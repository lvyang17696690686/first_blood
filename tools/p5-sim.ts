/** P5 团战无头冒烟：2v2/3v3 多阵营 + 队友AI + 队伍判定 + 存档往返（node 运行） */
import { Game } from '../src/game';
import { AIController } from '../src/ai';
import { Unit } from '../src/entities';
import { UNITS } from '../src/config';
import type { Faction } from '../src/types';

let pass = 0; let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function stepAI(g: Game, sec: number, ais: AIController[]) {
  const n = Math.round(sec * 30);
  for (let i = 0; i < n; i++) {
    g.update(1 / 30);
    for (const ai of ais) ai.update(1 / 30);
    if (g.over) break;
  }
}
function rebuild(g: Game) {
  g.spatial.clear();
  for (const u of g.units) if (!u.dead) g.spatial.insert(u);
  for (const b of g.buildings) if (!b.dead) g.spatial.insert(b);
}

console.log('=== P5-b 团战模拟 ===');

// ================= 场景 A：2v2 基础 =================
{
  console.log('场景 A：2v2 基础');
  const g = new Game({ races: ['elf', 'blood', 'undead', 'elf'], teamSize: 2 });
  ok(g.teams.length === 5 && g.teams[0] === 0 && g.teams[1] === 1 && g.teams[2] === -1 &&
     g.teams[3] === 0 && g.teams[4] === 1, 'A1 teams 映射 [0,1,-1,0,1]', JSON.stringify(g.teams));
  ok(g.startSlot.length === 5 && new Set(g.startSlot).size === 4, 'A2 startSlot 4 个出生点', JSON.stringify(g.startSlot));
  ok(g.startSlot[0] === 0 && g.startSlot[3] === 1 && g.startSlot[1] === 2 && g.startSlot[4] === 3,
    'A2b 槽位按队伍分配（队友=玩家侧，敌方=敌方侧）', JSON.stringify(g.startSlot));
  ok(g.map.startPositions.length === 4, 'A3 地图 4 个出生点', `n=${g.map.startPositions.length}`);
  for (const f of [0, 1, 3, 4] as Faction[]) {
    if (!g.buildings.some(b => b.faction === f && b.def.kind === 'main') ||
        g.units.filter(u => u.faction === f && u.def.kind === 'worker').length !== 5) {
      ok(false, `A4 阵营${f} 主基地+5工人`);
    }
  }
  ok(true, 'A4 四阵营主基地+5工人');
  ok(g.sameTeam(0, 3) && g.sameTeam(1, 4) && !g.sameTeam(0, 1) && !g.sameTeam(3, 4), 'A5 sameTeam 判定');
  // 中立矿守军：nodeSpawns 最后两位 = 中场带守军矿
  const guarded = [...g.resourceNodes.values()].filter(n => n.guarded);
  ok(guarded.length === 2, 'A6 中立守军矿 2 座', `n=${guarded.length}`);
  // 共享视野：队友工人周围已开雾
  const mate = g.units.find(u => u.faction === 3 && u.def.kind === 'worker')!;
  const tx = Math.floor(mate.x / 32), ty = Math.floor(mate.y / 32);
  g.updateFog(true);
  ok(g.fog[ty * g.map.w + tx] === 2, 'A7 队伍共享视野');
}

// ================= 场景 B：队伍判定 =================
{
  console.log('场景 B：队伍判定');
  const g = new Game({ races: ['elf', 'blood', 'undead', 'elf'], teamSize: 2 });
  const main0 = g.getMain(0)!;
  const ax = main0.x + 100, ay = main0.y;
  const mate = new Unit(UNITS.swordsman, 3, ax, ay);
  const foe = new Unit(UNITS.bfighter, 1, ax + 10, ay);
  g.units.push(mate, foe);
  rebuild(g);
  const e = g.queryNearestEnemy(ax, ay, 200, 0);
  ok(e !== null && e.faction === 1, 'B1 queryNearestEnemy 跳过队友', e ? `faction=${e.faction}` : 'null');
  // 胜负：拆掉敌方两队（1、4）主基地 → 玩家方胜
  let winCb: boolean | null = null;
  g.onVictory = w => { winCb = w; };
  g.killEntity(g.getMain(1)!, null);
  ok(!g.over, 'B2 只拆 E1 主基地不结算（E2 还在）');
  g.killEntity(g.getMain(4)!, null);
  ok(g.over?.win === true && winCb === true, 'B3 敌方全队主基地倒下 → 玩家方胜利');
}

