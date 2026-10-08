import { TILE, BUILDINGS, UNITS, DECK_UNIT_POOL, DECK_HERO_POOL, DECK_HEROES,
  DECK_UNIT_POOL_BLOOD, DECK_HERO_POOL_BLOOD,
  DECK_UNIT_POOL_UNDEAD, DECK_HERO_POOL_UNDEAD,
  UNIT_TECH_MAX, HERO_SKILL_MAX, RACE_BUILDINGS, RACE_WORKER } from './config';
import type { Game } from './game';
import type { Deck, Faction } from './types';
import { Unit, Building } from './entities';
import type { ResourceNode } from './entities';

/** 随机生成一张精灵族卡组（AI 用）：保底圣殿武士 + 兵营池 3 + 科技所池 2 + 英雄 3 */
export function randomElfDeck(): Deck {
  const pick = <T>(arr: readonly T[], n: number): T[] =>
    arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
  const barracksUnits = DECK_UNIT_POOL.slice(0, 8);      // 兵营系
  const arcaneUnits = DECK_UNIT_POOL.slice(8);           // 科技所系
  // 保底 1 本单位，避免 AI 前期无兵可出（与科技升级兵力门槛互锁）
  return {
    units: ['swordsman', ...pick(barracksUnits.filter(u => u !== 'swordsman'), 3), ...pick(arcaneUnits, 2)],
    heroes: pick(DECK_HERO_POOL, DECK_HEROES),
  };
}

/** P3：随机生成一张血兽族卡组（AI 用）：保底血兽兵 + 兵营池 3 + 先知帐幕池 2 + 英雄 3 */
export function randomBloodDeck(): Deck {
  const pick = <T>(arr: readonly T[], n: number): T[] =>
    arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
  const campUnits = DECK_UNIT_POOL_BLOOD.slice(0, 9);    // 兵营系
  const prophecyUnits = DECK_UNIT_POOL_BLOOD.slice(9);   // 先知帐幕系
  // 保底 1 本单位，避免 AI 前期无兵可出
  return {
    units: ['bfighter', ...pick(campUnits.filter(u => u !== 'bfighter'), 3), ...pick(prophecyUnits, 2)],
    heroes: pick(DECK_HERO_POOL_BLOOD, DECK_HEROES),
  };
}

/** P4：随机生成一张亡灵族卡组（AI 用）：保底骷髅先锋 + 埋骨地池 3 + 诅咒神殿池 2 + 英雄 3 */
export function randomUndeadDeck(): Deck {
  const pick = <T>(arr: readonly T[], n: number): T[] =>
    arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
  const boneyardUnits = DECK_UNIT_POOL_UNDEAD.slice(0, 9);    // 埋骨地系
  const templeUnits = DECK_UNIT_POOL_UNDEAD.slice(9);         // 诅咒神殿系
  // 保底 1 本单位，避免 AI 前期无兵可出
  return {
    units: ['skelpioneer', ...pick(boneyardUnits.filter(u => u !== 'skelpioneer'), 3), ...pick(templeUnits, 2)],
    heroes: pick(DECK_HERO_POOL_UNDEAD, DECK_HEROES),
  };
}

/** 脚本化 AI：建造顺序 + 波次进攻 + 基地防守（P1：卡组感知 + 富余升级；P3：按种族建造/出兵） */
export class AIController {
  game: Game;
  faction: Faction;
  timer = 2;
  attacking = false;
  wave = 0;
  sentCount = 0;
  /** 本局 AI 卡组（生成后写回 game.decks[faction]） */
  deck: Deck;

  constructor(game: Game, faction: Faction = 1) {
    this.game = game;
    this.faction = faction;
    const race = game.races[faction];
    this.deck = game.decks[faction] ??
      (race === 'blood' ? randomBloodDeck() : race === 'undead' ? randomUndeadDeck() : randomElfDeck());
    game.decks[faction] = this.deck;
  }

  /** 敌方玩家阵营 */
  private get enemy(): Faction { return this.faction === 0 ? 1 : 0; }
  /** 本族 kind → defId 映射 */
  private get rb(): Record<string, string> { return RACE_BUILDINGS[this.game.races[this.faction]]; }

