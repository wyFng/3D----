// 游戏主控：状态机、主循环、碰撞、道具、计分、相机、粒子、自动试玩

import * as THREE from 'three';
import {
  MAGNET_TIME, BOOST_TIME, LANE_TIME
} from './core/math.js';
import {
  playerBox, rowHit, overGap, decideHit,
  coinReachable, inMagnetRange, magnetStep,
  speedWithBoost, speedAtProgress, starFor, parTimeFor, moveX
} from './core/rules.js';
import { laneToX } from './core/math.js';
import { THEMES } from './world/themes.js';
import { skyTexture } from './world/textures.js';
import { buildTrack } from './world/track.js';
import { preloadAllProps } from './world/prop-loader.js';
import { Player } from './player/player.js';
import { createGltfCharacter } from './player/gltf-character.js';
import { createCharacter } from './player/character.js';
import { Sfx } from './audio/sfx.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LEVELS } from './levels/levels.js';

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.sfx = new Sfx();
    this.container = container;

    // 移动端检测：触屏设备自动降档
    this.isMobile = window.matchMedia('(pointer: coarse)').matches;

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.3 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    // 竖屏视野加宽：保证三条道完整可见
    this._applyFov = () => {
      const a = this.camera.aspect;
      this.baseFov = a < 0.8 ? 74 : 60;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    };
    this._applyFov();

    // Bloom 辉光后处理（?nobloom=1 可关闭；手机降强度）
    this.bloomEnabled = !new URLSearchParams(location.search).has('nobloom');
    if (this.bloomEnabled) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(new THREE.Scene(), this.camera));
      this.composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        this.isMobile ? 0.3 : 0.45, // strength
        0.55, // radius
        0.82  // threshold：只有高亮发光元素泛光
      ));
    }
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this._applyFov();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    });

    this.scene = null;
    this.player = null;
    this.level = null;
    this.state = 'menu'; // menu | ready | run | dead | win | pause
    this.auto = false;
    this.sessionBest = {}; // levelId -> { stars, time, coinPct }
    this.muted = false;
    this.levelToken = 0;

    // 预加载 glTF 角色模型（失败自动回退程序化角色）
    this.charFile = null;
    this.setCharacter('KayKit_Rogue.glb');
    this.propsPromise = preloadAllProps();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ---------- 关卡生命周期 ---------- */

  async startLevel(id) {
    const level = LEVELS[id - 1];
    if (!level) return;
    const token = ++this.levelToken;

    // 等待角色与场景道具就绪（最多 3s，超时用程序化兜底）
    const [char] = await Promise.race([
      Promise.all([this.charPromise, this.propsPromise]).then(([c]) => [c]),
      new Promise((r) => setTimeout(() => r([null]), 3000))
    ]);
    if (token !== this.levelToken) return; // 期间用户已切换关卡
    this.disposeScene();

    this.level = level;
    this.theme = THEMES[level.theme];

    const scene = new THREE.Scene();
    scene.background = skyTexture(this.theme.sky, this.theme.horizon);
    // 手机缩短绘制距离（雾外不画）
    const fogScale = this.isMobile ? 0.65 : 1;
    scene.fog = new THREE.Fog(this.theme.fog[0], this.theme.fog[1] * fogScale, this.theme.fog[2] * fogScale);
    this.scene = scene;
    if (this.composer) this.composer.passes[0].scene = scene; // RenderPass 指向新场景

    const [hemiSky, hemiGround, hemiInt] = this.theme.hemi;
    scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemiInt * 1.35));
    const sun = new THREE.DirectionalLight(...this.theme.sun);
    sun.intensity = this.theme.sun[1] * 1.3;
    sun.position.set(6, 12, 8);
    scene.add(sun);

    this.track = buildTrack(level, this.theme, { mobile: this.isMobile });
    scene.add(this.track.group);

    this.player = new Player(scene, char || createCharacter());
    this.gapRows = level.rows.filter((r) => r.t === 'gap');

    this._initParticles(scene);

    this.time = 0;
    this.runTime = 0;
    this.collected = 0;
    this.totalCoins = this.track.coins.length;
    this.magnetT = 0;
    this.boostT = 0;
    this.shield = false;
    this.invulnT = 0;    // 护盾抵挡后的短暂无敌
    this.hitStopT = 0;   // 护盾抵挡顿帧
    this.timeScale = 1;
    this.shake = 0;
    this.ri = 0;          // 障碍宽扫指针
    this.deathTimer = -1;
    this.deathSpin = false;
    this.hudT = 0;
    // 重置本关障碍消耗标记（上局护盾抵挡过的墙要恢复）
    for (const r of level.rows) r.done = false;

    this.state = 'ready';
    this.camera.position.set(0, 4.6, -7.6);
    this.camera.lookAt(0, 1.5, 10);
    this.ui.setReady(level);
    this.ui.showScreen(['ready', 'hud']);
  }

  disposeScene() {
    if (this.player) { this.player.dispose(); this.player = null; }
    if (this.track) { this.track.dispose(); this.track = null; }
    if (this.scene) {
      this.scene.traverse((o) => {
        // userData.shared 的几何体是跨关卡复用的道具模板，不能销毁
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      this.scene = null;
    }
  }

  beginRun() {
    if (this.state !== 'ready') return;
    this.state = 'run';
    this.ui.showScreen(['hud']);
    this.ui.flashMsg('开始！');
    this.sfx.ensure();
    this.sfx.startBgm();
  }

  restart() {
    if (this.level) this.startLevel(this.level.id);
  }

  toLevels() {
    this.state = 'menu';
    this.sfx.stopBgm();
    this.ui.buildLevelGrid(this.sessionBest, (id) => this.startLevel(id));
    this.ui.showScreen(['levels']);
  }

  /* ---------- 输入 ---------- */

  onAction(a) {
    if (a === 'mute') return this.toggleMute();
    if (this.state === 'ready') { this.beginRun(); return; }
    if (this.state === 'dead') { if (a === 'restart') this.restart(); return; }
    if (this.state === 'win') return;
    if (a === 'restart') return this.restart();
    if (a === 'pause') {
      if (this.state === 'run') { this.state = 'pause'; this.ui.showScreen(['hud', 'pause']); }
      else if (this.state === 'pause') { this.state = 'run'; this.ui.showScreen(['hud']); }
      return;
    }
    if (this.state !== 'run') return;
    const p = this.player;
    if (a === 'left') p.moveLane(-1);
    else if (a === 'right') p.moveLane(1);
    else if (a === 'jump') { if (p.jump()) this.sfx.jump(); }
    else if (a === 'slide') { if (p.slide()) this.sfx.slide(); }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.sfx.setMuted(this.muted);
    this.ui.setMuted(this.muted);
  }

  setAuto(v) { this.auto = v; }

  /** 切换角色模型（下一局生效） */
  setCharacter(file) {
    if (file === this.charFile) return;
    this.charFile = file;
    this.charPromise = createGltfCharacter(`${import.meta.env.BASE_URL}models/${file}`).catch((err) => {
      console.warn('[极速跑酷] 角色模型加载失败，使用程序化角色：', err?.message || err);
      return null;
    });
  }

  /** 测试钩子：时间倍率（仅用于自动化验证） */
  setTimeScale(v) { this.timeScale = v; }

  /* ---------- 主循环 ---------- */

  _loop() {
    requestAnimationFrame(this._loop);
    const raw = Math.min(this.clock.getDelta() * (this.timeScale || 1), 0.05);
    // 顿帧：护盾抵挡时短暂慢放（用真实时间恢复，不受慢放影响）
    if (this.hitStopT > 0) {
      this.hitStopT -= raw / (this.timeScale || 1);
      if (this.hitStopT <= 0) this.timeScale = 1;
    }

    if (this.state === 'run') {
      this._sim(raw);
    } else if (this.state === 'dead' && this.deathTimer >= 0) {
      this._deathAnim(raw);
    } else if (this.state === 'win' && this.scene) {
      // 通关后角色继续播放庆祝动画（_idleAnim 内部按状态选择 win 姿态）
      this._updateParticles(raw);
      this._idleAnim(raw, true);
    } else if ((this.state === 'ready' || this.state === 'menu') && this.scene) {
      this._idleAnim(raw);
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _idleAnim(dt, skipTime = false) {
    // 就绪/菜单时轻微推动画，让画面有生命感
    if (!this.track) return;
    if (!skipTime) this.time += dt;
    if (this.player) this.player.char.update(this.state === 'win' ? 'win' : 'idle', dt, this.time * 6);
    for (const s of this.track.spinners) s.rotation.y += dt * 2.5;
    for (const u of this.track.updatables) u(dt, this.time);
  }

  _sim(dt) {
    const lv = this.level;
    const p = this.player;
    this.runTime += dt;
    this.time += dt;

    if (this.auto) this._autopilot(dt);

    // 关内渐速：随进度线性提速
    const progress = Math.min(1, p.z / lv.length);
    const currentSpeed = speedAtProgress(lv.speed, lv.speedEnd ?? lv.speed, progress);
    const speed = speedWithBoost(currentSpeed, this.boostT > 0);
    p.update(dt, speed, (z, x) => overGap(this.gapRows, z, x));
    if (p.land) { p.land = false; this.sfx.land(); }

    // 坠落死亡
    if (p.dead) {
      this._die('掉下了赛道', false);
      return;
    }

    // 到达终点
    if (p.z >= lv.length - 0.6) return this._win();

    const pbox = playerBox(p.x, p.y, p.z, p.sliding);

    // 无敌窗口倒计时（护盾抵挡后 1 秒）
    if (this.invulnT > 0) this.invulnT -= dt;
    // 无敌期间角色闪烁提示
    p.char.group.visible = this.invulnT <= 0 || Math.floor(this.time * 12) % 2 === 0;

    // 障碍碰撞（宽扫窗口）
    while (this.ri < lv.rows.length && lv.rows[this.ri].d < p.z - 5) this.ri++;
    for (let j = this.ri; j < lv.rows.length; j++) {
      const row = lv.rows[j];
      if (row.d > p.z + 4) break;
      if (row.done || this.invulnT > 0) continue;
      if (rowHit(row, this.time, pbox)) {
        const result = decideHit(this.shield);
        if (result === 'shield') {
          this.shield = false;
          row.done = true;
          p.breakShield();
          this.invulnT = 1.0;
          this.hitStopT = 0.18;
          this.timeScale = 0.25; // 顿帧：让"护盾救了我"被清楚地感知到
          this._burst(p.x, 1.2, p.z, 0x3fa9f5, 12);
          this.sfx.shieldBreak();
          this.ui.flashMsg('护盾抵挡！');
          this.shake = 0.4;
        } else {
          this._die('撞上了障碍', true);
          return;
        }
      }
    }

    // 金币
    for (const c of this.track.coins) {
      if (c.taken) continue;
      if (this.magnetT > 0 && inMagnetRange({ x: c.x, y: c.y, z: c.z }, p.x, p.y + 1, p.z)) {
        const [nx, ny, nz] = magnetStep(c.x, c.y, c.z, p.x, p.y + 1, p.z, dt);
        c.x = nx; c.y = ny; c.z = nz;
        c.mesh.position.set(nx, ny, nz);
        c.pulled = true;
      }
      if (coinReachable({ x: c.x, y: c.y, z: c.z }, pbox)) {
        c.taken = true;
        c.mesh.visible = false;
        this.collected++;
        this.sfx.coin();
        this._burst(c.x, c.y, c.z, this.theme.coin, 4);
      }
    }

    // 道具
    for (const it of this.track.items) {
      if (it.taken) continue;
      if (Math.abs(it.z - p.z) < 1.0 && Math.abs(it.x - p.x) < 1.0 && Math.abs(it.y - (p.y + 1)) < 1.3) {
        it.taken = true;
        it.mesh.visible = false;
        this.sfx.power();
        this._burst(it.x, it.y, it.z, 0xffffff, 8);
        if (it.kind === 'magnet') { this.magnetT = MAGNET_TIME; this.ui.flashMsg('磁铁！'); }
        if (it.kind === 'shield') { this.shield = true; p.showShield(); this.ui.flashMsg('护盾！'); }
        if (it.kind === 'boost') { this.boostT = BOOST_TIME; this.ui.flashMsg('加速！'); }
      }
    }

    // 计时器
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.boostT > 0) this.boostT -= dt;

    // 场景动态
    for (const m of this.track.movers) {
      m.mesh.position.x = moveX(m.row, this.time);
      if (m.strip) m.strip.position.x = m.mesh.position.x;
    }
    for (const s of this.track.spinners) if (!s.userData?.static) s.rotation.y += dt * 3;
    for (const u of this.track.updatables) u(dt, this.time);
    this._updateParticles(dt);

    // 相机
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const fovTarget = this.baseFov + (this.boostT > 0 ? 8 : 0);
    if (Math.abs(this.camera.fov - fovTarget) > 0.1) {
      this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
    this._updateCamera(dt);

    // HUD（10Hz 节流）
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.ui.updateHud({
        progress: Math.min(1, p.z / lv.length),
        coins: this.collected,
        total: this.totalCoins,
        speedKmh: Math.round(currentSpeed * 3.6),
        magnetT: this.magnetT,
        shield: this.shield,
        boostT: this.boostT
      });
    }
  }

  _updateCamera(dt) {
    const p = this.player;
    const tx = p.x * 0.55;
    const target = new THREE.Vector3(tx, 4.6, p.z - 7.6);
    this.camera.position.lerp(target, Math.min(1, dt * 8));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(tx, 1.5, p.z + 9);
  }

  /* ---------- 死亡与胜利 ---------- */

  _die(reason, spin) {
    if (this.state !== 'run') return;
    this.state = 'dead';
    this.player.char.group.visible = true; // 无敌闪烁中死亡也要显示角色
    this.deathTimer = 0;
    this.deathSpin = spin && !this.player.isGltf; // glTF 角色用死亡动画，不旋转
    this.deathReason = reason;
    this.shake = 0.5;
    this.sfx.die();
    this._burst(this.player.x, 1, this.player.z, 0xff4d4d, 10);
  }

  _deathAnim(dt) {
    this.deathTimer += dt;
    if (this.player.isGltf) {
      this.player.char.update('dead', dt, 0); // 继续播放死亡动画
    } else if (this.deathSpin) {
      this.player.char.group.rotation.z += dt * 6;
      this.player.char.group.position.y += Math.max(0, 0.4 - this.deathTimer) * dt * 2;
    } else if (this.player.falling) {
      // 坠落死亡：慢镜头中继续下坠，避免定格在半空
      this.player.vy -= 26 * dt;
      this.player.y += this.player.vy * dt;
      this.player.char.group.position.y = this.player.y;
    }
    this.shake = Math.max(0, this.shake - dt);
    this._updateParticles(dt);
    if (this.deathTimer > 0.9) {
      this.deathTimer = -1;
      this.sfx.stopBgm();
      this.ui.showScreen(['hud', 'dead']);
      this.ui.showDead(this.deathReason);
    }
  }

  _win() {
    if (this.state !== 'run') return;
    this.state = 'win';
    this.player.celebrating = true;
    this.sfx.stopBgm();
    this.sfx.win();
    const p = this.player;
    for (let i = 0; i < 3; i++) {
      this._burst(p.x + (i - 1) * 1.5, 2 + i, p.z + i, [0xffd23e, 0xff3df0, 0x3fa9f5][i], 8);
    }
    const pct = this.totalCoins ? this.collected / this.totalCoins : 0;
    const par = parTimeFor(this.level.length, this.level.speed);
    const stars = starFor(pct, this.runTime, par);
    const prev = this.sessionBest[this.level.id];
    this.sessionBest[this.level.id] = {
      stars: Math.max(stars, prev?.stars ?? 0),
      time: Math.min(this.runTime, prev?.time ?? Infinity),
      coinPct: Math.max(pct, prev?.coinPct ?? 0)
    };
    this.ui.showScreen(['hud', 'win']);
    this.ui.showWin({
      stars,
      coins: this.collected,
      total: this.totalCoins,
      time: this.runTime,
      hasNext: this.level.id < LEVELS.length
    });
  }

  /* ---------- 粒子 ---------- */

  _initParticles(scene) {
    const geo = new THREE.OctahedronGeometry(0.09, 0);
    this.particles = [];
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.particles.push({ mesh, mat, v: new THREE.Vector3(), life: 0 });
    }
    this.particleGeo = geo;
  }

  _burst(x, y, z, color, n = 6) {
    let spawned = 0;
    for (const pt of this.particles) {
      if (pt.life > 0) continue;
      pt.life = 0.45 + Math.random() * 0.2;
      pt.mat.color.setHex(color);
      pt.mat.opacity = 1;
      pt.mesh.visible = true;
      pt.mesh.position.set(x, y, z);
      pt.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      pt.v.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
      if (++spawned >= n) break;
    }
  }

  _updateParticles(dt) {
    for (const pt of this.particles) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.mesh.visible = false; continue; }
      pt.v.y -= 12 * dt;
      pt.mesh.position.addScaledVector(pt.v, dt);
      pt.mat.opacity = Math.min(1, pt.life * 2.5);
    }
  }

  /* ---------- 自动试玩（测试用 AI）---------- */

  _autopilot() {
    const p = this.player;
    const lv = this.level;
    const progress = Math.min(1, p.z / lv.length);
    const speed = speedWithBoost(
      speedAtProgress(lv.speed, lv.speedEnd ?? lv.speed, progress),
      this.boostT > 0
    );
    const lookahead = lv.rows.filter((r) => r.d > p.z + 0.5 && r.d < p.z + 20 && !r.done);

    // 1) 选轨道：计算每条轨道距"首个致命障碍"的距离，选最安全的
    //    致命障碍 = 墙、移动障碍（预测落点）；低栏/横杆/缺口可动作通过，不作为变道依据
    const clearance = [Infinity, Infinity, Infinity];
    for (const r of lookahead) {
      if (r.t === 'wall') {
        for (const l of r.l) if (clearance[l] === Infinity) clearance[l] = r.d - p.z;
      } else if (r.t === 'move') {
        const eta = this.time + (r.d - p.z) / speed;
        const x = moveX(r, eta);
        for (let l = 0; l < 3; l++) {
          if (clearance[l] === Infinity && Math.abs(x - laneToX(l)) < 1.6) {
            clearance[l] = r.d - p.z;
          }
        }
      }
    }
    let best = p.lane;
    for (let l = 0; l < 3; l++) {
      if (clearance[l] > clearance[best] + 3) best = l; // 领先 3m 才换道，防振荡
    }
    if (best !== p.lane) p.moveLane(best - p.lane);

    // 2) 动作：当前轨道最近的可行动障碍
    for (const r of lookahead) {
      const affects = r.t === 'move' || (r.l && r.l.includes(p.lane));
      if (!affects) continue;
      const dist = r.d - p.z;
      // 起跳裕量取较大值，抵消帧间隔抖动带来的起跳点偏移
      if (r.t === 'low' && p.grounded && dist < speed * 0.42) { p.jump(); break; }
      if (r.t === 'gap' && p.grounded && dist < speed * 0.32) { p.jump(); break; }
      if (r.t === 'over' && p.grounded && dist < 4.6) { p.slide(); break; }
    }
  }
}