// ================= 场景 C：2v2 AI 冒烟 =================
{
  console.log('场景 C：2v2 AI 冒烟（150s）');
  const g = new Game({ races: ['elf', 'blood', 'undead', 'blood'], teamSize: 2, decks: [null, null, null, null] });
  g.decks[0] = { units: ['swordsman', 'archer', 'druid', 'panther', 'chariot', 'golem'], heroes: ['hero', 'princess', 'greendragon'] };
  const ais = [1, 3, 4].map(f => new AIController(g, f as Faction));
  stepAI(g, 150, ais);
  ok(true, 'C1 150s 模拟无崩溃');
  ok(!g.over, 'C2 150s 内未异常结算', g.over ? JSON.stringify(g.over) : '');
  const mateUnits = g.units.filter(u => u.faction === 3 && !u.dead);
  const mateArmy = mateUnits.filter(u => u.def.kind !== 'worker').length;
  ok(mateArmy >= 2, 'C3 队友 AI 出兵', `army=${mateArmy}`);
  ok(g.buildings.some(b => b.faction === 3 && b.def.kind === 'barracks'), 'C4 队友 AI 建造兵营');
  ok(Number.isFinite(g.factions[3].gold), 'C5 队友经济有限状态');
  // 队友没有被队友摧毁
  ok(g.buildings.some(b => b.faction === 0 && b.def.kind === 'main'), 'C6 玩家主基地健在');
}

// ================= 场景 D：2v2 存档往返 =================
{
  console.log('场景 D：2v2 存档往返');
  const g1 = new Game({ races: ['elf', 'blood', 'undead', 'elf'], teamSize: 2, decks: [null, null, null, null] });
  const ais1 = [1, 3, 4].map(f => new AIController(g1, f as Faction));
  stepAI(g1, 60, ais1);
  const snap = g1.serialize();
  const stats1 = { time: g1.time, units: g1.units.length, buildings: g1.buildings.length };
  const g2 = new Game({ load: JSON.parse(snap) });
  ok(g2.teamSize === 2 && g2.teams.length === 5 && g2.teams[3] === 0, 'D1 读档恢复 teamSize/teams');
  ok(g2.time === stats1.time && g2.units.length === stats1.units, 'D2 读档状态一致',
    `${g2.time}/${g2.units.length} vs ${stats1.time}/${stats1.units}`);
  const ais2 = [1, 3, 4].map(f => new AIController(g2, f as Faction));
  stepAI(g2, 30, ais2);
  ok(g2.time >= stats1.time + 29.9, 'D3 读档后继续推进 30s', `${g2.time}`);
  ok(g2.buildings.some(b => b.faction === 3 && b.def.kind === 'main') || g2.over, 'D4 队友主基地延续');
}

// ================= 场景 E：3v3 冒烟 =================
{
  console.log('场景 E：3v3 AI 冒烟（120s）');
  const g = new Game({ races: ['elf', 'blood', 'undead', 'elf', 'blood', 'undead'], teamSize: 3, decks: [null, null, null, null, null, null] });
  ok(g.teams.length === 7 && g.teams[5] === 0 && g.teams[6] === 1, 'E1 teams 映射 [0,1,-1,0,1,0,1]', JSON.stringify(g.teams));
  ok(g.map.startPositions.length === 6, 'E2 地图 6 个出生点', `n=${g.map.startPositions.length}`);
  const ais = [1, 3, 4, 5, 6].map(f => new AIController(g, f as Faction));
  stepAI(g, 120, ais);
  ok(true, 'E3 120s 模拟无崩溃');
  ok(!g.over, 'E4 120s 内未异常结算');
  const mainsOk = ([1, 3, 4, 5, 6] as Faction[]).every(f => g.buildings.some(b => b.faction === f && b.def.kind === 'main'));
  ok(mainsOk, 'E5 六阵营主基地健在');
  const p5Army = g.units.filter(u => u.faction === 5 && u.def.kind !== 'worker' && !u.dead).length;
  ok(p5Army >= 1, 'E6 队友(P3)出兵', `army=${p5Army}`);
}

console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
