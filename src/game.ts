import {
  TILE, STEP_DT, POP_CAP, HERO_MAX,
  UNITS, BUILDINGS, CREEPS, CREEP_RESPAWN,
  HERO_RESPAWN,
  UNIT_TECH_MAX, UNIT_TECH_TIME, UNIT_TECH_COST_FACTOR,
  HERO_SKILL_MAX, HERO_SKILL_COST,
  CAPTURE_COST_NEUTRAL, CAPTURE_COST_ENEMY, CAPTURE_RADIUS, MINE_INCOME,
  ORB_DROP_CHANCE, ORB_PICKUP_RADIUS, BUFF_DURATION,
  HASTE_MULT, FRENZY_MULT, GOLD_RAIN_AMOUNT,
  REVEAL_RADIUS, REVEAL_DURATION,
  RACE_BUILDINGS, RACE_WORKER,
} from './config';
import type { CreepDef } from './config';
import type { Faction, HeroSkillDef, UnitDef, Deck, Race, Order } from './types';
import type { ScenarioDef } from './scenario';
import { SCENARIOS, applyScenarioSetup, updateScenario } from './scenario';
import { rand } from './rng';
import { GameMap } from './map';
import {
  Unit, Building, makeResourceNode, resetNodeIds, resetEntityIds, resetOrbIds, makeOrb,
  peekEntityId, setEntityIdSeq, peekNodeId, setNodeIdSeq, peekOrbId, setOrbIdSeq,
} from './entities';
import type { Entity, ResourceNode, MagicOrb, OrbType } from './entities';
import { airDamageMult, canHitAir } from './traits';

export interface Projectile {
  x: number; y: number;
  targetId: number;
  sourceId: number;
  speed: number;
  dmg: number;
  splash: number;
  faction: Faction;
  color: number;
  dead: boolean;
}

export interface Effect {
  type: 'ring' | 'hit';
  x: number; y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: number;
}

export interface FactionState {
  gold: number;
  crystal: number;
  tech: 1 | 2 | 3;
  /** P1 兵种科技等级（unitId → 1-3，未记录视为 1） */
  unitTech: Record<string, number>;
}

export interface GameOptions {
  /** 各阵营出战卡组（null = 不限制，兼容测试/默认） */
  decks?: (Deck | null)[];
  /** P3 各阵营种族（null = 精灵默认） */
  races?: (Race | null)[];
  /** P5 队伍规模（1=1v1 默认, 2=2v2, 3=3v3） */
  teamSize?: 1 | 2 | 3;
  /** P5-c 战役关卡（存在时启用脚本事件与特殊胜利目标） */
  scenario?: ScenarioDef;
  /** P5 从存档恢复（跳过 setup） */
  load?: SaveData;
}

// ===== P5 存档格式 =====
export interface SaveUnit {
  id: number; def: string; f: Faction;
  /** 野怪/转化单位不在 UNITS 表，直接保存完整定义 */
  defRaw?: UnitDef;
  x: number; y: number; hp: number; mana: number; lvl: number; xp: number;
  techLv: number; skillLv: number[];
  order: Order; resume: Order;
  gather: GatherStateLite | null;
  shield: number; life: number; sumBy: number;
  isCreep: boolean; leash?: [number, number];
  bounty?: { gold: number; crystal: number; xp: number };
  charm?: { t: number; orig: Faction | null } | null;
}
interface GatherStateLite { nodeId: number; phase: 'moving' | 'mining' | 'returning'; timer: number; carrying: number }
export interface SaveBuilding {
  id: number; def: string; f: Faction; tx: number; ty: number;
  built: boolean; prog: number; hp: number;
  queue: { unitId: string; timer: number; total: number }[];
  tech: { to: 2 | 3; timer: number; total: number } | null;
  research: { unitId: string; timer: number; total: number } | null;
  rally: { x: number; y: number } | null;
  seenBy: boolean[];
}
export interface SaveData {
  v: 1;
  time: number;
  teamSize: number;
  teams: number[];
  startSlot: number[];
  races: Race[];
  decks: (Deck | null)[];
  factions: { gold: number; crystal: number; tech: 1 | 2 | 3; unitTech: Record<string, number> }[];
  fog: number[];
  units: SaveUnit[];
  buildings: SaveBuilding[];
  nodes: { id: number; tx: number; ty: number; amount: number; maxAmount: number; workers: number[];
    depleted: boolean; owner: number; guarded: boolean; income: number }[];
  camps: { x: number; y: number; size: 'small' | 'medium' | 'boss'; unitIds: number[]; alive: number; rt: number }[];
  deadHeroes: { faction: Faction; defId: string; timer: number }[];
  corpses: { x: number; y: number; defId: string; faction: Faction; timer: number }[];
  orbs: { id: number; type: OrbType; x: number; y: number; life: number; phase: number }[];
  seq: { e: number; n: number; o: number };
  /** P5-c 战役关卡 id（null = 标准对局） */
  scn?: string;
  /** P5-c 已触发的波次数 */
  sw?: number;
}

interface CreepCamp {
  x: number; y: number;
  size: 'small' | 'medium' | 'boss';
  unitIds: number[];
  aliveCount: number;
  respawnTimer: number;
}

interface DeadHero {
  faction: Faction;
  defId: string;
  timer: number;
}

interface DelayedCast {
  timer: number;
  x: number; y: number;
  heroId: number;
  sk: HeroSkillDef;
}

/** P3 多段落雷（雷暴）：定时在落点结算一段范围伤害 */
interface PendingStrike {
  timer: number;
  x: number; y: number;
  heroId: number;
  sk: HeroSkillDef;
  /** 剩余段数 */
  left: number;
}

/** P3 地面持续伤害区（熔岩裂隙） */
interface DotZone {
  x: number; y: number;
  r: number;
  dps: number;
  /** 剩余存在时间 */
  timer: number;
  /** 伤害结算周期计时 */
  tick: number;
  /** P4 沙暴：附带减速比例 */
  slowAmt?: number;
  faction: Faction;
  heroId: number;
}

// ===== 空间哈希 =====
class SpatialHash {
  cell = 72;
  buckets = new Map<number, Entity[]>();
  private key(cx: number, cy: number) { return cx * 10007 + cy; }

  clear() { this.buckets.clear(); }
  insert(e: Entity) {
    const r = e instanceof Building ? (e as Building).radius : (e as Unit).radius;
    const x0 = Math.floor((e.x - r) / this.cell), x1 = Math.floor((e.x + r) / this.cell);
    const y0 = Math.floor((e.y - r) / this.cell), y1 = Math.floor((e.y + r) / this.cell);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let arr = this.buckets.get(k);
        if (!arr) { arr = []; this.buckets.set(k, arr); }
        arr.push(e);
      }
  }
  queryCircle(x: number, y: number, r: number, out: Entity[]): Entity[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    const rr = r * r;
    const seen = new Set<number>();
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.buckets.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          // 精确距离校验：bucket 按 AABB 收集，角落实体可能超出半径
          const dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy > rr) continue;
          out.push(e);
        }
      }
    return out;
  }
}

export class Game {
  map = new GameMap();
  units: Unit[] = [];
  buildings: Building[] = [];
  resourceNodes = new Map<number, ResourceNode>();
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  factions: FactionState[] = [
    { gold: 0, crystal: 0, tech: 1, unitTech: {} },
    { gold: 0, crystal: 0, tech: 1, unitTech: {} },
    { gold: 0, crystal: 0, tech: 1, unitTech: {} },
  ];
  /** 出战卡组（P1）：按阵营索引 */
  decks: (Deck | null)[] = [null, null, null];
  /** P3 各阵营种族（0/1 玩家与 AI；野怪无种族） */
  races: Race[] = ['elf', 'elf'];
  /** P5 队伍规模（1=1v1, 2=2v2, 3=3v3） */
  teamSize = 1;
  /** AI 团队共享波次目标（阵营 → 集结点，供队友 AI 跟随集结） */
  aiWaves = new Map<number, { target: { x: number; y: number }; since: number }>();
  /** P5 阵营 → 队伍（0=玩家方 1=敌方 -1=野怪） */
  teams: number[] = [0, 1, -1];
  /** P5 阵营 → 地图出生点槽位索引 */
  startSlot: number[] = [0, 1, 0];
  /** P5-c 当前战役关卡（null = 标准对局） */
  scenario: ScenarioDef | null = null;
  /** P5-c 已触发的脚本波次数 */
  scenarioWaveIdx = 0;
  spatial = new SpatialHash();
  fog: Uint8Array;
  fogVersion = 0;
  creepCamps: CreepCamp[] = [];
  deadHeroes: DeadHero[] = [];
  delayedCasts: DelayedCast[] = [];
  /** P3 待结算落雷段 */
  pendingStrikes: PendingStrike[] = [];
  /** P3 地面 DoT 区域 */
  dotZones: DotZone[] = [];
  /** P4 尸体（供亡者复苏等技能消费，15 秒消散） */
  corpses: { x: number; y: number; defId: string; faction: Faction; timer: number }[] = [];
  /** P2 魔法球 */
  orbs: MagicOrb[] = [];
  /** P2 侦查区域（短暂开雾） */
  reveals: { x: number; y: number; r: number; timer: number }[] = [];
  time = 0;
  over: null | { win: boolean } = null;
  /** P5-d 已执行的模拟步数（回放指令定位用） */
  stepCount = 0;
  /** P5-d 回放模式：禁用玩家输入 */
  replayMode = false;
  fogTimer = 0;
  /** 光环/治疗刷新计时 */
  private auraTimer = 0;
  onLog: (msg: string) => void = () => {};
  onVictory: (win: boolean) => void = () => {};
  /** P6 音效钩子（表现层专用，不影响模拟确定性） */
  onSound: (name: string) => void = () => {};
  private queryBuf: Entity[] = [];
  private queryBuf2: Entity[] = [];
  private nodeIdSeq = 1;

