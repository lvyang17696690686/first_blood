import { MAP_W, MAP_H, TILE } from './config';
import type { Vec2 } from './types';

export const T_GRASS = 0;
export const T_TREE = 1;

/** 确定性随机 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NodeSpawn {
  type: 'gold';
  tx: number;
  ty: number; // 2x2 左上格
  amount: number;
  slots: number;
}

export interface CreepSpawn {
  tx: number;
  ty: number;
  size: 'small' | 'medium' | 'boss';
}

/** P2 中立据点点位（2x2 左上格） */
export interface StrongholdSpawn {
  tx: number;
  ty: number;
}

export class GameMap {
  tiles: Uint8Array;
  w = MAP_W;
  h = MAP_H;
  nodeSpawns: NodeSpawn[] = [];
  creepSpawns: CreepSpawn[] = [];
  /** P2 中立据点 */
  strongholdSpawns: StrongholdSpawn[] = [];
  /** 各阵营出生点（世界坐标，主基地中心） */
  startPositions: Vec2[] = [];

  constructor(seed = 20260927) {
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.generate(seed);
  }

  idx(tx: number, ty: number) { return ty * this.w + tx; }
  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  isWalkableTile(tx: number, ty: number) {
    if (!this.inBounds(tx, ty)) return false;
    return this.tiles[this.idx(tx, ty)] === T_GRASS;
  }
  setTile(tx: number, ty: number, v: number) {
    if (this.inBounds(tx, ty)) this.tiles[this.idx(tx, ty)] = v;
  }

  /** 圈出矩形（建筑/金矿占位） */
  blockRect(tx: number, ty: number, w: number, h: number, v: number = T_TREE) {
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++)
        this.setTile(x, y, v);
  }

  /** 找离目标格最近的可行走格（环形扩散，同圈取距离最小者） */
  nearestWalkable(tx: number, ty: number, maxR = 20): Vec2 | null {
    if (this.isWalkableTile(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= maxR; r++) {
      let best: Vec2 | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkableTile(tx + dx, ty + dy)) {
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = { x: tx + dx, y: ty + dy }; }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private placeTrees(rng: () => number, avoid: Vec2[], avoidR: number) {
    const clusters = 130;
    for (let i = 0; i < clusters; i++) {
      const cx = Math.floor(rng() * this.w);
      const cy = Math.floor(rng() * this.h);
      const size = 2 + Math.floor(rng() * 7);
      for (let j = 0; j < size * 2; j++) {
        const tx = cx + Math.floor((rng() - 0.5) * size * 2);
        const ty = cy + Math.floor((rng() - 0.5) * size * 2);
        if (!this.inBounds(tx, ty)) continue;
        // 边缘留白
        if (tx < 2 || ty < 2 || tx >= this.w - 2 || ty >= this.h - 2) continue;
        // 避开关键位置
        let bad = false;
        for (const a of avoid) {
          const ax = a.x / TILE, ay = a.y / TILE;
          if (Math.hypot(tx - ax, ty - ay) < avoidR) { bad = true; break; }
        }
        if (bad) continue;
        this.setTile(tx, ty, T_TREE);
      }
    }
  }

  private generate(seed: number) {
    const rng = mulberry32(seed);

    // 出生点：玩家左下、敌人右上
    const playerStart = { tx: 13, ty: 80 };
    const enemyStart = { tx: 82, ty: 13 };
    this.startPositions = [
      { x: (playerStart.tx + 1.5) * TILE, y: (playerStart.ty + 1.5) * TILE },
      { x: (enemyStart.tx + 1.5) * TILE, y: (enemyStart.ty + 1.5) * TILE },
    ];

    // 主基地 3x3 占位
    this.blockRect(playerStart.tx, playerStart.ty, 3, 3);
    this.blockRect(enemyStart.tx, enemyStart.ty, 3, 3);

    // 金矿点位：两矿贴家 + 两中立矿
    const mines: Array<[number, number]> = [
      [playerStart.tx + 6, playerStart.ty - 2],
      [playerStart.tx - 3, playerStart.ty - 7],
      [enemyStart.tx - 6, enemyStart.ty + 1],
      [enemyStart.tx + 4, enemyStart.ty + 4],
      [30, 46],
      [64, 48],
    ];
    for (const [tx, ty] of mines) {
      this.blockRect(tx, ty, 2, 2);
      this.nodeSpawns.push({ type: 'gold', tx, ty, amount: 4000, slots: 6 });
    }

    // 野怪营地
    this.creepSpawns.push({ tx: 47, ty: 47, size: 'boss' });
    this.creepSpawns.push({ tx: 48, ty: 72, size: 'medium' });
    this.creepSpawns.push({ tx: 46, ty: 22, size: 'medium' });
    this.creepSpawns.push({ tx: 72, ty: 48, size: 'medium' });
    this.creepSpawns.push({ tx: 22, ty: 47, size: 'medium' });
    this.creepSpawns.push({ tx: 24, ty: 70, size: 'small' });
    this.creepSpawns.push({ tx: 70, ty: 24, size: 'small' });
    this.creepSpawns.push({ tx: 24, ty: 26, size: 'small' });
    this.creepSpawns.push({ tx: 70, ty: 70, size: 'small' });
    // P2：中场两座中立金矿的守军 + 据点守军
    this.creepSpawns.push({ tx: 33, ty: 48, size: 'medium' });   // 守矿 (30,46)
    this.creepSpawns.push({ tx: 61, ty: 45, size: 'medium' });   // 守矿 (64,48)
    this.creepSpawns.push({ tx: 35, ty: 64, size: 'small' });    // 守据点 (32,62)
    this.creepSpawns.push({ tx: 59, ty: 29, size: 'small' });    // 守据点 (62,32)

    // P2 中立据点
    this.strongholdSpawns.push({ tx: 32, ty: 62 });
    this.strongholdSpawns.push({ tx: 62, ty: 32 });

    // 营地占位（阻挡中心格）
    for (const c of this.creepSpawns) this.blockRect(c.tx, c.ty, 2, 2);
    for (const s of this.strongholdSpawns) this.blockRect(s.tx, s.ty, 2, 2);

    // 避开关键区域后撒树
    const avoid: Vec2[] = [
      ...this.startPositions,
      ...this.nodeSpawns.map(n => ({ x: (n.tx + 1) * TILE, y: (n.ty + 1) * TILE })),
      ...this.creepSpawns.map(c => ({ x: (c.tx + 1) * TILE, y: (c.ty + 1) * TILE })),
      ...this.strongholdSpawns.map(s => ({ x: (s.tx + 1) * TILE, y: (s.ty + 1) * TILE })),
    ];
    // 家附近额外保护圈
    this.placeTrees(rng, avoid, 9);
  }
}
