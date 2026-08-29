import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/levels/levels.js';
import { validateLevel } from '../src/levels/validate.js';
import { parTimeFor } from '../src/core/rules.js';

describe('12 关关卡数据合法性', () => {
  it('共有 12 关且编号连续', () => {
    expect(LEVELS).toHaveLength(12);
    LEVELS.forEach((lv, i) => expect(lv.id).toBe(i + 1));
  });

  it('每一关都通过合法性校验（可通行、无重叠、有终点）', () => {
    const allErrors = [];
    for (const lv of LEVELS) {
      const errs = validateLevel(lv);
      if (errs.length) allErrors.push(...errs);
    }
    expect(allErrors).toEqual([]);
  });

  it('每关都有金币且金币总数合理', () => {
    for (const lv of LEVELS) {
      const total = lv.coins.reduce((s, c) => s + (c.n ?? 1), 0);
      expect(total).toBeGreaterThanOrEqual(20);
      expect(total).toBeLessThanOrEqual(700);
    }
  });

  it('每关至少含一种道具', () => {
    for (const lv of LEVELS) {
      expect(lv.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('难度曲线：速度随关数不下降，且关内末段提速', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].speed).toBeGreaterThanOrEqual(LEVELS[i - 1].speed);
    }
    for (const lv of LEVELS) {
      expect(lv.speedEnd).toBeGreaterThan(lv.speed);
    }
  });

  it('每关为 2000 米，标准时间在 100~230 秒内', () => {
    for (const lv of LEVELS) {
      expect(lv.length).toBe(2000);
      const par = parTimeFor(lv.length, lv.speed, lv.speedEnd);
      expect(par).toBeGreaterThan(100);
      expect(par).toBeLessThan(230);
    }
  });

  it('第一章教学关不含移动障碍与缺口，第三章才引入缺口', () => {
    for (const lv of LEVELS.slice(0, 3)) {
      expect(lv.rows.some((r) => r.t === 'move')).toBe(false);
      expect(lv.rows.some((r) => r.t === 'gap')).toBe(false);
    }
    expect(LEVELS[6].rows.some((r) => r.t === 'gap')).toBe(true);
  });
});
