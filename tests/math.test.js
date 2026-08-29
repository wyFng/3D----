import { describe, it, expect } from 'vitest';
import {
  clamp, smooth01, laneToX, laneShift, aabbOverlap,
  jumpY, jumpApex, jumpAirTime, GRAVITY, JUMP_V, LANE_W
} from '../src/core/math.js';

describe('基础数学函数', () => {
  it('clamp 夹紧', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(1.5, 0, 3)).toBe(1.5);
  });

  it('smooth01 输出范围与端点', () => {
    expect(smooth01(0)).toBe(0);
    expect(smooth01(1)).toBe(1);
    expect(smooth01(-1)).toBe(0);
    expect(smooth01(2)).toBe(1);
    const mid = smooth01(0.5);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('轨道坐标换算（lane 0 = 屏幕左 = +x）', () => {
    expect(laneToX(0)).toBe(LANE_W);
    expect(laneToX(1)).toBe(0);
    expect(laneToX(2)).toBe(-LANE_W);
    expect(laneToX(99)).toBe(-LANE_W); // 越界夹紧
  });

  it('换道夹紧到 0..2', () => {
    expect(laneShift(0, -1)).toBe(0);
    expect(laneShift(2, 1)).toBe(2);
    expect(laneShift(1, 1)).toBe(2);
    expect(laneShift(1, -1)).toBe(0);
  });

  it('AABB 相交判定', () => {
    const a = { x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 };
    expect(aabbOverlap(a, { x: 1.2, y: 1, z: 0, hx: 0.4, hy: 1, hz: 1 })).toBe(true);
    expect(aabbOverlap(a, { x: 2.2, y: 1, z: 0, hx: 0.4, hy: 1, hz: 1 })).toBe(false); // x 分离
    expect(aabbOverlap(a, { x: 0, y: 4, z: 0, hx: 1, hy: 1, hz: 1 })).toBe(false);     // y 分离
    expect(aabbOverlap(a, { x: 0, y: 1, z: 10, hx: 1, hy: 1, hz: 1 })).toBe(false);    // z 分离
  });
});

describe('跳跃抛物线', () => {
  it('起跳与落地高度为 0', () => {
    const T = jumpAirTime();
    expect(jumpY(0)).toBe(0);
    expect(jumpY(T)).toBeCloseTo(0, 5);
  });

  it('最高点 = v0²/2g，出现在 t = v0/g', () => {
    const apex = jumpApex();
    expect(jumpY(JUMP_V / GRAVITY)).toBeCloseTo(apex, 5);
    expect(apex).toBeGreaterThan(1.4); // 必须能跳过低栏(0.85m)
    expect(apex).toBeLessThan(2.2);    // 且不能跳过横杆(底缘1.15m起)
  });

  it('滞空时间内跳跃可跨越缺口', () => {
    const T = jumpAirTime();
    expect(T * 10).toBeGreaterThan(3.4); // 最低速 10m/s 时的跳跃距离 > 缺口纵深 3.2m
  });
});
