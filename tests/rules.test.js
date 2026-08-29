import { describe, it, expect } from 'vitest';
import {
  playerBox, obstacleBox, rowHit, overGap, decideHit,
  magnetStep, coinReachable, inMagnetRange, speedWithBoost,
  starFor, parTimeFor, moveX
} from '../src/core/rules.js';
import { JUMP_V, GRAVITY, GAP_LEN, MAGNET_RADIUS, BOOST_FACTOR } from '../src/core/math.js';

describe('障碍碰撞盒', () => {
  it('墙在轨道上且高 2.6m', () => {
    const b = obstacleBox({ d: 100, t: 'wall', l: [1] }, 0);
    expect(b.x).toBe(0);
    expect(b.y + b.hy).toBeCloseTo(2.6);
  });

  it('低栏顶部 0.85m，可被跳跃越过', () => {
    const low = obstacleBox({ d: 100, t: 'low', l: [1] }, 0);
    expect(low.y + low.hy).toBeCloseTo(0.85);
    // 地面站立 → 撞上
    expect(rowHit({ d: 100, t: 'low', l: [1] }, 0, playerBox(0, 0, 100, false))).toBe(true);
    // 跳到最高点 → 越过
    const feet = (JUMP_V * JUMP_V) / (2 * GRAVITY);
    expect(rowHit({ d: 100, t: 'low', l: [1] }, 0, playerBox(0, feet, 100, false))).toBe(false);
  });

  it('横杆：站立撞上，滑铲通过', () => {
    const row = { d: 100, t: 'over', l: [1] };
    expect(rowHit(row, 0, playerBox(0, 0, 100, false))).toBe(true);
    expect(rowHit(row, 0, playerBox(0, 0, 100, true))).toBe(false);
  });

  it('缺口没有碰撞盒', () => {
    expect(obstacleBox({ d: 100, t: 'gap', l: [0, 1] }, 0)).toBeNull();
    expect(rowHit({ d: 100, t: 'gap', l: [0, 1] }, 0, playerBox(0, 0, 100, false))).toBe(false);
  });

  it('移动障碍按正弦规律移动且确定性', () => {
    const row = { d: 100, t: 'move', l: [0, 1, 2], amp: 2.2, spd: 1, phase: 0 };
    expect(moveX(row, 0)).toBeCloseTo(0);
    expect(moveX(row, Math.PI / 2)).toBeCloseTo(2.2);
    expect(moveX(row, 0)).toBe(moveX(row, 0)); // 同一时刻结果一致（可预测）
  });
});

describe('缺口坠落判定', () => {
  const rows = [{ d: 100, t: 'gap', l: [0] }];
  it('站在缺口轨道上 → 坠落', () => {
    expect(overGap(rows, 100.5, 2.2)).toBe(true); // lane 0 = +2.2
    expect(overGap(rows, 100 + GAP_LEN - 0.5, 2.2)).toBe(true);
  });
  it('旁边的轨道不受影响', () => {
    expect(overGap(rows, 100.5, 0)).toBe(false);
    expect(overGap(rows, 100.5, -2.2)).toBe(false);
  });
  it('缺口范围外不受影响', () => {
    expect(overGap(rows, 95, 2.2)).toBe(false);
    expect(overGap(rows, 100 + GAP_LEN + 1, 2.2)).toBe(false);
  });
});

describe('道具规则', () => {
  it('护盾抵消一次碰撞', () => {
    expect(decideHit(true)).toBe('shield');
    expect(decideHit(false)).toBe('die');
  });

  it('磁铁逐步把金币拉向玩家并最终可拾取', () => {
    let c = [0, 1, 50];
    const p = [0, 1.2, 53];
    const pbox = { x: 0, y: 1.2, z: 53, hx: 0.35, hy: 0.85, hz: 0.3 };
    for (let i = 0; i < 600; i++) {
      c = magnetStep(...c, ...p, 1 / 60);
    }
    expect(coinReachable({ x: c[0], y: c[1], z: c[2] }, pbox)).toBe(true);
  });

  it('磁铁范围判定：前方吸附、后方不吸附', () => {
    expect(inMagnetRange({ x: 0, y: 1, z: 52 }, 0, 1, 48, MAGNET_RADIUS)).toBe(true);
    expect(inMagnetRange({ x: 0, y: 1, z: 44 }, 0, 1, 48, MAGNET_RADIUS)).toBe(false);
  });

  it('加速提高速度', () => {
    expect(speedWithBoost(10, false)).toBe(10);
    expect(speedWithBoost(10, true)).toBeCloseTo(10 * BOOST_FACTOR);
  });
});

describe('星级与标准时间', () => {
  const par = parTimeFor(320, 10);
  it('标准时间为正且略大于理论值', () => {
    expect(par).toBeGreaterThan(320 / 10);
  });
  it('高收集率+快速 → 3星', () => {
    expect(starFor(0.9, par * 0.95, par)).toBe(3);
  });
  it('中等表现 → 2星', () => {
    expect(starFor(0.6, par * 1.2, par)).toBe(2);
  });
  it('低收集率 → 1星', () => {
    expect(starFor(0.2, par * 0.9, par)).toBe(1);
    expect(starFor(0.95, par * 2, par)).toBe(1); // 超时太多
  });
});
