import {
  TILE, GATHER, UNIT_AGGRO, HERO_XP, HERO_LEVEL_BONUS, HERO_MANA_REGEN,
  ORB_LIFE, HASTE_MULT, FRENZY_MULT,
} from './config';
import type { Faction, Order, UnitDef, BuildingDef, HeroSkillDef } from './types';
import type { GameMap } from './map';
import { findPath } from './pathfinding';
import type { Vec2 } from './types';
import type { Game } from './game';
import { canHitAir } from './traits';
import { rand } from './rng';

let nextEntityId = 1;
export function resetEntityIds() { nextEntityId = 1; }
/** P5 存档：读档后恢复 id 序列 */
export function peekEntityId() { return nextEntityId; }
export function setEntityIdSeq(n: number) { nextEntityId = n; }

// ===== 基类 =====
export abstract class Entity {
  id = nextEntityId++;
  faction: Faction;
  x = 0;
  y = 0;
  hp: number;
  maxHp: number;
  armor: number;
  dead = false;
  selected = false;
  /** 渲染用受击闪烁 */
  hitFlash = 0;
  // P4 诅咒降甲（亡魂巫师等攻击附加）
  armorCurseTimer = 0;
  armorCurseAmt = 0;

  constructor(faction: Faction, hp: number, armor: number) {
    this.faction = faction;
    this.maxHp = hp;
    this.hp = hp;
    this.armor = armor;
  }

  abstract get label(): string;

  distTo(o: Entity | Vec2) {
    const ox = 'x' in o ? o.x : (o as Vec2).x;
    const oy = 'y' in o ? o.y : (o as Vec2).y;
    return Math.hypot(this.x - ox, this.y - oy);
  }
}

// ===== 单位 =====
export interface GatherState {
  nodeId: number;
  phase: 'moving' | 'mining' | 'returning';
  timer: number;
  carrying: number;
}

export class Unit extends Entity {
  def: UnitDef;
  radius: number;
  speed: number;
  dmg: number;
  range: number;
  attackSpeed: number;
  cooldown = 0;
  order: Order = { type: 'idle' };
  /** 持续性指令记忆（attackMove 的目的地 / gather 的节点） */
  resume: Order = { type: 'idle' };
  path: Vec2[] | null = null;
  pathGoal: Vec2 | null = null;
  repathTimer = 0;
  acquireTimer = 0;
  facing = 0;
  /** 攻击动画计时 */
  attackAnim = 0;

  // 工人
  gather: GatherState | null = null;

  // 英雄
  level = 1;
  xp = 0;
  mana = 200;
  maxMana = 200;
  skillCooldowns: number[] = [];
  /** 技能等级（1-3，效果+25%/级） */
  skillLevels: number[] = [];
  respawnTimer = 0;

  // P1 兵种科技
  /** 兵种科技等级（1-3，攻/血+10%/级） */
  techLevel = 1;
  /** 基础最大生命（不含科技/英雄成长） */
  baseMaxHp: number;

  // 野怪
  isCreep = false;
  leashX = 0;
  leashY = 0;
  creepBounty = { gold: 0, crystal: 0, xp: 0 };

  // P0 特性系统状态
  slowTimer = 0;   // 减速剩余时间
  slowAmt = 0;     // 减速比例
  shieldHp = 0;    // 护盾值
  blinkBuff = 0;   // 闪现斩杀标记（下一击 ×mult）
  blinkCd = 0;     // 闪现冷却
  blinkProbe = 0;  // 闪现探测节流
  auraAtk = 0;     // 攻击光环加成（比例）
  auraSpd = 0;     // 攻速光环加成
  auraMove = 0;    // 移速光环加成
  lifespan = 0;    // 召唤单位存续时间（>0 计时消散）
  /** 召唤来源单位 id（0 = 非召唤） */
  summonedBy = 0;

