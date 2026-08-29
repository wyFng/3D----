// glTF 骨骼动画角色：加载 KayKit CC0 模型，动画状态机驱动
// 模型文件位于 public/models/（构建期打包，运行时本地加载，零网络请求）
// 注：贴图由本模块自行从 GLB 解析注入（规避部分环境下 GLTFLoader blob 贴图管线静默失败的问题）

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 游戏姿态 → 模型动画片段（按优先级取第一个存在的） */
const CLIP_MAP = {
  run: ['Running_A'],
  idle: ['Unarmed_Idle', 'Idle'],
  jump: ['Jump_Full_Long', 'Jump_Start'],
  fall: ['Jump_Idle', 'Jump_Start'],
  // KayKit 无滑铲片段：Lie_Pose（腿朝前的水平姿态）最接近贴地滑铲；
  // 没有该片段的模型（机器人）走程序化后仰倾斜
  slide: ['Lie_Pose', 'Sit_Floor_Pose', 'Dodge_Forward'],
  dead: ['Death_A'],
  win: ['Cheer']
};

const LOOP_POSES = new Set(['run', 'idle', 'fall']);

/** 从 GLB 二进制中提取内嵌图片并解码为 ImageBitmap */
async function extractEmbeddedImages(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.slice(20, 20 + jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const images = [];
  for (const img of json.images || []) {
    const bv = json.bufferViews[img.bufferView];
    const off = binStart + bv.byteOffset;
    const blob = new Blob([buf.slice(off, off + bv.byteLength)], { type: img.mimeType });
    images.push(await createImageBitmap(blob));
  }
  return images;
}

export async function createGltfCharacter(url) {
  const [gltf, images] = await Promise.all([
    new GLTFLoader().loadAsync(url),
    extractEmbeddedImages(url)
  ]);
  const model = gltf.scene;

  // 调色板贴图需要最近邻采样（UV 取样极小色块，线性过滤会平均成一片白）
  function makeTexture(bitmap) {
    const tex = new THREE.Texture(bitmap);
    tex.flipY = false; // glTF UV 约定
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // 注入贴图：GLTFLoader 未成功挂上的材质用自解析贴图补齐
  let texIndex = 0;
  const usedBitmaps = new Set();
  model.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) {
        if (!usedBitmaps.has(m.map.uuid)) {
          m.map.magFilter = THREE.NearestFilter;
          m.map.minFilter = THREE.NearestFilter;
          m.map.generateMipmaps = false;
          m.map.needsUpdate = true;
          usedBitmaps.add(m.map.uuid);
        }
      } else if (images.length) {
        m.map = makeTexture(images[Math.min(texIndex, images.length - 1)]);
        m.needsUpdate = true;
      }
    }
    if (images.length && !Array.isArray(o.material)) texIndex++;
  });

  // 归一化：脚底对齐 y=0，总高 1.7m（与碰撞盒一致）
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const s = 1.7 / height;
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;

  const inner = new THREE.Group();
  inner.add(model);
  const group = new THREE.Group();
  group.add(inner);

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map();
  for (const c of gltf.animations) clips.set(c.name, c);
  // 是否有可用的滑铲片段（机器人等没有时走程序化后仰）
  const hasSlideClip = CLIP_MAP.slide.some((n) => clips.has(n));

  let currentName = null;

  function play(pose, fade = 0.14) {
    const candidates = CLIP_MAP[pose] || CLIP_MAP.run;
    const name = candidates.find((n) => clips.has(n));
    // 无对应片段（如机器人的滑铲）：保持当前动画，由 update 的程序化姿态兜底
    if (!name || name === currentName) return;
    const next = mixer.clipAction(clips.get(name));
    const loop = LOOP_POSES.has(pose);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.timeScale = pose === 'run' ? 1.05 : 1;
    const prev = currentName != null ? mixer.clipAction(clips.get(currentName)) : null;
    currentName = name;
    next.fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
  }

  function update(pose, dt /* , runPhase */) {
    play(pose);
    // 程序化滑铲兜底：无滑铲片段的模型整体后仰（绕脚底支点，像 limbo 滑）
    const targetTilt = pose === 'slide' && !hasSlideClip ? -1.05 : 0;
    inner.rotation.x += (targetTilt - inner.rotation.x) * Math.min(1, dt * 14);
    mixer.update(dt);
  }

  function dispose() {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  return { group, inner, update, dispose, isGltf: true };
}
