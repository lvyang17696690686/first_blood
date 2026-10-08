/** P5 存档/读档无头冒烟测试：跑 60s → 序列化 → 读档 → 继续跑 30s 检查状态连续性 */
import { Game } from '../src/game';
import { AIController } from '../src/ai';

let pass = 0; let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

console.log('=== P5-a 存档模拟 ===');
const g1 = new Game({ races: ['elf', 'blood'], decks: [null, null] });
const a1 = new AIController(g1, 1);
for (let i = 0; i < 60 * 30; i++) { g1.update(1 / 30); a1.update(1 / 30); }

const snap = g1.serialize();
const stats1 = {
  time: g1.time, units: g1.units.length, buildings: g1.buildings.length,
  gold: Math.floor(g1.factions[0].gold), nodes: g1.resourceNodes.size,
  camps: g1.creepCamps.length, fogLen: g1.fog.length,
};
console.log('60s 快照：', JSON.stringify(stats1), `大小=${(snap.length / 1024).toFixed(1)}KB`);

const g2 = new Game({ load: JSON.parse(snap) });
const a2 = new AIController(g2, 1);
ok(g2.time === stats1.time, 'R1 读档时间一致', `${g2.time} vs ${stats1.time}`);
ok(g2.units.length === stats1.units, 'R2 读档单位数一致', `${g2.units.length} vs ${stats1.units}`);
ok(g2.buildings.length === stats1.buildings, 'R3 读档建筑数一致');
ok(g2.resourceNodes.size === stats1.nodes, 'R4 读档节点数一致');
ok(g2.factions[0].tech === g1.factions[0].tech, 'R5 科技一致');
ok(g2.factions[1].unitTech && typeof g2.factions[1].unitTech === 'object', 'R6 AI 兵种科技结构存在');
// 工人采集状态恢复：有工人在 mining/returning 且 node.workers 有登记
const miners = g2.units.filter(u => u.def.kind === 'worker' && u.gather && u.gather.phase !== 'moving');
ok(miners.length > 0 || g2.units.every(u => u.def.kind !== 'worker'), 'R7 工人采集状态恢复');
// id 序列：新单位不与现存 id 冲突
let idOk = true;
const ids = new Set(g2.units.map(u => u.id));
for (let i = 0; i < 5 * 30; i++) {
  g2.update(1 / 30); a2.update(1 / 30);
  for (const u of g2.units) if (ids.has(u.id) === false) ids.add(u.id);
  if (g2.units.length !== ids.size) { idOk = false; break; }
}
ok(idOk, 'R8 读档后新单位 id 无冲突');
ok(Number.isFinite(g2.factions[0].gold) && g2.factions[0].gold >= 0, 'R9 金币状态有限');
// 继续跑完 30s 无异常
for (let i = 0; i < 25 * 30; i++) { g2.update(1 / 30); a2.update(1 / 30); if (g2.over) break; }
ok(g2.time >= stats1.time + 25, 'R10 读档后继续推进 30s', `${g2.time}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