  // P2 魔法球增益
  hasteTimer = 0;  // 加速：移速/攻速 ×HASTE_MULT
  frenzyTimer = 0; // 狂暴：伤害 ×FRENZY_MULT

  // P3 血兽族增益/减益
  rageTimer = 0;           // 狂暴（英雄技能）：攻速加成
  rageAmt = 0;             // 狂暴攻速加成比例
  atkStacksCount = 0;      // 攻速叠层（獠牙人狼）
  atkDebuffTimer = 0;      // 凝视降攻剩余时间
  atkDebuffMult = 1;       // 凝视攻击倍率
  chargeStatic = 0;        // 冲锋：静止计时
  chargePrimed = false;    // 冲锋首击就绪
  charmedTimer = 0;        // 灵魂操控剩余时间
  // ---- P4 亡灵状态 ----
  plagueTimer = 0;         // 瘟疫剩余时间
  plagueDps = 0;           // 瘟疫每秒伤害
  plagueSrcId = 0;         // 瘟疫来源（击杀归属）
  fearTimer = 0;           // 恐惧剩余时间（失控乱窜）
  private fearDir = 0;
  private fearDirTimer = 0;
  exploded = false;        // 自爆已引爆标记（防二次引爆）
  originalFaction: Faction | null = null; // 灵魂操控原阵营
  private lastX = 0; private lastY = 0;   // 冲锋位移检测

  constructor(def: UnitDef, faction: Faction, x: number, y: number) {
    super(faction, def.hp, def.armor);
    this.def = def;
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    this.speed = def.speed;
    this.dmg = def.dmg;
    this.range = def.range;
    this.attackSpeed = def.attackSpeed;
    this.baseMaxHp = def.hp;
    if (def.heroSkills) {
      this.skillCooldowns = def.heroSkills.map(() => 0);
      this.skillLevels = def.heroSkills.map(() => 1);
    }
    if (faction === 2) this.isCreep = true;
    this.lastX = x; this.lastY = y;
  }

  get label() { return this.def.name; }

  get heroSkillDefs(): HeroSkillDef[] { return this.def.heroSkills ?? []; }

  /** 飞行单位 */
  get flying(): boolean { return !!this.def.traits?.flying; }
  /** 可否攻击飞行目标 */
  get canAir(): boolean { return canHitAir(this); }
  /** 有效移速：光环加成 − 减速 × 加速buff × 冲锋 */
  get moveSpeed(): number {
    const slow = this.slowTimer > 0 ? 1 - this.slowAmt : 1;
    const haste = this.hasteTimer > 0 ? HASTE_MULT : 1;
    const ch = this.def.traits?.charge;
    const chargeMult = ch && this.chargeStatic >= ch.delay ? ch.mult : 1;
    return this.speed * (1 + this.auraMove) * slow * haste * chargeMult;
  }

  /** 攻速倍率：光环 × 加速buff × 攻速叠层 × 狂暴 */
  get spdMult(): number {
    const st = this.def.traits?.atkStacks;
    const stacks = st ? 1 + this.atkStacksCount * st.per : 1;
    const rage = this.rageTimer > 0 ? 1 + this.rageAmt : 1;
    return (1 + this.auraSpd) * (this.hasteTimer > 0 ? HASTE_MULT : 1) * stacks * rage;
  }

  /** 英雄成长系数 */
  get heroScale() {
    if (this.def.kind !== 'hero') return 1;
    return 1 + (this.level - 1) * HERO_LEVEL_BONUS;
  }

  /** 兵种科技生命/攻击倍率（+10%/级） */
  get techMult() { return 1 + 0.1 * (this.techLevel - 1); }

  /** 应用兵种科技等级（存量单位属性同步提升） */
  applyTechLevel(lv: number) {
    if (lv <= this.techLevel) return;
    this.techLevel = lv;
    const oldMax = this.maxHp;
    this.maxHp = Math.round(this.baseMaxHp * this.heroScale * this.techMult);
    this.hp += this.maxHp - oldMax;
  }

