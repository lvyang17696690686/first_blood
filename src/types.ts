// ===== 基础类型定义 =====

/** 阵营：0=玩家 1=敌人 2=野怪(中立)；P5 团战：3/5=玩家方队友 4/6=敌方队友 */
export type Faction = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type UnitKind = 'worker' | 'melee' | 'ranged' | 'siege' | 'hero';
export type BuildingKind =
  | 'main' | 'house' | 'barracks' | 'extractor' | 'arcane' | 'tower' | 'stronghold';

export interface Vec2 {
  x: number;
  y: number;
}

export type Order =
  | { type: 'idle' }
  | { type: 'move'; target: Vec2 }
  | { type: 'attackMove'; target: Vec2 }
  | { type: 'attack'; targetId: number }
  | { type: 'gather'; nodeId: number }
  | { type: 'build'; buildingId: number }
  | { type: 'hold' };

import type { Traits } from './traits';

/** 种族（P3/P4）：elf 精灵 / blood 血兽 / undead 亡灵 */
export type Race = 'elf' | 'blood' | 'undead';

/** 出战卡组（P1）：6 兵团卡 + 3 英雄卡 */
export interface Deck {
  units: string[];
  heroes: string[];
}

export interface UnitDef {
  id: string;
  name: string;
  kind: UnitKind;
  /** 需要的科技等级 1-3 */
  tier: 1 | 2 | 3;
  costGold: number;
  costCrystal: number;
  buildTime: number; // 秒
  hp: number;
  armor: number;
  dmg: number;
  range: number; // 世界像素（tile=32）
  attackSpeed: number; // 每秒攻击次数
  speed: number; // 每秒移动像素
  radius: number;
  /** 攻击是否为远程弹道 */
  projectile: boolean;
  /** 野怪经验 */
  bounty: number;
  color: number;
  desc: string;
  /** 单位特性（P0 特性系统） */
  traits?: Traits;
  /** 所属种族（P3）：缺省 elf */
  race?: Race;
  /** 骨架单位（P4）：受骷髅系光环加成 */
  skeleton?: boolean;
  // 英雄专用
  heroSkills?: HeroSkillDef[];
}

export interface HeroSkillDef {
  id: string;
  name: string;
  hotkey: string;
  cooldown: number;
  manaCost: number;
  radius: number;
  /** 伤害(敌方)/治疗(友方) 数值 */
  power: number;
  targetAllies: boolean;
  desc: string;
  /** 需要玩家点击地面指定目标点（否则自中心施放） */
  targeted?: boolean;
  /** 作用形状：circle（默认）/ line（朝目标点的长条） */
  shape?: 'circle' | 'line';
  /** 落弹延迟秒数（炮击类） */
  delay?: number;
  /** 召唤临时单位 */
  summon?: { unitId: string; count: number; lifetime: number };
  /** 给友军附加护盾值 */
  shield?: number;
  // ---- P3 新技能效果 ----
  /** 自我增益（狂暴类）：攻速加成，持续 dur 秒 */
  selfBuff?: { atkSpeed: number; dur: number };
  /** 多段落雷/打击：共 strikes 次，间隔 interval 秒 */
  strikes?: { count: number; interval: number };
  /** 地面持续伤害区域 */
  dotZone?: { dps: number; dur: number };
  /** 灵魂操控：夺取范围内一个敌方单位（单目标，对被夺者计时归还） */
  charm?: { dur: number };
  /** 降敌攻击：范围内敌人攻击 ×mult，持续 dur 秒 */
  atkDebuff?: { mult: number; dur: number };
  // ---- P4 亡灵新技能效果 ----
  /** 亡者复苏：消耗附近尸体召唤骷髅 */
  revive?: { count: number };
  /** 生命虹吸：对最近敌人造成伤害并等量治疗自身 */
  drain?: { dmg: number };
  /** 俯冲突进：向目标点位移并造成小范围伤害 */
  dash?: { dist: number };
  /** 恐惧：范围内敌人短暂失控乱窜 */
  fear?: { dur: number };
  /** 沙暴：地面减速+持续伤害区域（dotZone 的减速扩展） */
  sandstorm?: { dps: number; dur: number; slow: number };
  /** 自爆大招：牺牲自身造成巨额 AoE，随后进入英雄复活计时 */
  selfDestruct?: { dmg: number };
}

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  costGold: number;
  costCrystal: number;
  buildTime: number; // 建造时长(秒)
  hp: number;
  armor: number;
  w: number; // 占格宽
  h: number;
  /** 需要科技等级 */
  tier: 1 | 2 | 3;
  color: number;
  /** 提供人口 */
  supply: number;
  /** 每秒产原石 */
  crystalRate: number;
  /** 可训练单位 */
  trains: string[];
  /** 攻击(塔) */
  dmg?: number;
  range?: number;
  attackSpeed?: number;
  projectile?: boolean;
  /** P2 占领后每秒产金（据点） */
  income?: number;
  /** 所属种族（P3）：缺省 elf */
  race?: Race;
  desc: string;
}

export interface ResourceNodeDef {
  type: 'gold' | 'crystal';
  amount: number;
  /** 同时采集人数上限 */
  slots: number;
}
