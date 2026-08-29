// 数学常量与纯函数（可单元测试，不依赖 three.js）

export const LANE_W = 2.2;
// 赛道沿 +Z 延伸、相机朝 +Z 观察时，世界 +X 投影在屏幕左侧，
// 因此 lane 0（左）对应 +x，lane 2（右）对应 -x
export const LANE_X = [LANE_W, 0, -LANE_W];

export const GRAVITY = 26;
export const JUMP_V = 9.2;
export const SLIDE_TIME = 0.65;
export const LANE_TIME = 0.16;
export const GAP_LEN = 3.2;      // 缺口（断桥）纵深
export const FALL_DEATH_Y = -2.5;

export const PLAYER = { hx: 0.35, hz: 0.3, h: 1.7, slideH: 0.8 };

export const MAGNET_RADIUS = 5.0;
export const MAGNET_SPEED = 18;
export const MAGNET_TIME = 6;
export const BOOST_TIME = 4;
export const BOOST_FACTOR = 1.35;

export const LANES = [0, 1, 2];

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** 0..1 平滑插值曲线 */
export function smooth01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 轨道序号(0,1,2) → 世界 x 坐标 */
export function laneToX(lane) {
  return LANE_X[clamp(Math.round(lane), 0, 2)];
}

/** 换道并夹紧到 0..2 */
export function laneShift(lane, delta) {
  return clamp(lane + delta, 0, 2);
}

/** AABB 相交（中心 + 半尺寸） */
export function aabbOverlap(a, b) {
  return (
    Math.abs(a.x - b.x) < a.hx + b.hx &&
    Math.abs(a.y - b.y) < a.hy + b.hy &&
    Math.abs(a.z - b.z) < a.hz + b.hz
  );
}

/** 跳跃抛物线：t 秒后的高度（不低于 0） */
export function jumpY(t, v0 = JUMP_V, g = GRAVITY) {
  const y = v0 * t - 0.5 * g * t * t;
  return y > 0 ? y : 0;
}

export function jumpApex(v0 = JUMP_V, g = GRAVITY) {
  return (v0 * v0) / (2 * g);
}

export function jumpAirTime(v0 = JUMP_V, g = GRAVITY) {
  return (2 * v0) / g;
}
