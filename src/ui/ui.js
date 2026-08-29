// UI 层管理：屏幕切换、HUD、关卡网格、结算

import { THEMES } from '../world/themes.js';
import { LEVELS } from '../levels/levels.js';

const $ = (id) => document.getElementById(id);

const SCREENS = ['menu', 'levels', 'chars', 'ready', 'hud', 'dead', 'win', 'pause'];

export const ui = {
  onPickLevel: null,

  showScreen(names) {
    for (const s of SCREENS) {
      $(`scr-${s}`).classList.toggle('hidden', !names.includes(s));
    }
  },

  setReady(level) {
    const theme = THEMES[level.theme];
    $('ready-chip').textContent = `第 ${level.id} 关 · ${theme.name}`;
    $('ready-chip').style.background = `#${theme.rail.toString(16).padStart(6, '0')}`;
    $('ready-name').textContent = level.name;
  },

  updateHud({ progress, coins, total, speedKmh, magnetT, shield, boostT }) {
    $('hud-progress-fill').style.width = `${(progress * 100).toFixed(1)}%`;
    $('hud-coins').textContent = `🪙 ${coins}/${total}`;
    const speedEl = $('hud-speed');
    speedEl.textContent = `🏃 ${speedKmh} km/h`;
    // 速度越快颜色越暖，强化提速感知
    const heat = Math.min(1, Math.max(0, (speedKmh - 40) / 40));
    speedEl.style.color = `rgb(${255}, ${Math.round(255 - heat * 170)}, ${Math.round(255 - heat * 210)})`;
    const chips = [];
    if (magnetT > 0) chips.push(`<div class="chip chip-magnet">🧲 磁铁 ${magnetT.toFixed(1)}s</div>`);
    if (shield) chips.push(`<div class="chip chip-shield">🛡 护盾</div>`);
    if (boostT > 0) chips.push(`<div class="chip chip-boost">⚡ 加速 ${boostT.toFixed(1)}s</div>`);
    $('hud-powerups').innerHTML = chips.join('');
  },

  flashMsg(text) {
    const el = $('hud-msg');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth; // 重启动画
    el.classList.add('pop');
  },

  showDead(reason) {
    $('dead-reason').textContent = reason;
  },

  showWin({ stars, coins, total, time, hasNext }) {
    $('win-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('win-stats').innerHTML = `
      <span>🪙 金币 ${coins}/${total}</span>
      <span>⏱ 用时 ${time.toFixed(1)}s</span>`;
    $('btn-next').style.display = hasNext ? '' : 'none';
  },

  setMuted(m) {
    $('btn-mute').textContent = m ? '🔇' : '🔊';
  },

  buildCharGrid(characters, currentFile, onPick) {
    const grid = $('char-grid');
    grid.innerHTML = '';
    for (const c of characters) {
      const card = document.createElement('button');
      card.className = 'level-card char-card' + (c.file === currentFile ? ' char-active' : '');
      card.innerHTML = `
        <canvas class="char-thumb" width="220" height="220"></canvas>
        <div class="lv-name">${c.name}</div>
        <div class="char-desc">${c.desc}</div>`;
      card.addEventListener('click', () => {
        grid.querySelectorAll('.char-card').forEach((el) => el.classList.remove('char-active'));
        card.classList.add('char-active');
        onPick(c.file);
      });
      grid.appendChild(card);
    }
  },

  buildLevelGrid(bests, onPick) {
    this.onPickLevel = onPick;
    const grid = $('level-grid');
    grid.innerHTML = '';
    for (const lv of LEVELS) {
      const theme = THEMES[lv.theme];
      const best = bests[lv.id];
      const card = document.createElement('button');
      card.className = 'level-card';
      card.style.setProperty('--accent', `#${theme.rail.toString(16).padStart(6, '0')}`);
      card.innerHTML = `
        <div class="lv-num">${lv.id}</div>
        <div class="lv-name">${lv.name}</div>
        <div class="lv-stars">${best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '未挑战'}</div>`;
      card.addEventListener('click', () => onPick(lv.id));
      grid.appendChild(card);
    }
  }
};
