import type { BuildingDef, UnitDef } from './types';

// ===== 全局常量 =====
export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const POP_CAP = 60;
export const START_GOLD = 700;
export const START_CRYSTAL = 150;

export const FACTION_COLORS = ['#4dd06a', '#e05a5a', '#d0a84d'];
export const FACTION_NAMES = ['玩家', '敌方', '野怪'];

/** 固定模拟步长 */
export const STEP_DT = 1 / 30;

// ===== 单位数据（精灵族）=====
export const UNITS: Record<string, UnitDef> = {
  worker: {
    id: 'worker', name: '精灵工匠', kind: 'worker', tier: 1,
    costGold: 50, costCrystal: 0, buildTime: 6,
    hp: 120, armor: 0, dmg: 5, range: 26, attackSpeed: 1, speed: 95,
    radius: 8, projectile: false, bounty: 15, color: 0x8fd9a8,
    desc: '采集金币、建造建筑的后勤单位。',
  },
  swordsman: {
    id: 'swordsman', name: '圣殿武士', kind: 'melee', tier: 1,
    costGold: 50, costCrystal: 0, buildTime: 8,
    hp: 260, armor: 2, dmg: 14, range: 28, attackSpeed: 1, speed: 85,
    radius: 10, projectile: false, bounty: 30, color: 0x7fb2ff,
    desc: '坚实的近战前排，1本主力。',
  },
  archer: {
    id: 'archer', name: '木精灵', kind: 'ranged', tier: 1,
    costGold: 60, costCrystal: 10, buildTime: 9,
    hp: 150, armor: 0, dmg: 13, range: 150, attackSpeed: 1.1, speed: 90,
    radius: 9, projectile: true, bounty: 30, color: 0xa8e063,
    desc: '远程射手，脆皮但输出稳定。',
  },
  druid: {
    id: 'druid', name: '德鲁伊', kind: 'melee', tier: 2,
    costGold: 90, costCrystal: 20, buildTime: 12,
    hp: 380, armor: 3, dmg: 22, range: 30, attackSpeed: 1, speed: 95,
    radius: 11, projectile: false, bounty: 45, color: 0x6bbf59,
    desc: '2本近战，越战越勇的猛兽形态。',
  },
  panther: {
    id: 'panther', name: '豹女哨兵', kind: 'ranged', tier: 2,
    costGold: 90, costCrystal: 30, buildTime: 12,
    hp: 200, armor: 1, dmg: 18, range: 170, attackSpeed: 1.35, speed: 105,
    radius: 9, projectile: true, bounty: 45, color: 0xe8c15a,
    desc: '2本高速射手，机动游击。',
  },
  chariot: {
    id: 'chariot', name: '重刃战车', kind: 'siege', tier: 2,
    costGold: 140, costCrystal: 60, buildTime: 16,
    hp: 420, armor: 2, dmg: 30, range: 180, attackSpeed: 0.6, speed: 70,
    radius: 12, projectile: true, bounty: 60, color: 0xb0885a,
    desc: '攻城器械，对建筑造成双倍伤害，附带溅射。',
    traits: { siege: 2, splash: 60 },
    },
  golem: {
    id: 'golem', name: '巨石罗氪', kind: 'melee', tier: 3,
    costGold: 180, costCrystal: 80, buildTime: 20,
    hp: 900, armor: 6, dmg: 40, range: 34, attackSpeed: 0.7, speed: 60,
    radius: 13, projectile: false, bounty: 80, color: 0x9aa5b5,
    desc: '3本重坦，死亡时分裂成3个小罗氪继续围殴对手。',
    traits: { deathSplit: { unitId: 'golet', count: 3 } },
  },
  golet: {
    id: 'golet', name: '小罗氪', kind: 'melee', tier: 3,
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 200, armor: 2, dmg: 12, range: 28, attackSpeed: 1, speed: 75,
    radius: 8, projectile: false, bounty: 15, color: 0xb5bfce,
    desc: '巨石罗氪分裂出的碎石碎片。',
  },
  thunderer: {
    id: 'thunderer', name: '夜空雷卫', kind: 'ranged', tier: 3,
    costGold: 200, costCrystal: 100, buildTime: 22,
    hp: 300, armor: 1, dmg: 34, range: 200, attackSpeed: 0.9, speed: 80,
    radius: 11, projectile: true, bounty: 80, color: 0x9f7fff,
    desc: '3本重型法师，雷电之力附带溅射。',
    traits: { splash: 50 },
  },
  // ---- P0 精灵补卡 ----
  treant: {
    id: 'treant', name: '大树人', kind: 'melee', tier: 2,
    costGold: 110, costCrystal: 30, buildTime: 14,
    hp: 650, armor: 3, dmg: 10, range: 30, attackSpeed: 0.6, speed: 60,
    radius: 12, projectile: false, bounty: 50, color: 0x4e7a3e,
    desc: '治疗型辅助：每秒治疗附近友军10点，高血量低输出的前排。',
    traits: { healAura: { radius: 120, rate: 10 } },
  },
  fawn: {
    id: 'fawn', name: '丛林小鹿', kind: 'ranged', tier: 2,
    costGold: 85, costCrystal: 35, buildTime: 12,
    hp: 170, armor: 0, dmg: 14, range: 160, attackSpeed: 1.2, speed: 100,
    radius: 9, projectile: true, bounty: 45, color: 0xd9a066,
    desc: '长矛投射命中使敌人减速30%持续2秒，擅长风筝与留人。',
    traits: { slow: { amount: 0.3, dur: 2 } },
  },
  firedrake: {
    id: 'firedrake', name: '烈焰飞龙', kind: 'ranged', tier: 2,
    costGold: 120, costCrystal: 60, buildTime: 15,
    hp: 240, armor: 1, dmg: 20, range: 130, attackSpeed: 0.8, speed: 115,
    radius: 11, projectile: true, bounty: 55, color: 0xe0703a,
    desc: '飞行单位，无视地形直线飞行，喷火溅射。仅远程/对空单位可攻击。',
    traits: { flying: true, splash: 55 },
  },
  teacher: {
    id: 'teacher', name: '精灵老师', kind: 'ranged', tier: 3,
    costGold: 160, costCrystal: 80, buildTime: 18,
    hp: 260, armor: 1, dmg: 16, range: 150, attackSpeed: 1, speed: 85,
    radius: 10, projectile: true, bounty: 65, color: 0x88ccff,
    desc: '攻击光环：附近友军攻击力+15%，越学越强。',
    traits: { aura: { radius: 130, atk: 0.15, label: '友军攻击+15%' } },
  },
  assassin: {
    id: 'assassin', name: '月光刺客', kind: 'melee', tier: 3,
    costGold: 170, costCrystal: 85, buildTime: 18,
    hp: 220, armor: 1, dmg: 26, range: 28, attackSpeed: 1.3, speed: 125,
    radius: 9, projectile: false, bounty: 65, color: 0xc0c8e8,
    desc: '定期闪现到范围内血量最低的敌人身后，下一击造成3倍伤害。',
    traits: { blinkKill: { radius: 250, mult: 3, cd: 6 } },
  },
  treantspirit: {
    id: 'treantspirit', name: '树人', kind: 'melee', tier: 1,
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 300, armor: 1, dmg: 15, range: 28, attackSpeed: 0.8, speed: 70,
    radius: 10, projectile: false, bounty: 10, color: 0x5d8a4a,
    desc: '森林长老召唤的临时树人，60秒后消散。',
  },
  hero: {
    id: 'hero', name: '疾风王子·利夫', kind: 'hero', tier: 2,
    costGold: 200, costCrystal: 100, buildTime: 25,
    hp: 600, armor: 4, dmg: 28, range: 34, attackSpeed: 1.1, speed: 115,
    radius: 11, projectile: false, bounty: 150, color: 0xffd97a,
    desc: '精灵王继承人，领军出战越战越勇。拥有两个主动技能。',
    heroSkills: [
      {
        id: 'shockwave', name: '冲击波', hotkey: 'Q',
        cooldown: 8, manaCost: 40, radius: 95, power: 60, targetAllies: false,
        desc: '对周围敌人造成60点伤害。',
      },
      {
        id: 'healwave', name: '森林祝福', hotkey: 'W',
        cooldown: 12, manaCost: 50, radius: 110, power: 80, targetAllies: true,
        desc: '治疗周围友军80点生命。',
      },
    ],
  },
  // ---- P0 补英雄（英雄商店最多3名） ----
  princess: {
    id: 'princess', name: '顽皮公主·爱尔', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 560, armor: 3, dmg: 24, range: 150, attackSpeed: 1, speed: 100,
    radius: 10, projectile: true, bounty: 150, color: 0xffb0d8,
    desc: '远程炮击英雄，被动：攻击对建筑造成1.5倍伤害。',
    traits: { siege: 1.5 },
    heroSkills: [
      {
        id: 'bombard', name: '炮击', hotkey: 'Q',
        cooldown: 10, manaCost: 45, radius: 85, power: 70, targetAllies: false,
        targeted: true, delay: 1,
        desc: '呼叫炮击：1秒后在指定地点落下炸弹，范围70伤害。',
      },
      {
        id: 'starward', name: '星光庇护', hotkey: 'W',
        cooldown: 14, manaCost: 50, radius: 110, power: 0, targetAllies: true,
        shield: 120,
        desc: '给周围友军附加120点护盾。',
      },
    ],
  },
  greendragon: {
    id: 'greendragon', name: '烈焰绿龙·基蒙', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 620, armor: 3, dmg: 30, range: 120, attackSpeed: 0.8, speed: 105,
    radius: 12, projectile: true, bounty: 150, color: 0x63c96b,
    desc: '飞行英雄，喷火附带溅射，无视地形直线飞行。',
    traits: { flying: true, splash: 40 },
    heroSkills: [
      {
        id: 'firebreath', name: '烈焰吐息', hotkey: 'Q',
        cooldown: 9, manaCost: 45, radius: 110, power: 55, targetAllies: false,
        targeted: true, shape: 'line',
        desc: '朝指定方向喷出长条火焰，55点伤害。',
      },
      {
        id: 'firerain', name: '天降火雨', hotkey: 'W',
        cooldown: 14, manaCost: 55, radius: 90, power: 60, targetAllies: false,
        targeted: true,
        desc: '指定地点降下火雨，范围60伤害。',
      },
    ],
  },
  elder: {
    id: 'elder', name: '森林长老·福瑞斯', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 640, armor: 4, dmg: 22, range: 160, attackSpeed: 0.9, speed: 85,
    radius: 11, projectile: true, bounty: 150, color: 0x7ad9a0,
    desc: '辅助英雄：群体治疗与召唤树人。',
    heroSkills: [
      {
        id: 'liferain', name: '生命之雨', hotkey: 'Q',
        cooldown: 10, manaCost: 50, radius: 130, power: 90, targetAllies: true,
        desc: '治疗周围友军90点生命。',
      },
      {
        id: 'naturerage', name: '自然之怒', hotkey: 'W',
        cooldown: 25, manaCost: 70, radius: 60, power: 0, targetAllies: false,
        targeted: true,
        summon: { unitId: 'treantspirit', count: 2, lifetime: 60 },
        desc: '在指定地点召唤2名树人（60秒）。',
      },
    ],
  },

  // ===== P3 血兽族（策划文档 §4.2） =====
  bworker: {
    id: 'bworker', name: '苦工', kind: 'worker', tier: 1,
    costGold: 50, costCrystal: 0, buildTime: 6,
    hp: 140, armor: 0, dmg: 5, range: 26, attackSpeed: 1, speed: 90,
    radius: 8, projectile: false, bounty: 15, color: 0xc98f6a,
    race: 'blood',
    desc: '血兽族后勤单位，采集金币、建造建筑。',
  },
  bfighter: {
    id: 'bfighter', name: '血兽兵', kind: 'melee', tier: 1,
    costGold: 55, costCrystal: 0, buildTime: 8,
    hp: 320, armor: 1, dmg: 13, range: 28, attackSpeed: 1, speed: 85,
    radius: 10, projectile: false, bounty: 30, color: 0xb0604a,
    race: 'blood',
    desc: '皮糙肉厚的1本近战前排。',
  },
  spearfrog: {
    id: 'spearfrog', name: '矛毒蛙', kind: 'ranged', tier: 1,
    costGold: 60, costCrystal: 10, buildTime: 9,
    hp: 140, armor: 0, dmg: 12, range: 145, attackSpeed: 1.2, speed: 95,
    radius: 9, projectile: true, bounty: 30, color: 0x9fb04a,
    race: 'blood',
    desc: '远程毒矛射手，对空倍率1.25。',
    traits: { antiAir: 1.25 },
  },
  shieldbull: {
    id: 'shieldbull', name: '巨盾黑牛', kind: 'melee', tier: 2,
    costGold: 100, costCrystal: 20, buildTime: 13,
    hp: 500, armor: 4, dmg: 16, range: 28, attackSpeed: 0.8, speed: 75,
    radius: 12, projectile: false, bounty: 45, color: 0x5a4a44,
    race: 'blood',
    desc: '反伤 6：受击反弹固定伤害，越打越亏的前排铁壁。',
    traits: { thorns: 6 },
  },
  witchdoc: {
    id: 'witchdoc', name: '巫医', kind: 'ranged', tier: 2,
    costGold: 90, costCrystal: 40, buildTime: 13,
    hp: 220, armor: 0, dmg: 10, range: 160, attackSpeed: 1, speed: 90,
    radius: 9, projectile: true, bounty: 45, color: 0x6aa08a,
    race: 'blood',
    desc: '自动施放群体治疗：每秒治疗附近友军12点。',
    traits: { healAura: { radius: 120, rate: 12 } },
  },
  fangwolf: {
    id: 'fangwolf', name: '獠牙人狼', kind: 'melee', tier: 2,
    costGold: 85, costCrystal: 15, buildTime: 12,
    hp: 300, armor: 1, dmg: 16, range: 28, attackSpeed: 1, speed: 110,
    radius: 10, projectile: false, bounty: 45, color: 0x8a7440,
    race: 'blood',
    desc: '攻速成长：每次攻击+6%攻速，最多叠5层，缠斗越久越快。',
    traits: { atkStacks: { per: 0.06, max: 5 } },
  },
  axethrower: {
    id: 'axethrower', name: '掷斧手', kind: 'ranged', tier: 2,
    costGold: 80, costCrystal: 25, buildTime: 12,
    hp: 210, armor: 0, dmg: 15, range: 155, attackSpeed: 0.9, speed: 90,
    radius: 9, projectile: true, bounty: 45, color: 0xc08040,
    race: 'blood',
    desc: '25% 概率暴击造成 2 倍伤害。',
    traits: { crit: { chance: 0.25, mult: 2 } },
  },
  crushercart: {
    id: 'crushercart', name: '粉碎战车', kind: 'siege', tier: 2,
    costGold: 140, costCrystal: 60, buildTime: 16,
    hp: 440, armor: 2, dmg: 28, range: 175, attackSpeed: 0.55, speed: 65,
    radius: 12, projectile: true, bounty: 60, color: 0x7a5a3a,
    race: 'blood',
    desc: '攻城器械：对建筑×2伤害，附带溅射。',
    traits: { siege: 2, splash: 60 },
  },
  firewitch: {
    id: 'firewitch', name: '玩火女巫', kind: 'ranged', tier: 2,
    costGold: 110, costCrystal: 50, buildTime: 14,
    hp: 200, armor: 0, dmg: 26, range: 165, attackSpeed: 0.7, speed: 85,
    radius: 9, projectile: true, bounty: 55, color: 0xe06030,
    race: 'blood',
    desc: '高伤火球，命中溅射 55 范围。',
    traits: { splash: 55 },
  },
  dragoon: {
    id: 'dragoon', name: '飞龙骑士', kind: 'ranged', tier: 2,
    costGold: 130, costCrystal: 60, buildTime: 15,
    hp: 260, armor: 1, dmg: 24, range: 120, attackSpeed: 0.6, speed: 120,
    radius: 11, projectile: true, bounty: 55, color: 0xa04a5a,
    race: 'blood',
    desc: '飞行单位：50% 暴击造成 3 倍伤害，高风险高爆发。',
    traits: { flying: true, crit: { chance: 0.5, mult: 3 } },
  },
  shaman: {
    id: 'shaman', name: '萨满', kind: 'ranged', tier: 3,
    costGold: 170, costCrystal: 90, buildTime: 20,
    hp: 280, armor: 1, dmg: 20, range: 170, attackSpeed: 0.9, speed: 85,
    radius: 10, projectile: true, bounty: 65, color: 0x50b0a0,
    race: 'blood',
    desc: '增益光环：附近友军攻速+20%、移速+15%。',
    traits: { aura: { radius: 130, atkSpeed: 0.2, move: 0.15, label: '友军攻速+20% 移速+15%' } },
  },
  chainknight: {
    id: 'chainknight', name: '链锤骑兵', kind: 'melee', tier: 3,
    costGold: 160, costCrystal: 70, buildTime: 18,
    hp: 450, armor: 3, dmg: 34, range: 30, attackSpeed: 0.9, speed: 130,
    radius: 11, projectile: false, bounty: 65, color: 0x9a6a30,
    race: 'blood',
    desc: '冲锋：静止2秒后移速×2.5，冲锋后的首次攻击伤害×2。',
    traits: { charge: { delay: 2, mult: 2.5, firstHitMult: 2 } },
  },
  lavabeast: {
    id: 'lavabeast', name: '熔岩巨兽', kind: 'melee', tier: 3,
    costGold: 190, costCrystal: 90, buildTime: 22,
    hp: 1000, armor: 5, dmg: 38, range: 32, attackSpeed: 0.65, speed: 55,
    radius: 13, projectile: false, bounty: 80, color: 0xd05020,
    race: 'blood',
    desc: '再生：每秒回血5点，越拖越难杀的3本重坦。',
    traits: { regen: 5 },
  },
  cyclops: {
    id: 'cyclops', name: '独眼阿当', kind: 'melee', tier: 3,
    costGold: 200, costCrystal: 100, buildTime: 24,
    hp: 1300, armor: 4, dmg: 45, range: 32, attackSpeed: 0.6, speed: 60,
    radius: 14, projectile: false, bounty: 85, color: 0xb0883a,
    race: 'blood',
    desc: '超高生命：30% 暴击造成 2.5 倍伤害。',
    traits: { crit: { chance: 0.3, mult: 2.5 } },
  },
  // ---- P3 血兽英雄 ×4 ----
  brade: {
    id: 'brade', name: '风暴利刃·布雷德', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 650, armor: 4, dmg: 30, range: 32, attackSpeed: 1.2, speed: 110,
    radius: 11, projectile: false, bounty: 150, color: 0xe08a3a,
    race: 'blood',
    desc: '血兽第一猛将，旋风斩与狂暴化身战场绞肉机。',
    heroSkills: [
      {
        id: 'whirlwind', name: '旋风斩', hotkey: 'Q',
        cooldown: 8, manaCost: 40, radius: 95, power: 70, targetAllies: false,
        desc: '对周围敌人造成70点伤害。',
      },
      {
        id: 'rage', name: '狂暴', hotkey: 'W',
        cooldown: 14, manaCost: 45, radius: 0, power: 0, targetAllies: false,
        selfBuff: { atkSpeed: 0.5, dur: 5 },
        desc: '自身攻速+50%，持续5秒。',
      },
    ],
  },
  syl: {
    id: 'syl', name: '元素先知·西尔', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 520, armor: 2, dmg: 26, range: 180, attackSpeed: 1, speed: 90,
    radius: 10, projectile: true, bounty: 150, color: 0x60a0e0,
    race: 'blood',
    desc: '操控雷火元素的先知，远程区域压制。',
    heroSkills: [
      {
        id: 'thunderstorm', name: '雷暴', hotkey: 'Q',
        cooldown: 11, manaCost: 55, radius: 85, power: 40, targetAllies: false,
        targeted: true, strikes: { count: 3, interval: 0.5 },
        desc: '指定区域落下3次闪电，每次40点伤害。',
      },
      {
        id: 'lavafracture', name: '熔岩裂隙', hotkey: 'W',
        cooldown: 15, manaCost: 60, radius: 80, power: 0, targetAllies: false,
        targeted: true, dotZone: { dps: 25, dur: 5 },
        desc: '撕开熔岩裂隙：区域内敌人每秒受到25点伤害，持续5秒。',
      },
    ],
  },
  dukun: {
    id: 'dukun', name: '无相巫师·妒昆', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 560, armor: 2, dmg: 24, range: 170, attackSpeed: 1, speed: 90,
    radius: 10, projectile: true, bounty: 150, color: 0x8060b0,
    race: 'blood',
    desc: '诡秘的灵魂操控者，夺敌为己用。',
    heroSkills: [
      {
        id: 'soulgrab', name: '灵魂操控', hotkey: 'Q',
        cooldown: 20, manaCost: 60, radius: 70, power: 0, targetAllies: false,
        targeted: true, charm: { dur: 8 },
        desc: '夺取一名敌方单位为我方作战8秒。',
      },
      {
        id: 'darkheal', name: '群体暗愈', hotkey: 'W',
        cooldown: 12, manaCost: 50, radius: 120, power: 85, targetAllies: true,
        desc: '治疗周围友军85点生命。',
      },
    ],
  },
  kada: {
    id: 'kada', name: '图腾兄弟·卡达', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 900, armor: 6, dmg: 24, range: 30, attackSpeed: 0.9, speed: 75,
    radius: 12, projectile: false, bounty: 150, color: 0x708a50,
    race: 'blood',
    desc: '双生图腾守护者，削弱敌人、庇护友军。',
    heroSkills: [
      {
        id: 'gaze', name: '凝视', hotkey: 'Q',
        cooldown: 12, manaCost: 45, radius: 90, power: 0, targetAllies: false,
        targeted: true, atkDebuff: { mult: 0.6, dur: 4 },
        desc: '凝视区域：敌人攻击力降低40%，持续4秒。',
      },
      {
        id: 'totemward', name: '图腾壁垒', hotkey: 'W',
        cooldown: 14, manaCost: 50, radius: 120, power: 0, targetAllies: true,
        shield: 150,
        desc: '给周围友军附加150点护盾。',
      },
    ],
  },
  // ---- P4 亡灵族兵种（策划文档 §4.3） ----
  ghoul: {
    id: 'ghoul', name: '食尸鬼', kind: 'worker', tier: 1,
    costGold: 40, costCrystal: 0, buildTime: 5,
    hp: 100, armor: 0, dmg: 6, range: 26, attackSpeed: 1.1, speed: 100,
    radius: 9, projectile: false, bounty: 8, color: 0x7a8a6a,
    race: 'undead',
    desc: '亡灵工人：采集/建造，更廉价快速。',
  },
  skelpioneer: {
    id: 'skelpioneer', name: '骷髅先锋', kind: 'melee', tier: 1,
    costGold: 35, costCrystal: 0, buildTime: 5,
    hp: 180, armor: 0, dmg: 11, range: 28, attackSpeed: 1.1, speed: 90,
    radius: 9, projectile: false, bounty: 12, color: 0xa8a89a,
    race: 'undead', skeleton: true,
    desc: '最廉价近战：适合爆骷髅海。',
  },
  bonearcher: {
    id: 'bonearcher', name: '骨弓', kind: 'ranged', tier: 1,
    costGold: 60, costCrystal: 10, buildTime: 9,
    hp: 140, armor: 0, dmg: 12, range: 150, attackSpeed: 1.1, speed: 90,
    radius: 9, projectile: true, bounty: 18, color: 0xb8b09a,
    race: 'undead', skeleton: true,
    desc: '远程射手，可攻击飞行单位。',
    traits: { antiAir: 1 },
  },
  demonmage: {
    id: 'demonmage', name: '恶魔法师', kind: 'ranged', tier: 2,
    costGold: 100, costCrystal: 40, buildTime: 13,
    hp: 210, armor: 0, dmg: 22, range: 160, attackSpeed: 0.9, speed: 85,
    radius: 10, projectile: true, bounty: 40, color: 0x8a5ab0,
    race: 'undead',
    desc: '远程法师，稳定的法术输出。',
  },
  demonguard: {
    id: 'demonguard', name: '恶魔护卫', kind: 'melee', tier: 2,
    costGold: 95, costCrystal: 25, buildTime: 13,
    hp: 460, armor: 3, dmg: 20, range: 28, attackSpeed: 0.9, speed: 85,
    radius: 11, projectile: false, bounty: 38, color: 0x6a5a8a,
    race: 'undead',
    desc: '近战护卫：高护甲高血量。',
  },
  plaguecart: {
    id: 'plaguecart', name: '瘟疫战车', kind: 'ranged', tier: 2,
    costGold: 140, costCrystal: 60, buildTime: 16,
    hp: 430, armor: 2, dmg: 24, range: 170, attackSpeed: 0.55, speed: 65,
    radius: 12, projectile: true, bounty: 55, color: 0x6a8a4a,
    race: 'undead',
    desc: '攻城×2：投掷瘟疫尸体，命中与溅射传播瘟疫（8/s×4秒）。',
    traits: { siege: 2, splash: 45, plague: { dps: 8, dur: 4 } },
  },
  bonequeen: {
    id: 'bonequeen', name: '白骨女王', kind: 'ranged', tier: 2,
    costGold: 105, costCrystal: 35, buildTime: 13,
    hp: 240, armor: 1, dmg: 18, range: 155, attackSpeed: 1.0, speed: 90,
    radius: 10, projectile: true, bounty: 42, color: 0xc0b8d0,
    race: 'undead', skeleton: true,
    desc: '每击杀一个敌人召唤 1 名骷髅战士（场上上限 4）。',
    traits: { onKillSummon: { unitId: 'skel', max: 4, lifetime: 90 } },
  },
  succubus: {
    id: 'succubus', name: '魅魔', kind: 'ranged', tier: 2,
    costGold: 115, costCrystal: 45, buildTime: 14,
    hp: 220, armor: 0, dmg: 20, range: 165, attackSpeed: 1.0, speed: 95,
    radius: 10, projectile: true, bounty: 45, color: 0xb05a7a,
    race: 'undead',
    desc: '对空 ×1.5：飞行单位的克星。',
    traits: { antiAir: 1.5 },
  },
  zombiegiant: {
    id: 'zombiegiant', name: '丧尸巨人', kind: 'melee', tier: 2,
    costGold: 120, costCrystal: 40, buildTime: 15,
    hp: 700, armor: 3, dmg: 30, range: 30, attackSpeed: 0.6, speed: 60,
    radius: 13, projectile: false, bounty: 48, color: 0x5a7a4a,
    race: 'undead',
    desc: '重坦：700 血高护甲前排。',
  },
  soulwitch: {
    id: 'soulwitch', name: '亡魂巫师', kind: 'ranged', tier: 2,
    costGold: 100, costCrystal: 45, buildTime: 13,
    hp: 200, armor: 0, dmg: 18, range: 160, attackSpeed: 0.9, speed: 85,
    radius: 10, projectile: true, bounty: 40, color: 0x7a6ac0,
    race: 'undead',
    desc: '诅咒：攻击命中降低目标 3 点护甲，持续 8 秒。',
    traits: { armorCurse: { amt: 3, dur: 8 } },
  },
  devourer: {
    id: 'devourer', name: '噬魂鬼', kind: 'melee', tier: 3,
    costGold: 120, costCrystal: 60, buildTime: 15,
    hp: 260, armor: 1, dmg: 50, range: 30, attackSpeed: 0.8, speed: 120,
    radius: 11, projectile: false, bounty: 60, color: 0x9a4a5a,
    race: 'undead',
    desc: '自爆：扑向目标或死亡时引爆，造成 90 点 AoE 伤害。',
    traits: { selfExplode: { dmg: 90, radius: 80 } },
  },
  ghosttongue: {
    id: 'ghosttongue', name: '长舌幽灵', kind: 'ranged', tier: 3,
    costGold: 150, costCrystal: 80, buildTime: 18,
    hp: 280, armor: 1, dmg: 26, range: 110, attackSpeed: 1.1, speed: 115,
    radius: 11, projectile: true, bounty: 65, color: 0x8ac0a8,
    race: 'undead',
    desc: '飞行单位：高频率输出，仅远程可击中。',
    traits: { flying: true },
  },
  skeletonlord: {
    id: 'skeletonlord', name: '骷髅将军', kind: 'melee', tier: 3,
    costGold: 170, costCrystal: 80, buildTime: 20,
    hp: 620, armor: 5, dmg: 36, range: 30, attackSpeed: 0.8, speed: 80,
    radius: 12, projectile: false, bounty: 75, color: 0xb0a880,
    race: 'undead', skeleton: true,
    desc: '光环：骷髅系友军攻击 +25%。',
    traits: { aura: { radius: 130, atk: 0.25, skeletonsOnly: true, label: '骷髅系友军攻击+25%' } },
  },
  // ---- P4 亡灵召唤物（不入卡组） ----
  skel: {
    id: 'skel', name: '骷髅战士', kind: 'melee', tier: 1,
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 120, armor: 0, dmg: 10, range: 26, attackSpeed: 1.1, speed: 95,
    radius: 8, projectile: false, bounty: 0, color: 0xc8c8b8,
    race: 'undead', skeleton: true,
    desc: '被召唤的骷髅战士。',
  },
  hellfire: {
    id: 'hellfire', name: '地狱火巨人', kind: 'melee', tier: 3,
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 800, armor: 4, dmg: 40, range: 32, attackSpeed: 0.7, speed: 60,
    radius: 14, projectile: false, bounty: 0, color: 0xe06020,
    race: 'undead',
    desc: '被召唤的火焰巨人，限时存在。',
  },
  // ---- P4 亡灵英雄 ×4 ----
  pope: {
    id: 'pope', name: '骷髅教皇', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 540, armor: 3, dmg: 24, range: 165, attackSpeed: 1.0, speed: 85,
    radius: 10, projectile: true, bounty: 150, color: 0xd0c8a0,
    race: 'undead', skeleton: true,
    desc: '亡灵信仰的化身，唤起死者为他而战。',
    heroSkills: [
      {
        id: 'revive', name: '亡者复苏', hotkey: 'Q',
        cooldown: 14, manaCost: 55, radius: 220, power: 0, targetAllies: false,
        revive: { count: 3 },
        desc: '消耗附近最多3具尸体，各召唤1名骷髅战士。',
      },
      {
        id: 'hypnosis', name: '信仰催眠', hotkey: 'W',
        cooldown: 16, manaCost: 50, radius: 70, power: 0, targetAllies: false,
        targeted: true, charm: { dur: 6 },
        desc: '魅惑一名敌方单位为我方作战6秒。',
      },
    ],
  },
  necromancer: {
    id: 'necromancer', name: '死灵术士', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 500, armor: 2, dmg: 26, range: 170, attackSpeed: 0.9, speed: 85,
    radius: 10, projectile: true, bounty: 150, color: 0x5a6ab0,
    race: 'undead',
    desc: '禁忌术法的大师，召唤地狱火、汲取生命。',
    heroSkills: [
      {
        id: 'hellfire', name: '地狱火', hotkey: 'Q',
        cooldown: 25, manaCost: 70, radius: 60, power: 0, targetAllies: false,
        targeted: true, summon: { unitId: 'hellfire', count: 1, lifetime: 30 },
        desc: '召唤火焰巨人（800血），持续30秒。',
      },
      {
        id: 'lifedrain', name: '生命虹吸', hotkey: 'W',
        cooldown: 10, manaCost: 40, radius: 180, power: 90, targetAllies: false,
        targeted: true, drain: { dmg: 90 },
        desc: '汲取最近敌人90点生命，等量治疗自身。',
      },
    ],
  },
  demonlord: {
    id: 'demonlord', name: '恶魔王骑·迪克', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 620, armor: 4, dmg: 32, range: 30, attackSpeed: 1.1, speed: 125,
    radius: 11, projectile: false, bounty: 150, color: 0xa03a3a,
    race: 'undead',
    desc: '地狱的骑兵，冲锋陷阵、散播绝望。',
    heroSkills: [
      {
        id: 'dive', name: '俯冲突进', hotkey: 'Q',
        cooldown: 10, manaCost: 45, radius: 70, power: 70, targetAllies: false,
        targeted: true, dash: { dist: 150 },
        desc: '向目标点突进150距离，落地对周围造成70点伤害。',
      },
      {
        id: 'oppress', name: '绝望压迫', hotkey: 'W',
        cooldown: 13, manaCost: 50, radius: 110, power: 0, targetAllies: false,
        fear: { dur: 0.8 },
        desc: '范围恐惧：敌人失控0.8秒。',
      },
    ],
  },
  deathgod: {
    id: 'deathgod', name: '沙漠死神·阿努比斯', kind: 'hero', tier: 2,
    costGold: 190, costCrystal: 90, buildTime: 25,
    hp: 950, armor: 6, dmg: 28, range: 32, attackSpeed: 0.9, speed: 70,
    radius: 12, projectile: false, bounty: 150, color: 0xd0a84d,
    race: 'undead',
    desc: '掌管死亡的神明，沙暴埋葬敌人，自爆亦能归来。',
    heroSkills: [
      {
        id: 'sandstorm', name: '沙暴', hotkey: 'Q',
        cooldown: 12, manaCost: 55, radius: 95, power: 0, targetAllies: false,
        targeted: true, sandstorm: { dps: 30, dur: 5, slow: 0.4 },
        desc: '沙暴区域：每秒30点伤害并减速40%，持续5秒。',
      },
      {
        id: 'selfdestruct', name: '死亡绽放', hotkey: 'W',
        cooldown: 30, manaCost: 80, radius: 120, power: 200, targetAllies: false,
        selfDestruct: { dmg: 200 },
        desc: '牺牲自身引爆巨额 AoE（200点），随后进入复活计时。',
      },
    ],
  },
};

