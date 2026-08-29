// 关卡系统 v3：2000 米长关 + 确定性路段块生成
// 每关由 40~60 个"路段块"铺满 12m→1988m，难度在关内三段递进
// 金币确定性自动铺设（避开障碍与缺口），由 validate.js 把关可通行性

let seq = 0;
const GAP_SAFE = 3.2; // 与 core/math.js 的 GAP_LEN 一致

function builder() {
  const rows = [], items = [];
  const L = (v) => (Array.isArray(v) ? v : [v]);
  return {
    rows, items,
    wall: (d, l) => rows.push({ d, t: 'wall', l: L(l) }),
    low: (d, l) => rows.push({ d, t: 'low', l: L(l) }),
    over: (d, l) => rows.push({ d, t: 'over', l: L(l) }),
    gap: (d, l) => rows.push({ d, t: 'gap', l: L(l) }),
    move: (d, o = {}) =>
      rows.push({ d, t: 'move', l: [0, 1, 2], amp: o.amp ?? 2.2, spd: o.spd ?? 1.0, phase: o.phase ?? 0 }),
    item: (d, l, k) => items.push({ d, l, k })
  };
}

/* ---- 路段块工厂：每块在自己的区间铺障碍，返回消耗的距离 ---- */

function blockFactories(g, st) {
  const lane = (k) => [1, 0, 2][((k % 3) + 3) % 3];
  const pair = (k) => [[0, 1], [1, 2], [0, 2]][((k % 3) + 3) % 3];
  // 通用"连续 N 个"模板：越界自动停止
  const run = (place, count) => (d, every, limit) => {
    let placed = 0;
    for (let k = 0; k < count && d + k * every < limit; k++) {
      place(d + k * every, k);
      placed++;
    }
    st.off += placed;
    return placed * every;
  };
  return {
    // 连续低栏（换道跳）
    hurdles: run((dd, k) => g.low(dd, lane(st.off + k)), 3),
    // 蛇形墙
    slalom: run((dd, k) => g.wall(dd, lane(st.off + k + 1)), 3),
    // 双墙换道（每次堵两条道）
    doubleWall: run((dd, k) => g.wall(dd, pair(st.off + k)), 3),
    // 横杆链（每第 3 个为全轨横杆）
    bars: run((dd, k) => g.over(dd, k % 3 === 2 ? [0, 1, 2] : [lane(st.off + k)]), 3),
    // 缺口链（单道/双道/整宽壕沟轮换）
    gaps: run((dd, k) => {
      const sets = [[1], [0], [0, 1], [2], [1, 2], [0, 1, 2]];
      g.gap(dd, sets[((st.off + k) % 6 + 6) % 6]);
    }, 3),
    // 同点组合：一条道低栏 + 另一条道墙
    combo: run((dd, k) => {
      const a = lane(st.off + k);
      const b = (a + 1 + (k % 2)) % 3;
      g.low(dd, a);
      g.wall(dd, b === a ? (a + 1) % 3 : b);
    }, 2),
    // 移动石墩（独占区域）
    mover: (d, every) => {
      g.move(d, { spd: st.moverSpd, phase: st.off * 1.13 });
      st.off++;
      return every;
    }
  };
}

/** 块序列铺满赛道，并按三段递进收紧间距 */
function fillWithBlocks(g, { length, blocks, evers, moverSpd }) {
  const st = { off: 0, moverSpd };
  const F = blockFactories(g, st);
  let d = 14;
  let i = 0;
  const end = length - 20;
  while (d < end) {
    const phase = d < length * 0.38 ? 0 : d < length * 0.72 ? 1 : 2;
    const f = F[blocks[i % blocks.length]];
    d += f(d, evers[phase], length - 12) + 4;
    i++;
  }
  // 道具：每 ~330m 一个，三种轮换，自动避开障碍
  const kinds = ['shield', 'magnet', 'boost'];
  let kind = 0;
  for (let dd = 320; dd < length - 60; dd += 330) {
    let lane = -1;
    for (const l of [1, 0, 2]) {
      const solid = g.rows.some(
        (r) => r.t !== 'gap' && r.t !== 'move' && r.l.includes(l) && Math.abs(r.d - dd) < 2
      );
      const swept = g.rows.some((r) => r.t === 'move' && Math.abs(r.d - dd) < 2.5);
      if (!solid && !swept) { lane = l; break; }
    }
    if (lane >= 0) g.item(dd, lane, kinds[kind++ % 3]);
  }
}

