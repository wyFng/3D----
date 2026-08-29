// 赛道与世界生成：把关卡数据变成 3D 场景（全部程序化，无外部资源）

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_W, LANE_X, GAP_LEN } from '../core/math.js';
import { moveX } from '../core/rules.js';
import { windowTexture, floorTexture } from './textures.js';
import { getTemplate, spawnProp, PROP_FILES } from './prop-loader.js';

const SLAB = 4;          // 地板块长度
const TRACK_HALF = LANE_W * 1.5 + 0.25;

/** 共享柔影纹理（径向渐变黑） */
let aoTexture = null;
function getAoTexture() {
  if (aoTexture) return aoTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  aoTexture = new THREE.CanvasTexture(c);
  return aoTexture;
}

/** 在物体脚下铺一片接地柔影（消灭浮空积木感） */
function addAo(group, x, z, w, d, opacity = 0.4) {
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshBasicMaterial({ map: getAoTexture(), transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  group.add(m);
}

/** 确定性伪随机（同一关每次构建完全一致） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function laneGapRanges(level, lane) {
  const ranges = [];
  for (const r of level.rows) {
    if (r.t === 'gap' && r.l.includes(lane)) ranges.push([r.d, r.d + GAP_LEN]);
  }
  return ranges;
}

function inRanges(ranges, a, b) {
  return ranges.some(([s, e]) => a < e - 0.3 && b > s + 0.3);
}

export function buildTrack(level, theme, opts = {}) {
  const mobile = !!opts.mobile;
  const group = new THREE.Group();
  const rng = mulberry32(level.id * 7919 + 13);
  const disposables = [];

  const mat = (color, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
    disposables.push(m);
    return m;
  };
  const emissive = (color, intensity = 1.2) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity });
    disposables.push(m);
    return m;
  };
  const addBox = (w, h, d, x, y, z, material) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const floorTex = floorTexture(theme.floor);
  disposables.push(floorTex);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.05 });
  disposables.push(floorMat);
  // 接缝板：更暗的地板材质，形成明暗节奏
  const floorMatJoint = new THREE.MeshStandardMaterial({
    map: floorTex, color: new THREE.Color(0.78, 0.78, 0.84), roughness: 0.9
  });
  disposables.push(floorMatJoint);
  const edgeMat = mat(theme.floorEdge);
  const railMat = emissive(theme.rail, 1.6);
  const warnMat = emissive(theme.warn, 1.4);
  const wallMat = mat(theme.wall);
  const obstMat = mat(theme.obstacle);
  const accentMat = emissive(theme.accent, 1.5);
  const coinMat = new THREE.MeshStandardMaterial({
    color: theme.coin, emissive: theme.coin, emissiveIntensity: 0.55,
    roughness: 0.3, metalness: 0.6
  });
  disposables.push(coinMat);

  /* ---- 静态几何合批收集器：同材质的盒子合并为一个网格（绘制调用从数千降到几十） ---- */
  const staticGeos = { floor: [], joint: [], edge: [], rail: [], warn: [], accent: [] };
  const pushBox = (list, w, h, d, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y, z);
    list.push(geo);
  };
  const flushStatic = () => {
    const mats = { floor: floorMat, joint: floorMatJoint, edge: edgeMat, rail: railMat, warn: warnMat, accent: accentMat };
    for (const key of Object.keys(staticGeos)) {
      const list = staticGeos[key];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((geo) => geo.dispose());
      disposables.push(merged);
      const mesh = new THREE.Mesh(merged, mats[key]);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      staticGeos[key] = [];
    }
  };

  /* ---- 地板（按轨道逐块铺设，缺口处留空；每 5 块一块深色接缝板） ---- */
  const gapRanges = [0, 1, 2].map((l) => laneGapRanges(level, l));
  for (let z = 0; z < level.length; z += SLAB) {
    const isJoint = (z / SLAB) % 5 === 4;
    const floorList = isJoint ? staticGeos.joint : staticGeos.floor;
    for (let lane = 0; lane < 3; lane++) {
      if (inRanges(gapRanges[lane], z, z + SLAB)) continue;
      pushBox(floorList, LANE_W, 0.4, SLAB, LANE_X[lane], -0.2, z + SLAB / 2);
    }
    // 两侧边缘
    pushBox(staticGeos.edge, 0.5, 0.5, SLAB, -TRACK_HALF - 0.25, -0.25, z + SLAB / 2);
    pushBox(staticGeos.edge, 0.5, 0.5, SLAB, TRACK_HALF + 0.25, -0.25, z + SLAB / 2);
    // 底部支撑结构（每 12m 一道，让悬浮赛道可信）
    if ((z / SLAB) % 3 === 0) {
      pushBox(staticGeos.edge, TRACK_HALF * 2 + 1, 5, 1.1, 0, -2.9, z + SLAB / 2);
    }
  }

  /* ---- 车道发光分隔条（相邻轨道都有地面时铺设） ---- */
  for (let z = 0; z < level.length; z += SLAB) {
    for (const bx of [-1.1, 1.1]) {
      const leftLane = bx < 0 ? 0 : 1;
      const rightLane = bx < 0 ? 1 : 2;
      const anyFloor =
        !inRanges(gapRanges[leftLane], z, z + SLAB) ||
        !inRanges(gapRanges[rightLane], z, z + SLAB);
      if (!anyFloor) continue;
      pushBox(staticGeos.accent, 0.07, 0.03, SLAB, bx, 0.015, z + SLAB / 2);
    }
  }

  /* ---- 发光护栏（整宽缺口处断开） ---- */
  const fullGaps = level.rows.filter((r) => r.t === 'gap' && r.l.length >= 3).map((r) => [r.d - 1, r.d + GAP_LEN + 1]);
  let railStart = 0;
  const railSegs = [];
  for (const [s, e] of fullGaps.sort((a, b) => a[0] - b[0])) {
    if (s > railStart) railSegs.push([railStart, s]);
    railStart = Math.max(railStart, e);
  }
  if (railStart < level.length) railSegs.push([railStart, level.length]);
  for (const [s, e] of railSegs) {
    const len = e - s;
    if (len <= 0) continue;
    for (const side of [-1, 1]) {
      pushBox(staticGeos.rail, 0.12, 0.1, len, side * TRACK_HALF, 0.45, s + len / 2);
      pushBox(staticGeos.edge, 0.12, 0.5, len, side * TRACK_HALF, 0.1, s + len / 2);
    }
  }

  /* ---- 缺口警示条 + 碎裂石板 ---- */
  for (const r of level.rows) {
    if (r.t !== 'gap') continue;
    for (const lane of r.l) {
      const x = LANE_X[lane];
      pushBox(staticGeos.warn, LANE_W, 0.08, 0.3, x, 0.02, r.d - 0.2);
      pushBox(staticGeos.warn, LANE_W, 0.08, 0.3, x, 0.02, r.d + GAP_LEN + 0.2);
    }
    // 缺口两缘的碎裂石板（装饰）
    const debrisA = spawnProp(getTemplate(PROP_FILES.brokenA), { height: 0.16, width: 1.4, x: LANE_X[r.l[0]] + 0.7, y: 0, z: r.d - 0.75, rotY: rng() * 1.2 - 0.6, tint: theme.propTint });
    const debrisB = spawnProp(getTemplate(PROP_FILES.brokenB), { height: 0.16, width: 1.4, x: LANE_X[r.l[r.l.length - 1]] - 0.7, y: 0, z: r.d + GAP_LEN + 0.75, rotY: rng() * 1.2 - 0.6, tint: theme.propTint });
    if (debrisA) group.add(debrisA);
    if (debrisB) group.add(debrisB);
  }
  flushStatic(); // 合批落盘（地板/边缘/支撑/护栏/警示条）

  /* ---- 障碍物（KayKit 道具换装，程序化几何兜底） ---- */
  const movers = [];
  const tint = theme.obstacleTint || theme.propTint;
  for (const r of level.rows) {
    const z = r.d;
    if (r.t === 'wall') {
      const x = LANE_X[r.l[0]];
      const wall = spawnProp(getTemplate(PROP_FILES.wall), { height: 2.6, width: 2.05, x, z, tint, emissive: theme.propEmissive, emissiveIntensity: 0.5 });
      if (wall) {
        group.add(wall);
        pushBox(staticGeos.warn, 2.0, 0.1, 0.72, x, 2.56, z); // 顶部警示发光条
      } else {
        addBox(2.0, 2.6, 0.7, x, 1.3, z, wallMat);
        addBox(2.0, 0.25, 0.75, x, 2.35, z, accentMat);
      }
      addAo(group, x, z, 3.0, 1.8);
    } else if (r.t === 'low') {
      const x = LANE_X[r.l[0]];
      const half = spawnProp(getTemplate(PROP_FILES.wallHalf), { height: 0.78, width: 2.0, x, z, tint, emissive: theme.propEmissive, emissiveIntensity: 0.4 });
      if (half) {
        group.add(half);
        pushBox(staticGeos.warn, 2.0, 0.08, 0.3, x, 0.82, z);
      } else {
        addBox(2.0, 0.38, 0.3, x, 0.6, z, obstMat);
        addBox(0.18, 0.8, 0.3, x - 0.9, 0.4, z, obstMat);
        addBox(0.18, 0.8, 0.3, x + 0.9, 0.4, z, obstMat);
        addBox(2.0, 0.1, 0.34, x, 0.82, z, warnMat);
      }
      addAo(group, x, z, 2.8, 1.4);
    } else if (r.t === 'over') {
      const x = LANE_X[r.l[0]];
      const postL = spawnProp(getTemplate(PROP_FILES.pillar), { height: 2.7, width: 0.5, x: x - 0.95, z, tint, emissive: theme.propEmissive, emissiveIntensity: 0.4 });
      const postR = spawnProp(getTemplate(PROP_FILES.pillar), { height: 2.7, width: 0.5, x: x + 0.95, z, tint, emissive: theme.propEmissive, emissiveIntensity: 0.4 });
      if (postL && postR) {
        group.add(postL, postR);
      } else {
        addBox(0.18, 2.7, 0.3, x - 0.95, 1.35, z, wallMat);
        addBox(0.18, 2.7, 0.3, x + 0.95, 1.35, z, wallMat);
      }
      // 悬空横杆（滑铲通过），保留警示条
      addBox(2.0, 1.45, 0.35, x, 1.875, z, obstMat);
      pushBox(staticGeos.warn, 2.0, 0.12, 0.39, x, 1.2, z);
      addAo(group, x, z, 3.0, 1.6);
    } else if (r.t === 'move') {
      const slab = spawnProp(getTemplate(PROP_FILES.wallPillar), { height: 2.5, width: 1.7, tint, emissive: theme.propEmissive, emissiveIntensity: 0.5 });
      if (slab) {
        const g = new THREE.Group();
        g.add(slab);
        // 顶部警示条（挂进滑动组，跟随移动；slab 脚底在组原点）
        const stripGeo = new THREE.BoxGeometry(1.7, 0.1, 0.72);
        disposables.push(stripGeo);
        const strip = new THREE.Mesh(stripGeo, warnMat);
        strip.position.y = 2.46;
        g.add(strip);
        g.position.set(0, 0, z);
        group.add(g);
        movers.push({ row: r, mesh: g });
        // 滑轨
        addBox(TRACK_HALF * 2, 0.08, 0.3, 0, 0.04, z, railMat);
      } else {
        const mesh = addBox(1.8, 2.6, 0.7, 0, 1.3, z, wallMat);
        const strip2 = addBox(1.7, 0.1, 0.72, 0, 2.46, z, warnMat);
        strip2.userData.follow = mesh;
        addBox(TRACK_HALF * 2, 0.08, 0.3, 0, 0.04, z, railMat);
        movers.push({ row: r, mesh, strip: strip2 });
      }
      addAo(group, 0, z, 2.4, 1.6);
    }
  }
  flushStatic(); // 障碍警示条合批

  /* ---- 金币与道具 ---- */
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18);
  disposables.push(coinGeo);
  const spinners = [];
  const coinList = [];
  for (const c of level.coins) {
    const n = c.n ?? 1;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.rotation.x = Math.PI / 2;
      const y = c.y === 'a' ? 2.1 : 1.0;
      mesh.position.set(LANE_X[c.l], y, c.d + i * 2.0);
      group.add(mesh);
      spinners.push(mesh);
      coinList.push({ mesh, taken: false, x: mesh.position.x, y, z: mesh.position.z, pulled: false });
    }
  }

  const itemList = [];
  const itemGeo = {
    magnet: new THREE.TorusGeometry(0.34, 0.13, 10, 20),
    shield: new THREE.SphereGeometry(0.4, 14, 12),
    boost: new THREE.OctahedronGeometry(0.42)
  };
  const itemMat = {
    magnet: emissive(0xff4d4d, 1.2),
    shield: emissive(0x3fa9f5, 1.2),
    boost: emissive(0xffd23e, 1.4)
  };
  disposables.push(...Object.values(itemGeo));
  for (const it of level.items) {
    const mesh = new THREE.Mesh(itemGeo[it.k], itemMat[it.k]);
    mesh.position.set(LANE_X[it.l], 1.1, it.d);
    group.add(mesh);
    spinners.push(mesh);
    itemList.push({ mesh, kind: it.k, taken: false, x: mesh.position.x, y: 1.1, z: it.d });
  }

  /* ---- 终点 ---- */
  const finishZ = level.length;
  addBox(0.5, 4.2, 0.5, -TRACK_HALF, 2.1, finishZ, wallMat);
  addBox(0.5, 4.2, 0.5, TRACK_HALF, 2.1, finishZ, wallMat);
  addBox(TRACK_HALF * 2 + 0.5, 0.7, 0.5, 0, 4.3, finishZ, accentMat);
  // 终点旗帜
  const flagL = spawnProp(getTemplate(PROP_FILES.banner), { height: 1.6, x: -TRACK_HALF + 0.35, y: 2.6, z: finishZ - 0.4, rotY: Math.PI, tint: theme.propTint });
  const flagR = spawnProp(getTemplate(PROP_FILES.banner), { height: 1.6, x: TRACK_HALF - 0.35, y: 2.6, z: finishZ - 0.4, tint: theme.propTint });
  if (flagL) group.add(flagL);
  if (flagR) group.add(flagR);
  // 格纹终点线
  for (let i = 0; i < 8; i++) {
    const w = (TRACK_HALF * 2) / 8;
    addBox(w, 0.06, 1.2, -TRACK_HALF + w * (i + 0.5), 0.03, finishZ - 0.7, i % 2 ? warnMat : edgeMat);
  }

  /* ---- 主题装饰 ---- */
  const updatables = [];
  decorate(group, theme, level, rng, { mat, emissive, addBox, disposables, updatables, mobile });

  return {
    group,
    coins: coinList,
    items: itemList,
    movers,
    spinners,
    updatables,
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}