// ===== 建筑数据 =====
export const BUILDINGS: Record<string, BuildingDef> = {
  main: {
    id: 'main', name: '生命古树', kind: 'main',
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 1600, armor: 4, w: 3, h: 3, tier: 1,
    color: 0x3e8e5a, supply: 10, crystalRate: 0, trains: ['worker'],
    desc: '主基地：训练工匠、上交金币、升级科技。被摧毁则战败。',
  },
  house: {
    id: 'house', name: '树屋', kind: 'house',
    costGold: 60, costCrystal: 0, buildTime: 12,
    hp: 400, armor: 0, w: 2, h: 2, tier: 1,
    color: 0x5a7a4a, supply: 8, crystalRate: 0, trains: [],
    desc: '提供8人口。',
  },
  barracks: {
    id: 'barracks', name: '战争古树', kind: 'barracks',
    costGold: 150, costCrystal: 0, buildTime: 20,
    hp: 800, armor: 2, w: 3, h: 3, tier: 1,
    color: 0x4a6a55, supply: 0, crystalRate: 0, trains: ['swordsman', 'archer', 'druid', 'panther', 'chariot', 'treant', 'fawn', 'firedrake'],
    desc: '训练1-2本战斗单位。',
  },
  extractor: {
    id: 'extractor', name: '原石神龛', kind: 'extractor',
    costGold: 100, costCrystal: 0, buildTime: 15,
    hp: 500, armor: 1, w: 2, h: 2, tier: 1,
    color: 0x7a5fb0, supply: 0, crystalRate: 1.2, trains: [],
    desc: '每秒产出1.2原石。原石用于科技与高级单位。',
  },
  arcane: {
    id: 'arcane', name: '智慧古树', kind: 'arcane',
    costGold: 120, costCrystal: 80, buildTime: 25,
    hp: 650, armor: 2, w: 2, h: 2, tier: 2,
    color: 0x5566aa, supply: 0, crystalRate: 0, trains: ['golem', 'thunderer', 'teacher', 'assassin', 'hero', 'princess', 'greendragon', 'elder'],
    desc: '需要2本。训练3本单位与英雄（最多召唤3名英雄）。',
  },
  tower: {
    id: 'tower', name: '荆棘箭塔', kind: 'tower',
    costGold: 80, costCrystal: 40, buildTime: 18,
    hp: 550, armor: 4, w: 2, h: 2, tier: 1,
    color: 0x6a7a5a, supply: 0, crystalRate: 0, trains: [],
    dmg: 16, range: 190, attackSpeed: 1, projectile: true,
    desc: '防御塔，自动攻击范围内敌人。',
  },
  // ---- P2 中立据点（不可建造，占领获得） ----
  stronghold: {
    id: 'stronghold', name: '前线据点', kind: 'stronghold',
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 2000, armor: 6, w: 2, h: 2, tier: 1,
    color: 0x8a7a4a, supply: 0, crystalRate: 0,
    trains: [
      'swordsman', 'archer', 'druid', 'panther', 'chariot', 'treant', 'fawn', 'firedrake', 'golem', 'thunderer', 'teacher', 'assassin',
      'bfighter', 'spearfrog', 'shieldbull', 'witchdoc', 'fangwolf', 'axethrower', 'crushercart', 'firewitch', 'dragoon', 'shaman', 'chainknight', 'lavabeast', 'cyclops',
      'skelpioneer', 'bonearcher', 'demonmage', 'demonguard', 'plaguecart', 'bonequeen', 'succubus', 'zombiegiant', 'soulwitch', 'devourer', 'ghosttongue', 'skeletonlord',
    ],
    income: 1.5,
    desc: '中立据点：占领后持续产金，并可作为前进出兵点。',
  },

  // ===== P3 血兽族建筑（策划文档 §4.2） =====
  totem: {
    id: 'totem', name: '战争图腾', kind: 'main',
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 1600, armor: 4, w: 3, h: 3, tier: 1,
    color: 0x8e4a3a, supply: 10, crystalRate: 0, trains: ['bworker'],
    race: 'blood',
    desc: '血兽主基地：训练苦工、上交金币、升级科技。被摧毁则战败。',
  },
  pen: {
    id: 'pen', name: '兽栏', kind: 'house',
    costGold: 60, costCrystal: 0, buildTime: 12,
    hp: 400, armor: 0, w: 2, h: 2, tier: 1,
    color: 0x7a5540, supply: 8, crystalRate: 0, trains: [],
    race: 'blood',
    desc: '提供8人口。',
  },
  bloodcamp: {
    id: 'bloodcamp', name: '血兽兵营', kind: 'barracks',
    costGold: 150, costCrystal: 0, buildTime: 20,
    hp: 800, armor: 2, w: 3, h: 3, tier: 1,
    color: 0x6a4038, supply: 0, crystalRate: 0,
    trains: ['bfighter', 'spearfrog', 'shieldbull', 'witchdoc', 'fangwolf', 'axethrower', 'crushercart', 'firewitch', 'dragoon'],
    race: 'blood',
    desc: '训练1-2本血兽战斗单位。',
  },
  lavaaltar: {
    id: 'lavaaltar', name: '熔岩祭坛', kind: 'extractor',
    costGold: 100, costCrystal: 0, buildTime: 15,
    hp: 500, armor: 1, w: 2, h: 2, tier: 1,
    color: 0xb05a2a, supply: 0, crystalRate: 1.2, trains: [],
    race: 'blood',
    desc: '每秒产出1.2原石。原石用于科技与高级单位。',
  },
  prophecy: {
    id: 'prophecy', name: '先知帐幕', kind: 'arcane',
    costGold: 120, costCrystal: 80, buildTime: 25,
    hp: 650, armor: 2, w: 2, h: 2, tier: 2,
    color: 0x8a4a6a, supply: 0, crystalRate: 0,
    trains: ['shaman', 'chainknight', 'lavabeast', 'cyclops', 'brade', 'syl', 'dukun', 'kada'],
    race: 'blood',
    desc: '需要2本。训练3本单位与英雄（最多召唤3名英雄）。',
  },
  bloodtower: {
    id: 'bloodtower', name: '血兽箭楼', kind: 'tower',
    costGold: 80, costCrystal: 40, buildTime: 18,
    hp: 550, armor: 4, w: 2, h: 2, tier: 1,
    color: 0x5a3a3a, supply: 0, crystalRate: 0, trains: [],
    dmg: 16, range: 190, attackSpeed: 1, projectile: true,
    race: 'blood',
    desc: '防御塔，自动攻击范围内敌人。',
  },

  // ===== P4 亡灵族建筑（策划文档 §4.3） =====
  throne: {
    id: 'throne', name: '亡灵王座', kind: 'main',
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 1600, armor: 4, w: 3, h: 3, tier: 1,
    color: 0x4a3a5a, supply: 10, crystalRate: 0, trains: ['ghoul'],
    race: 'undead',
    desc: '亡灵主基地：训练食尸鬼、上交金币、升级科技。被摧毁则战败。',
  },
  graveyard: {
    id: 'graveyard', name: '尸骸墓穴', kind: 'house',
    costGold: 60, costCrystal: 0, buildTime: 12,
    hp: 400, armor: 0, w: 2, h: 2, tier: 1,
    color: 0x3a3a4a, supply: 8, crystalRate: 0, trains: [],
    race: 'undead',
    desc: '提供8人口。',
  },
  boneyard: {
    id: 'boneyard', name: '埋骨地', kind: 'barracks',
    costGold: 150, costCrystal: 0, buildTime: 20,
    hp: 800, armor: 2, w: 3, h: 3, tier: 1,
    color: 0x4a4440, supply: 0, crystalRate: 0,
    trains: ['skelpioneer', 'bonearcher', 'demonmage', 'demonguard', 'plaguecart', 'bonequeen', 'succubus', 'zombiegiant', 'soulwitch'],
    race: 'undead',
    desc: '训练1-2本亡灵战斗单位。',
  },
  wellspring: {
    id: 'wellspring', name: '怨灵井', kind: 'extractor',
    costGold: 100, costCrystal: 0, buildTime: 15,
    hp: 500, armor: 1, w: 2, h: 2, tier: 1,
    color: 0x3a5a5a, supply: 0, crystalRate: 1.2, trains: [],
    race: 'undead',
    desc: '每秒产出1.2原石。原石用于科技与高级单位。',
  },
  cursetemple: {
    id: 'cursetemple', name: '诅咒神殿', kind: 'arcane',
    costGold: 120, costCrystal: 80, buildTime: 25,
    hp: 650, armor: 2, w: 2, h: 2, tier: 2,
    color: 0x5a3a6a, supply: 0, crystalRate: 0,
    trains: ['devourer', 'ghosttongue', 'skeletonlord', 'pope', 'necromancer', 'demonlord', 'deathgod'],
    race: 'undead',
    desc: '需要2本。训练3本单位与英雄（最多召唤3名英雄）。',
  },
  ghosttower: {
    id: 'ghosttower', name: '幽灵塔', kind: 'tower',
    costGold: 80, costCrystal: 40, buildTime: 18,
    hp: 550, armor: 4, w: 2, h: 2, tier: 1,
    color: 0x404a52, supply: 0, crystalRate: 0, trains: [],
    dmg: 16, range: 190, attackSpeed: 1, projectile: true,
    race: 'undead',
    desc: '防御塔，自动攻击范围内敌人。',
  },
};

