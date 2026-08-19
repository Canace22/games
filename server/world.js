'use strict';
/** 地图生成与碰撞。固定种子，服务端生成一次后下发给客户端。 */

const { NPCS, TOWERS, BOSS_SPAWN } = require('./data');

const TILE = 32;
const W = 64; // 横向 tile 数
const H = 64;

// tile: 0 草 1 深草 2 水 3 树 4 岩 5 路
const BLOCKED = new Set([2, 3, 4]);

// 确定性随机（mulberry32）
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate() {
  const rand = rng(20260819);
  const map = new Array(W * H).fill(0);

  // 基础地形：几片深草与湖
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = rand();
      let t = 0;
      if (n > 0.86) t = 1;
      if (n > 0.965) t = 4;
      map[y * W + x] = t;
    }
  }
  // 湖
  blob(map, rand, 46, 46, 6, 2);
  blob(map, rand, 12, 20, 5, 2);
  // 树林
  blob(map, rand, 45, 12, 8, 3);
  blob(map, rand, 24, 44, 7, 3);
  blob(map, rand, 8, 52, 5, 3);

  // 主干道：横竖两条路，保证通行
  for (let x = 4; x < W - 4; x++) map[32 * W + x] = 5;
  for (let y = 4; y < H - 4; y++) map[y * W + 32] = 5;

  // 地图边缘围一圈岩石
  for (let x = 0; x < W; x++) { map[x] = 4; map[(H - 1) * W + x] = 4; }
  for (let y = 0; y < H; y++) { map[y * W] = 4; map[y * W + W - 1] = 4; }

  // 关键点周围清场
  const clearAt = (px, py, r) => {
    const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) map[y * W + x] = 0;
  };
  NPCS.forEach((n) => clearAt(n.x, n.y, 3));
  TOWERS.forEach((t) => clearAt(t.x, t.y, 3));
  clearAt(BOSS_SPAWN.x, BOSS_SPAWN.y, 5);
  clearAt(560, 540, 5); // 出生营地

  return map;
}

function blob(map, rand, cx, cy, r, tile) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < r * (0.65 + rand() * 0.45)) map[y * W + x] = tile;
    }
  }
}

const map = generate();

/** 像素坐标是否可站立（用半径为 r 的方形做四角检测） */
function walkable(px, py, r = 10) {
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const tx = Math.floor((px + dx) / TILE);
    const ty = Math.floor((py + dy) / TILE);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    if (BLOCKED.has(map[ty * W + tx])) return false;
  }
  return true;
}

/** 分轴移动：撞墙时保留另一轴，手感更好 */
function moveWithCollision(x, y, dx, dy, r = 10) {
  let nx = x, ny = y;
  if (dx && walkable(x + dx, y, r)) nx = x + dx;
  if (dy && walkable(nx, y + dy, r)) ny = y + dy;
  return [nx, ny];
}

const SPAWN_POINT = { x: 560, y: 540 };

module.exports = { TILE, W, H, map, walkable, moveWithCollision, SPAWN_POINT, PIXEL_W: W * TILE, PIXEL_H: H * TILE };
