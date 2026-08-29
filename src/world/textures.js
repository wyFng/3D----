// 程序化 CanvasTexture：楼体窗户、天空渐变、地面纹理（无外部图片）

import * as THREE from 'three';

function hex(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** 亮窗楼体纹理：暗色楼体 + 随机点亮的窗户点阵 */
export function windowTexture(baseColor, litColors) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = hex(baseColor);
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 14;
  const cw = 128 / cols, rh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (Math.random() < 0.42) continue; // 部分窗户不亮
      g.fillStyle = hex(litColors[Math.floor(Math.random() * litColors.length)]);
      g.globalAlpha = 0.55 + Math.random() * 0.45;
      g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.24, cw * 0.56, rh * 0.42);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 天空渐变背景（顶部→地平线） */
export function skyTexture(topColor, bottomColor) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, hex(topColor));
  grad.addColorStop(0.62, hex(mix(topColor, bottomColor, 0.55)));
  grad.addColorStop(1, hex(bottomColor));
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 地面板材纹理：横向防滑纹 + 边缘暗缝 */
export function floorTexture(baseColor) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = hex(baseColor);
  g.fillRect(0, 0, 128, 128);
  g.globalAlpha = 0.14;
  for (let y = 8; y < 128; y += 16) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, y, 128, 2);
    g.fillStyle = '#000000';
    g.fillRect(0, y + 6, 128, 3);
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 4);
  g.fillRect(0, 124, 128, 4);
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