/** 每关配方：按章节定义块序列与间距（三段递进） */
function levelConfig(id) {
  const chapter = Math.floor((id - 1) / 3);
  const inChap = (id - 1) % 3;
  const speed = [11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 17][id - 1];
  const speedEnd = Math.round(speed * 1.25 * 10) / 10; // 关内末段提速 25%
  const moverSpd = 1.1 + chapter * 0.2 + inChap * 0.07;
  const configs = [
    { blocks: ['hurdles', 'slalom', 'hurdles', 'doubleWall'], evers: [20, 16, 13] },
    { blocks: ['hurdles', 'mover', 'bars', 'slalom', 'combo', 'doubleWall'], evers: [19, 15, 12] },
    { blocks: ['gaps', 'slalom', 'bars', 'gaps', 'mover', 'doubleWall', 'hurdles'], evers: [24, 20, 17] },
    { blocks: ['combo', 'gaps', 'mover', 'hurdles', 'bars', 'slalom', 'gaps', 'doubleWall'], evers: [16, 13, 11] }
  ];
  return { speed, speedEnd, moverSpd, ...configs[chapter] };
}

/** 组装关卡：障碍由块生成，金币确定性自动铺设 */
function makeLevel(meta, setup) {
  const g = builder();
  setup(g);
  g.rows.sort((a, c) => a.d - c.d);

  const blocked = (d, lane) =>
    g.rows.some(
      (r) =>
        (r.t === 'move' && Math.abs(r.d - d) < 2.2) ||
        (r.t !== 'gap' && r.t !== 'move' && r.l.includes(lane) && Math.abs(r.d - d) < 2.0)
    );
  const inGap = (d, lane) =>
    g.rows.some((r) => r.t === 'gap' && r.l.includes(lane) && d > r.d - 1 && d < r.d + GAP_SAFE + 1);

  const coins = [];
  for (let d = 34; d < meta.length - 14; d += 26) {
    for (const lane of [1, 0, 2]) {
      // 逐枚检查 4 个金币位（间隔 2m）前后都不压障碍、不落缺口
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        if (blocked(d + i * 2, lane) || inGap(d + i * 2, lane)) ok = false;
      }
      if (ok) {
        coins.push({ d, l: lane, n: 4, y: 'g' });
        break;
      }
    }
  }
  // 低栏/缺口上方的跨跃金币弧（每 3 处一个，避免过密）
  let jumpIdx = 0;
  for (const r of g.rows) {
    if ((r.t === 'low' || r.t === 'gap') && jumpIdx++ % 3 === 0) {
      coins.push({ d: r.d - 3, l: r.l[0], n: 5, y: 'a' });
    }
  }
  coins.sort((a, c) => a.d - c.d);
  g.items.sort((a, c) => a.d - c.d);
  return { id: ++seq, ...meta, rows: g.rows, coins, items: g.items };
}

/* ---- 12 关 × 2000m ---- */

const NAMES = [
  '霓虹都市 · 启程', '霓虹都市 · 滑行', '霓虹都市 · 穿行',
  '古庙丛林 · 石径', '古庙丛林 · 遗迹', '古庙丛林 · 深林',
  '天空浮岛 · 云端', '天空浮岛 · 断桥', '天空浮岛 · 风暴',
  '熔岩洞窟 · 火径', '熔岩洞窟 · 奔流', '熔岩洞窟 · 终局'
];
const THEME_BY_LEVEL = ['neon', 'jungle', 'sky', 'lava'];

export const LEVELS = NAMES.map((name, i) => {
  const id = i + 1;
  const cfg = levelConfig(id);
  return makeLevel(
    {
      name,
      theme: THEME_BY_LEVEL[Math.floor((id - 1) / 3)],
      speed: cfg.speed,
      speedEnd: cfg.speedEnd,
      length: 2000
    },
    (g) => fillWithBlocks(g, { length: 2000, ...cfg })
  );
});

export const THEMES_ORDER = ['neon', 'jungle', 'sky', 'lava'];
