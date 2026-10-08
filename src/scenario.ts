/** P5-c 战役 PVE：5 关卡（固定敌方阵容 + 脚本增援 + 多样化胜利目标，教学性质） */
import { UNITS } from './config';
import type { Game } from './game';
import type { Race } from './types';
import { Unit } from './entities';

export type ScenarioObjective =
  | { type: 'destroy'; text: string }
  | { type: 'survive'; time: number; text: string }
  | { type: 'capture'; strongholds: number; text: string };

/** 脚本增援：t 秒后在敌方主基地附近刷一批兵，向玩家推进 */
export interface ScenarioWave {
  t: number;
  ids: string[];
  log?: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  brief: string;
  playerRace: Race;
  enemyRace: Race;
  /** 敌方初始科技（默认 1 本） */
  enemyTech?: 1 | 2 | 3;
  /** 敌方初始资源加成 */
  enemyGold?: number;
  /** 开局预置敌军（站在敌方主基地旁） */
  enemyStartUnits?: string[];
  /** 定时增援波次 */
  waves?: ScenarioWave[];
  objective: ScenarioObjective;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'm1',
    name: '第一关 · 初阵',
    brief: '教学关：采集资源 → 建造兵营 → 训练部队，摧毁敌方主基地即可获胜。',
    playerRace: 'elf',
    enemyRace: 'elf',
    objective: { type: 'destroy', text: '摧毁敌方主基地' },
  },
  {
    id: 'm2',
    name: '第二关 · 守卫古树',
    brief: '血兽部落大举来犯！建造防御塔、守住阵地，坚持 5 分钟即为胜利。',
    playerRace: 'elf',
    enemyRace: 'blood',
    enemyGold: 500,
    waves: [
      { t: 75, ids: ['bfighter', 'bfighter', 'bfighter', 'spearfrog'], log: '敌方第一波增援抵达！' },
      { t: 165, ids: ['shieldbull', 'spearfrog', 'spearfrog', 'fangwolf'], log: '敌方重步兵增援来袭！' },
      { t: 255, ids: ['bfighter', 'bfighter', 'crushercart', 'witchdoc'], log: '敌方攻城部队逼近，撑住！' },
    ],
    objective: { type: 'survive', time: 300, text: '坚守 300 秒' },
  },
  {
    id: 'm3',
    name: '第三关 · 桥头堡',
    brief: '占领地图上 2 处中立据点即可控制隘口。派兵清除守军后，消耗金币占领（据点 300 金）。',
    playerRace: 'blood',
    enemyRace: 'elf',
    enemyGold: 300,
    objective: { type: 'capture', strongholds: 2, text: '占领 2 处中立据点' },
  },
  {
    id: 'm4',
    name: '第四关 · 亡灵大军',
    brief: '亡灵军团已推进到边境。海量低阶亡灵不难击杀，但小心亡者复苏——摧毁埋骨地群，端掉主基地。',
    playerRace: 'elf',
    enemyRace: 'undead',
    enemyGold: 800,
    enemyTech: 2,
    enemyStartUnits: ['ghoul', 'ghoul', 'ghoul', 'ghoul', 'bonearcher', 'bonearcher'],
    waves: [
      { t: 120, ids: ['ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul', 'skelpioneer'], log: '亡灵第一波尸潮涌来！' },
      { t: 240, ids: ['ghoul', 'ghoul', 'ghoul', 'ghoul', 'skelpioneer', 'skelpioneer', 'plaguecart'], log: '亡灵第二波尸潮 + 攻城车！' },
    ],
    objective: { type: 'destroy', text: '摧毁亡灵主基地' },
  },
  {
    id: 'm5',
    name: '第五关 · 决战',
    brief: '血兽酋长倾巢而出，科技遥遥领先。这是最后一战——摧毁战争图腾，写下你的传奇。',
    playerRace: 'elf',
    enemyRace: 'blood',
    enemyGold: 1500,
    enemyTech: 3,
    enemyStartUnits: ['bfighter', 'bfighter', 'shieldbull', 'spearfrog'],
    waves: [
      { t: 100, ids: ['bfighter', 'bfighter', 'fangwolf', 'fangwolf'], log: '血兽猎头部队出击！' },
      { t: 200, ids: ['crushercart', 'firewitch', 'bfighter', 'bfighter'], log: '血兽精锐压上！' },
      { t: 300, ids: ['dragoon', 'lavabeast', 'shieldbull', 'witchdoc'], log: '血兽酋长亲卫队现身！' },
    ],
    objective: { type: 'destroy', text: '摧毁战争图腾' },
  },
];

/** 应用关卡开局配置（在 setup() 尾部调用） */
export function applyScenarioSetup(g: Game) {
  const s = g.scenario;
  if (!s) return;
  const foe = g.factions[1];
  if (s.enemyGold) foe.gold += s.enemyGold;
  if (s.enemyTech) foe.tech = s.enemyTech;
  const main = g.getMain(1);
  if (!main) return;
  // 开局预置敌军：主基地下方一字排开
  (s.enemyStartUnits ?? []).forEach((id, i) => {
    const def = UNITS[id];
    if (!def) return;
    const u = new Unit(def, 1, main.x - 90 + i * 36, main.y + main.radius + 40);
    u.order = { type: 'idle' };
    g.units.push(u);
  });
}

/** 推进脚本波次 + 多样化胜利目标（update() 内调用）。返回 true 表示对局已结束 */
export function updateScenario(g: Game, dt: number): boolean {
  const s = g.scenario;
  if (!s) return false;

  // 波次增援
  if (s.waves && s.waves.length > 0) {
    while (g.scenarioWaveIdx < s.waves.length && g.time >= s.waves[g.scenarioWaveIdx].t) {
      const w = s.waves[g.scenarioWaveIdx++];
      const main = g.getMain(1);
      if (main && !g.over) {
        w.ids.forEach((id, i) => {
          const def = UNITS[id];
          if (!def) return;
          const u = new Unit(def, 1, main.x - 80 + (i % 7) * 27, main.y + main.radius + 40 + Math.floor(i / 7) * 30);
          const target = g.getMain(0);
          u.order = { type: 'attackMove', target: target ? { x: target.x, y: target.y } : { x: main.x, y: main.y + 600 } };
          g.units.push(u);
        });
        if (w.log) g.onLog(w.log);
      }
    }
  }

  if (g.over) return true;

  // 胜利目标
  const obj = s.objective;
  if (obj.type === 'survive') {
    if (g.time >= obj.time) {
      g.over = { win: true };
      g.onVictory(true);
      return true;
    }
  } else if (obj.type === 'capture') {
    let owned = 0;
    for (const b of g.buildings) {
      if (!b.dead && b.def.kind === 'stronghold' && g.sameTeam(b.faction, 0)) owned++;
    }
    if (owned >= obj.strongholds) {
      g.over = { win: true };
      g.onVictory(true);
      return true;
    }
  }
  return false;
}