  /** 按技能等级放大后的技能定义（+25%/级） */
  scaledSkill(idx: number): HeroSkillDef | null {
    const defs = this.heroSkillDefs;
    if (!defs || idx >= defs.length) return null;
    const sk = defs[idx];
    const mult = 1 + 0.25 * ((this.skillLevels[idx] ?? 1) - 1);
    if (mult === 1) return sk;
    return {
      ...sk,
      power: Math.round(sk.power * mult),
      shield: sk.shield !== undefined ? Math.round(sk.shield * mult) : undefined,
    };
  }

  /** 设置移动目的地（带寻路；飞行直线） */
  setDest(game: Game, x: number, y: number, order?: Order) {
    this.pathGoal = { x, y };
    if (this.flying) {
      this.path = [{ x, y }]; // 无视地形直线飞行
    } else {
      this.path = findPath(game.map, { x: this.x, y: this.y }, { x, y });
    }
    if (order) this.order = order;
  }

  followPath(game: Game, dt: number): boolean {
    if (!this.path || this.path.length === 0) return true;
    const wp = this.path[0];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) {
      this.path.shift();
      return this.path.length === 0;
    }
    const step = Math.min(this.moveSpeed * dt, d);
    const nx = this.x + (dx / d) * step;
    const ny = this.y + (dy / d) * step;
    game.moveEntity(this, nx, ny);
    this.facing = Math.atan2(dy, dx);
    return false;
  }

  /** 闪现斩杀：跳到范围内血量最低敌人身后 */
  private tryBlink(game: Game): boolean {
    const bk = this.def.traits?.blinkKill;
    if (!bk || this.blinkCd > 0 || this.blinkProbe > 0) return false;
    this.blinkProbe = 0.25;
    const t = game.queryLowestEnemy(this.x, this.y, bk.radius, this.faction, this.canAir);
    if (!t || !(t instanceof Unit)) return false;
    this.blinkCd = bk.cd;
    this.blinkBuff = 1;
    const ang = Math.atan2(this.y - t.y, this.x - t.x);
    const bx = t.x + Math.cos(ang) * (t.radius + this.radius + 2);
    const by = t.y + Math.sin(ang) * (t.radius + this.radius + 2);
    if (this.flying) {
      this.x = Math.max(TILE, Math.min(game.map.w * TILE - TILE, bx));
      this.y = Math.max(TILE, Math.min(game.map.h * TILE - TILE, by));
    } else {
      const spot = game.map.nearestWalkable(Math.floor(bx / TILE), Math.floor(by / TILE), 6);
      if (spot) { this.x = spot.x * TILE + TILE / 2; this.y = spot.y * TILE + TILE / 2; }
    }
    this.path = null;
    game.onBlinkFx(this.x, this.y);
    return true;
  }

  /** 朝目标移动直到进入射程 */
  chaseAndAttack(game: Game, target: Entity, dt: number, hold = false): void {
    if (!hold && target instanceof Unit && target.faction !== this.faction) {
      this.tryBlink(game);
    }
    const targetRadius = target instanceof Unit ? target.radius : (target as Building).radius;
    const d = this.distTo(target) - targetRadius;
    const effRange = this.range + targetRadius;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (d <= effRange) {
      this.facing = Math.atan2(target.y - this.y, target.x - this.x);
      if (this.cooldown <= 0) {
        this.cooldown = 1 / (this.attackSpeed * this.spdMult);
        this.attackAnim = 0.15;
        // P3 攻速叠层：攻击时叠加
        const st = this.def.traits?.atkStacks;
        if (st && this.atkStacksCount < st.max) this.atkStacksCount++;
        // P3 冲锋首击：伤害×firstHitMult 并消耗
        let hitMult = 1;
        if (this.def.traits?.charge && this.chargePrimed) {
          hitMult = this.def.traits.charge.firstHitMult;
          this.chargePrimed = false;
          this.chargeStatic = 0;
        }
        const dmg = this.effDmg() * hitMult;
        // P4 自爆：近战自爆单位进入射程即引爆，不进行普通攻击
        const se = this.def.traits?.selfExplode;
        if (se) { game.selfExplode(this, se.dmg, se.radius); return; }
        if (this.def.projectile) {
          game.spawnProjectile(this, target, dmg);
        } else {
          game.dealDamage(this, target, dmg);
        }
      }
      if (!hold) { this.path = null; }
    } else if (!hold) {
      // 追击：节流寻路
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || !this.path) {
        this.repathTimer = 0.5;
        this.setDest(game, target.x, target.y);
      }
      this.followPath(game, dt);
    }
  }

  effDmg() {
    const frenzy = this.frenzyTimer > 0 ? FRENZY_MULT : 1;
    const debuff = this.atkDebuffTimer > 0 ? this.atkDebuffMult : 1;
    return this.dmg * this.heroScale * this.techMult * (1 + this.auraAtk) * frenzy * debuff;
  }

  gainXp(amount: number) {
    if (this.def.kind !== 'hero' || this.level >= HERO_XP.length) return;
    this.xp += amount;
    while (this.level < HERO_XP.length && this.xp >= HERO_XP[this.level]) {
      this.level++;
      this.maxHp = Math.round(this.baseMaxHp * this.heroScale * this.techMult);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3);
      this.maxMana += 40;
    }
  }

  update(game: Game, dt: number) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    if (this.def.kind === 'hero') {
      this.mana = Math.min(this.maxMana, this.mana + HERO_MANA_REGEN * dt);
      for (let i = 0; i < this.skillCooldowns.length; i++) {
        this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
      }
    }
    // 特性状态计时
    if (this.slowTimer > 0) {
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      if (this.slowTimer === 0) this.slowAmt = 0;
    }
    if (this.blinkCd > 0) this.blinkCd = Math.max(0, this.blinkCd - dt);
    if (this.blinkProbe > 0) this.blinkProbe = Math.max(0, this.blinkProbe - dt);
    // P2 增益计时
    if (this.hasteTimer > 0) this.hasteTimer = Math.max(0, this.hasteTimer - dt);
    if (this.frenzyTimer > 0) this.frenzyTimer = Math.max(0, this.frenzyTimer - dt);
    // P3 增益/减益计时
    if (this.rageTimer > 0) this.rageTimer = Math.max(0, this.rageTimer - dt);
    if (this.atkDebuffTimer > 0) {
      this.atkDebuffTimer = Math.max(0, this.atkDebuffTimer - dt);
      if (this.atkDebuffTimer === 0) this.atkDebuffMult = 1;
    }
    if (this.charmedTimer > 0) {
      this.charmedTimer -= dt;
      if (this.charmedTimer <= 0 && this.originalFaction !== null) {
        game.restoreCharm(this);
      }
    }
    // P4 诅咒降甲计时
    if (this.armorCurseTimer > 0) {
      this.armorCurseTimer = Math.max(0, this.armorCurseTimer - dt);
      if (this.armorCurseTimer === 0) this.armorCurseAmt = 0;
    }
    // P4 瘟疫：每秒掉血，击杀归属瘟疫来源
    if (this.plagueTimer > 0) {
      this.plagueTimer = Math.max(0, this.plagueTimer - dt);
      this.hp -= this.plagueDps * dt;
      this.hitFlash = Math.max(this.hitFlash, 0.06);
      if (this.hp <= 0) {
        this.hp = 0;
        const src = game.byId(this.plagueSrcId) ?? null;
        game.killEntity(this, src && !src.dead ? src : null);
        return;
      }
    }
    // P4 恐惧：失控乱窜，不执行正常指令
    if (this.fearTimer > 0) {
      this.fearTimer = Math.max(0, this.fearTimer - dt);
      this.fearDirTimer -= dt;
      if (this.fearDirTimer <= 0) {
        this.fearDir = rand() * Math.PI * 2;
        this.fearDirTimer = 0.25;
      }
      const fs = this.moveSpeed * 0.7 * dt;
      game.moveEntity(this, this.x + Math.cos(this.fearDir) * fs, this.y + Math.sin(this.fearDir) * fs);
      return;
    }
    // P3 冲锋：静止计时（位移超阈值重置，静止累加；就绪后首击消耗）
    const moved = Math.abs(this.x - this.lastX) + Math.abs(this.y - this.lastY);
    if (moved > 0.6) this.chargeStatic = 0;
    else if (this.def.traits?.charge) this.chargeStatic += dt;
    this.lastX = this.x; this.lastY = this.y;
    const chg = this.def.traits?.charge;
    if (chg && this.chargeStatic >= chg.delay) this.chargePrimed = true;
    const tr = this.def.traits;
    if (tr?.regen && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + tr.regen * dt);
    if (this.lifespan > 0) {
      this.lifespan -= dt;
      if (this.lifespan <= 0) { game.killEntity(this, null); return; }
    }

    switch (this.order.type) {
      case 'idle': this.updateIdle(game, dt); break;
      case 'move': this.updateMove(game, dt); break;
      case 'attackMove': this.updateAttackMove(game, dt); break;
      case 'attack': this.updateAttack(game, dt); break;
      case 'gather': this.updateGather(game, dt); break;
      case 'build': this.updateBuild(game, dt); break;
      case 'hold': this.updateHold(game, dt); break;
    }
  }

  private acquireTarget(game: Game): Entity | null {
    return game.queryNearestEnemy(this.x, this.y, UNIT_AGGRO, this.faction, this.canAir);
  }

  private updateIdle(game: Game, dt: number) {
    // 野怪：脱离 leash 范围则回营地
    if (this.isCreep) {
      const dl = Math.hypot(this.x - this.leashX, this.y - this.leashY);
      if (dl > 420) {
        this.order = { type: 'move', target: { x: this.leashX, y: this.leashY } };
        this.resume = { type: 'idle' };
        return;
      }
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 8 * dt);
    }
    this.acquireTimer -= dt;
    if (this.acquireTimer <= 0) {
      this.acquireTimer = 0.3 + rand() * 0.2;
      if (this.def.kind !== 'worker') {
        const t = this.acquireTarget(game);
        if (t) this.resume = { type: 'attack', targetId: t.id };
      }
    }
    if (this.resume.type === 'attack') {
      const t = game.byId(this.resume.targetId);
      if (t && !t.dead) { this.chaseAndAttack(game, t, dt); return; }
      this.resume = { type: 'idle' };
    }
  }

  private updateMove(game: Game, dt: number) {
    const o = this.order as { type: 'move'; target: Vec2 };
    if (!this.pathGoal || Math.hypot(this.pathGoal.x - o.target.x, this.pathGoal.y - o.target.y) > 24) {
      this.setDest(game, o.target.x, o.target.y);
    }
    if (this.followPath(game, dt)) this.order = { type: 'idle' };
  }

  private updateAttackMove(game: Game, dt: number) {
    const o = this.order as { type: 'attackMove'; target: Vec2 };
    const t = this.acquireTarget(game);
    if (t) { this.chaseAndAttack(game, t, dt); return; }
    if (!this.pathGoal || Math.hypot(this.pathGoal.x - o.target.x, this.pathGoal.y - o.target.y) > 24) {
      this.setDest(game, o.target.x, o.target.y);
    }
    if (this.followPath(game, dt)) this.order = { type: 'idle' };
  }

  private updateAttack(game: Game, dt: number) {
    const o = this.order as { type: 'attack'; targetId: number };
    const t = game.byId(o.targetId);
    if (!t || t.dead) {
      // 目标死亡：若原来是 attackMove/gather 则恢复
      this.order = this.resume;
      this.resume = { type: 'idle' };
      if (this.order.type === 'idle') this.order = { type: 'idle' };
      return;
    }
    // P2：据点无敌（只能占领），放弃攻击避免卡死
    if (t instanceof Building && t.def.kind === 'stronghold') {
      this.order = { type: 'idle' };
      this.resume = { type: 'idle' };
      return;
    }
    this.chaseAndAttack(game, t, dt);
  }

  private updateHold(game: Game, dt: number) {
    const t = this.acquireTarget(game);
    if (t) this.chaseAndAttack(game, t, dt, true);
  }

  private updateGather(game: Game, dt: number) {
    const o = this.order as { type: 'gather'; nodeId: number };
    if (!this.gather || this.gather.nodeId !== o.nodeId) {
      this.gather = { nodeId: o.nodeId, phase: 'moving', timer: 0, carrying: this.gather?.carrying ?? 0 };
      this.path = null;
    }
    const g = this.gather;
    if (g.phase === 'moving') {
      let node = game.resourceNodes.get(o.nodeId);
      if (!node || node.amount <= 0) {
        const alt = game.findNearestNode(this.x, this.y);
        if (!alt) { this.order = { type: 'idle' }; return; }
        this.order = { type: 'gather', nodeId: alt.id };
        return;
      }
      // 走到矿边（2x2 矿心到相邻可站格最近 48px，判定要大于它）
      const d = Math.hypot(this.x - node.x, this.y - node.y);
      const arriveDist = TILE * 2.2;
      if (d <= arriveDist && node.workers.length < node.slots) {
        if (!node.workers.includes(this.id)) node.workers.push(this.id);
        g.phase = 'mining';
        g.timer = GATHER.mineTime;
        this.path = null;
      } else if (d <= arriveDist && node.workers.length >= node.slots) {
        // 排队等待，稍微后退
        if (this.path) this.followPath(game, dt);
      } else {
        this.repathTimer -= dt;
        if (!this.path || this.repathTimer <= 0) {
          this.repathTimer = 0.6;
          const spot = game.map.nearestWalkable(
            Math.floor(node.x / TILE), Math.floor(node.y / TILE), 8);
          if (spot) this.setDest(game, spot.x * TILE + TILE / 2, spot.y * TILE + TILE / 2);
        }
        this.followPath(game, dt);
      }
      return;
    }
    if (g.phase === 'mining') {
      const node = game.resourceNodes.get(o.nodeId);
      if (!node || node.amount <= 0) {
        if (node) node.workers = node.workers.filter(id => id !== this.id);
        g.phase = 'moving'; this.path = null;
        return;
      }
      g.timer -= dt;
      this.facing = Math.atan2(node.y - this.y, node.x - this.x);
      if (g.timer <= 0) {
        const take = Math.min(GATHER.carry, node.amount);
        node.amount -= take;
        g.carrying = take;
        if (node.amount <= 0) node.depleted = true;
        node.workers = node.workers.filter(id => id !== this.id);
        g.phase = 'returning';
        this.path = null;
      }
      return;
    }
    if (g.phase === 'returning') {
      const hall = game.findNearestDropoff(this.x, this.y, this.faction);
      if (!hall) { this.order = { type: 'idle' }; return; }
      const d = this.distTo(hall);
      const arriveDist = TILE * 2.2;
      if (d <= arriveDist) {
        game.deposit(this.faction, g.carrying);
        g.carrying = 0;
        // 回矿：矿没了找最近的
        const node = game.resourceNodes.get(g.nodeId);
        if (!node || node.amount <= 0) {
          const alt = game.findNearestNode(hall.x, hall.y);
          if (!alt) { this.order = { type: 'idle' }; return; }
          g.nodeId = alt.id;
        }
        g.phase = 'moving';
        this.path = null;
      } else {
        this.repathTimer -= dt;
        if (!this.path || this.repathTimer <= 0) {
          this.repathTimer = 0.8;
          this.setDest(game, hall.x, hall.y);
        }
        this.followPath(game, dt);
      }
    }
  }

  private updateBuild(game: Game, dt: number) {
    const o = this.order as { type: 'build'; buildingId: number };
    const b = game.byId(o.buildingId) as Building | undefined;
    if (!b || b.dead || b.built) {
      this.order = { type: 'idle' };
      // 完工后自动回去采集
      const node = game.findNearestNode(this.x, this.y);
      if (node && this.def.kind === 'worker') this.order = { type: 'gather', nodeId: node.id };
      return;
    }
    const d = this.distTo(b);
    const arriveDist = TILE * 2.4;
    if (d > arriveDist) {
      this.repathTimer -= dt;
      if (!this.path || this.repathTimer <= 0) {
        this.repathTimer = 0.6;
        this.setDest(game, b.x, b.y);
      }
      this.followPath(game, dt);
    } else {
      this.facing = Math.atan2(b.y - this.y, b.x - this.x);
      b.buildProgress = Math.min(1, b.buildProgress + dt / b.def.buildTime);
      b.hp = Math.max(b.hp, b.maxHp * (0.1 + 0.9 * b.buildProgress));
      if (b.buildProgress >= 1) {
        b.built = true;
        game.onBuildingCompleted(b);
        this.order = { type: 'idle' };
        const node = game.findNearestNode(this.x, this.y);
        if (node && this.def.kind === 'worker') this.order = { type: 'gather', nodeId: node.id };
      }
    }
  }

  castSkill(game: Game, idx: number): boolean {
    const sk = this.scaledSkill(idx);
    if (!sk) return false;
    if (sk.targeted) return false; // 点地技能必须走 castSkillAt
    if (this.skillCooldowns[idx] > 0 || this.mana < sk.manaCost) return false;
    this.mana -= sk.manaCost;
    this.skillCooldowns[idx] = sk.cooldown;
    game.castAreaSkill(this, this.x, this.y, sk);
    return true;
  }

  /** 点地施放（targeted 技能） */
  castSkillAt(game: Game, idx: number, x: number, y: number): boolean {
    const sk = this.scaledSkill(idx);
    if (!sk) return false;
    if (this.skillCooldowns[idx] > 0 || this.mana < sk.manaCost) return false;
    this.mana -= sk.manaCost;
    this.skillCooldowns[idx] = sk.cooldown;
    this.facing = Math.atan2(y - this.y, x - this.x);
    if (sk.summon) { game.spawnSummons(this, x, y, sk); return true; }
    if (sk.shape === 'line') { game.castLineSkill(this, x, y, sk); return true; }
    game.castAreaSkill(this, x, y, sk, sk.delay ?? 0);
    return true;
  }
}