/** 种族 → 各类建筑 defId 映射（P3/P4） */
export const RACE_BUILDINGS: Record<string, Record<string, string>> = {
  elf: { main: 'main', house: 'house', barracks: 'barracks', extractor: 'extractor', arcane: 'arcane', tower: 'tower' },
  blood: { main: 'totem', house: 'pen', barracks: 'bloodcamp', extractor: 'lavaaltar', arcane: 'prophecy', tower: 'bloodtower' },
  undead: { main: 'throne', house: 'graveyard', barracks: 'boneyard', extractor: 'wellspring', arcane: 'cursetemple', tower: 'ghosttower' },
};

/** 种族 → 工人 defId（P3/P4） */
export const RACE_WORKER: Record<string, string> = { elf: 'worker', blood: 'bworker', undead: 'ghoul' };

/** 主基地科技升级 */
export const TECH_UPGRADES = [
  { to: 2, costGold: 150, costCrystal: 100, time: 30, name: '升级2本' },
  { to: 3, costGold: 250, costCrystal: 200, time: 45, name: '升级3本' },
] as const;

// ===== P1 卡组与兵种科技 =====
/** 出战卡组单位池（精灵族战斗单位） */
export const DECK_UNIT_POOL = [
  'swordsman', 'archer', 'druid', 'panther', 'chariot',
  'treant', 'fawn', 'firedrake', 'golem', 'thunderer', 'teacher', 'assassin',
] as const;
/** 出战卡组英雄池 */
export const DECK_HERO_POOL = ['hero', 'princess', 'greendragon', 'elder'] as const;
/** P3 血兽族卡池 */
export const DECK_UNIT_POOL_BLOOD = [
  'bfighter', 'spearfrog', 'shieldbull', 'witchdoc', 'fangwolf', 'axethrower',
  'crushercart', 'firewitch', 'dragoon', 'shaman', 'chainknight', 'lavabeast', 'cyclops',
] as const;
export const DECK_HERO_POOL_BLOOD = ['brade', 'syl', 'dukun', 'kada'] as const;
/** P4 亡灵族卡池 */
export const DECK_UNIT_POOL_UNDEAD = [
  'skelpioneer', 'bonearcher', 'demonmage', 'demonguard', 'plaguecart', 'bonequeen',
  'succubus', 'zombiegiant', 'soulwitch', 'devourer', 'ghosttongue', 'skeletonlord',
] as const;
export const DECK_HERO_POOL_UNDEAD = ['pope', 'necromancer', 'demonlord', 'deathgod'] as const;
export const DECK_UNITS = 6;
export const DECK_HEROES = 3;

