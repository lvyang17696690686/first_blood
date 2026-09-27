// P0 特性系统无头验证（node 运行，不依赖渲染）
import { Game } from '../src/game';
import { UNITS, BUILDINGS } from '../src/config';
import { Unit, Building } from '../src/entities';
import { AIController } from '../src/ai';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}

const g = new Game();
// 测试点均避开野怪营地（tile 坐标见 map.ts 营地/矿点列表）
// P2 新增了守矿/守据点营地，T2 的测试点附近出现了守军 creep，会干扰索敌判定，直接移除全部野怪
for (const c of g.units) if (c.isCreep) c.dead = true;
g.units = g.units.filter(u => !u.dead);

// ---- T1 飞行寻路 ----
const fd = new Unit(UNITS.firedrake, 0, 100, 100);
g.units.push(fd);
fd.setDest(g, 900, 900);
check('飞行单位 path 为直线单点', fd.path !== null && fd.path!.length === 1);
const sw = new Unit(UNITS.swordsman, 0, 100, 100);
g.units.push(sw);
sw.setDest(g, 900, 900);
check('地面单位 path 为寻路结果', sw.path !== null);

// ---- T2a 地面近战不索敌飞行 ----
const sword = new Unit(UNITS.swordsman, 0, 900, 2000);
g.units.push(sword);
const fly = new Unit(UNITS.firedrake, 1, 960, 2000);
g.units.push(fly);
for (let i = 0; i < 40; i++) g.update(1 / 30);
check('近战地面单位不攻击飞行单位', sword.order.type !== 'attack' && sword.resume.type !== 'attack',
  `order=${sword.order.type} resume=${sword.resume.type}`);

// ---- T2b 远程可打飞行 ----
const arch = new Unit(UNITS.archer, 0, 1100, 2000);
g.units.push(arch);
const fly2 = new Unit(UNITS.firedrake, 1, 1190, 2000);
g.units.push(fly2);
for (let i = 0; i < 150; i++) g.update(1 / 30);
check('远程单位可攻击飞行单位', fly2.hp < fly2.maxHp, `hp=${fly2.hp}/${fly2.maxHp}`);

// ---- T3 减速 ----
const fawn = new Unit(UNITS.fawn, 0, 2000, 2000);
g.units.push(fawn);
const victim = new Unit(UNITS.swordsman, 1, 2120, 2000);
g.units.push(victim);
victim.order = { type: 'move', target: { x: 2400, y: 2000 } };
for (let i = 0; i < 150; i++) g.update(1 / 30);
check('丛林小鹿减速/攻击生效', victim.slowTimer > 0 || victim.hp < victim.maxHp,
  `slow=${victim.slowTimer} hp=${victim.hp}`);

// ---- T4 治疗光环（独立 Game 隔离，防止共享场上的野怪/残留单位干扰） ----
{
  const g4 = new Game();
  const treant = new Unit(UNITS.treant, 0, 1300, 2300);
  g4.units.push(treant);
  const wounded = new Unit(UNITS.swordsman, 0, 1360, 2300);
  wounded.hp = 100;
  g4.units.push(wounded);
  for (let i = 0; i < 75; i++) g4.update(1 / 30); // 2.5s
  check('大树人治疗光环回血', wounded.hp > 100, `hp=${wounded.hp}`);
}

// ---- T5 攻击光环 ----
const teacher = new Unit(UNITS.teacher, 0, 1400, 2300);
g.units.push(teacher);
const bufUnit = new Unit(UNITS.swordsman, 0, 1460, 2300);
g.units.push(bufUnit);
for (let i = 0; i < 30; i++) g.update(1 / 30);
check('精灵老师攻击光环叠加', Math.abs(bufUnit.auraAtk - 0.15) < 1e-9, `auraAtk=${bufUnit.auraAtk}`);
check('光环提高实际攻击', bufUnit.effDmg() > bufUnit.dmg);

// ---- T6 闪现斩杀 ----
const assassin = new Unit(UNITS.assassin, 0, 2500, 2500);
g.units.push(assassin);
const prey = new Unit(UNITS.archer, 1, 2650, 2500);
prey.hp = 100;
g.units.push(prey);
assassin.order = { type: 'attackMove', target: { x: 2650, y: 2500 } };
for (let i = 0; i < 240; i++) g.update(1 / 30);
check('月光刺客闪现完成斩杀', prey.dead, `preyHp=${prey.hp}`);

