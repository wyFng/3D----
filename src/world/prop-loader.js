// 场景道具加载器：KayKit CC0 道具（构建期打包、运行时本地加载）
// 提供 异步预加载 + 同步取模板 + 归一化克隆（缩放/着色/放置）

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map();      // url -> Promise<THREE.Group>
const templates = new Map();  // url -> THREE.Group | null（解析结果）

/** 道具清单（KayKit Dungeon Remastered, CC0） */
export const PROP_BASE = `${import.meta.env.BASE_URL}models/props/`;
export const PROP_FILES = {
  wall: `${PROP_BASE}wall.gltf.glb`,
  wallHalf: `${PROP_BASE}wall_half.gltf.glb`,
  wallPillar: `${PROP_BASE}wall_pillar.gltf.glb`,
  pillar: `${PROP_BASE}pillar.gltf.glb`,
  column: `${PROP_BASE}column.gltf.glb`,
  boxes: `${PROP_BASE}box_stacked.gltf.glb`,
  barrel: `${PROP_BASE}barrel_small.gltf.glb`,
  banner: `${PROP_BASE}banner_red.gltf.glb`,
  brokenA: `${PROP_BASE}floor_tile_small_broken_A.gltf.glb`,
  brokenB: `${PROP_BASE}floor_tile_small_broken_B.gltf.glb`,
  spikes: `${PROP_BASE}floor_tile_big_spikes.glb`
};

export function preloadAllProps() {
  return preloadProps(Object.values(PROP_FILES));
}

async function loadProp(url) {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const scene = gltf.scene;
    // KayKit 调色板贴图：最近邻采样防止色块被过滤平均
    scene.traverse((o) => {
      if (o.geometry) o.geometry.userData.shared = true; // 模板几何体跨关卡共享，禁止销毁
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) {
          m.map.magFilter = THREE.NearestFilter;
          m.map.minFilter = THREE.NearestFilter;
          m.map.generateMipmaps = false;
          m.map.needsUpdate = true;
        }
      }
    });
    templates.set(url, scene);
    return scene;
  } catch (e) {
    console.warn('[极速跑酷] 道具加载失败，使用程序化兜底：', url, e?.message || e);
    templates.set(url, null);
    return null;
  }
}

/** 预加载一批道具（游戏启动时调用一次） */
export function preloadProps(urls) {
  return Promise.allSettled(
    urls.map((u) => {
      if (!cache.has(u)) cache.set(u, loadProp(u));
      return cache.get(u);
    })
  );
}

/** 同步取已解析的模板（未加载完成或失败返回 null，调用方走程序化兜底） */
export function getTemplate(url) {
  return templates.get(url) ?? null;
}

/**
 * 生成一个归一化的道具实例
 * @param {THREE.Group|null} template 模板（null 时调用方走兜底）
 * @param {object} opt { height, width, x, y, z, rotY, tint, emissive, emissiveIntensity }
 */
export function spawnProp(template, opt = {}) {
  if (!template) return null;
  const { height = 1, width = null, x = 0, y = 0, z = 0, rotY = 0, tint = null, emissive = null, emissiveIntensity = 0 } = opt;
  const clone = template.clone(true);

  // 材质独立克隆并按主题染色（不影响模板）
  clone.traverse((o) => {
    if (!o.material) return;
    const apply = (m) => {
      const c = m.clone();
      if (tint) c.color.multiply(new THREE.Color(tint[0], tint[1], tint[2])); // 分量可 >1，用于提亮深色调色板
      if (emissive) {
        c.emissive = new THREE.Color(emissive);
        c.emissiveIntensity = emissiveIntensity;
      }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
  });

  clone.rotation.y = rotY;

  // 归一化：按目标高度缩放，宽度超出时夹紧；脚底落在 y 上，水平对齐 x/z
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  let s = height / Math.max(0.001, size.y);
  if (width) s = Math.min(s, width / Math.max(0.001, size.x));
  clone.scale.setScalar(s);

  const box2 = new THREE.Box3().setFromObject(clone);
  const center = box2.getCenter(new THREE.Vector3());
  clone.position.x += x - center.x;
  clone.position.z += z - center.z;
  clone.position.y += y - box2.min.y;
  return clone;
}
