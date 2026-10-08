/** P5-d 回放：指令记录 → 复现（模拟层确定性：固定步长 + 种子随机） */
import type { Game } from './game';
import type { Order, Race, Deck } from './types';
import { Unit, Building } from './entities';
import type { GatherState } from './entities';

/**
 * 指令格式（紧凑数组）：
 * ['ords', entries] — entries: [unitId, order, resume, gather, clearPath][]
 * ['rally', buildingId, x, y]
 * ['reveal', x, y]
 * ['cast', heroId, skillIdx, x | null, y | null]   // x/y 为 null = 自身施法
 * ['place', defId, tx, ty, builderId]              // builderId -1 = 无
 * ['train', buildingId, unitId]
 * ['techup', buildingId]
 * ['utex', buildingId, unitId]
 * ['hskill', heroId, skillIdx]
 * ['capture', targetId]                            // ResourceNode 或 Building
 * ['cancel', buildingId]                           // 取消训练队列头
 */
export type ReplayCmd = unknown[];

export interface ReplayHeader {
  v: 1;
  name: string;
  date: string;
  seed: number;
  teamSize: 1 | 2 | 3;
  races: Race[];
  decks: (Deck | null)[];
  scenario: string | null;
}

export interface ReplayData {
  header: ReplayHeader;
  cmds: { s: number; c: ReplayCmd }[];
}

// ===== 录制器 =====
let recGame: Game | null = null;
let rec: ReplayData | null = null;

export function recStart(game: Game, header: ReplayHeader) {
  recGame = game;
  rec = { header, cmds: [] };
}

export function recStop(): ReplayData | null {
  const out = rec;
  recGame = null;
  rec = null;
  return out;
}

export function recRecording(): boolean {
  return rec !== null;
}

/** 录制一条玩家指令：生效于下一模拟步（stepCount+1） */
export function recCmd(...cmd: ReplayCmd) {
  if (!rec || !recGame) return;
  rec.cmds.push({ s: recGame.stepCount + 1, c: cmd });
}

/** 录制一组单位指令（与 input.ts 的 ord() 同构） */
export type OrdEntry = [number, Order, Order, GatherState | null, number];

// ===== 存储 =====
const LIST_KEY = 'wc_replays_v1';
const MAX_REPLAYS = 10;
const MAX_BYTES = 3 * 1024 * 1024;

export interface ReplayEntry extends ReplayData {
  time: number;
  win: boolean;
}

export function loadReplayList(): ReplayEntry[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveReplay(data: ReplayData, time: number, win: boolean) {
  try {
    const list = loadReplayList();
    list.unshift({ ...data, time, win } as ReplayEntry);
    while (list.length > MAX_REPLAYS || JSON.stringify(list).length > MAX_BYTES) {
      if (list.length <= 1) { list.pop(); break; }
      list.pop();
    }
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch { /* 存储满等异常忽略 */ }
}

// ===== 复现：应用一条指令（live 与回放共用同一套游戏 API） =====
export function applyCmd(g: Game, cmd: ReplayCmd) {
  const [type] = cmd as [string];
  switch (type) {
    case 'ords': {
      const entries = cmd[1] as OrdEntry[];
      for (const [id, order, resume, gather, clearPath] of entries) {
        const e = g.byId(id);
        if (!(e instanceof Unit) || e.dead) continue;
        e.order = order;
        e.resume = resume;
        e.gather = gather;
        if (clearPath) e.path = null;
      }
      break;
    }
    case 'rally': {
      const b = g.byId(cmd[1] as number);
      if (b && 'rally' in b) b.rally = { x: cmd[2] as number, y: cmd[3] as number };
      break;
    }
    case 'reveal':
      g.revealArea(cmd[1] as number, cmd[2] as number, 0);
      break;
    case 'cast': {
      const hero = g.byId(cmd[1] as number);
      if (!(hero instanceof Unit) || hero.dead) break;
      const idx = cmd[2] as number;
      const x = cmd[3] as number | null, y = cmd[4] as number | null;
      if (x === null || y === null) hero.castSkill(g, idx);
      else hero.castSkillAt(g, idx, x, y);
      break;
    }
    case 'place': {
      const builderId = cmd[4] as number;
      const bu = builderId >= 0 ? g.byId(builderId) : undefined;
      g.placeBuilding(0, cmd[1] as string, cmd[2] as number, cmd[3] as number,
        bu instanceof Unit && !bu.dead ? bu : undefined);
      break;
    }
    case 'train': {
      const b = g.byId(cmd[1] as number);
      if (b instanceof Building) g.trainUnit(0, b, cmd[2] as string);
      break;
    }
    case 'techup': {
      const b = g.byId(cmd[1] as number);
      if (b instanceof Building) g.startTechUpgrade(0, b);
      break;
    }
    case 'utex': {
      const b = g.byId(cmd[1] as number);
      if (b instanceof Building) g.startUnitTech(0, b, cmd[2] as string);
      break;
    }
    case 'hskill': {
      const hero = g.byId(cmd[1] as number);
      if (hero instanceof Unit) g.upgradeHeroSkill(0, hero, cmd[2] as number);
      break;
    }
    case 'capture': {
      const id = cmd[1] as number;
      const node = g.resourceNodes.get(id);
      if (node) g.tryCapture(0, node);
      else {
        const b = g.byId(id);
        if (b instanceof Building) g.tryCapture(0, b);
      }
      break;
    }
    case 'cancel': {
      const b = g.byId(cmd[1] as number);
      if (b instanceof Building) b.queue.shift();
      break;
    }
  }
}