/** 兵种科技：3 级，攻/血 +10%/级，费用=造价×0.8×当前级，研究 20s */
export const UNIT_TECH_MAX = 3;
export const UNIT_TECH_TIME = 20;
export const UNIT_TECH_COST_FACTOR = 0.8;
/** 英雄技能升级：3 级，效果+25%/级，费用 150×当前级 */
export const HERO_SKILL_MAX = 3;
export const HERO_SKILL_COST = 150;

/** 采集参数 */
export const GATHER = {
  carry: 10,        // 每趟携带金币
  mineTime: 2,      // 采矿耗时(秒)
  buildSpeed: 1,    // 建造加速系数（1个工人正常速度）
};

/** 英雄经验 */
export const HERO_XP = [0, 150, 400, 800, 1400];
export const HERO_LEVEL_BONUS = 0.12; // 每级属性加成
export const HERO_RESPAWN = 20; // 秒
export const HERO_MANA_REGEN = 2;
export const HERO_MAX = 3; // 同时拥有英雄上限

/** 野怪数据 */
export interface CreepDef {
  id: string; name: string;
  hp: number; dmg: number; armor: number; speed: number;
  radius: number; range: number; attackSpeed: number;
  bountyGold: number; bountyCrystal: number; xp: number;
  color: number; projectile?: boolean;
}

