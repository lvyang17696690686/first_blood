import { MAP_W, MAP_H, TILE } from './config';
import type { GameMap } from './map';
import type { Vec2 } from './types';

// ===== A* 寻路（8方向，禁止切角）=====

const W = MAP_W, H = MAP_H;
const gScore = new Float32Array(W * H);
const fScore = new Float32Array(W * H);
const cameFrom = new Int32Array(W * H);
// 二叉堆
const heap: number[] = [];
let stamp = 0;
const visitedStamp = new Int32Array(W * H);
const closedStamp = new Int32Array(W * H);

function heapPush(idx: number) {
  heap.push(idx);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[i]]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function heapPop(): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l;
      if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

function heuristic(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
}

/** 视线检测（Bresenham，用于路径平滑） */
export function lineWalkable(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  let tx0 = Math.floor(x0 / TILE), ty0 = Math.floor(y0 / TILE);
  const tx1 = Math.floor(x1 / TILE), ty1 = Math.floor(y1 / TILE);
  const dx = Math.abs(tx1 - tx0), dy = Math.abs(ty1 - ty0);
  const sx = tx0 < tx1 ? 1 : -1, sy = ty0 < ty1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard++ < 2000) {
    if (!map.isWalkableTile(tx0, ty0)) return false;
    if (tx0 === tx1 && ty0 === ty1) return true;
    const e2 = err * 2;
    let movedX = false, movedY = false;
    if (e2 > -dy) { err -= dy; tx0 += sx; movedX = true; }
    if (e2 < dx) { err += dx; ty0 += sy; movedY = true; }
    // 对角移动：要求至少一个直角邻居可走，避免穿墙角
    if (movedX && movedY) {
      if (!map.isWalkableTile(tx0 - sx, ty0) && !map.isWalkableTile(tx0, ty0 - sy)) return false;
    }
  }
  return false;
}

export function findPath(map: GameMap, from: Vec2, to: Vec2, maxExpand = 6000): Vec2[] | null {
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) ||
      !Number.isFinite(to.x) || !Number.isFinite(to.y)) return null;
  const sx = Math.floor(from.x / TILE), sy = Math.floor(from.y / TILE);
  let gx = Math.floor(to.x / TILE), gy = Math.floor(to.y / TILE);
  if (!map.inBounds(gx, gy)) return null;

  // 目标不可走：找最近可走格
  if (!map.isWalkableTile(gx, gy)) {
    const alt = map.nearestWalkable(gx, gy, 12);
    if (!alt) return null;
    gx = alt.x; gy = alt.y;
  }
  if (sx === gx && sy === gy) {
    // 已在目标格：若实际距离仍远（目标点位于阻挡区内部，如建筑/矿中心），
    // 返回直线逼近点，让单位贴到目标边缘
    if (Math.hypot(from.x - to.x, from.y - to.y) > TILE * 0.5) {
      return [{ x: to.x, y: to.y }];
    }
    return [];
  }

  stamp++;
  heap.length = 0;
  const startIdx = sy * W + sx, goalIdx = gy * W + gx;
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(sx, sy, gx, gy);
  cameFrom[startIdx] = -1;
  visitedStamp[startIdx] = stamp;
  heapPush(startIdx);

  let expanded = 0;
  let found = false;
  while (heap.length > 0) {
    const cur = heapPop();
    if (cur === goalIdx) { found = true; break; }
    if (closedStamp[cur] === stamp) continue;
    closedStamp[cur] = stamp;
    if (++expanded > maxExpand) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!map.isWalkableTile(nx, ny)) continue;
      // 禁止切角：斜向需要两个相邻直角格都可走
      if (dx !== 0 && dy !== 0) {
        if (!map.isWalkableTile(cx + dx, cy) || !map.isWalkableTile(cx, cy + dy)) continue;
      }
      const ni = ny * W + nx;
      if (closedStamp[ni] === stamp) continue;
      const ng = gScore[cur] + cost;
      if (visitedStamp[ni] !== stamp || ng < gScore[ni]) {
        visitedStamp[ni] = stamp;
        gScore[ni] = ng;
        fScore[ni] = ng + heuristic(nx, ny, gx, gy);
        cameFrom[ni] = cur;
        heapPush(ni);
      }
    }
  }

  if (!found) return null;

  // 回溯
  const cells: Vec2[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    cells.push({ x: (cur % W) * TILE + TILE / 2, y: ((cur / W) | 0) * TILE + TILE / 2 });
    cur = cameFrom[cur];
  }
  cells.reverse();

  // 视线平滑
  const path: Vec2[] = [];
  let anchor = 0;
  // 起点是单位脚下，跳过
  for (let i = 2; i < cells.length; i++) {
    if (!lineWalkable(map, cells[anchor].x, cells[anchor].y, cells[i].x, cells[i].y)) {
      path.push(cells[i - 1]);
      anchor = i - 1;
    }
  }
  path.push(cells[cells.length - 1]);
  return path;
}