// ---- T7 死亡分裂 ----
const golem = new Unit(UNITS.golem, 0, 2900, 2900);
g.units.push(golem);
g.dealDamage(null, golem, 99999);
check('巨石罗氪死亡分裂3小罗氪', g.units.filter(u => !u.dead && u.def.id === 'golet').length === 3);

// ---- 清理测试杂兵（释放人口，避免影响英雄商店测试） ----
for (const u of g.units) {
  if (u.faction !== 2 && u.def.kind !== 'worker') u.dead = true;
}
g.units = g.units.filter(u => !u.dead);

// ---- T8 英雄商店上限 ----
g.factions[0].tech = 3;
g.factions[0].gold = 5000;   // 补足资源（3名英雄共需 ~580 金 / 280 水晶）
g.factions[0].crystal = 5000;
const arcane = new Building(BUILDINGS.arcane, 0, 20, 20, true);
g.buildings.push(arcane);
let trained = 0;
for (const hid of ['hero', 'princess', 'greendragon']) {
  if (g.trainUnit(0, arcane, hid)) trained++;
}
check('可召唤前3名英雄', trained === 3, `trained=${trained}`);
for (const q of arcane.queue) q.timer = 0.001;
for (let i = 0; i < 5; i++) g.update(1 / 30);
check('3名英雄入场', g.units.filter(u => u.faction === 0 && u.def.kind === 'hero').length === 3);
check('第4名英雄被上限拒绝', !g.trainUnit(0, arcane, 'elder'));

// ---- T9 飞行英雄 ----
const gd = g.units.find(u => u.def.id === 'greendragon');
check('烈焰绿龙是飞行单位', !!gd && gd.flying);

// ---- T10 护盾 ----
const pr = g.units.find(u => u.def.id === 'princess');
if (pr) {
  const guard = new Unit(UNITS.swordsman, 0, pr.x + 50, pr.y);
  g.units.push(guard);
  // 跑几帧让空间哈希收录 guard（实际对局中单位早已在场，无此问题）
  for (let i = 0; i < 3; i++) g.update(1 / 30);
  pr.mana = 200;
  const before = guard.hp;
  const okShield = pr.castSkill(g, 1);
  check('星光庇护施放成功', okShield);
  check('星光庇护附加护盾', guard.shieldHp > 0, `shield=${guard.shieldHp}`);
  g.dealDamage(null, guard, 80);
  check('护盾优先吸收伤害', guard.hp === before && guard.shieldHp < 120,
    `hp=${guard.hp} shield=${guard.shieldHp}`);

  // ---- T11 炮击延迟落弹 ----
  pr.mana = 200;
  pr.skillCooldowns[0] = 0;
  // 目标远离 guard（>170 索敌范围），避免开打污染「延迟期内未落弹」判定
  const target = new Unit(UNITS.swordsman, 1, pr.x + 200, pr.y + 300);
  const hpBefore = target.hp;
  g.units.push(target);
  const ok = pr.castSkillAt(g, 0, target.x, target.y);
  check('炮击施放成功', ok);
  check('延迟期内未落弹', target.hp === hpBefore);
  for (let i = 0; i < 45; i++) g.update(1 / 30);
  check('延迟后落弹造成伤害', target.hp < hpBefore, `hp ${hpBefore}→${target.hp}`);
} else {
  check('princess 入场', false);
}

// ---- T12 召唤树人 ----
// elder 在 T8 被英雄上限拒绝未入场，直接生成
const el = g.spawnUnitAt(UNITS.elder, 0, 3200, 2200);
if (el) {
  el.mana = 200;
  const ok = el.castSkillAt(g, 1, el.x + 120, el.y);
  const spirits = g.units.filter(u => !u.dead && u.def.id === 'treantspirit');
  check('自然之怒召唤2树人（60s存续）', ok && spirits.length === 2 && spirits.every(s => s.lifespan > 0),
    `n=${spirits.length}`);
} else {
  check('elder 入场', false);
}

// ---- T13 AI 全流程压力测试（含新卡池） ----
const g2 = new Game();
const ai = new AIController(g2);
let err: unknown = null;
try {
  for (let i = 0; i < 160 * 30; i++) {
    g2.update(1 / 30);
    ai.update(1 / 30);
    if (g2.over) break;
  }
} catch (e) { err = e; }
check('AI 对抗 160s 无崩溃', !err, String(err));
console.log(`  AI 状态: tech=${g2.factions[1].tech} units=${g2.units.length === 0 ? g2.units.length : g2.units.length} time=${Math.round(g2.time)}s over=${!!g2.over}`);
check('AI 正常运营（升2本）', g2.factions[1].tech >= 2, `tech=${g2.factions[1].tech}`);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