// ===== 建筑 =====
export interface ProductionItem {
  unitId: string;
  timer: number;
  total: number;
}

export class Building extends Entity {
  def: BuildingDef;
  tx: number; ty: number;
  w: number; h: number;
  built = false;
  buildProgress = 0;
  queue: ProductionItem[] = [];
  techUpgrade: { to: 2 | 3; timer: number; total: number } | null = null;
  /** P1 兵种科技研究（与生产队列并行） */
  research: { unitId: string; timer: number; total: number } | null = null;
  rally: Vec2 | null = null;
  attackCooldown = 0;
  attackAnim = 0;
  /** 迷雾记忆：各玩家阵营是否见过 */
  seenBy: boolean[] = [false, false];

  constructor(def: BuildingDef, faction: Faction, tx: number, ty: number, instant = false) {
    super(faction, def.hp, def.armor);
    this.def = def;
    this.tx = tx; this.ty = ty;
    this.w = def.w; this.h = def.h;
    this.x = (tx + def.w / 2) * TILE;
    this.y = (ty + def.h / 2) * TILE;
    if (instant) {
      this.built = true;
      this.buildProgress = 1;
    } else {
      this.hp = Math.max(1, def.hp * 0.1);
      this.maxHp = def.hp;
    }
  }

  get label() { return this.def.name; }
  get radius() { return Math.max(this.w, this.h) * TILE * 0.5; }