  constructor(options?: GameOptions) {
    // P5：阵营数量 = 2×队伍规模 + 野怪；faction 编号 0=P1 1=E1 2=野怪 3=P2 4=E2 5=P3 6=E3
    const nF = 2 * (options?.teamSize ?? 1) + 1;
    this.teamSize = options?.teamSize ?? 1;
    this.factions = Array.from({ length: nF }, () => ({ gold: 0, crystal: 0, tech: 1 as 1 | 2 | 3, unitTech: {} }));
    this.decks = new Array(nF).fill(null);
    this.races = new Array(nF).fill('elf');
    this.teams = [];
    this.startSlot = [];
    // 地图出生点排列：[P1..Pn, E1..En]（前 teamSize 个=玩家方，其余=敌方）
    let pSlot = 0, eSlot = this.teamSize;
    for (let i = 0; i < nF; i++) {
      if (i === 2) { this.teams.push(-1); this.startSlot.push(0); continue; }
      const team = i < 2 ? i : (i - 3) % 2 === 0 ? 0 : 1;
      this.teams.push(team);
      this.startSlot.push(team === 0 ? pSlot++ : eSlot++);
    }
    if (options?.decks) {
      for (let i = 0; i < Math.min(options.decks.length, nF); i++) this.decks[i] = options.decks[i];
    }
    this.scenario = options?.scenario ?? null;
    if (options?.races) {
      for (let i = 0; i < Math.min(options.races.length, nF); i++) {
        const r = options.races[i];
        if (r) this.races[i] = r;
      }
    }
    this.map = new GameMap(20260927, this.teamSize);
    this.fog = new Uint8Array(this.map.w * this.map.h);
    if (options?.load) this.restoreFrom(options.load);
    else this.setup();
}

  // ===== 初始化 =====
  private setup() {
    resetEntityIds();
    resetNodeIds();
    resetOrbIds();
    this.nodeIdSeq = 1;
    // 资源节点
    for (const ns of this.map.nodeSpawns) {
      const node = makeResourceNode(ns.tx, ns.ty, ns.amount, ns.slots);
      node.id = this.nodeIdSeq++;
      // 中场两座矿（nodeSpawns 后两个）带野怪守军，占领后产金
      this.resourceNodes.set(node.id, node);
    }
    const nodes = [...this.resourceNodes.values()];
    for (const node of nodes.slice(-2)) {
      node.guarded = true;
      node.income = MINE_INCOME;
    }
    // 出生：主基地 + 5 工人（P5：所有非野怪阵营，按种族选择建筑/单位）
    for (let f = 0 as Faction; f < this.factions.length; f = (f + 1) as Faction) {
      if (f === 2) continue;
      const sp = this.map.startPositions[this.startSlot[f]];
      const race = this.races[f];
      const mainDef = BUILDINGS[RACE_BUILDINGS[race].main];
      const hall = new Building(mainDef, f as Faction,
        Math.floor(sp.x / TILE) - 1, Math.floor(sp.y / TILE) - 1, true);
      this.buildings.push(hall);
      const workerDef = UNITS[RACE_WORKER[race]];
      for (let i = 0; i < 5; i++) {
        const u = new Unit(workerDef, f as Faction, sp.x + (i - 2) * 30, sp.y + 60);
        this.units.push(u);
        // 自动开矿
        const node = this.findNearestNode(u.x, u.y);
        if (node) u.order = { type: 'gather', nodeId: node.id };
      }
      this.factions[f].gold = 700;
      this.factions[f].crystal = 150;
    }
    // 野怪
    for (const cs of this.map.creepSpawns) {
      this.spawnCreepCamp(cs.tx, cs.ty, cs.size);
    }
    // P2 中立据点
    for (const s of this.map.strongholdSpawns) {
      const b = new Building(BUILDINGS.stronghold, 2, s.tx, s.ty, true);
      b.seenBy[0] = true; // 据点始终可见
      this.buildings.push(b);
    }
    this.updateFog(true);
    applyScenarioSetup(this);
  }

  private spawnCreepCamp(tx: number, ty: number, size: 'small' | 'medium' | 'boss') {
    const cx = (tx + 1) * TILE, cy = (ty + 1) * TILE;
    const camp: CreepCamp = { x: cx, y: cy, size, unitIds: [], aliveCount: 0, respawnTimer: 0 };
    const make = (def: CreepDef, dx: number, dy: number) => {
      const udef: UnitDef = {
        id: def.id, name: def.name, kind: def.range > 60 ? 'ranged' : 'melee', tier: 1,
        costGold: 0, costCrystal: 0, buildTime: 0,
        hp: def.hp, armor: def.armor, dmg: def.dmg, range: def.range,
        attackSpeed: def.attackSpeed, speed: def.speed, radius: def.radius,
        projectile: !!def.projectile, bounty: def.xp, color: def.color, desc: '',
      };
      const u = new Unit(udef, 2, cx + dx, cy + dy);
      u.isCreep = true;
      u.leashX = cx; u.leashY = cy;
      u.creepBounty = { gold: def.bountyGold, crystal: def.bountyCrystal, xp: def.xp };
      u.order = { type: 'idle' };
      this.units.push(u);
      camp.unitIds.push(u.id);
    };
    if (size === 'small') {
      make(CREEPS.scout, -26, 0);
      make(CREEPS.scout, 26, 8);
    } else if (size === 'medium') {
      make(CREEPS.hunter, -28, -10);
      make(CREEPS.hunter, 28, 6);
      make(CREEPS.troll, 0, 30);
    } else {
      make(CREEPS.troll, -40, -20);
      make(CREEPS.troll, 40, -16);
      make(CREEPS.boss, 0, 10);
    }
    camp.aliveCount = camp.unitIds.length;
    this.creepCamps.push(camp);
  }

  // ===== P5 存档 =====
  serialize(): string {
    const d: SaveData = {
      v: 1,
      time: this.time,
      teamSize: this.teamSize,
      teams: [...this.teams],
      startSlot: [...this.startSlot],
      races: [...this.races],
      decks: this.decks.map(k => (k ? { units: [...k.units], heroes: [...k.heroes] } : null)),
      factions: this.factions.map(f => ({ ...f, unitTech: { ...f.unitTech } })),
      fog: Array.from(this.fog),
      units: this.units.map(u => ({
        id: u.id, def: u.def.id, f: u.faction,
        defRaw: UNITS[u.def.id] ? undefined : u.def,
        x: u.x, y: u.y, hp: u.hp, mana: u.mana, lvl: u.level, xp: u.xp,
        techLv: u.techLevel, skillLv: [...u.skillLevels],
        order: u.order, resume: u.resume,
        gather: u.gather ? { ...u.gather } : null,
        shield: u.shieldHp, life: u.lifespan, sumBy: u.summonedBy,
        isCreep: u.isCreep,
        leash: u.isCreep ? [u.leashX, u.leashY] : undefined,
        bounty: u.isCreep ? { ...u.creepBounty } : undefined,
        charm: u.charmedTimer > 0 ? { t: u.charmedTimer, orig: u.originalFaction } : null,
      })),
      buildings: this.buildings.map(b => ({
        id: b.id, def: b.def.id, f: b.faction, tx: b.tx, ty: b.ty,
        built: b.built, prog: b.buildProgress, hp: b.hp,
        queue: b.queue.map(q => ({ ...q })),
        tech: b.techUpgrade ? { ...b.techUpgrade } : null,
        research: b.research ? { ...b.research } : null,
        rally: b.rally ? { ...b.rally } : null,
        seenBy: [...b.seenBy],
      })),
      nodes: [...this.resourceNodes.values()].map(n => ({
        id: n.id, tx: n.tx, ty: n.ty, amount: n.amount, maxAmount: n.maxAmount,
        workers: [...n.workers], depleted: n.depleted, owner: n.owner,
        guarded: n.guarded, income: n.income,
      })),
      camps: this.creepCamps.map(c => ({
        x: c.x, y: c.y, size: c.size, unitIds: [...c.unitIds], alive: c.aliveCount, rt: c.respawnTimer,
      })),
      deadHeroes: this.deadHeroes.map(h => ({ ...h })),
      corpses: this.corpses.map(c => ({ ...c })),
      orbs: this.orbs.map(o => ({ id: o.id, type: o.type, x: o.x, y: o.y, life: o.life, phase: o.phase })),
      seq: { e: peekEntityId(), n: peekNodeId(), o: peekOrbId() },
      scn: this.scenario?.id,
      sw: this.scenarioWaveIdx,
    };
    return JSON.stringify(d);
  }