/* ================= 主题装饰 ================= */

function decorate(group, theme, level, rng, ctx) {
  const { mat, emissive, addBox, disposables, updatables, mobile } = ctx;
  const L = level.length;
  const decorStep = mobile ? 1.5 : 1; // 手机降低装饰密度

  if (theme.deco === 'city') {
    const bMat = mat(0x0d1230);
    const winMats = [0, 0, 0].map((_, i) => {
      const tex = windowTexture(0x10173a, [0x35e0ff, 0xff3df0, 0xffd76a, 0x9fe8ff]);
      const m = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5,
        color: 0x22284a, roughness: 0.8
      });
      disposables.push(tex, m);
      return m;
    });
    const beaconMat = emissive(0xff3355, 2.0);
    for (let z = -10; z < L + 20; z += (13 + rng() * 8) * decorStep) {
      for (const side of [-1, 1]) {
        const h = 8 + rng() * 22;
        const w = 4 + rng() * 5;
        const x = side * (9 + rng() * 9);
        const wm = winMats[Math.floor(rng() * winMats.length)];
        addBox(w, h, w, x, h / 2 - 0.5, z, wm);
        // 楼顶航空灯
        addBox(0.22, 0.22, 0.22, x, h - 0.3, z, beaconMat);
      }
    }
    // 发光拱门：增强纵深与速度感
    const archGlow = emissive(theme.accent, 1.5);
    const archRail = emissive(theme.rail, 1.6);
    for (let z = 30; z < L - 10; z += 45) {
      addBox(0.35, 4.8, 0.35, -3.4, 2.4, z, bMat);
      addBox(0.35, 4.8, 0.35, 3.4, 2.4, z, bMat);
      addBox(7.15, 0.42, 0.4, 0, 4.65, z, archGlow);
      addBox(6.4, 0.12, 0.3, 0, 4.2, z, archRail);
    }
    // 星空
    const starGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      pos[i * 3] = (rng() - 0.5) * 240;
      pos[i * 3 + 1] = 25 + rng() * 70;
      pos[i * 3 + 2] = rng() * (L + 60) - 20;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    disposables.push(starGeo);
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.4, sizeAttenuation: true }));
    disposables.push(stars.material);
    group.add(stars);
  }

  if (theme.deco === 'temple') {
    const stoneMat = mat(0x9b8b70);
    const mossMat = mat(0x3fae5a);
    const trunkMat = mat(0x6b4a2f);
    const leafMat = mat(0x2f8f4e);
    for (let z = -5; z < L + 15; z += 15) {
      // 石柱
      for (const side of [-1, 1]) {
        if (rng() > 0.35) {
          const x = side * (6.5 + rng() * 2);
          addBox(1.4, 5 + rng() * 2, 1.4, x, 2.5, z, stoneMat);
          addBox(1.8, 0.5, 1.8, x, 5.2, z, stoneMat);
          addBox(1.2, 0.3, 1.2, x, 5.55, z, mossMat);
        }
      }
      // 树
      for (let i = 0; i < 2; i++) {
        const side = rng() > 0.5 ? 1 : -1;
        const x = side * (8 + rng() * 7);
        const zt = z + rng() * 10;
        const th = 2.5 + rng() * 2;
        addBox(0.5, th, 0.5, x, th / 2, zt, trunkMat);
        const geo = new THREE.ConeGeometry(1.6 + rng(), 3 + rng() * 2, 7);
        disposables.push(geo);
        const cone = new THREE.Mesh(geo, leafMat);
        cone.position.set(x, th + 1.2, zt);
        group.add(cone);
      }
    }
  }

  if (theme.deco === 'clouds') {
    const cloudMat = mat(0xffffff, { roughness: 1 });
    const rockMat = mat(0xb0a488);
    const grassMat = mat(0x63c74d);
    for (let z = -10; z < L + 20; z += 16) {
      // 云
      for (let i = 0; i < 2; i++) {
        const x = (rng() - 0.5) * 60;
        const y = 4 + rng() * 12;
        const cz = z + rng() * 12;
        for (let s = 0; s < 3; s++) {
          const geo = new THREE.SphereGeometry(1.2 + rng() * 1.4, 10, 8);
          disposables.push(geo);
          const p = new THREE.Mesh(geo, cloudMat);
          p.position.set(x + s * 1.6 - 1.6, y, cz);
          p.scale.y = 0.55;
          group.add(p);
        }
      }
      // 浮岛
      if (rng() > 0.3) {
        const side = rng() > 0.5 ? 1 : -1;
        const x = side * (9 + rng() * 8);
        const y = -5 - rng() * 7;
        const geo = new THREE.DodecahedronGeometry(2.5 + rng() * 2, 0);
        disposables.push(geo);
        const isl = new THREE.Mesh(geo, rockMat);
        isl.position.set(x, y, z);
        isl.scale.y = 0.6;
        group.add(isl);
        const g = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), grassMat);
        disposables.push(g.geometry);
        g.position.set(x, y + 1.1, z);
        g.scale.y = 0.25;
        group.add(g);
      }
    }
  }

  if (theme.deco === 'volcano') {
    const rockMat = mat(0x2b1512);
    const lavaMat = emissive(0xff5a1f, 1.6);
    for (let z = -5; z < L + 15; z += 11) {
      for (const side of [-1, 1]) {
        // 钟乳石/石笋
        const geo = new THREE.ConeGeometry(1 + rng() * 1.4, 4 + rng() * 6, 6);
        disposables.push(geo);
        const cone = new THREE.Mesh(geo, rockMat);
        cone.position.set(side * (6 + rng() * 8), 1.5, z + rng() * 5);
        group.add(cone);
        // 熔岩池
        if (rng() > 0.5) {
          const pgeo = new THREE.CircleGeometry(1.5 + rng() * 2, 12);
          disposables.push(pgeo);
          const pool = new THREE.Mesh(pgeo, lavaMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(side * (7 + rng() * 6), -0.35, z + rng() * 6);
          group.add(pool);
        }
      }
    }
    // 上升的火星
    const emberGeo = new THREE.BufferGeometry();
    const N = 180;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 30;
      pos[i * 3 + 1] = rng() * 12;
      pos[i * 3 + 2] = rng() * (L + 40) - 10;
      vel[i] = 0.6 + rng() * 1.6;
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    disposables.push(emberGeo);
    const emberMat = new THREE.PointsMaterial({ color: 0xff7a33, size: 0.22, transparent: true, opacity: 0.9 });
    disposables.push(emberMat);
    const embers = new THREE.Points(emberGeo, emberMat);
    group.add(embers);
    updatables.push((dt, time) => {
      const arr = embers.geometry.attributes.position.array;
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] += vel[i] * dt;
        if (arr[i * 3 + 1] > 13) arr[i * 3 + 1] = 0;
      }
      embers.geometry.attributes.position.needsUpdate = true;
    });
  }

  /* ---- 通用 KayKit 道具装饰：柱子/木桶/木箱沿两侧点缀 ---- */
  const tpl = {
    column: getTemplate(PROP_FILES.column),
    barrel: getTemplate(PROP_FILES.barrel),
    boxes: getTemplate(PROP_FILES.boxes),
    spikes: getTemplate(PROP_FILES.spikes)
  };
  for (let z = 15; z < L - 8; z += 17 * decorStep) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = side * (6.2 + rng() * 2.2);
    const zz = z + rng() * 6;
    const pick = rng();
    if (pick < 0.4 || theme.deco === 'volcano') {
      const p = spawnProp(tpl.column, { height: 3 + rng() * 1.5, x, z: zz, rotY: rng() * 3, tint: theme.propTint, emissive: theme.propEmissive, emissiveIntensity: 0.35 });
      if (p) { group.add(p); addAo(group, x, zz, 2.2, 2.2, 0.32); }
    } else if (pick < 0.72) {
      const p = spawnProp(tpl.barrel, { height: 0.9, x, z: zz, rotY: rng() * 3, tint: theme.propTint, emissive: theme.propEmissive, emissiveIntensity: 0.3 });
      if (p) { group.add(p); addAo(group, x, zz, 1.4, 1.4, 0.3); }
    } else {
      const p = spawnProp(tpl.boxes, { height: 1.2, x, z: zz, rotY: rng() * 3, tint: theme.propTint, emissive: theme.propEmissive, emissiveIntensity: 0.3 });
      if (p) { group.add(p); addAo(group, x, zz, 1.8, 1.8, 0.32); }
    }
    if (theme.deco === 'volcano' && tpl.spikes) {
      const sp = spawnProp(tpl.spikes, { height: 0.5, width: 0.9, x: -side * (5.4 + rng() * 1.5), z: z + 8, rotY: rng(), tint: theme.propTint });
      if (sp) group.add(sp);
    }
  }
}
