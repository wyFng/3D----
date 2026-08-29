// 角色选择缩略图：共享离屏渲染器，把角色模型渲染成卡片肖像

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let renderer = null, scene = null, camera = null;
const modelCache = new Map();

async function getModel(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  // KayKit 调色板贴图：最近邻采样
  model.traverse((o) => {
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
  modelCache.set(url, model);
  return model;
}

/**
 * 把角色渲染到指定 canvas（3/4 视角肖像）
 * @param {string} url 模型地址
 * @param {HTMLCanvasElement} canvas 卡片内的 2D 画布
 */
export async function renderCharacterThumb(url, canvas) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(220, 220);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x44507a, 1.5));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.0);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  }

  const model = await getModel(url);
  scene.add(model);

  // 归一化：脚底贴底、身高占画幅约 88%
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  const s = 1.76 / h;
  model.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  model.rotation.y = 0.38; // 3/4 侧身，比正面呆板照好看

  camera.position.set(0, 1.05, 3.3);
  camera.lookAt(0, 0.92, 0);

  renderer.render(scene, camera);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);

  scene.remove(model);
  model.rotation.y = 0;
}
