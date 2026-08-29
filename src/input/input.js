// 输入：键盘 + 触屏/鼠标滑动。所有操作通过回调交给 Game。

export function setupInput(el, h) {
  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'slide', KeyS: 'slide',
    Escape: 'pause', KeyP: 'pause',
    KeyR: 'restart', KeyM: 'mute'
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const a = keyMap[e.code];
    if (!a) return;
    e.preventDefault();
    h.action(a);
  });

  // 触屏 / 鼠标滑动（阈值按屏幕短边 4% 自适应）
  let sx = 0, sy = 0, tracking = false;
  const SWIPE = Math.max(24, Math.min(window.innerWidth, window.innerHeight) * 0.04);

  el.addEventListener('pointerdown', (e) => {
    tracking = true;
    sx = e.clientX; sy = e.clientY; st = performance.now();
  });

  el.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < SWIPE && ady < SWIPE) {
      h.action('jump'); // 轻点 = 跳跃
      return;
    }
    if (adx > ady) h.action(dx > 0 ? 'right' : 'left');
    else h.action(dy > 0 ? 'slide' : 'jump');
  });

  el.addEventListener('pointercancel', () => { tracking = false; });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
