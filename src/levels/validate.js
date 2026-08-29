// 关卡数据合法性校验（纯函数，供单元测试使用）
// 校验目标：每一关都必然存在可通行路径、金币/道具不会压在障碍里

import { LANES, GAP_LEN } from '../core/math.js';
import { OBSTACLE_TYPES, ITEM_KINDS } from '../core/rules.js';

const COIN_SPACING = 2.0;

/** 按 d 分组（Δd < 0.5 视为同一位置） */
function groupByD(rows) {
  const sorted = [...rows].sort((a, b) => a.d - b.d);
  const groups = [];
  for (const r of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(r.d - g[0].d) < 0.5) g.push(r);
    else groups.push([r]);
  }
  return groups;
}

function unionLanes(group) {
  const s = new Set();
  for (const r of group) for (const l of r.l || []) s.add(l);
  return s;
}

/** 地面物体（金币/道具）是否被实体障碍压住 */
function blockedBy(rows, d, lane, y) {
  for (const r of rows) {
    if (r.t === 'move') {
      if (y !== 'a' && Math.abs(r.d - d) < 1.5) return true; // 移动障碍横扫全部轨道
      continue;
    }
    if (r.t === 'gap') continue;
    if (!r.l.includes(lane)) continue;
    if (r.t === 'over') {
      // 横杆悬空：地面金币可从下方通过；空中金币会穿模
      if (y === 'a' && Math.abs(r.d - d) < 1.0) return true;
      continue;
    }
    if (Math.abs(r.d - d) < 1.0) return true; // wall / low
  }
  return false;
}

function insideGap(rows, d, lane) {
  for (const r of rows) {
    if (r.t !== 'gap' || !r.l.includes(lane)) continue;
    if (d > r.d - 0.5 && d < r.d + GAP_LEN + 0.5) return true;
  }
  return false;
}

export function validateLevel(lv) {
  const errs = [];
  const push = (m) => errs.push(`[第${lv.id}关 ${lv.name}] ${m}`);

  if (!Number.isFinite(lv.id)) push('缺少 id');
  if (!lv.name) push('缺少 name');
  if (!lv.theme) push('缺少 theme');
  if (!(lv.speed >= 5 && lv.speed <= 25)) push(`speed 非法: ${lv.speed}`);
  if (!(lv.length >= 150)) push(`关卡长度不足: ${lv.length}`);

  const rows = lv.rows || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].d < rows[i - 1].d - 1e-6) push(`rows 未按 d 排序 @index ${i}`);
  }
  for (const r of rows) {
    if (!OBSTACLE_TYPES.includes(r.t)) push(`未知障碍类型 "${r.t}" @d=${r.d}`);
    if (r.t === 'move') continue; // 移动障碍横扫全部轨道，无需轨道列表
    if (!Array.isArray(r.l) || r.l.length === 0) push(`障碍缺少轨道列表 @d=${r.d} ${r.t}`);
    else for (const l of r.l) if (!LANES.includes(l)) push(`轨道编号非法 ${l} @d=${r.d}`);
    if (r.d < 12) push(`障碍距起点过近 @d=${r.d}`);
    if (r.d > lv.length - 10) push(`障碍距终点过近 @d=${r.d}`);
  }

  // 同一位置的通过性
  const groups = groupByD(rows);
  const fullGapGroups = [];
  for (const g of groups) {
    let hasMove = false, hasGap = false;
    const solid = new Set();
    for (const r of g) {
      if (r.t === 'move') hasMove = true;
      else if (r.t === 'gap') hasGap = true;
      // 只有墙是完全无法用动作越过的；低栏可跳、横杆可滑
      else if (r.t === 'wall') for (const l of r.l) solid.add(l);
    }
    if (hasMove && (solid.size > 0 || hasGap)) push(`移动障碍与其他障碍位置重叠 @d=${g[0].d}`);
    if (!hasMove && !hasGap && solid.size >= 3) push(`同一位置堵死全部轨道 @d=${g[0].d}`);
    if (hasGap && unionLanes(g).size >= 3) fullGapGroups.push(g[0].d);
  }
  // 全轨道缺口（整宽壕沟）必须留出落地+再起跳的距离
  for (let i = 1; i < fullGapGroups.length; i++) {
    if (fullGapGroups[i] - fullGapGroups[i - 1] < GAP_LEN + 5) {
      push(`连续全轨缺口过近 @d=${fullGapGroups[i]}，玩家无法落地起跳`);
    }
  }

  for (const c of lv.coins || []) {
    if (!LANES.includes(c.l)) push(`金币轨道非法 @d=${c.d}`);
    const n = c.n ?? 1;
    for (let i = 0; i < n; i++) {
      const d = c.d + i * COIN_SPACING;
      if (c.y !== 'a' && insideGap(rows, d, c.l)) push(`地面金币落在缺口上方 @d=${d} 轨道${c.l}`);
      if (blockedBy(rows, d, c.l, c.y)) push(`金币与障碍重叠 @d=${d} 轨道${c.l}`);
    }
  }

  for (const it of lv.items || []) {
    if (!ITEM_KINDS.includes(it.k)) push(`未知道具 "${it.k}" @d=${it.d}`);
    if (!LANES.includes(it.l)) push(`道具轨道非法 @d=${it.d}`);
    else if (blockedBy(rows, it.d, it.l, 'g')) push(`道具与障碍重叠 @d=${it.d}`);
  }

  return errs;
}