  get tiles() {
    const list: Array<[number, number]> = [];
    for (let y = this.ty; y < this.ty + this.h; y++)
      for (let x = this.tx; x < this.tx + this.w; x++)
        list.push([x, y]);
    return list;
  }

  update(game: Game, dt: number) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    if (!this.built) return;

    // 原石产出
    if (this.def.crystalRate > 0) game.addCrystal(this.faction, this.def.crystalRate * dt);
    // P2 据点产金（占领后）
    if (this.def.income && this.faction !== 2) game.deposit(this.faction, this.def.income * dt);

    // 科技升级
    if (this.techUpgrade) {
      this.techUpgrade.timer -= dt;
      if (this.techUpgrade.timer <= 0) {
        game.setTech(this.faction, this.techUpgrade.to);
        this.techUpgrade = null;
      }
      return; // 升级期间不能训练
    }

    // 生产队列
    if (this.queue.length > 0) {
      const item = this.queue[0];
      item.timer -= dt;
      if (item.timer <= 0) {
        this.queue.shift();
        game.spawnFromBuilding(this, item.unitId);
      }
    }

    // 兵种科技研究（与队列并行）
    if (this.research) {
      this.research.timer -= dt;
      if (this.research.timer <= 0) {
        const uid = this.research.unitId;
        this.research = null;
        game.completeUnitTech(this.faction, uid);
      }
    }

