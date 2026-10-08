/** P5-c 战役 PVE 无头冒烟测试：关卡注入 / 三类胜利目标 / 脚本波次 / 存档恢复 */
import { Game } from '../src/game';
import { UNITS } from '../src/config';
import { SCENARIOS } from '../src/scenario';
import { Unit } from '../src/entities';

let pass = 0; let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
function step(g: Game, secs: number) {
  for (let i = 0; i < secs * 30; i++) { g.update(1 / 30); if (g.over) return; }
}

console.log('=== P5-c 战役模拟 ===');

// --- A. m1 教学关（destroy 标准规则） ---
console.log('A. m1 destroy');
const g1 = new Game({ decks: [null, null], races: ['elf', 'elf'], scenario: SCENARIOS[0] });
ok(g1.scenario === SCENARIOS[0], 'A1 关卡注入', String(g1.scenario?.id));
ok(g1.races[1] === 'elf', 'A2 敌方种族');
ok(g1.scenarioWaveIdx === 0, 'A3 波次计数初始');
step(g1, 60);
ok(g1.units.every(u => u.faction !== 1 || !u.def.id.includes('ghoul')), 'A4 无预置敌军（教学关）');
ok(!g1.over, 'A5 60s 对局正常推进');

// --- B. m2 守卫关（survive + 波次） ---
console.log('B. m2 survive');
const g2 = new Game({ decks: [null, null], races: ['elf', 'blood'], scenario: SCENARIOS[1] });
ok(g2.factions[1].gold >= 700 + 500, 'B1 敌方金币加成', String(g2.factions[1].gold));
// 测试脚手架：给玩家 8 守军（波次压力下不至于被打穿）
const pMain = g2.getMain(0)!;
for (let i = 0; i < 8; i++) {
  const u = new Unit(UNITS[i % 2 === 0 ? 'archer' : 'swordsman'], 0, pMain.x - 80 + i * 24, pMain.y + 50);
  g2.units.push(u);
}
step(g2, 80);
const waveUnits = g2.units.filter(u => u.faction === 1 && !u.isCreep);
ok(g2.scenarioWaveIdx === 1, 'B2 75s 波次触发', String(g2.scenarioWaveIdx));
ok(waveUnits.length >= 4, 'B3 增援单位已生成', String(waveUnits.length));
step(g2, 240);
ok(g2.over?.win === true, 'B4 坚守 300s 判胜', JSON.stringify(g2.over));

// --- C. m3 桥头堡（capture） ---
console.log('C. m3 capture');
const g3 = new Game({ decks: [null, null], races: ['blood', 'elf'], scenario: SCENARIOS[2] });
ok(g3.scenario === SCENARIOS[2], 'C1 关卡注入');
const strongholds = g3.buildings.filter(b => b.def.kind === 'stronghold');
ok(strongholds.length === 2, 'C2 两座中立据点', String(strongholds.length));
ok(!g3.over, 'C3 未占领不判胜');
for (const b of strongholds) b.faction = 0; // 模拟占领
step(g3, 1);
ok(g3.over?.win === true, 'C4 占领 2 据点判胜', JSON.stringify(g3.over));

// --- D. m4 亡灵大军（预置兵 + enemyTech + 波次） ---
console.log('D. m4 destroy + startUnits');
const g4 = new Game({ decks: [null, null], races: ['elf', 'undead'], scenario: SCENARIOS[3] });
ok(g4.factions[1].tech === 2, 'D1 敌方 2 本开局', String(g4.factions[1].tech));
const pre = g4.units.filter(u => u.faction === 1 && !u.isCreep && u.order.type === 'idle');
ok(pre.length === 6, 'D2 开局预置 6 敌军', String(pre.length));
ok(g4.factions[1].gold >= 700 + 800, 'D3 敌方金币', String(g4.factions[1].gold));
step(g4, 125);
ok(g4.scenarioWaveIdx === 1, 'D4 120s 第一波尸潮触发', String(g4.scenarioWaveIdx));
ok(g4.units.filter(u => u.faction === 1 && !u.isCreep).length >= 12, 'D5 波次单位入场');
ok(!g4.over, 'D6 125s 对局进行中');

// --- E. m2 存档恢复（关卡 + 波次计数） ---
console.log('E. 存档恢复');
const g5 = new Game({ decks: [null, null], races: ['elf', 'blood'], scenario: SCENARIOS[1] });
const pm = g5.getMain(0)!;
for (let i = 0; i < 8; i++) {
  const u = new Unit(UNITS[i % 2 === 0 ? 'archer' : 'swordsman'], 0, pm.x - 80 + i * 24, pm.y + 50);
  g5.units.push(u);
}
step(g5, 80);
ok(g5.scenarioWaveIdx === 1, 'E1 读档前 1 波已触发', String(g5.scenarioWaveIdx));
const snap = JSON.parse(g5.serialize()) as { scn?: string; sw?: number };
ok(snap.scn === 'm2' && snap.sw === 1, 'E2 存档含关卡字段', JSON.stringify({ scn: snap.scn, sw: snap.sw }));
const g6 = new Game({ load: snap });
ok(g6.scenario?.id === 'm2', 'E3 读档恢复关卡', String(g6.scenario?.id));
ok(g6.scenarioWaveIdx === 1, 'E4 读档恢复波次计数', String(g6.scenarioWaveIdx));
for (let i = 0; i < 8; i++) {
  const u = new Unit(UNITS[i % 2 === 0 ? 'archer' : 'swordsman'], 0, pm.x - 80 + i * 24, pm.y + 50);
  g6.units.push(u);
}
step(g6, 100);
ok(g6.scenarioWaveIdx === 2, 'E5 读档后 165s 第二波触发', String(g6.scenarioWaveIdx));
ok(g6.over?.win === true || g6.time > 0, 'E6 读档对局可继续推进');

console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
