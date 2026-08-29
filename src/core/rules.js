// 游戏规则纯函数：障碍碰撞、道具效果、星级评定
// 均不依赖 three.js，供单元测试与运行时共用

import {
  aabbOverlap, clamp, laneToX, PLAYER,
  MAGNET_RADIUS, MAGNET_SPEED, BOOST_FACTOR, GAP_LEN
} from './math.js';

export const OBSTACLE_TYPES = ['wall', 'low', 'over', 'gap', 'move'];
export const ITEM_KINDS = ['magnet', 'shield', 'boost'];

/**
 * 生成玩家碰撞盒（中心 + 半尺寸）
 * @param {number} x 世界 x
 * @param {number} feetY 脚底高度
 * @param {number} z 世界 z（前进方向）
 * @param {boolean} sliding 是否滑铲
 */
export function playerBox(x, feetY, z, sliding) {
  const h = sliding ? PLAYER.slideH : PLAYER.h;
  return { x, y: feetY + h / 2, z, hx: PLAYER.hx, hy: h / 2, hz: PLAYER.hz };
}

/** 移动障碍在 time 时刻的 x 坐标（确定性正弦摆动） */
export function moveX(row, time) {
  const amp = row.amp ?? 2.2;
  const spd = row.spd ?? 1.2;
  return Math.sin(time * spd + (row.phase ?? 0)) * amp;
}

/**
 * 障碍物碰撞盒。gap（缺口）无碰撞盒，返回 null。
 * 行数据: { d, t, l: [lanes], amp?, spd?, phase? }
 */
export function obstacleBox(row, time) {
  if (row.t === 'gap') return null;
  const z = row.d;
  switch (row.t) {
    case 'wall':
      return { x: laneToX(row.l[0]), y: 1.3, z, hx: 1.0, hy: 1.3, hz: 0.4 };
    case 'move':
      return { x: moveX(row, time), y: 1.3, z, hx: 0.9, hy: 1.3, hz: 0.4 };
    case 'low':
      return { x: laneToX(row.l[0]), y: 0.425, z, hx: 1.0, hy: 0.425, hz: 0.3 };
    case 'over':
      // 横杆底缘 1.15m，顶部 2.6m —— 站立会撞上，滑铲可通过
      return { x: laneToX(row.l[0]), y: 1.875, z, hx: 1.0, hy: 0.725, hz: 0.3 };
    default:
      return null;
  }
}

/** 玩家是否撞上该障碍行（gap 永不碰撞，走坠落逻辑） */
export function rowHit(row, time, pbox) {
  const box = obstacleBox(row, time);
  if (!box) return false;
  return aabbOverlap(pbox, box);
}

/** 玩家在 z 处是否处于缺口上方（x 决定所在轨道） */
export function overGap(rows, z, x, laneW = 2.2) {
  for (const r of rows) {
    if (r.t !== 'gap') continue;
    if (z < r.d - 0.1 || z > r.d + GAP_LEN + 0.1) continue;
    for (const lane of r.l) {
      if (Math.abs(x - laneToX(lane)) < laneW / 2 + 0.15) return true;
    }
  }
  return false;
}

/** 被击中时的结果：有护盾则抵消，否则死亡 */
export function decideHit(hasShield) {
  return hasShield ? 'shield' : 'die';
}

/** 磁铁：把金币朝玩家胸口拉动一步（纯函数，返回新位置） */
export function magnetStep(cx, cy, cz, px, py, pz, dt, speed = MAGNET_SPEED) {
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return [px, py, pz];
  const step = Math.min(speed * dt, dist);
  const k = step / dist;
  return [cx + dx * k, cy + dy * k, cz + dz * k];
}

/** 金币是否可被拾取（与玩家碰撞盒的距离判定） */
export function coinReachable(coin, pbox, radius = 0.95) {
  return (
    Math.abs(coin.x - pbox.x) < radius &&
    Math.abs(coin.y - pbox.y) < radius &&
    Math.abs(coin.z - pbox.z) < radius
  );
}

/** 金币是否在磁铁吸附范围内（只在玩家前方或略后方） */
export function inMagnetRange(coin, px, py, pz, radius = MAGNET_RADIUS) {
  const dz = coin.z - pz;
  return dz > -1 && dz < radius && Math.hypot(coin.x - px, coin.z - pz) < radius;
}

/** 加速道具下的实际速度 */
export function speedWithBoost(baseSpeed, boostActive) {
  return boostActive ? baseSpeed * BOOST_FACTOR : baseSpeed;
}

/** 关内渐速：随进度从起始速度线性加速到终止速度 */
export function speedAtProgress(startSpeed, endSpeed, progress) {
  const t = clamp(progress, 0, 1);
  return startSpeed + (endSpeed - startSpeed) * t;
}

/** 星级评定：金币收集率 + 通关时间 vs 标准时间 */
export function starFor(coinPct, time, parTime) {
  if (coinPct >= 0.85 && time <= parTime) return 3;
  if (coinPct >= 0.5 && time <= parTime * 1.3) return 2;
  return 1;
}

/** 标准通关时间（关内渐速时按平均速度估算） */
export function parTimeFor(length, speed, speedEnd = speed) {
  const avg = (speed + speedEnd) / 2;
  return (length / avg) * 1.12 + 2;
}
