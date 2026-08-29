// 程序化小人角色 v3：胶囊体四肢 + 球关节 + 立体头盔 + 飘动围巾
// 全部几何体程序化生成，跑/跳/滑姿态动画

import * as THREE from 'three';

export function createCharacter() {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // 滑铲时旋转 inner，保持 group 原点在脚底
  group.add(inner);

  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf5, roughness: 0.35, metalness: 0.05 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a2a, emissive: 0x2de1ff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.4
  });
  const suit = new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.55 });
  const suitDark = new THREE.MeshStandardMaterial({ color: 0x24304d, roughness: 0.7 });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x113355, emissive: 0x2de1ff, emissiveIntensity: 1.4, roughness: 0.4
  });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.8, side: THREE.DoubleSide });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });

  /* ---- 躯干：胸部（宽胶囊，压扁）+ 腰腹（窄）---- */
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.3, 6, 16), suit);
  chest.position.y = 1.12;
  chest.scale.set(1.1, 1, 0.72);
  inner.add(chest);

  const waist = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.12, 4, 14), suitDark);
  waist.position.y = 0.8;
  waist.scale.set(1.05, 1, 0.75);
  inner.add(waist);

  // 胸前发光条纹 + 背包
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05), stripeMat);
  stripe.position.set(0, 1.2, 0.21);
  inner.add(stripe);
  const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 12), suitDark);
  pack.position.set(0, 1.1, -0.26);
  pack.scale.set(1.1, 1, 0.6);
  inner.add(pack);

  /* ---- 头盔：球体 + 弧形面甲 + 顶部导流鳍 ---- */
  const head = new THREE.Group();
  head.position.y = 1.6;
  inner.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.245, 20, 16), helmetMat);
  skull.scale.set(1, 1.06, 1);
  head.add(skull);
  // 面甲：截取球冠前片，微微突出
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 20, 12, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.3),
    visorMat
  );
  visor.rotation.y = -Math.PI / 2; // 开口朝 +z（前进方向）
  visor.rotation.x = Math.PI;      // 球冠翻到上半 → 调整为眼部高度
  visor.position.z = 0.015;
  head.add(visor);
  // 顶部导流鳍
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.3), stripeMat);
  fin.position.set(0, 0.24, -0.04);
  head.add(fin);

  /* ---- 围巾：3 节链式，随速度飘动 ---- */
  const scarfSegs = [];
  let scarfParent = head;
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    if (i === 0) pivot.position.set(0, -0.12, -0.2);
    scarfParent.add(pivot);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.2 - i * 0.035, 0.05, 0.26), scarfMat);
    seg.position.z = -0.13;
    pivot.add(seg);
    scarfSegs.push(pivot);
    scarfParent = pivot;
    pivot.position.z = i === 0 ? pivot.position.z : -0.26;
  }

  /* ---- 四肢：胶囊体 + 球形关节（支点在顶端）---- */
  function limb(radius, length, mat, jointMat) {
    const pivot = new THREE.Group();
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), mat);
    capsule.position.y = -length / 2 - radius * 0.2;
    pivot.add(capsule);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 12, 10), jointMat);
    pivot.add(joint);
    return pivot;
  }

  const armL = limb(0.075, 0.4, suit, skin);
  armL.position.set(-0.34, 1.34, 0);
  const armR = limb(0.075, 0.4, suit, skin);
  armR.position.set(0.34, 1.34, 0);
  // 白色手套
  const gloveGeo = new THREE.SphereGeometry(0.095, 12, 10);
  const gloveL = new THREE.Mesh(gloveGeo, shoeMat);
  gloveL.position.y = -0.52;
  armL.add(gloveL);
  const gloveR = new THREE.Mesh(gloveGeo, shoeMat);
  gloveR.position.y = -0.52;
  armR.add(gloveR);
  inner.add(armL, armR);

  const legL = limb(0.09, 0.44, suitDark, suitDark);
  legL.position.set(-0.15, 0.74, 0);
  const legR = limb(0.09, 0.44, suitDark, suitDark);
  legR.position.set(0.15, 0.74, 0);
  inner.add(legL, legR);

  // 球鞋：胶囊底 + 橙色鞋面
  function shoe() {
    const s = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.14, 4, 10).rotateX(Math.PI / 2), shoeMat);
    sole.position.set(0, -0.6, 0.03);
    s.add(sole);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.2), suit);
    top.position.set(0, -0.53, 0.02);
    s.add(top);
    return s;
  }
  legL.add(shoe());
  legR.add(shoe());

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  /**
   * 姿态更新（与 glTF 角色同一签名，可互换）
   * @param {'run'|'jump'|'slide'|'fall'|'idle'|'win'|'dead'} pose
   * @param {number} dt 帧间隔
   * @param {number} runPhase 跑步摆动相位（随距离推进）
   */
  let animT = 0;
  function update(pose, dt, runPhase) {
    animT += dt;
    if (pose === 'win') pose = 'fall';      // 程序化角色：胜利用举手姿态
    if (pose === 'dead') pose = 'fall';
    if (pose === 'idle') { pose = 'run'; runPhase = animT * 2.2; } // 待机：慢速踏步
    if (pose === 'run') {
      inner.rotation.x = 0;
      inner.position.y = 0;
      const swing = Math.sin(runPhase);
      legL.rotation.x = swing * 0.95;
      legR.rotation.x = -swing * 0.95;
      armL.rotation.x = -swing * 0.85;
      armR.rotation.x = swing * 0.85;
      armL.rotation.z = 0.1;
      armR.rotation.z = -0.1;
      chest.rotation.y = swing * 0.08; // 跑动躯干扭转
      inner.position.y = Math.abs(Math.sin(runPhase)) * 0.05;
    } else if (pose === 'jump') {
      inner.rotation.x = 0;
      inner.position.y = 0;
      legL.rotation.x = -0.95;
      legR.rotation.x = 0.45;
      armL.rotation.x = -2.5;
      armR.rotation.x = -2.5;
      armL.rotation.z = 0.3;
      armR.rotation.z = -0.3;
      chest.rotation.y = 0;
    } else if (pose === 'slide') {
      inner.rotation.x = -1.15;
      inner.position.y = 0.25;
      legL.rotation.x = -0.4;
      legR.rotation.x = 0.2;
      armL.rotation.x = 0.4;
      armR.rotation.x = 0.4;
      armL.rotation.z = 0;
      armR.rotation.z = 0;
      chest.rotation.y = 0;
    } else {
      // fall 坠落
      inner.rotation.x = 0;
      inner.position.y = 0;
      legL.rotation.x = 0.55;
      legR.rotation.x = -0.3;
      armL.rotation.x = -2.9;
      armR.rotation.x = -2.9;
      armL.rotation.z = 0.5;
      armR.rotation.z = -0.5;
      chest.rotation.y = 0;
    }

    // 围巾飘动：跑步时随步伐上下摆，跳跃/坠落时向上扬起
    const flutter = pose === 'run' ? Math.sin(runPhase * 1.1) * 0.3 : -0.55;
    const lift = pose === 'jump' || pose === 'fall' ? -0.9 : 0;
    for (let i = 0; i < scarfSegs.length; i++) {
      const s = scarfSegs[i];
      s.rotation.x = 0.25 + lift + flutter * (1 - i * 0.22) + Math.sin(animT * 7 + i * 1.3) * 0.12;
    }
  }

  return { group, inner, update, dispose };
}
