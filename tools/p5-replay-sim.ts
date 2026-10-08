/** P5-d 回放无头冒烟：录制对局（含玩家指令）→ 种子复现 → 状态逐位一致 */
import { Game } from '../src/game';
import { AIController } from '../src/ai';
import { setSeed } from '../src/rng';
import { recStart, recStop, recCmd, applyCmd } from '../src/replay';
import type { ReplayData } from '../src/replay';

let pass = 0; let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

const SEED = 424242;
const STEPS = 60 * 30; // 60s

// ===== 第一遍：录制 =====
setSeed(SEED);
const gA = new Game({ decks: [null, null], races: ['elf', 'blood'] });
const aiA = new AIController(gA, 1);
recStart(gA, {
  v: 1, name: '测试对局', date: '2026-10-08', seed: SEED,
  teamSize: 1, races: ['elf', 'blood'], decks: [null, null], scenario: null,
});

// 脚本化玩家指令：recCmd（录制）+ applyCmd（live 等效应用，与输入层同一套变更）
const mainA = gA.getMain(0)!;
const scriptAt = new Map<number, (() => void)[]>();
const at = (sec: number, fn: () => void) => {
  const arr = scriptAt.get(sec) ?? [];
  arr.push(fn);
  scriptAt.set(sec, arr);
};
at(2, () => { recCmd('train', mainA.id, 'worker'); applyCmd(gA, ['train', mainA.id, 'worker']); });
at(8, () => {
  const w = gA.units.find(u => u.faction === 0 && u.def.kind === 'worker' && !u.dead)!;
  recCmd('ords', [[w.id, { type: 'move', target: { x: w.x + 100, y: w.y } }, { type: 'idle' }, null, 0]]);
  applyCmd(gA, ['ords', [[w.id, { type: 'move', target: { x: w.x + 100, y: w.y } }, { type: 'idle' }, null, 0]]]);
});
at(12, () => {
  // 建造房屋：从主基地附近找一个合法位置
  let tx = 0, ty = 0, found = false;
  for (let r = 4; r < 12 && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        const cx = Math.floor(mainA.x / 32) - 1 + dx, cy = Math.floor(mainA.y / 32) - 1 + dy;
        if (gA.canPlace(cx, cy, 2, 2)) { tx = cx; ty = cy; found = true; }
      }
    }
  }
  if (found) {
    const w = gA.units.find(u => u.faction === 0 && u.def.kind === 'worker' && !u.dead)!;
    recCmd('place', 'house', tx, ty, w.id);
    applyCmd(gA, ['place', 'house', tx, ty, w.id]);
  }
});
at(20, () => {
  const w = gA.units.find(u => u.faction === 0 && u.def.kind === 'worker' && !u.dead)!;
  recCmd('ords', [[w.id, { type: 'idle' }, { type: 'idle' }, null, 1]]);
  applyCmd(gA, ['ords', [[w.id, { type: 'idle' }, { type: 'idle' }, null, 1]]]);
});

for (let i = 0; i < STEPS; i++) {
  const fns = scriptAt.get(Math.floor(gA.time));
  if (fns) { for (const f of fns) f(); scriptAt.delete(Math.floor(gA.time)); }
  gA.update(1 / 30);
  aiA.update(1 / 30);
  if (gA.over) break;
}
const data = recStop() as ReplayData | null;
ok(data !== null, 'R1 录制产出回放');
ok((data?.cmds.length ?? 0) >= 3, 'R2 玩家指令已记录', String(data?.cmds.length));
const size = JSON.stringify(data).length;
ok(size < 1024 * 1024, 'R3 回放文件 < 1MB', `${(size / 1024).toFixed(1)}KB`);
console.log(`      指令数=${data?.cmds.length} 大小=${(size / 1024).toFixed(1)}KB 时长=${gA.time.toFixed(1)}s`);

// 基准状态
const hashOf = (g: Game) => {
  let h = 0;
  for (const u of g.units) h = (h * 31 + u.id * 7 + Math.round(u.x * 10) * 13 + Math.round(u.y * 10) * 17 + Math.round(u.hp)) | 0;
  for (const b of g.buildings) h = (h * 31 + b.id * 11 + Math.round(b.hp)) | 0;
  return h;
};
const base = {
  time: gA.time, units: gA.units.length, buildings: gA.buildings.length,
  gold: gA.factions.map(f => Math.floor(f.gold)), hash: hashOf(gA),
};

// ===== 第二遍：回放 =====
console.log('回放复现：');
setSeed(SEED);
const gB = new Game({ decks: [null, null], races: ['elf', 'blood'] });
const aiB = new AIController(gB, 1);
gB.replayMode = true;
let cmdIdx = 0;
for (let i = 0; i < STEPS; i++) {
  const next = gB.stepCount + 1;
  while (cmdIdx < data!.cmds.length && data!.cmds[cmdIdx].s === next) {
    applyCmd(gB, data!.cmds[cmdIdx].c);
    cmdIdx++;
  }
  gB.update(1 / 30);
  aiB.update(1 / 30);
  if (gB.over) break;
}
ok(cmdIdx === data!.cmds.length, 'R4 全部指令已回放', `${cmdIdx}/${data!.cmds.length}`);
ok(gB.time === base.time, 'R5 时间一致', `${gB.time} vs ${base.time}`);
ok(gB.units.length === base.units, 'R6 单位数一致', `${gB.units.length} vs ${base.units}`);
ok(gB.buildings.length === base.buildings, 'R7 建筑数一致', `${gB.buildings.length} vs ${base.buildings}`);
ok(JSON.stringify(gB.factions.map(f => Math.floor(f.gold))) === JSON.stringify(base.gold),
  'R8 经济一致', `${JSON.stringify(gB.factions.map(f => Math.floor(f.gold)))} vs ${JSON.stringify(base.gold)}`);
ok(hashOf(gB) === base.hash, 'R9 状态哈希一致（逐位确定）', `${hashOf(gB)} vs ${base.hash}`);

// ===== 第三遍：不同种子 → 状态应不同（种子生效验证） =====
setSeed(999999);
const gC = new Game({ decks: [null, null], races: ['elf', 'blood'] });
const aiC = new AIController(gC, 1);
for (let i = 0; i < 30 * 30; i++) { gC.update(1 / 30); aiC.update(1 / 30); if (gC.over) break; }
setSeed(SEED);
const gD = new Game({ decks: [null, null], races: ['elf', 'blood'] });
const aiD = new AIController(gD, 1);
for (let i = 0; i < 30 * 30; i++) { gD.update(1 / 30); aiD.update(1 / 30); if (gD.over) break; }
const h1 = hashOf(gC) + '|' + JSON.stringify(gC.factions.map(f => Math.floor(f.gold)));
setSeed(999999);
const gE = new Game({ decks: [null, null], races: ['elf', 'blood'] });
const aiE = new AIController(gE, 1);
for (let i = 0; i < 30 * 30; i++) { gE.update(1 / 30); aiE.update(1 / 30); if (gE.over) break; }
ok(hashOf(gC) === hashOf(gE), 'R10 同种子两次运行一致');
ok(h1 !== (hashOf(gD) + '|' + JSON.stringify(gD.factions.map(f => Math.floor(f.gold)))), 'R11 不同种子状态不同');

console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
