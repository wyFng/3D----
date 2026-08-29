// 玩家控制器：换道 / 跳跃 / 下滑 / 坠落（视觉部分），碰撞判定交给 rules.js

import * as THREE from 'three';
import { LANE_X, GRAVITY, JUMP_V, SLIDE_TIME, FALL_DEATH_Y } from '../core/math.js';
import { createCharacter } from './character.js';

/** 护盾罩着色器：菲涅尔边缘发光 */
const SHIELD_VERT = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const SHIELD_FRAG = `
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
    float a = (fresnel * 0.85 + 0.06) * uOpacity;
    gl_FragColor = vec4(uColor * (0.5 + fresnel * 1.6), a);
  }
`;

export class Player {
  constructor(scene, char) {
    this.char = char || createCharacter();
    this.isGltf = this.char.isGltf === true;
    scene.add(this.char.group);

    // 护盾罩（跟随角色，默认隐藏）
    const shieldGeo = new THREE.SphereGeometry(0.95, 28, 20);
    const shieldMat = new THREE.ShaderMaterial({
      vertexShader: SHIELD_VERT,
      fragmentShader: SHIELD_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x3fa9f5) },
        uOpacity: { value: 1.0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    this.char.group.add(this.shieldMesh);
    this.shieldState = 'none'; // none | on | break
    this.shieldAnimT = 0;

    // 伪阴影（跟随脚底的半透明圆片）
    const shadowGeo = new THREE.CircleGeometry(0.5, 20);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.reset();
  }

  reset() {
    this.lane = 1;
    this.x = 0;
    this.y = 0;          // 脚底高度
    this.z = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideT = 0;
    this.falling = false;
    this.dead = false;
    this.celebrating = false;
    this.runPhase = 0;
    this.jumpT = 0;
    this.shieldMesh.visible = false;
    this.shieldState = 'none';
    this.shieldAnimT = 0;
    this.char.group.rotation.set(0, 0, 0);
    this.char.group.position.set(0, 0, 0);
  }

  /** 拾取护盾：保护罩展开 */
  showShield() {
    this.shieldState = 'on';
    this.shieldAnimT = 0;
    this.shieldMesh.visible = true;
    this.shieldMesh.material.uniforms.uOpacity.value = 1.0;
  }

  /** 护盾被击碎：撑大淡出后隐藏 */
  breakShield() {
    if (this.shieldState !== 'on') return;
    this.shieldState = 'break';
    this.shieldAnimT = 0;
  }

  /** 护盾罩动画：展开 → 呼吸脉动 → 碎裂消散 */
  _updateShield(dt) {
    if (this.shieldState === 'none') return;
    this.shieldAnimT += dt;
    const mesh = this.shieldMesh;
    if (this.shieldState === 'on') {
      // 展开动画（0.28s 弹出）+ 呼吸脉动
      const t = Math.min(1, this.shieldAnimT / 0.28);
      const pop = 1 + 0.28 * Math.sin(t * Math.PI); // 弹性过冲
      mesh.scale.setScalar(0.25 + 0.75 * t * pop);
      mesh.scale.y *= 0.92; // 略扁，罩住人物即可
      mesh.rotation.y += dt * 0.8;
      mesh.material.uniforms.uOpacity.value = 0.85 + Math.sin(this.shieldAnimT * 6) * 0.15;
    } else if (this.shieldState === 'break') {
      const t = Math.min(1, this.shieldAnimT / 0.32);
      mesh.scale.setScalar(1 + t * 0.55);
      mesh.material.uniforms.uOpacity.value = 1 - t;
      if (t >= 1) {
        this.shieldState = 'none';
        mesh.visible = false;
      }
    }
  }

  get pose() {
    if (this.celebrating) return 'win';
    if (this.falling) return 'fall';
    if (!this.grounded) return 'jump';
    if (this.sliding) return 'slide';
    return 'run';
  }

  moveLane(delta) {
    if (this.dead || this.falling) return;
    const next = Math.min(2, Math.max(0, this.lane + delta));
    this.lane = next;
  }

  jump() {
    if (this.dead || this.falling || !this.grounded) return false;
    this.vy = JUMP_V;
    this.grounded = false;
    this.sliding = false;
    this.jumpT = 0;
    return true;
  }

  slide() {
    if (this.dead || this.falling) return false;
    if (!this.grounded) {
      // 空中下压：快速落地
      this.vy = Math.min(this.vy, -10);
      return true;
    }
    this.sliding = true;
    this.slideT = SLIDE_TIME;
    return true;
  }

  update(dt, speed, gapChecker) {
    if (this.dead) return;
    const prevY = this.y;
    this.z += speed * dt;
    this.runPhase += speed * dt * 1.9;

    // 换道平滑（指数趋近）
    const targetX = LANE_X[this.lane];
    this.x += (targetX - this.x) * Math.min(1, dt * 13);
    if (Math.abs(targetX - this.x) < 0.01) this.x = targetX;

    // 滑铲计时
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.sliding = false;
    }

    // 垂直运动
    if (!this.grounded) {
      this.jumpT += dt;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.falling) {
        // 坠入缺口：不做落地判定，一直坠到死亡线
        if (this.y < FALL_DEATH_Y) this.dead = true;
      } else if (this.y <= 0 && this.vy <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.land = true; // 供外部播放落地音效
      }
    } else if (gapChecker && gapChecker(this.z, this.x)) {
      // 跑进缺口 → 开始坠落
      this.falling = true;
      this.grounded = false;
      this.vy = 0;
    }

    // 视觉同步
    void prevY;
    this.char.group.position.set(this.x, this.y, this.z);
    this.char.update(this.pose, dt, this.runPhase);
    this._updateShield(dt);
    // 缺口/坠落时没有地面可投影
    this.shadow.visible = !this.falling && !gapChecker?.(this.z, this.x);
    this.shadow.position.set(this.x, 0.02, this.z);
    const h = Math.max(0, this.y);
    const s = Math.max(0.3, 1 - h * 0.28);
    this.shadow.scale.setScalar(s);
    this.shadow.material.opacity = 0.35 * s;
  }

  dispose() {
    this.char.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