  private restoreFrom(d: SaveData) {
    resetEntityIds(); resetNodeIds(); resetOrbIds();
    this.teamSize = d.teamSize ?? 1;
    this.teams = [...d.teams];
    this.startSlot = [...(d.startSlot ?? this.startSlot)];
    this.scenario = SCENARIOS.find(s => s.id === d.scn) ?? null;
    this.scenarioWaveIdx = d.sw ?? 0;
    this.races = [...d.races];
    this.decks = d.decks.map(k => (k ? { units: [...k.units], heroes: [...k.heroes] } : null));
    this.factions = d.factions.map(f => ({ ...f, unitTech: { ...f.unitTech } }));
    this.time = d.time;
    // 单位
    for (const su of d.units) {
      const def = su.defRaw ?? UNITS[su.def];
      if (!def) continue;
      const u = new Unit(def, su.f, su.x, su.y);
      u.id = su.id;
      u.techLevel = su.techLv ?? 1;
      u.level = su.lvl ?? 1;
      u.xp = su.xp ?? 0;
      u.maxHp = Math.round(u.baseMaxHp * u.heroScale * u.techMult);
      u.hp = su.hp;
      u.mana = su.mana;
      if (su.skillLv && su.skillLv.length > 0) u.skillLevels = [...su.skillLv];
      u.order = su.order; u.resume = su.resume;
      u.gather = su.gather ? { ...su.gather } : null;
      u.shieldHp = su.shield ?? 0;
      u.lifespan = su.life ?? 0;
      u.summonedBy = su.sumBy ?? 0;
      u.isCreep = su.isCreep;
      if (su.leash) { u.leashX = su.leash[0]; u.leashY = su.leash[1]; }
      if (su.bounty) u.creepBounty = { ...su.bounty };
      if (su.charm) { u.charmedTimer = su.charm.t; u.originalFaction = su.charm.orig; }
      this.units.push(u);
    }
    // 建筑（重新阻挡地形）
    for (const sb of d.buildings) {
      const def = BUILDINGS[sb.def];
      if (!def) continue;
      const b = new Building(def, sb.f, sb.tx, sb.ty, sb.built);
      b.id = sb.id;
      b.buildProgress = sb.prog;
      b.hp = sb.hp;
      b.queue = sb.queue.map(q => ({ ...q }));
      b.techUpgrade = sb.tech ? { ...sb.tech } : null;
      b.research = sb.research ? { ...sb.research } : null;
      b.rally = sb.rally ? { ...sb.rally } : null;
      b.seenBy = [...sb.seenBy];
      this.buildings.push(b);
      this.map.blockRect(sb.tx, sb.ty, def.w, def.h, 2);
    }
    // 已被摧毁的主基地：取消生成时的占位阻挡
    for (let f = 0 as Faction; f < this.factions.length; f = (f + 1) as Faction) {
      if (f === 2) continue;
      if (!this.buildings.some(b => b.faction === f && b.def.kind === 'main')) {
        const sp = this.map.startPositions[this.startSlot[f] ?? f];
        this.map.blockRect(Math.floor(sp.x / TILE) - 1, Math.floor(sp.y / TILE) - 1, 3, 3, 0);
      }
    }
    // 资源节点
    for (const sn of d.nodes) {
      const n = makeResourceNode(sn.tx, sn.ty, sn.amount, 6);
      n.id = sn.id;
      n.maxAmount = sn.maxAmount;
      n.workers = [...sn.workers];
      n.depleted = sn.depleted;
      n.owner = sn.owner;
      n.guarded = sn.guarded;
      n.income = sn.income;
      this.resourceNodes.set(n.id, n);
    }
    // 野怪营地
    for (const sc of d.camps) {
      this.creepCamps.push({
        x: sc.x, y: sc.y, size: sc.size, unitIds: [...sc.unitIds],
        aliveCount: sc.alive, respawnTimer: sc.rt,
      });
    }
    this.deadHeroes = d.deadHeroes.map(h => ({ ...h }));
    this.corpses = d.corpses.map(c => ({ ...c }));
    for (const so of d.orbs) {
      this.orbs.push({ id: so.id, type: so.type, x: so.x, y: so.y, life: so.life, phase: so.phase });
    }
    this.fog = new Uint8Array(d.fog);
    setEntityIdSeq(d.seq.e);
    setNodeIdSeq(d.seq.n);
    setOrbIdSeq(d.seq.o);
    this.updateFog(true);
  }

  // ===== 查询 =====
  byId(id: number): Entity | undefined {
    for (const u of this.units) if (u.id === id) return u;
    for (const b of this.buildings) if (b.id === id) return b;
    return undefined;
  }