    // 防御塔攻击
    if (this.def.dmg && this.def.range) {
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      const t = game.queryNearestEnemy(this.x, this.y, this.def.range, this.faction);
      if (t && this.attackCooldown <= 0) {
        this.attackCooldown = 1 / (this.def.attackSpeed ?? 1);
        this.attackAnim = 0.15;
        if (this.def.projectile) game.spawnProjectile(this, t, this.def.dmg);
        else game.dealDamage(this, t, this.def.dmg);
      }
    }
  }
}

// ===== 资源节点 =====
export interface ResourceNode {
  id: number;
  type: 'gold';
  tx: number; ty: number;
  w: number; h: number;
  x: number; y: number;
  amount: number;
  maxAmount: number;
  slots: number;
  workers: number[];
  depleted: boolean;
  /** P2 占领态：-1 中立 / 2 野怪占据 / 其余为占领阵营（占领后产金叠加层） */
  owner: number;
  /** P2 是否带野怪守军（中场矿） */
  guarded: boolean;
  /** P2 占领后每秒产金 */
  income: number;
}

let nextNodeId = 1;
export function makeResourceNode(tx: number, ty: number, amount: number, slots: number): ResourceNode {
  return {
    id: nextNodeId++,
    type: 'gold',
    tx, ty, w: 2, h: 2,
    x: (tx + 1) * TILE, y: (ty + 1) * TILE,
    amount, maxAmount: amount, slots,
    workers: [],
    depleted: false,
    owner: -1,
    guarded: false,
    income: 0,
  };
}
export function resetNodeIds() { nextNodeId = 1; }
export function peekNodeId() { return nextNodeId; }
export function setNodeIdSeq(n: number) { nextNodeId = n; }

// ===== P2 魔法球 =====
export type OrbType = 'haste' | 'frenzy' | 'goldrain';

export interface MagicOrb {
  id: number;
  type: OrbType;
  x: number; y: number;
  life: number;
  /** 浮动动画相位 */
  phase: number;
}

let nextOrbId = 1;
export function makeOrb(type: OrbType, x: number, y: number): MagicOrb {
  return { id: nextOrbId++, type, x, y, life: ORB_LIFE, phase: rand() * Math.PI * 2 };
}
export function resetOrbIds() { nextOrbId = 1; }
export function peekOrbId() { return nextOrbId; }
export function setOrbIdSeq(n: number) { nextOrbId = n; }