export const CREEPS: Record<'scout' | 'hunter' | 'troll' | 'boss', CreepDef> = {
  scout: { id: 'scout', name: '腐化斥候', hp: 180, dmg: 8, armor: 0, speed: 80, radius: 9, range: 28, attackSpeed: 1, bountyGold: 30, bountyCrystal: 0, xp: 40, color: 0xc9a44d },
  hunter: { id: 'hunter', name: '暗影猎人', hp: 300, dmg: 14, armor: 1, speed: 85, radius: 10, range: 150, attackSpeed: 1, bountyGold: 40, bountyCrystal: 15, xp: 60, color: 0xa08850, projectile: true },
  troll: { id: 'troll', name: '洞穴巨魔', hp: 550, dmg: 18, armor: 2, speed: 70, radius: 12, range: 30, attackSpeed: 0.8, bountyGold: 55, bountyCrystal: 25, xp: 90, color: 0x8f7a45 },
  boss: { id: 'boss', name: '深渊领主', hp: 1300, dmg: 35, armor: 3, speed: 60, radius: 15, range: 36, attackSpeed: 0.7, bountyGold: 200, bountyCrystal: 100, xp: 220, color: 0x9a4dc9 },
};

/** 野怪行为 */
export const CREEP_AGGRO = 170;   // 仇恨半径
export const CREEP_LEASH = 420;   // 脱离巡逻半径
export const CREEP_RESPAWN = 75;  // 重生时间(秒)