  queryNearestEnemy(x: number, y: number, r: number, faction: Faction, canAir = true): Entity | null {
    this.spatial.queryCircle(x, y, r, this.queryBuf);
    let best: Entity | null = null;
    let bd = Infinity;
    for (const e of this.queryBuf) {
      if (e.dead || this.sameTeam(e.faction, faction)) continue;
      if (e instanceof Unit && e.flying && !canAir) continue; // 打不到飞行单位
      // P2 据点只能占领不能攻击，不作为索敌目标
      if (e instanceof Building && (e as Building).def.kind === 'stronghold') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 范围内血量最低的敌人（闪现斩杀用） */
  queryLowestEnemy(x: number, y: number, r: number, faction: Faction, canAir: boolean): Entity | null {
    this.spatial.queryCircle(x, y, r, this.queryBuf);
    let best: Entity | null = null;
    let bh = Infinity;
    for (const e of this.queryBuf) {
      if (e.dead || this.sameTeam(e.faction, faction) || !(e instanceof Unit)) continue;
      if (e.flying && !canAir) continue;
      if (e.hp < bh) { bh = e.hp; best = e; }
    }
    return best;
  }

  findNearestNode(x: number, y: number): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bd = Infinity;
    for (const n of this.resourceNodes.values()) {
      if (n.amount <= 0) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  findNearestDropoff(x: number, y: number, faction: Faction): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.faction !== faction || !b.built || b.def.kind !== 'main') continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  getMain(faction: Faction): Building | null {
    for (const b of this.buildings) {
      if (!b.dead && b.faction === faction && b.def.kind === 'main') return b;
    }
    return null;
  }

  supplyUsed(faction: Faction): number {
    let n = 0;
    for (const u of this.units) if (!u.dead && u.faction === faction) n++;
    return n;
  }

  supplyCap(faction: Faction): number {
    let cap = 0;
    for (const b of this.buildings) {
      if (!b.dead && b.faction === faction && b.built) cap += b.def.supply;
    }
    return Math.min(POP_CAP, cap);
  }

  canAfford(faction: Faction, gold: number, crystal: number) {
    const f = this.factions[faction];
    return f.gold >= gold && f.crystal >= crystal;
  }

  /** P5 同队判定（含自身；野怪同队互不攻击） */
  sameTeam(a: Faction, b: Faction): boolean { return this.teams[a] === this.teams[b]; }

  spend(faction: Faction, gold: number, crystal: number) {
    const f = this.factions[faction];
    if (!this.canAfford(faction, gold, crystal)) return false;
    f.gold -= gold; f.crystal -= crystal;
    return true;
  }

  addCrystal(faction: Faction, amount: number) {
    this.factions[faction].crystal += amount;
  }

  deposit(faction: Faction, gold: number) {
    this.factions[faction].gold += gold;
  }

  // ===== 建造/训练 =====
  /** P1：单位是否在对应阵营卡组内（工人恒可用，无卡组=不限制） */
  deckAllows(faction: Faction, unitId: string): boolean {
    const deck = this.decks[faction];
    if (!deck) return true;
    const def = UNITS[unitId];
    if (!def) return false;
    if (def.kind === 'worker') return true;
    if (def.kind === 'hero') return deck.heroes.includes(unitId);
    return deck.units.includes(unitId);
  }

  canPlace(tx: number, ty: number, w: number, h: number): boolean {
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++) {
        if (!this.map.isWalkableTile(x, y)) return false;
      }
    // 不与单位重叠过近（中心检查）
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.x > tx * TILE - 10 && u.x < (tx + w) * TILE + 10 &&
          u.y > ty * TILE - 10 && u.y < (ty + h) * TILE + 10) return false;
    }
    return true;
  }

  placeBuilding(faction: Faction, defId: string, tx: number, ty: number, builder?: Unit): Building | null {
    const def = BUILDINGS[defId];
    if (!def) return null;
    if (this.factions[faction].tech < def.tier) { if (faction === 0) this.onLog(`需要 ${def.tier} 本科技`); return null; }
    if (!this.canPlace(tx, ty, def.w, def.h)) { if (faction === 0) this.onLog('无法在此建造'); return null; }
    if (!this.spend(faction, def.costGold, def.costCrystal)) { if (faction === 0) this.onLog('资源不足'); return null; }
    const b = new Building(def, faction, tx, ty);
    this.buildings.push(b);
    this.map.blockRect(tx, ty, def.w, def.h, 2);
    if (builder) builder.order = { type: 'build', buildingId: b.id };
    if (faction === 0) this.onSound('place');
    return b;
  }

  trainUnit(faction: Faction, building: Building, unitId: string): boolean {
    const def = UNITS[unitId];
    if (!def || !building.built || building.techUpgrade) return false;
    // P1 卡组限制
    if (!this.deckAllows(faction, unitId)) { if (faction === 0) this.onLog('该单位不在出战卡组中'); return false; }
    if (def.tier > this.factions[faction].tech) { if (faction === 0) this.onLog(`需要 ${def.tier} 本科技`); return false; }
    if (building.queue.length >= 5) return false;
    // 英雄上限：场上存活 + 复活倒计时 + 生产队列中的英雄
    if (def.kind === 'hero') {
      let n = this.deadHeroes.filter(d => d.faction === faction).length;
      for (const u of this.units) if (!u.dead && u.faction === faction && u.def.kind === 'hero') n++;
      for (const b of this.buildings) {
        if (b.dead || b.faction !== faction) continue;
        for (const q of b.queue) if (UNITS[q.unitId]?.kind === 'hero') n++;
      }
      if (n >= HERO_MAX) { if (faction === 0) this.onLog(`英雄数量已达上限（${HERO_MAX}）`); return false; }
    }
    if (this.supplyUsed(faction) + building.queue.length >= this.supplyCap(faction)) {
      if (faction === 0) this.onLog('人口已满，请建造树屋');
      return false;
    }
    if (!this.spend(faction, def.costGold, def.costCrystal)) {
      if (faction === 0) this.onLog('资源不足');
      return false;
    }
    building.queue.push({ unitId, timer: def.buildTime, total: def.buildTime });
    if (faction === 0) this.onSound('train');
    return true;
  }

  startTechUpgrade(faction: Faction, hall: Building): boolean {
    if (hall.techUpgrade || hall.queue.length > 0) return false;
    const cur = this.factions[faction].tech;
    if (cur >= 3) return false;
    const up = cur === 1
      ? { to: 2 as const, costGold: 150, costCrystal: 100, time: 30, name: '升级2本' }
      : { to: 3 as const, costGold: 250, costCrystal: 200, time: 45, name: '升级3本' };
    if (!this.spend(faction, up.costGold, up.costCrystal)) {
      if (faction === 0) this.onLog('资源不足');
      return false;
    }
    hall.techUpgrade = { to: up.to, timer: up.time, total: up.time };
    if (faction === 0) this.onLog(up.name + ' 开始');
    return true;
  }

  setTech(faction: Faction, to: 2 | 3) {
    this.factions[faction].tech = to;
    if (faction === 0) { this.onLog(`科技升级完成：${to} 本`); this.onSound('tech'); }
  }

  // ===== P1 兵种科技 =====
  /** 可研究兵种科技的单位（英雄/工人/召唤物除外） */
  unitTechAvailable(unitId: string): boolean {
    const def = UNITS[unitId];
    return !!def && def.kind !== 'hero' && def.kind !== 'worker' && def.costGold > 0;
  }

  unitTechLevel(faction: Faction, unitId: string): number {
    return this.factions[faction].unitTech[unitId] ?? 1;
  }

  unitTechCost(unitId: string, curLevel: number): number {
    const def = UNITS[unitId];
    if (!def) return 0;
    return Math.round(def.costGold * UNIT_TECH_COST_FACTOR * curLevel);
  }

  startUnitTech(faction: Faction, building: Building, unitId: string): boolean {
    const def = UNITS[unitId];
    if (!def || !building.built || building.research) return false;
    if (!building.def.trains.includes(unitId)) return false;
    if (!this.unitTechAvailable(unitId)) return false;
    const cur = this.unitTechLevel(faction, unitId);
    if (cur >= UNIT_TECH_MAX) return false;
    if (!this.spend(faction, this.unitTechCost(unitId, cur), 0)) {
      if (faction === 0) this.onLog('资源不足');
      return false;
    }
    building.research = { unitId, timer: UNIT_TECH_TIME, total: UNIT_TECH_TIME };
    if (faction === 0) this.onLog(`${def.name} 兵种科技研究中 → Lv.${cur + 1}`);
    return true;
  }

  completeUnitTech(faction: Faction, unitId: string) {
    const next = Math.min(UNIT_TECH_MAX, this.unitTechLevel(faction, unitId) + 1);
    this.factions[faction].unitTech[unitId] = next;
    for (const u of this.units) {
      if (!u.dead && u.faction === faction && u.def.id === unitId) u.applyTechLevel(next);
    }
    if (faction === 0) this.onLog(`${UNITS[unitId]?.name ?? unitId} 兵种科技 → Lv.${next}（攻/血 +10%/级）`);
  }

  // ===== P1 英雄技能升级 =====
  heroSkillCost(curLevel: number): number { return HERO_SKILL_COST * curLevel; }

  upgradeHeroSkill(faction: Faction, hero: Unit, idx: number): boolean {
    if (hero.dead || hero.def.kind !== 'hero') return false;
    if (idx >= hero.heroSkillDefs.length) return false;
    const cur = hero.skillLevels[idx] ?? 1;
    if (cur >= HERO_SKILL_MAX) return false;
    if (!this.spend(faction, this.heroSkillCost(cur), 0)) {
      if (faction === 0) this.onLog('资源不足');
      return false;
    }
    hero.skillLevels[idx] = cur + 1;
    if (faction === 0) this.onLog(`${hero.def.name}·${hero.heroSkillDefs[idx].name} → Lv.${cur + 1}（效果+25%）`);
    return true;
  }

  spawnFromBuilding(b: Building, unitId: string) {
    const def = UNITS[unitId];
    if (!def) return;
    // 出生点：建筑边缘朝集结点方向
    let sx = b.x, sy = b.y + b.radius + 20;
    if (b.rally) {
      const dx = b.rally.x - b.x, dy = b.rally.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      sx = b.x + (dx / d) * (b.radius + 22);
      sy = b.y + (dy / d) * (b.radius + 22);
    }
    const spot = this.map.nearestWalkable(Math.floor(sx / TILE), Math.floor(sy / TILE), 10);
    const u = new Unit(def, b.faction, spot ? spot.x * TILE + TILE / 2 : sx, spot ? spot.y * TILE + TILE / 2 : sy);
    // 新训练单位按当前兵种科技等级初始化
    const techLv = this.unitTechLevel(b.faction, unitId);
    if (techLv > 1 && def.kind !== 'hero') u.applyTechLevel(techLv);
    this.units.push(u);
    if (b.rally) {
      if (def.kind === 'worker') {
        const node = this.findNearestNode(b.rally.x, b.rally.y);
        if (node) u.order = { type: 'gather', nodeId: node.id };
        else u.setDest(this, b.rally.x, b.rally.y, { type: 'move', target: { ...b.rally } });
      } else {
        u.setDest(this, b.rally.x, b.rally.y, { type: 'move', target: { ...b.rally } });
      }
    } else if (def.kind === 'worker') {
      const node = this.findNearestNode(u.x, u.y);
      if (node) u.order = { type: 'gather', nodeId: node.id };
    }
  }

  onBuildingCompleted(b: Building) {
    if (b.faction === 0) { this.onLog(`${b.def.name} 建造完成`); this.onSound('build'); }
  }

  // ===== 移动 =====
  moveEntity(u: Unit, nx: number, ny: number) {
    // 飞行：无视地形，只受地图边界限制
    if (u.flying) {
      u.x = Math.max(TILE, Math.min(this.map.w * TILE - TILE, nx));
      u.y = Math.max(TILE, Math.min(this.map.h * TILE - TILE, ny));
      return;
    }
    const r = u.radius;
    // 碰撞：阻挡格
    const free = (x: number, y: number) => {
      const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
      const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          if (!this.map.isWalkableTile(tx, ty)) return false;
      return true;
    };
    if (free(nx, ny)) { u.x = nx; u.y = ny; return; }
    if (free(nx, u.y)) { u.x = nx; return; }
    if (free(u.x, ny)) { u.y = ny; return; }
  }

  /** 单位间分离（软推挤）；飞行单位不参与地面推挤 */
  private separate() {
    for (const u of this.units) {
      if (u.dead || u.flying) continue;
      this.spatial.queryCircle(u.x, u.y, u.radius + 14, this.queryBuf);
      let px = 0, py = 0;
      for (const o of this.queryBuf) {
        if (o === u || o.dead || !(o instanceof Unit)) continue;
        const dx = u.x - o.x, dy = u.y - o.y;
        const d = Math.hypot(dx, dy);
        const minD = u.radius + o.radius;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) / minD;
          px += (dx / d) * push;
          py += (dy / d) * push;
        } else if (d <= 0.001) {
          px += (rand() - 0.5) * 0.2;
          py += (rand() - 0.5) * 0.2;
        }
      }
      if (px !== 0 || py !== 0) {
        const sep = 40;
        this.moveEntity(u, u.x + px * sep * STEP_DT * 8, u.y + py * sep * STEP_DT * 8);
      }
    }
  }

  // ===== 战斗 =====
  dealDamage(source: Entity | null, target: Entity, dmg: number, splash = 0, noThorns = false) {
    if (target.dead) return;
    // 据点无敌：只能占领，不能摧毁
    if (target instanceof Building && target.def.kind === 'stronghold') return;
    // 飞行目标：无对空能力的攻击无效；对空倍率结算
    if (target instanceof Unit && target.flying) {
      if (source instanceof Unit) {
        if (!canHitAir(source)) return;
        dmg *= airDamageMult(source);
      }
    }
    this.onSound('hit'); // P6 战斗命中音（audio 层节流）
    // 攻击方特性：闪现斩杀 > 暴击 / 攻城 / 减速
    if (source instanceof Unit) {
      const st = source.def.traits;
      if (st) {
        if (source.blinkBuff > 0 && st.blinkKill) {
          dmg *= st.blinkKill.mult;
          source.blinkBuff = 0;
          this.effects.push({ type: 'ring', x: target.x, y: target.y, radius: 22, life: 0.25, maxLife: 0.25, color: 0xc0c8ff });
        } else if (st.crit && rand() < st.crit.chance) {
          dmg *= st.crit.mult;
        }
        if (target instanceof Building && st.siege) dmg *= st.siege;
        if (target instanceof Unit && st.slow) {
          target.slowTimer = Math.max(target.slowTimer, st.slow.dur);
          target.slowAmt = Math.max(target.slowAmt, st.slow.amount);
        }
        // P4 瘟疫：命中附加持续伤害（溅射传播见 applySplash）
        if (target instanceof Unit && st.plague) {
          target.plagueTimer = Math.max(target.plagueTimer, st.plague.dur);
          target.plagueDps = st.plague.dps;
          target.plagueSrcId = source.id;
        }
        // P4 诅咒降甲：命中降低护甲
        if (st.armorCurse) {
          target.armorCurseTimer = Math.max(target.armorCurseTimer, st.armorCurse.dur);
          target.armorCurseAmt = Math.max(target.armorCurseAmt, st.armorCurse.amt);
        }
        // P4 偷取增益：驱散目标正面增益，自身获得加速
        if (st.stealBuffs && target instanceof Unit &&
            (target.hasteTimer > 0 || target.frenzyTimer > 0 || target.rageTimer > 0 || target.shieldHp > 0)) {
          target.hasteTimer = 0; target.frenzyTimer = 0; target.rageTimer = 0; target.shieldHp = 0;
          source.hasteTimer = Math.max(source.hasteTimer, BUFF_DURATION);
        }
      }
    }
    // 护盾优先吸收
    if (target instanceof Unit && target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, dmg);
      target.shieldHp -= absorbed;
      dmg -= absorbed;
      target.hitFlash = 0.12;
      if (dmg <= 0.001) return;
    }
    // P4 诅咒降甲：目标护甲临时降低后再结算
    const effArmor = Math.max(0, target.armor - (target.armorCurseTimer > 0 ? target.armorCurseAmt : 0));
    const eff = Math.max(1, dmg - effArmor);
    target.hp -= eff;
    target.hitFlash = 0.12;
    // 被打反击（打不到对方时不反击，避免地面近战被飞行单位无脑风筝）
    if (target instanceof Unit && source) {
      const srcFlying = source instanceof Unit && source.flying;
      if (!srcFlying || target.canAir) {
        if (!target.isCreep) {
          if (target.order.type === 'idle' || target.order.type === 'hold') {
            target.order = { type: 'attack', targetId: source.id };
          }
        } else if (target.order.type === 'idle') {
          target.order = { type: 'attack', targetId: source.id };
        }
      }
    }
    if (target.hp <= 0) {
      target.hp = 0;
      this.killEntity(target, source);
    }
    // P3 反伤：目标存活时反弹固定伤害给近战来源（noThorns 防递归）
    if (!noThorns && !target.dead && source instanceof Unit && target instanceof Unit) {
      const th = target.def.traits?.thorns;
      if (th && th > 0) this.dealDamage(target, source, th, 0, true);
    }
    if (splash > 0) this.applySplash(source, target.x, target.y, dmg, splash);
  }

  /** 溅射：落点半径内敌人受一半伤害（不波及飞行单位） */
  private applySplash(source: Entity | null, x: number, y: number, dmg: number, radius: number) {
    this.spatial.queryCircle(x, y, radius, this.queryBuf);
    const targets = this.queryBuf.slice();
    const st = source ? this.teams[source.faction] : -2;
    for (const o of targets) {
      if (o.dead || (st !== -2 && this.teams[o.faction] === st)) continue;
      if (o instanceof Unit && o.flying) continue;
      o.hp -= Math.max(1, dmg * 0.5 - o.armor);
      o.hitFlash = 0.12;
      // P4 瘟疫溅射传播
      const sp = source instanceof Unit ? source.def.traits?.plague : undefined;
      if (sp && o instanceof Unit && source) {
        o.plagueTimer = Math.max(o.plagueTimer, sp.dur);
        o.plagueDps = sp.dps;
        o.plagueSrcId = source.id;
      }
      if (o.hp <= 0) this.killEntity(o, source);
    }
  }

  /** P4 自爆：对半径内敌人造成伤害后自毁（防二次引爆） */
  selfExplode(u: Unit, dmg: number, radius: number) {
    u.exploded = true;
    this.effects.push({ type: 'ring', x: u.x, y: u.y, radius, life: 0.4, maxLife: 0.4, color: 0xffaa33 });
    this.spatial.queryCircle(u.x, u.y, radius, this.queryBuf);
    const targets = this.queryBuf.slice();
    for (const e of targets) {
      if (e.dead || e === u || this.sameTeam(e.faction, u.faction)) continue;
      this.dealDamage(u, e, dmg);
    }
    if (!u.dead) this.killEntity(u, null);
  }

  killEntity(e: Entity, killer: Entity | null) {
    if (e.dead) return;
    e.dead = true;
    e.selected = false;
    if (e instanceof Building) {
      this.map.blockRect(e.tx, e.ty, e.w, e.h, 0);
      this.effects.push({ type: 'ring', x: e.x, y: e.y, radius: e.radius, life: 0.5, maxLife: 0.5, color: 0xff8844 });
      // 主基地被摧毁 → 该队所有主基地倒下才结算胜负
      if (e.def.kind === 'main') {
        const loserTeam = this.teams[e.faction];
        const teamHasMain = this.buildings.some(b =>
          !b.dead && b.def.kind === 'main' && this.teams[b.faction] === loserTeam);
        if (!teamHasMain) {
          // P5-c：非 destroy 关卡拆除主基地不直接判胜（由目标判定结算）
          const destroyMode = !this.scenario || this.scenario.objective.type === 'destroy';
          if (destroyMode) {
            this.over = { win: loserTeam !== this.teams[0] };
            this.onVictory(this.over.win);
          }
          if (loserTeam === this.teams[0]) this.onLog('主基地被摧毁…');
          else this.onLog('敌方主基地全部倒下！');
        }
      }
      return;
    }
    const u = e as Unit;
    // 掉落奖励
    if (killer) {
      const kf = killer.faction;
      if (kf !== 2 && !this.sameTeam(kf, u.faction)) {
        if (u.isCreep) {
          this.factions[kf].gold += u.creepBounty.gold;
          this.factions[kf].crystal += u.creepBounty.crystal;
        } else {
          this.factions[kf].gold += Math.round(u.def.bounty * 0.5);
        }
        // 附近友方英雄分经验
        this.spatial.queryCircle(u.x, u.y, 350, this.queryBuf);
        const heroes = this.queryBuf.filter(o =>
          o instanceof Unit && !o.dead && this.sameTeam(o.faction, kf) && (o as Unit).def.kind === 'hero') as Unit[];
        if (heroes.length > 0) {
          const share = Math.max(1, Math.round((u.isCreep ? u.creepBounty.xp : u.def.bounty) / heroes.length));
          for (const h of heroes) h.gainXp(share);
        }
      }
    }
    // 野怪营地计数
    for (const camp of this.creepCamps) {
      if (camp.unitIds.includes(u.id)) {
        camp.aliveCount--;
        if (camp.aliveCount <= 0) camp.respawnTimer = CREEP_RESPAWN;
      }
    }
    // P2：野怪死亡掉落魔法球（boss 必掉）
    if (u.isCreep && killer && killer.faction !== 2) {
      const isBoss = u.def.id === 'boss';
      if (isBoss || rand() < ORB_DROP_CHANCE) {
        const roll = rand();
        const type: OrbType = roll < 0.34 ? 'haste' : roll < 0.67 ? 'frenzy' : 'goldrain';
        this.orbs.push(makeOrb(type, u.x, u.y));
      }
    }
    // P2：大型野怪（巨魔/Boss）被玩家阵营击杀 → 转为击杀方单位推线
    if (u.isCreep && (u.def.id === 'troll' || u.def.id === 'boss') &&
        killer && killer.faction !== 2) {
      this.spawnConvertedCreep(u, killer.faction);
    }
    // 死亡分裂
    const tr = u.def.traits;
    if (tr?.deathSplit) {
      const def = UNITS[tr.deathSplit.unitId];
      if (def) {
        for (let i = 0; i < tr.deathSplit.count; i++) {
          const a = (Math.PI * 2 * i) / tr.deathSplit.count;
          const nu = this.spawnUnitAt(def, u.faction, u.x + Math.cos(a) * 18, u.y + Math.sin(a) * 18);
          if (nu) nu.order = { type: 'attackMove', target: { x: u.x, y: u.y } };
        }
      }
    }
    // P4 自爆：被击杀时引爆（接近目标引爆已置 exploded 标记）
    if (tr?.selfExplode && !u.exploded) {
      this.selfExplode(u, tr.selfExplode.dmg, tr.selfExplode.radius);
      return;
    }
    // P4 留下尸体（15 秒消散，供亡者复苏消费）
    this.corpses.push({ x: u.x, y: u.y, defId: u.def.id, faction: u.faction, timer: 15 });
    if (this.corpses.length > 200) this.corpses.shift();
    // 击杀触发：召唤
    if (killer instanceof Unit && !killer.dead) {
      const ok = killer.def.traits?.onKillSummon;
      if (ok) {
        const def = UNITS[ok.unitId];
        if (def) {
          let n = 0;
          for (const o of this.units) {
            if (!o.dead && o.summonedBy === killer.id && o.def.id === ok.unitId) n++;
          }
          if (n < ok.max) {
            const su = this.spawnUnitAt(def, killer.faction, u.x, u.y);
            if (su) { su.summonedBy = killer.id; su.lifespan = ok.lifetime; }
          }
        }
      }
    }
    // 英雄死亡 → 计时复活
    if (u.def.kind === 'hero' && u.faction !== 2) {
      this.deadHeroes.push({ faction: u.faction, defId: u.def.id, timer: HERO_RESPAWN });
      this.onLog(u.faction === 0 ? '英雄阵亡，即将复活'
        : this.sameTeam(u.faction, 0) ? '队友英雄阵亡' : '敌方英雄阵亡');
    }
  }

  /** P2：巨魔/Boss 转为击杀方单位，沿中路推向敌方基地 */
  private spawnConvertedCreep(creep: Unit, faction: Faction) {
    const src = CREEPS[creep.def.id as 'troll' | 'boss'];
    if (!src) return;
    const udef: UnitDef = {
      id: src.id, name: `狂暴${src.name}`, kind: src.range > 60 ? 'ranged' : 'melee', tier: 1,
      costGold: 0, costCrystal: 0, buildTime: 0,
      hp: src.hp, armor: src.armor, dmg: src.dmg, range: src.range,
      attackSpeed: src.attackSpeed, speed: src.speed + 15, radius: src.radius,
      projectile: !!src.projectile, bounty: 0, color: src.color, desc: '被击杀后为我方而战的大型野怪。',
    };
    const u = new Unit(udef, faction, creep.x, creep.y);
    this.units.push(u);
    // 中路固定路线：推向最近的敌方主基地（P5：队伍内任一敌方）
    const foeTeam = 1 - this.teams[faction];
    let enemyMain: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.def.kind !== 'main' || this.teams[b.faction] !== foeTeam) continue;
      const d = Math.hypot(b.x - creep.x, b.y - creep.y);
      if (d < bd) { bd = d; enemyMain = b; }
    }
    const mid = { x: (this.map.w * TILE) / 2, y: (this.map.h * TILE) / 2 };
    const goal = enemyMain ? { x: enemyMain.x, y: enemyMain.y } : mid;
    u.order = { type: 'attackMove', target: goal };
    u.resume = { type: 'attackMove', target: goal };
    this.onLog(faction === 0 ? `${udef.name} 加入我方，向敌方基地推进！`
      : this.sameTeam(faction, 0) ? `队友的${udef.name}加入战斗！` : `敌方狂暴${src.name}向我方推进！`);
  }

  /** 在世界坐标生成单位（地面单位自动找最近可走格） */
  spawnUnitAt(def: UnitDef, faction: Faction, x: number, y: number): Unit | null {
    if (!def) return null;
    let px = x, py = y;
    if (!def.traits?.flying) {
      const spot = this.map.nearestWalkable(Math.floor(x / TILE), Math.floor(y / TILE), 8);
      if (spot) { px = spot.x * TILE + TILE / 2; py = spot.y * TILE + TILE / 2; }
    }
    const u = new Unit(def, faction, px, py);
    this.units.push(u);
    return u;
  }

  spawnProjectile(source: Entity, target: Entity, dmg: number, splash?: number) {
    const sp = splash ?? (source instanceof Unit ? source.def.traits?.splash ?? 0 : 0);
    this.projectiles.push({
      x: source.x, y: source.y - 8,
      targetId: target.id,
      sourceId: source.id,
      speed: 340,
      dmg, splash: sp,
      faction: source.faction,
      color: source.faction === 0 ? 0x8fe0ff : source.faction === 1 ? 0xffa08f : 0xffe08a,
      dead: false,
    });
  }

  castAreaSkill(hero: Unit, x: number, y: number, sk: HeroSkillDef, delay = 0) {
    if (delay > 0) {
      // 延迟落弹（炮击等）：先标记预警圈
      this.delayedCasts.push({ timer: delay, x, y, heroId: hero.id, sk });
      this.effects.push({ type: 'ring', x, y, radius: sk.radius, life: delay, maxLife: delay, color: 0xffd34d });
      return;
    }
    this.applyAreaSkill(hero, x, y, sk);
  }

  private applyAreaSkill(hero: Unit, x: number, y: number, sk: HeroSkillDef) {
    const ht = this.teams[hero.faction]; // 英雄所属队伍（队友共享增益判定）
    // P3 自身增益（狂暴）：只作用于英雄自身
    if (sk.selfBuff) {
      hero.rageTimer = Math.max(hero.rageTimer, sk.selfBuff.dur);
      hero.rageAmt = sk.selfBuff.atkSpeed;
      this.effects.push({ type: 'ring', x: hero.x, y: hero.y, radius: 30, life: 0.45, maxLife: 0.45, color: 0xff6644 });
      if (this.sameTeam(hero.faction, 0)) this.onLog(`${hero.def.name} 进入狂暴！`);
      return;
    }
    // P3 多段落雷（雷暴）：调度定时落雷
    if (sk.strikes) {
      this.pendingStrikes.push({ timer: 0.05, x, y, heroId: hero.id, sk, left: sk.strikes.count });
      return;
    }
    // P3 地面持续伤害区（熔岩裂隙）
    if (sk.dotZone) {
      this.dotZones.push({
        x, y, r: sk.radius, dps: sk.dotZone.dps, timer: sk.dotZone.dur,
        tick: 0.5, faction: hero.faction, heroId: hero.id,
      });
      this.effects.push({ type: 'ring', x, y, radius: sk.radius, life: 0.6, maxLife: 0.6, color: 0xff7733 });
      return;
    }
    // P4 沙暴：地面减速+持续伤害区域
    if (sk.sandstorm) {
      this.dotZones.push({
        x, y, r: sk.radius, dps: sk.sandstorm.dps, timer: sk.sandstorm.dur,
        tick: 0.5, faction: hero.faction, heroId: hero.id, slowAmt: sk.sandstorm.slow,
      });
      this.effects.push({ type: 'ring', x, y, radius: sk.radius, life: 0.6, maxLife: 0.6, color: 0xd0b060 });
      return;
    }
    // P4 亡者复苏：消耗附近尸体召唤骷髅战士
    if (sk.revive) {
      const near = this.corpses
        .map((c, i) => ({ c, i, d: Math.hypot(c.x - x, c.y - y) }))
        .filter(o => o.d <= sk.radius)
        .sort((a, b) => a.d - b.d)
        .slice(0, sk.revive.count);
      if (near.length === 0) {
        if (this.sameTeam(hero.faction, 0)) this.onLog('亡者复苏：附近没有尸体');
        return;
      }
      const def = UNITS['skel'];
      for (const o of near.reverse()) {
        this.corpses.splice(o.i, 1);
        const nu = this.spawnUnitAt(def, hero.faction, o.c.x, o.c.y);
        if (nu) {
          nu.order = { type: 'attackMove', target: { x: o.c.x, y: o.c.y } };
          this.effects.push({ type: 'ring', x: o.c.x, y: o.c.y, radius: 24, life: 0.5, maxLife: 0.5, color: 0xc8c8b8 });
        }
      }
      if (this.sameTeam(hero.faction, 0)) this.onLog(`亡者复苏：${near.length} 名骷髅战士从坟墓中爬起！`);
      return;
    }
    // P4 生命虹吸：汲取最近敌人，等量治疗自身
    if (sk.drain) {
      let best: Unit | null = null; let bd = Infinity;
      this.spatial.queryCircle(hero.x, hero.y, sk.radius, this.queryBuf2);
      for (const e of this.queryBuf2) {
        if (e.dead || !(e instanceof Unit) || this.teams[e.faction] === ht || e.flying) continue;
        const d = hero.distTo(e);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return;
      this.dealDamage(hero, best, sk.power);
      hero.hp = Math.min(hero.maxHp, hero.hp + sk.power);
      this.effects.push({ type: 'ring', x: best.x, y: best.y, radius: 26, life: 0.4, maxLife: 0.4, color: 0xa040c0 });
      if (this.sameTeam(hero.faction, 0)) this.onLog(`生命虹吸：汲取 ${best.def.name} ${sk.power} 点生命`);
      return;
    }
    // P4 俯冲突进：向目标点位移并造成范围伤害
    if (sk.dash) {
      const dx = x - hero.x, dy = y - hero.y;
      const d = Math.hypot(dx, dy) || 1;
      const steps = Math.min(Math.floor(sk.dash.dist / 8), Math.floor(d / 8));
      for (let i = 0; i < steps; i++) {
        this.moveEntity(hero, hero.x + (dx / d) * 8, hero.y + (dy / d) * 8);
      }
      this.effects.push({ type: 'ring', x: hero.x, y: hero.y, radius: sk.radius, life: 0.45, maxLife: 0.45, color: 0xff6a4a });
      this.spatial.queryCircle(hero.x, hero.y, sk.radius, this.queryBuf2);
      for (const e of this.queryBuf2.slice()) {
        if (e.dead || e === hero || this.teams[e.faction] === ht) continue;
        this.dealDamage(hero, e, sk.power);
      }
      return;
    }
    // P4 恐惧：范围内敌人短暂失控乱窜
    if (sk.fear) {
      this.spatial.queryCircle(x, y, sk.radius, this.queryBuf2);
      for (const e of this.queryBuf2) {
        if (e.dead || !(e instanceof Unit) || this.teams[e.faction] === ht) continue;
        e.fearTimer = Math.max(e.fearTimer, sk.fear.dur);
      }
      this.effects.push({ type: 'ring', x, y, radius: sk.radius, life: 0.5, maxLife: 0.5, color: 0x6040a0 });
      return;
    }
    // P4 自爆大招：牺牲自身造成巨额 AoE，随后进入英雄复活计时
    if (sk.selfDestruct) {
      this.effects.push({ type: 'ring', x: hero.x, y: hero.y, radius: sk.radius, life: 0.6, maxLife: 0.6, color: 0xffaa33 });
      this.spatial.queryCircle(hero.x, hero.y, sk.radius, this.queryBuf2);
      for (const e of this.queryBuf2.slice()) {
        if (e.dead || e === hero || this.teams[e.faction] === ht) continue;
        this.dealDamage(hero, e, sk.power);
      }
      if (this.sameTeam(hero.faction, 0)) this.onLog(`${hero.def.name} 化作死亡绽放！`);
      this.killEntity(hero, null);
      return;
    }
    // P3 灵魂操控：夺取落点最近敌方非英雄单位
    if (sk.charm) {
      this.spatial.queryCircle(x, y, sk.radius, this.queryBuf);
      let best: Unit | null = null;
      let bd = Infinity;
      for (const e of this.queryBuf) {
        if (e.dead || !(e instanceof Unit) || this.teams[e.faction] === ht) continue;
        if (e.def.kind === 'hero') continue; // 英雄意志坚定，不可操控
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const victimTeam = this.teams[best.faction];
        if (best.originalFaction === null) best.originalFaction = best.faction;
        best.faction = hero.faction;
        best.charmedTimer = sk.charm.dur;
        best.order = { type: 'idle' };
        best.resume = { type: 'idle' };
        best.path = null;
        best.selected = false;
        this.effects.push({ type: 'ring', x: best.x, y: best.y, radius: 26, life: 0.5, maxLife: 0.5, color: 0xc77dff });
        if (this.sameTeam(hero.faction, 0)) this.onLog(`灵魂操控：${best.def.name} 为你而战 ${Math.round(sk.charm.dur)} 秒！`);
        else if (victimTeam === this.teams[0]) this.onLog('敌方英雄操控了我方单位！');
      }
      return;
    }
    this.effects.push({
      type: 'ring', x, y, radius: sk.radius, life: 0.45, maxLife: 0.45,
      color: sk.targetAllies ? 0x7dd87d : 0xff9a4d,
    });
    this.spatial.queryCircle(x, y, sk.radius, this.queryBuf);
    const targets = this.queryBuf.slice();
    if (sk.targetAllies) {
      for (const e of targets) {
        if (e.dead || this.teams[e.faction] !== ht || !(e instanceof Unit)) continue;
        const u = e;
        if (sk.shield) {
          u.shieldHp = Math.min(u.maxHp, u.shieldHp + sk.shield);
          this.effects.push({ type: 'ring', x: u.x, y: u.y, radius: 18, life: 0.3, maxLife: 0.3, color: 0x9fd8ff });
        } else if (sk.power && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + sk.power);
          this.effects.push({ type: 'ring', x: u.x, y: u.y, radius: 18, life: 0.3, maxLife: 0.3, color: 0x7dd87d });
        }
      }
    } else {
      for (const e of targets) {
        if (e.dead || this.teams[e.faction] === ht) continue;
        // P3 凝视降攻
        if (sk.atkDebuff && e instanceof Unit) {
          e.atkDebuffTimer = Math.max(e.atkDebuffTimer, sk.atkDebuff.dur);
          e.atkDebuffMult = sk.atkDebuff.mult;
        }
        if (sk.power > 0) this.dealDamage(hero, e, sk.power);
      }
    }
  }

  /** 长条形技能（直线吐火等） */
  castLineSkill(hero: Unit, x: number, y: number, sk: HeroSkillDef) {
    const ang = Math.atan2(y - hero.y, x - hero.x);
    const len = sk.radius * 2.2, wid = sk.radius * 0.55;
    const ex = hero.x + Math.cos(ang) * len, ey = hero.y + Math.sin(ang) * len;
    for (let t = 0.15; t <= 1; t += 0.15) {
      this.effects.push({
        type: 'ring', x: hero.x + (ex - hero.x) * t, y: hero.y + (ey - hero.y) * t,
        radius: wid * 0.8, life: 0.35, maxLife: 0.35, color: 0xff7030,
      });
    }
    this.spatial.queryCircle((hero.x + ex) / 2, (hero.y + ey) / 2, len / 2 + wid, this.queryBuf);
    const targets = this.queryBuf.slice();
    for (const e of targets) {
      if (e.dead || this.sameTeam(e.faction, hero.faction)) continue;
      const er = e instanceof Unit ? e.radius : (e as Building).radius;
      if (pointSegDist(e.x, e.y, hero.x, hero.y, ex, ey) <= wid + er) {
        this.dealDamage(hero, e, sk.power);
      }
    }
  }

  /** 召唤临时单位（英雄技能） */
  spawnSummons(hero: Unit, x: number, y: number, sk: HeroSkillDef) {
    const sm = sk.summon;
    if (!sm) return;
    const def = UNITS[sm.unitId];
    if (!def) return;
    for (let i = 0; i < sm.count; i++) {
      const a = (Math.PI * 2 * i) / sm.count;
      const u = this.spawnUnitAt(def, hero.faction, x + Math.cos(a) * 30, y + Math.sin(a) * 30);
      if (u) {
        u.lifespan = sm.lifetime;
        u.summonedBy = hero.id;
        u.order = { type: 'attackMove', target: { x, y } };
      }
    }
    this.effects.push({ type: 'ring', x, y, radius: sk.radius + 20, life: 0.45, maxLife: 0.45, color: 0x7ad9a0 });
  }

  /** 闪现特效 */
  onBlinkFx(x: number, y: number) {
    this.effects.push({ type: 'ring', x, y, radius: 26, life: 0.3, maxLife: 0.3, color: 0xc0c8ff });
  }

  // ===== 光环 =====
  /** 光环增益与治疗光环刷新（interval 秒结算一次治疗量） */
  private updateAuras(interval: number) {
    for (const u of this.units) {
      if (u.dead) continue;
      u.auraAtk = 0; u.auraSpd = 0; u.auraMove = 0;
    }
    for (const s of this.units) {
      if (s.dead) continue;
      const tr = s.def.traits;
      const aura = tr?.aura;
      if (aura) {
        this.spatial.queryCircle(s.x, s.y, aura.radius, this.queryBuf2);
        for (const e of this.queryBuf2) {
          if (e.dead || e === s || !(e instanceof Unit) || this.teams[e.faction] !== this.teams[s.faction]) continue;
          // P4 骷髅系光环：仅对骨架单位生效
          if (aura.skeletonsOnly && !e.def.skeleton) continue;
          e.auraAtk += aura.atk ?? 0;
          e.auraSpd += aura.atkSpeed ?? 0;
          e.auraMove += aura.move ?? 0;
        }
      }
      const heal = tr?.healAura;
      if (heal) {
        this.spatial.queryCircle(s.x, s.y, heal.radius, this.queryBuf2);
        for (const e of this.queryBuf2) {
          if (e.dead || !(e instanceof Unit) || this.teams[e.faction] !== this.teams[s.faction]) continue;
          if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + heal.rate * interval);
        }
      }
    }
  }

  // ===== 迷雾 =====
  updateFog(force = false) {
    if (!force && this.fogTimer > 0) return;
    this.fogTimer = 0.2;
    const fog = this.fog;    // visible(2) → explored(1)
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    const reveal = (wx: number, wy: number, r: number) => {
      const tr = Math.ceil(r / TILE);
      const cx = Math.floor(wx / TILE), cy = Math.floor(wy / TILE);
      for (let dy = -tr; dy <= tr; dy++)
        for (let dx = -tr; dx <= tr; dx++) {
          if (dx * dx + dy * dy > tr * tr) continue;
          const tx = cx + dx, ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) continue;
          fog[ty * this.map.w + tx] = 2;
        }
    };
    for (const u of this.units) {
      if (u.dead || !this.sameTeam(u.faction, 0)) continue; // 队伍共享视野
      reveal(u.x, u.y, u.isCreep ? 0 : 230);
    }
    for (const b of this.buildings) {
      if (b.dead || !this.sameTeam(b.faction, 0)) continue;
      reveal(b.x, b.y, 280);
      // 敌方建筑被看到 → 记忆
      this.spatial.queryCircle(b.x, b.y, 300, this.queryBuf);
      for (const e of this.queryBuf) {
        if (e instanceof Building && e.faction !== 2 && !this.sameTeam(e.faction, 0)) e.seenBy[0] = true;
      }
    }
    // P2 侦查区域：短暂开雾
    for (const r of this.reveals) {
      reveal(r.x, r.y, r.r);
    }
    this.fogVersion++;
  }

  // ===== P2 占领（矿产/据点） =====
  /** 占领目标：中立矿（ResourceNode）或据点（Building） */
  captureCost(target: ResourceNode | Building): number {
    const owner = target instanceof Building ? target.faction : target.owner;
    return owner === -1 || owner === 2 ? CAPTURE_COST_NEUTRAL : CAPTURE_COST_ENEMY;
  }

  /** 目标是否可被该阵营占领（附近有己方单位、无敌方单位、中立守军已清） */
  canCapture(faction: Faction, target: ResourceNode | Building): { ok: boolean; reason: string } {
    if (target instanceof Building) {
      if (target.dead || target.def.kind !== 'stronghold') return { ok: false, reason: '' };
      if (this.sameTeam(target.faction, faction)) return { ok: false, reason: '已占领' };
    } else {
      // 仅中场带守军产金的中立矿可占领（普通矿点零收益，策划文档 §P2）
      if (target.income <= 0) return { ok: false, reason: '此矿脉无法占领' };
      if (target.depleted && target.owner === -1) return { ok: false, reason: '矿脉枯竭' };
      if (this.sameTeam(target.owner as Faction, faction)) return { ok: false, reason: '已占领' };
    }
    const x = target.x, y = target.y;
    let ownNear = false;
    for (const u of this.units) {
      if (u.dead || u.isCreep) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d > CAPTURE_RADIUS) continue;
      if (this.sameTeam(u.faction, faction)) ownNear = true;
      else if (u.faction !== 2) return { ok: false, reason: '敌方单位在附近' };
    }
    if (!ownNear) return { ok: false, reason: '需要己方单位靠近' };
    // 中立守军未清空（附近 220 内有野怪）
    if (!(target instanceof Building) ? target.guarded : target.faction === 2) {
      const guardNear = this.units.some(u =>
        !u.dead && u.isCreep && Math.hypot(u.x - x, u.y - y) < 230);
      if (guardNear) return { ok: false, reason: '守军尚未清除' };
    }
    return { ok: true, reason: '' };
  }

  /** 尝试占领：成功则扣费并转移归属 */
  tryCapture(faction: Faction, target: ResourceNode | Building): boolean {
    const c = this.canCapture(faction, target);
    if (!c.ok) { if (this.sameTeam(faction, 0) && c.reason) this.onLog(`无法占领：${c.reason}`); return false; }
    const cost = this.captureCost(target);
    if (!this.spend(faction, cost, 0)) {
      if (this.sameTeam(faction, 0)) this.onLog('资源不足');
      return false;
    }
    if (target instanceof Building) {
      target.faction = faction as Faction;
      target.seenBy[0] = true;
      target.hp = target.maxHp;
      if (this.sameTeam(faction, 0)) this.onLog(`已占领${target.def.name}（-${cost}金）`);
      else this.onLog('敌方占领了据点！');
    } else {
      target.owner = faction;
      if (this.sameTeam(faction, 0)) this.onLog(`已占领中立金矿（-${cost}金，+${target.income}金/秒）`);
      else this.onLog('敌方占领了中立金矿！');
    }
    this.effects.push({ type: 'ring', x: target.x, y: target.y, radius: 60, life: 0.5, maxLife: 0.5, color: 0xffd97a });
    return true;
  }

  /** 附近可占领目标（UI 占领按钮用） */
  findCapturableNear(faction: Faction, x: number, y: number): ResourceNode | Building | null {
    let best: ResourceNode | Building | null = null;
    let bd = Infinity;
    for (const n of this.resourceNodes.values()) {
      if (this.sameTeam(n.owner as Faction, faction) || (n.depleted && n.owner === -1)) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < CAPTURE_RADIUS && d < bd) { bd = d; best = n; }
    }
    for (const b of this.buildings) {
      if (b.dead || b.def.kind !== 'stronghold' || this.sameTeam(b.faction, faction)) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < CAPTURE_RADIUS && d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ===== P2 侦查 =====
  revealArea(x: number, y: number, faction: Faction) {
    void faction;
    this.reveals.push({ x, y, r: REVEAL_RADIUS, timer: REVEAL_DURATION });
    this.updateFog(true);
    if (this.sameTeam(faction, 0)) this.onLog('侦查已释放');
  }

  // ===== P2 魔法球 =====
  private updateOrbs(dt: number) {
    for (const o of this.orbs) {
      o.life -= dt;
      if (o.life <= 0) continue;
      // 拾取：非野怪单位靠近
      this.spatial.queryCircle(o.x, o.y, ORB_PICKUP_RADIUS, this.queryBuf);
      for (const e of this.queryBuf) {
        if (e.dead || !(e instanceof Unit) || e.isCreep) continue;
        this.applyOrb(e, o.type);
        o.life = 0;
        break;
      }
    }
    this.orbs = this.orbs.filter(o => o.life > 0);
  }

  private applyOrb(u: Unit, type: OrbType) {
    const names = { haste: '加速', frenzy: '狂暴', goldrain: '金雨' } as const;
    if (type === 'haste') u.hasteTimer = BUFF_DURATION;
    else if (type === 'frenzy') u.frenzyTimer = BUFF_DURATION;
    else this.deposit(u.faction, GOLD_RAIN_AMOUNT);
    if (this.sameTeam(u.faction, 0)) {
      this.onLog(`拾取${names[type]}魔法球${type === 'goldrain' ? `（+${GOLD_RAIN_AMOUNT}金）` : ''}`);
      this.onSound('orb');
    }
    this.effects.push({ type: 'ring', x: u.x, y: u.y, radius: 20, life: 0.3, maxLife: 0.3, color: 0xb39bf5 });
  }

  // ===== P3 灵魂操控归还 =====
  /** 操控到期：单位归还原阵营 */
  restoreCharm(u: Unit) {
    if (u.originalFaction === null) return;
    u.faction = u.originalFaction;
    u.originalFaction = null;
    u.charmedTimer = 0;
    u.order = { type: 'idle' };
    u.resume = { type: 'idle' };
    u.path = null;
    u.selected = false;
    this.effects.push({ type: 'ring', x: u.x, y: u.y, radius: 24, life: 0.4, maxLife: 0.4, color: 0xc77dff });
    if (this.sameTeam(u.faction, 0)) this.onLog(`${u.def.name} 摆脱了灵魂操控！`);
  }

  // ===== P3 落雷/地面DoT =====
  private updatePendingStrikes(dt: number) {
    if (this.pendingStrikes.length === 0) return;
    for (const ps of this.pendingStrikes) {
      ps.timer -= dt;
      if (ps.timer <= 0) {
        ps.left--;
        ps.timer = ps.sk.strikes?.interval ?? 0.5;
        const hero = this.byId(ps.heroId);
        const src = hero instanceof Unit && !hero.dead ? hero : null;
        const st = src ? this.teams[src.faction] : -1;
        this.effects.push({ type: 'ring', x: ps.x, y: ps.y, radius: ps.sk.radius, life: 0.28, maxLife: 0.28, color: 0xaee6ff });
        this.spatial.queryCircle(ps.x, ps.y, ps.sk.radius, this.queryBuf);
        const targets = this.queryBuf.slice();
        for (const e of targets) {
          if (e.dead || this.teams[e.faction] === st) continue;
          this.dealDamage(src, e, ps.sk.power);
        }
      }
    }
    this.pendingStrikes = this.pendingStrikes.filter(p => p.left > 0);
  }

  private updateDotZones(dt: number) {
    if (this.dotZones.length === 0) return;
    for (const z of this.dotZones) {
      z.timer -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.5;
        const hero = this.byId(z.heroId);
        const src = hero instanceof Unit && !hero.dead ? hero : null;
        this.effects.push({ type: 'ring', x: z.x, y: z.y, radius: z.r * 0.8, life: 0.3, maxLife: 0.3, color: 0xff7733 });
        this.spatial.queryCircle(z.x, z.y, z.r, this.queryBuf);
        const targets = this.queryBuf.slice();
        for (const e of targets) {
          if (e.dead || this.sameTeam(e.faction, z.faction)) continue;
          // P4 沙暴减速：每跳刷新减速计时
          if (z.slowAmt && e instanceof Unit) {
            e.slowTimer = Math.max(e.slowTimer, 0.7);
            e.slowAmt = Math.max(e.slowAmt, z.slowAmt);
          }
          this.dealDamage(src, e, z.dps * 0.5);
        }
      }
    }
    this.dotZones = this.dotZones.filter(z => z.timer > 0);
  }

  // ===== 主循环 =====
  update(dt: number) {
    if (this.over) return;
    dt = STEP_DT;
    this.stepCount++;
    this.time += dt;
    this.fogTimer -= dt;

    // P5-c 战役：波次增援 + 特殊胜利目标
    if (updateScenario(this, dt)) return;

    // 空间哈希重建
    this.spatial.clear();
    for (const u of this.units) if (!u.dead) this.spatial.insert(u);
    for (const b of this.buildings) if (!b.dead) this.spatial.insert(b);

    // 实体更新
    for (const u of this.units) if (!u.dead) u.update(this, dt);
    for (const b of this.buildings) if (!b.dead) b.update(this, dt);

    this.separate();

    // 光环与治疗光环（周期刷新）
    this.auraTimer -= dt;
    if (this.auraTimer <= 0) {
      this.auraTimer = 0.4;
      this.updateAuras(0.4);
    }

    // 延迟施法（炮击等）
    if (this.delayedCasts.length > 0) {
      for (const dc of this.delayedCasts) {
        dc.timer -= dt;
        if (dc.timer <= 0) {
          const hero = this.byId(dc.heroId);
          if (hero instanceof Unit && !hero.dead) this.applyAreaSkill(hero, dc.x, dc.y, dc.sk);
        }
      }
      this.delayedCasts = this.delayedCasts.filter(dc => dc.timer > 0);
    }

    // 弹道
    for (const p of this.projectiles) {
      const t = this.byId(p.targetId);
      if (!t || t.dead) { p.dead = true; continue; }
      const dx = t.x - p.x, dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 6) {
        p.dead = true;
        const src = this.byId(p.sourceId) ?? null;
        this.dealDamage(src, t, p.dmg, p.splash);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    // P2 魔法球
    this.updateOrbs(dt);

    // P3 落雷/地面DoT区
    this.updatePendingStrikes(dt);
    this.updateDotZones(dt);

    // P4 尸体 decay
    if (this.corpses.length > 0) {
      for (const c of this.corpses) c.timer -= dt;
      this.corpses = this.corpses.filter(c => c.timer > 0);
    }

    // P2 侦查计时
    if (this.reveals.length > 0) {
      for (const r of this.reveals) r.timer -= dt;
      this.reveals = this.reveals.filter(r => r.timer > 0);
      this.fogVersion++;
    }

    // P2 占领矿产出
    for (const n of this.resourceNodes.values()) {
      if (n.owner >= 0) this.deposit(n.owner as Faction, n.income * dt);
    }

    // 特效
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter(fx => fx.life > 0);

    // 尸体清理
    this.units = this.units.filter(u => !u.dead);
    this.buildings = this.buildings.filter(b => !b.dead);

    // 野怪重生
    for (const camp of this.creepCamps) {
      if (camp.aliveCount <= 0 && camp.respawnTimer > 0) {
        camp.respawnTimer -= dt;
        if (camp.respawnTimer <= 0) {
          this.creepCamps = this.creepCamps.filter(c => c !== camp);
          this.spawnCreepCamp(Math.floor(camp.x / TILE) - 1, Math.floor(camp.y / TILE) - 1, camp.size);
        }
      }
    }

    // 英雄复活
    for (const dh of this.deadHeroes) {
      dh.timer -= dt;
      if (dh.timer <= 0) {
        const main = this.getMain(dh.faction);
        const hdef = UNITS[dh.defId] ?? UNITS.hero;
        if (main) {
          const hero = new Unit(hdef, dh.faction, main.x, main.y + main.radius + 24);
          this.units.push(hero);
          this.onLog(this.sameTeam(dh.faction, 0) ? `${hdef.name} 已复活` : `敌方 ${hdef.name} 复活`);
        }
        dh.timer = 9999; // 占位，稍后过滤
      }
    }
    this.deadHeroes = this.deadHeroes.filter(d => d.timer > 0);

    // 迷雾
    this.updateFog();

    // 胜负兜底：无建筑无单位（按队伍结算）
    if (!this.over) {
      const myTeam = this.teams[0];
      const teamAlive = (t: number) =>
        this.buildings.some(b => this.teams[b.faction] === t) ||
        this.units.some(u => this.teams[u.faction] === t);
      const meAlive = teamAlive(myTeam);
      const foeAlive = teamAlive(1 - myTeam);
      if (!meAlive) { this.over = { win: false }; this.onVictory(false); }
      else if (!foeAlive) { this.over = { win: true }; this.onVictory(true); }
    }
  }
}

/** 点到线段的最短距离 */
function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 0.001) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