  update(dt: number) {
    if (this.game.over) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.5;
      this.think();
    }
  }

  private get mine(): Building[] {
    return this.game.buildings.filter(b => !b.dead && b.faction === this.faction);
  }
  private get myUnits(): Unit[] {
    return this.game.units.filter(u => !u.dead && u.faction === this.faction);
  }
  private count(id: string): number {
    return this.mine.filter(b => b.def.id === id).length;
  }
  private afford(g: number, c: number) { return this.game.canAfford(this.faction, g, c); }

  private think() {
    const g = this.game;
    const f = g.factions[this.faction];
    const hall = g.getMain(this.faction);
    if (!hall) return;
    const units = this.myUnits;
    const workers = units.filter(u => u.def.kind === 'worker');
    const army = units.filter(u => u.def.kind !== 'worker');

    // ---- 经济 ----
    for (const w of workers) {
      if (w.order.type === 'idle' && (!w.gather || w.gather.carrying === 0 && w.gather.phase === 'moving')) {
        const node = g.findNearestNode(w.x, w.y);
        if (node) { w.order = { type: 'gather', nodeId: node.id }; w.gather = null; }
      }
    }

    // 训练工人
    const supplyLeft = g.supplyCap(this.faction) - g.supplyUsed(this.faction);
    if (workers.length < 9 && hall.queue.length === 0 && !hall.techUpgrade &&
        supplyLeft > 0 && this.afford(50, 0)) {
      g.trainUnit(this.faction, hall, RACE_WORKER[g.races[this.faction]]);
    }

    // ---- 建造（按种族 kind → defId 映射，P3） ----
    const rb = this.rb;
    const unfinished = this.mine.find(b => !b.built);
    if (unfinished) {
      // 保险：确保有工人在建
      const hasBuilder = workers.some(w =>
        w.order.type === 'build' && (w.order as { buildingId?: number }).buildingId === unfinished.id);
      if (!hasBuilder) {
        const builder = this.pickBuilder(workers);
        if (builder) builder.order = { type: 'build', buildingId: unfinished.id };
      }
    } else {
      const order: Array<[string, boolean]> = [
        ['house', supplyLeft <= 2 && this.count(rb.house) < 10],
        ['barracks', this.count(rb.barracks) < 1],
        ['extractor', this.count(rb.extractor) < 1],
        ['barracks', this.count(rb.barracks) < 2],
        ['extractor', this.count(rb.extractor) < 2], // 第二座 extractor 提前，保证 crystal 积累后再建 arcane
        ['arcane', f.tech >= 2 && this.count(rb.arcane) < 1],
        ['tower', this.count(rb.tower) < 1],
        ['tower', this.count(rb.tower) < 2 && f.crystal > 120],
        ['house', this.count(rb.house) < 10],
        ['barracks', this.count(rb.barracks) < 3],
      ];
      for (const [kind, want] of order) {
        if (!want) continue;
        const bid = rb[kind];
        const def = BUILDINGS[bid];
        if (f.tech < def.tier) {
          // 需要升级科技
          if (!hall.techUpgrade && hall.queue.length === 0) {
            const c = f.tech === 1 ? { g: 150, c: 100 } : { g: 250, c: 200 };
            if (this.afford(c.g, c.c) && army.length >= 5) g.startTechUpgrade(this.faction, hall);
          }
          break;
        }
        if (!this.afford(def.costGold, def.costCrystal)) break;
        const spot = this.findSpot(hall, def.w, def.h);
        if (!spot) break;
        const builder = this.pickBuilder(workers);
        if (builder) {
          g.placeBuilding(this.faction, bid, spot.tx, spot.ty, builder);
        }
        break; // 每次只启动一个建造
      }
    }

    // ---- 科技节奏（独立于建造顺序） ----
    if (!hall.techUpgrade && hall.queue.length === 0) {
      if (f.tech === 1 && this.count(rb.barracks) >= 1 && this.count(rb.extractor) >= 1 &&
          f.crystal >= 100 && this.afford(150, 100) && army.length >= 4) {
        g.startTechUpgrade(this.faction, hall);
      } else if (f.tech === 2 && this.count(rb.arcane) >= 1 &&
                 this.afford(250, 200) && army.length >= 6) {
        g.startTechUpgrade(this.faction, hall);
      }
    }

    // ---- 训练部队（P1：按卡组过滤；P3：按种族建筑） ----
    const inDeck = (id: string) => this.deck.units.includes(id) || this.deck.heroes.includes(id);
    const barracks = this.mine.filter(b => b.built && b.def.kind === 'barracks');
    const bpool = BUILDINGS[rb.barracks].trains.filter(id => UNITS[id].tier <= f.tech && inDeck(id));
    for (const b of barracks) {
      if (b.queue.length > 0) continue;
      // 优先当前科技可训练的卡组单位；无则取卡组内任意单位（trainUnit 会按科技把关）
      const inDeckAny = BUILDINGS[rb.barracks].trains.filter(id => inDeck(id));
      const pick = bpool.length > 0 ? bpool[(Math.random() * bpool.length) | 0] : inDeckAny[0];
      if (!pick) continue;
      const udef = UNITS[pick];
      if (supplyLeft > 0 && this.afford(udef.costGold, udef.costCrystal)) {
        g.trainUnit(this.faction, b, pick);
      }
    }
    const arcane = this.mine.find(b => b.built && b.def.kind === 'arcane');
    if (arcane && arcane.queue.length === 0) {
      const apool = BUILDINGS[rb.arcane].trains.filter(id => UNITS[id].tier <= f.tech && inDeck(id));
      if (apool.length > 0) {
        const heroCount = units.filter(u => u.def.kind === 'hero').length +
          arcane.queue.filter(q => UNITS[q.unitId]?.kind === 'hero').length;
        let pick: string | null = null;
        if (heroCount === 0) {
          // 先召唤一名英雄
          const hp = apool.filter(id => UNITS[id].kind === 'hero');
          if (hp.length > 0) pick = hp[(Math.random() * hp.length) | 0];
        }
        if (!pick) {
          const np = apool.filter(id => UNITS[id].kind !== 'hero');
          if (np.length > 0) pick = np[(Math.random() * np.length) | 0];
        }
        if (pick) {
          const udef = UNITS[pick];
          if (g.supplyCap(this.faction) - g.supplyUsed(this.faction) > 0 &&
              this.afford(udef.costGold, udef.costCrystal)) {
            g.trainUnit(this.faction, arcane, pick);
          }
        }
      }
    }

    // ---- P1：富余经济 → 兵种科技 / 英雄技能升级 ----
    if (f.gold > 500) {
      const lab = this.mine.find(b => b.built && (b.def.kind === 'barracks' || b.def.kind === 'arcane') && !b.research);
      if (lab) {
        const candidates = lab.def.trains.filter(id =>
          this.deck.units.includes(id) && g.unitTechAvailable(id) &&
          g.unitTechLevel(this.faction, id) < UNIT_TECH_MAX);
        if (candidates.length > 0) {
          g.startUnitTech(this.faction, lab, candidates[(Math.random() * candidates.length) | 0]);
        }
      }
      if (f.gold > 700) {
        const hero = units.find(u => u.def.kind === 'hero');
        if (hero) {
          const idx = hero.skillLevels.findIndex(lv => lv < HERO_SKILL_MAX);
          if (idx >= 0) g.upgradeHeroSkill(this.faction, hero, idx);
        }
      }
    }

    // ---- P2：抢矿 / 占点 ----
    this.updateCapture(units, army);

    // ---- 进攻波次（血兽前期压制：首波早、成长快；270s 后总攻决胜，P3） ----
    const allIn = g.time > 270;
    if (allIn) this.onLogOnce('发起总攻！全军出击！');

    // ---- 防守：家附近有敌人（总攻期只回防一半，主力继续围城，防止被小股敌人拉扯回家） ----
    const threat = g.units.find(u =>
      !u.dead && u.faction === this.enemy && u.def.kind !== 'worker' &&
      this.mine.some(b => Math.hypot(u.x - b.x, u.y - b.y) < 480));
    if (threat) {
      const sorted = army.slice().sort((a, b) =>
        Math.hypot(a.x - threat.x, a.y - threat.y) - Math.hypot(b.x - threat.x, b.y - threat.y));
      const defenders = allIn ? sorted.slice(0, Math.ceil(sorted.length / 2)) : sorted;
      for (const u of defenders) {
        if (u.order.type !== 'attack') {
          u.order = { type: 'attackMove', target: { x: threat.x, y: threat.y } };
        }
      }
      return;
    }

    const foeArmy = g.units.filter(u => !u.dead && u.faction === this.enemy && u.def.kind !== 'worker').length;
    // 血兽/亡灵走海量快攻节奏，精灵走质量爬升节奏
    const swarm = g.races[this.faction] !== 'elf';
    const base = swarm ? Math.min(8 + this.wave * 3, 18) : Math.min(8 + this.wave * 4, 22);
    // 只打有兵力优势的仗（+3 才值得进攻：防守方有塔与满编优势），避免小波次白给
    const threshold = allIn ? 0 : Math.max(base, foeArmy + 3);
    if (!this.attacking && army.length >= threshold) {
      this.attacking = true;
      this.sentCount = army.length;
    }
    if (this.attacking) {
      if (!allIn && army.length < Math.max(3, this.sentCount * 0.35)) {
        // 撤退整编
        this.attacking = false;
        this.wave++;
        for (const u of army) {
          u.order = { type: 'attackMove', target: { x: hall.x, y: hall.y + 80 } };
        }
      } else if (allIn && army.length < 10) {
        // 总攻也要攒出决定性兵力：零散兵在基地集结，避免被塔逐个吃掉形成死循环平局
        for (const u of army) {
          if (u.order.type === 'idle') {
            u.order = { type: 'move', target: { x: hall.x, y: hall.y + 80 } };
          }
        }
      } else {
        const target = this.pickAttackTarget(allIn);
        if (target) {
          for (const u of army) {
            if (u.order.type === 'idle' || u.order.type === 'move' ||
                (u.order.type === 'attackMove' && Math.hypot(u.x - target.x, u.y - target.y) > 700)) {
              u.order = { type: 'attackMove', target: { ...target } };
            }
          }
        }
      }
    }
  }

  /** 总攻提示只发一次 */
  private allInLogged = false;
  private onLogOnce(msg: string) {
    if (this.allInLogged) return;
    this.allInLogged = true;
    this.game.onLog(this.faction === 1 ? `敌方${msg}` : msg);
  }

  private pickAttackTarget(allIn: boolean): { x: number; y: number } | null {
    const g = this.game;
    const foe = this.enemy;
    if (!allIn) {
      const main = g.getMain(foe);
      if (main) return { x: main.x, y: main.y };
    }
    // 总攻：从距我主基地最近的敌方建筑开始逐栋拆除（塔/人口先掉，持续推进不可逆）
    const ref = g.getMain(this.faction);
    const bx = ref?.x ?? 0, by = ref?.y ?? 0;
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of g.buildings) {
      if (b.dead || b.faction !== foe) continue;
      const d = Math.hypot(b.x - bx, b.y - by);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return { x: best.x, y: best.y };
    const main = g.getMain(foe);
    if (main) return { x: main.x, y: main.y };
    const u = g.units.find(x => x.faction === foe && !x.dead);
    return u ? { x: u.x, y: u.y } : null;
  }

  // ===== P2 占领小队 =====
  private capTarget: ResourceNode | Building | null = null;
  private capSquad: number[] = [];
  private capSince = 0;

  private updateCapture(units: Unit[], army: Unit[]) {
    const g = this.game;
    const f = g.factions[this.faction];
    // 已有小队：就位则尝试占领
    if (this.capTarget && this.capSquad.length > 0) {
      // 超时放弃（120s），防止小队被牵走后卡死
      if (g.time - this.capSince > 120) { this.capTarget = null; this.capSquad = []; return; }
      const alive = units.filter(u => this.capSquad.includes(u.id));
      if (alive.length === 0) { this.capTarget = null; this.capSquad = []; return; }
      const tgt = this.capTarget;
      const near = alive.filter(u => Math.hypot(u.x - tgt.x, u.y - tgt.y) < 140);
      if (near.length > 0 && g.canCapture(this.faction, tgt).ok) {
        g.tryCapture(this.faction, tgt);
        this.capTarget = null;
        this.capSquad = [];
      }
      return;
    }
    // 无小队 & 兵力资源富余 → 组织占领（进攻中兵力富余也可派小分队抢矿，避免激进种族被锁死经济）
    const capNeed = this.attacking ? 12 : 6;
    if (army.length < capNeed || f.gold < 250) return;
    const main = g.getMain(this.faction);
    if (!main) return;
    let best: ResourceNode | Building | null = null;
    let bd = Infinity;
    for (const n of g.resourceNodes.values()) {
      // 只占领有产金收益的中立矿（普通矿点占领零收益，纯烧 150 金）
      if (n.owner === this.faction || n.depleted || n.income <= 0) continue;
      // 中立矿 150 金：留 100 金缓冲
      if (f.gold < 250) break;
      const d = Math.hypot(n.x - main.x, n.y - main.y);
      if (d < bd) { bd = d; best = n; }
    }
    for (const b of g.buildings) {
      if (b.dead || b.def.kind !== 'stronghold' || b.faction === this.faction) continue;
      // 据点 300 金：留 100 金缓冲
      if (f.gold < 400) break;
      const d = Math.hypot(b.x - main.x, b.y - main.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    const squad = army.slice(0, this.attacking ? 3 : 5);
    this.capTarget = best;
    this.capSquad = squad.map(u => u.id);
    this.capSince = g.time;
    for (const u of squad) {
      u.order = { type: 'attackMove', target: { x: best.x, y: best.y } };
    }
  }

  private pickBuilder(workers: Unit[]): Unit | null {
    // 优先取空闲/采集中的最近工人
    let best: Unit | null = null;
    let bd = Infinity;
    const hall = this.game.getMain(this.faction)!;
    for (const w of workers) {
      if (w.order.type === 'build') continue;
      const d = Math.hypot(w.x - hall.x, w.y - hall.y);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }

  private findSpot(hall: Building, w: number, h: number): { tx: number; ty: number } | null {
    const g = this.game;
    const cx = hall.tx, cy = hall.ty;
    for (let r = 3; r <= 14; r++) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r);
        const ty = Math.round(cy + Math.sin(a) * r);
        if (g.canPlace(tx, ty, w, h)) return { tx, ty };
      }
    }
    return null;
  }
}
