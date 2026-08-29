// 入口：装配 UI 与 Game，处理全局按钮与 URL 测试参数

import './style.css';
import { Game } from './game.js';
import { ui } from './ui/ui.js';
import { setupInput } from './input/input.js';
import { LEVELS } from './levels/levels.js';
import { renderCharacterThumb } from './ui/char-preview.js';

const game = new Game(document.getElementById('app'), ui);

/* ---- 可选角色（CC0 模型，见 README 许可说明） ---- */
const CHARACTERS = [
  { file: 'KayKit_Rogue.glb', name: '暗影盗贼', desc: '双匕刺客 · 敏捷均衡' },
  { file: 'KayKit_Knight.glb', name: '钢铁骑士', desc: '重甲剑士 · 沉稳可靠' },
  { file: 'KayKit_Barbarian.glb', name: '狂野蛮人', desc: '巨斧勇士 · 狂野奔放' },
  { file: 'KayKit_Mage.glb', name: '秘法师', desc: '法杖贤者 · 神秘莫测' },
  { file: 'RobotExpressive.glb', name: '电子机器人', desc: 'Q 版机器人 · 活泼搞怪' }
];
let currentChar = 'KayKit_Rogue.glb';

// ?model=xxx.glb 调试参数：直接指定角色模型
const modelName = new URLSearchParams(location.search).get('model');
if (modelName) {
  currentChar = modelName;
  game.setCharacter(modelName);
}

function openCharSelect() {
  ui.buildCharGrid(CHARACTERS, currentChar, (file) => {
    currentChar = file;
    game.setCharacter(file);
    game.sfx.click();
  });
  ui.showScreen(['chars']);
  // 异步渲染每张卡片的角色肖像（模型有缓存，二次打开秒出）
  const canvases = document.querySelectorAll('#char-grid .char-thumb');
  CHARACTERS.forEach((c, i) => {
    const canvas = canvases[i];
    if (canvas && !canvas.dataset.done) {
      renderCharacterThumb(`${import.meta.env.BASE_URL}models/${c.file}`, canvas)
        .then(() => { canvas.dataset.done = '1'; })
        .catch(() => {});
    }
  });
}

setupInput(game.renderer.domElement, {
  action: (a) => game.onAction(a)
});

/* ---- 按钮绑定 ---- */
const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { game.sfx.ensure(); game.sfx.click(); fn(); });

on('btn-start', () => { ui.buildLevelGrid(game.sessionBest, (id) => game.startLevel(id)); ui.showScreen(['levels']); });
on('btn-chars', openCharSelect);
on('btn-chars-back', () => ui.showScreen(['menu']));
on('btn-help', () => document.getElementById('help-panel').classList.toggle('hidden'));
on('btn-back-menu', () => ui.showScreen(['menu']));
on('btn-retry', () => game.restart());
on('btn-dead-back', () => game.toLevels());
on('btn-next', () => {
  const next = Math.min(LEVELS.length, game.level.id + 1);
  game.startLevel(next);
});
on('btn-win-retry', () => game.restart());
on('btn-win-back', () => game.toLevels());
on('btn-resume', () => game.onAction('pause'));
on('btn-pause-retry', () => game.restart());
on('btn-pause-back', () => game.toLevels());
on('btn-pause', () => game.onAction('pause'));
on('btn-mute', () => game.toggleMute());

// 就绪屏：点击任意处开始（移动端主入口）
document.getElementById('scr-ready').addEventListener('pointerup', () => game.beginRun());

/* ---- 测试钩子：?level=N&autoplay=1 供自动化实测 ---- */
const params = new URLSearchParams(location.search);
window.__game = game;
const auto = params.get('autoplay');
if (auto) game.setAuto(true);
const ts = parseFloat(params.get('ts'));
if (ts > 0) game.setTimeScale(ts);
const startId = parseInt(params.get('level'), 10);
if (startId >= 1 && startId <= LEVELS.length) {
  game.startLevel(startId);
} else {
  ui.showScreen(['menu']);
}

// 首次交互后解锁音频
const unlock = () => { game.sfx.ensure(); window.removeEventListener('pointerdown', unlock); };
window.addEventListener('pointerdown', unlock);

// 主菜单用实时游戏场景做背景：后台加载第 1 关，加载完切到菜单态
if (!startId) {
  game.startLevel(1).then(() => {
    if (game.state === 'ready') {
      game.state = 'menu';
      ui.showScreen(['menu']);
    }
  });
}