/** 单位索敌 */
export const UNIT_AGGRO = 170;
export const PROJECTILE_SPEED = 340;

/** 指令卡建筑菜单（工匠建造列表） */
export const BUILD_MENU: string[] = ['house', 'barracks', 'extractor', 'arcane', 'tower'];
/** 血兽族建造菜单（P3） */
export const BUILD_MENU_BLOOD: string[] = ['pen', 'bloodcamp', 'lavaaltar', 'prophecy', 'bloodtower'];
/** 亡灵族建造菜单（P4） */
export const BUILD_MENU_UNDEAD: string[] = ['graveyard', 'boneyard', 'wellspring', 'cursetemple', 'ghosttower'];

// ===== P2 地图机制 =====
/** 占领费用：中立 150 / 敌方占领 300 */
export const CAPTURE_COST_NEUTRAL = 150;
export const CAPTURE_COST_ENEMY = 300;
/** 占领判定半径 */
export const CAPTURE_RADIUS = 150;
/** 中立金矿占领后每秒产金 */
export const MINE_INCOME = 2.5;
/** 魔法球掉落概率（boss 必掉） */
export const ORB_DROP_CHANCE = 0.3;
export const ORB_PICKUP_RADIUS = 26;
export const ORB_LIFE = 30;
/** 增益时长 */
export const BUFF_DURATION = 15;
export const HASTE_MULT = 1.4;
export const FRENZY_MULT = 1.6;
export const GOLD_RAIN_AMOUNT = 100;
/** 侦查 */
export const REVEAL_RADIUS = 420;
export const REVEAL_DURATION = 8;
