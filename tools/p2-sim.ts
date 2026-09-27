// P2 地图机制无头验证（node 运行，不依赖渲染）
import { Game } from '../src/game';
import { TILE, CAPTURE_COST_NEUTRAL, CAPTURE_COST_ENEMY } from '../src/config';
import { Unit, makeOrb } from '../src/entities';
import { AIController } from '../src/ai';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}
function step(g: Game, sec: number) {
  for (let i = 0; i < Math.round(sec * 30); i++) g.update(1 / 30);
}

// 空间哈希重建（测试中直接 push 单位后调用）
function rebuild(g: Game) {
  g.spatial.clear();
  for (const u of g.units) if (!u.dead) g.spatial.insert(u);
  for (const b of g.buildings) if (!b.dead) g.spatial.insert(b);
}

// ================= 场景 A：矿产占领 =================
{
  const g = new Game();
  g.factions[0].gold = 1000;
  const mine = [...g.resourceNodes.values()].find(n => n.tx === 30 && n.ty === 46)!;
  // 附近守军（33,48 medium 营地）
  const guards = g.units.filter(u => u.isCreep && Math.hypot(u.x - mine.x, u.y - mine.y) < 230);
  check('A1 中场金矿有守军', guards.length > 0, `n=${guards.length}`);

  const cap1 = g.canCapture(0, mine);
  check('A2 守军未清时拒绝占领', !cap1.ok, cap1.reason);

  // 玩家单位靠近但守军未清 → 仍拒绝
  const hero = g.spawnUnitAt({ ...g.units[0].def, id: 'testu', name: '测试兵', kind: 'melee', supply: 0 } as never, 0, mine.x + 60, mine.y) as Unit;
  rebuild(g);
  check('A3 有己方单位在场', g.canCapture(0, mine).reason === '守军尚未清除',
    g.canCapture(0, mine).reason);

  // 清掉守军
  const killer = hero;
  for (const c of guards) g.dealDamage(killer, c, 99999);
  const cap2 = g.canCapture(0, mine);
  check('A4 守军清空后可占领', cap2.ok, cap2.reason);

  const goldBefore = g.factions[0].gold;
  check('A5 占领成功扣费', g.tryCapture(0, mine), `cost=${CAPTURE_COST_NEUTRAL}`);
  check('A6 扣费金额正确', goldBefore - g.factions[0].gold === CAPTURE_COST_NEUTRAL,
    `${goldBefore}→${g.factions[0].gold}`);
  check('A7 矿归属转移', mine.owner === 0, `owner=${mine.owner}`);

  // 产金：income 2.5/s
  step(g, 4);
  // 期间无人采集，只有矿产收入 + 无其他收入（初始无树屋？精灵初始有收入吗——用差值>0判断即可）
  check('A8 占领矿持续产金', g.factions[0].gold > goldBefore - CAPTURE_COST_NEUTRAL + 4 * 2,
    `gold=${g.factions[0].gold}`);
  check('A9 重复占领被拒', !g.tryCapture(0, mine));
}

// ================= 场景 B：据点占领 =================
{
  const g = new Game();
  g.factions[0].gold = 1000;
  const sh = g.buildings.find(b => b.def.kind === 'stronghold' && b.faction === 2)!;
  check('B1 中立据点存在', !!sh && sh.faction === 2);

  // 据点无敌
  const hp0 = sh.hp;
  g.dealDamage(null, sh, 5000);
  check('B2 据点免疫直接伤害', sh.hp === hp0, `hp=${sh.hp}/${hp0}`);

  // 守军未清 → 拒绝
  const guards = g.units.filter(u => u.isCreep && Math.hypot(u.x - sh.x, u.y - sh.y) < 230);
  check('B3 据点有守军', guards.length > 0, `n=${guards.length}`);
  check('B4 守军未清时拒绝占领据点', !g.canCapture(0, sh).ok, g.canCapture(0, sh).reason);

  const hero = g.spawnUnitAt({ ...g.units[0].def, id: 'testu', name: '测试兵', kind: 'melee', supply: 0 } as never, 0, sh.x + 60, sh.y) as Unit;
  rebuild(g);
  for (const c of guards) g.dealDamage(hero, c, 99999);
  const goldBefore = g.factions[0].gold;
  check('B5 占领据点成功', g.tryCapture(0, sh));
  check('B6 据点归属转移且满血', sh.faction === 0 && sh.hp === sh.maxHp, `faction=${sh.faction}`);
  check('B7 据点占领费为中立价', goldBefore - g.factions[0].gold === CAPTURE_COST_NEUTRAL);

  // 据点可出战斗单位
  const okTrain = g.trainUnit(0, sh, 'swordsman');
  check('B8 据点可训练战斗单位', okTrain, 'trainUnit 失败');
  step(g, 12);
  check('B9 据点产兵入场', g.units.some(u => !u.dead && u.faction === 0 && u.def.id === 'swordsman'),
    `units=${g.units.filter(u => u.faction === 0).length}`);

  // 敌方据点占领费 300
  const sh2 = g.buildings.find(b => b.def.kind === 'stronghold' && b.faction === 2)!;
  if (sh2) {
    sh2.faction = 1;
    check('B10 敌方据点占领费 300', g.captureCost(sh2) === CAPTURE_COST_ENEMY,
      `cost=${g.captureCost(sh2)}`);
  }
}

// ================= 场景 C：魔法球 =================
{
  const g = new Game();
  // 安全测试点（远离野怪营地，避免测试单位被打死导致 buff 计时冻结）
  const u = g.spawnUnitAt({ ...g.units[0].def, id: 'testu', name: '测试兵', kind: 'melee', supply: 0 } as never, 0, 400, 2050) as Unit;
  rebuild(g);

  // haste
  g.orbs.push(makeOrb('haste', u.x, u.y));
  const baseSpd = u.moveSpeed;
  step(g, 0.2);
  check('C1 拾取加速球', u.hasteTimer > 0, `timer=${u.hasteTimer}`);
  check('C2 加速球提升移速', u.moveSpeed > baseSpd, `${baseSpd}→${u.moveSpeed}`);
  step(g, 16);
  check('C3 加速 buff 到期消失', u.hasteTimer === 0, `timer=${u.hasteTimer}`);

  // frenzy
  const baseEff = u.effDmg();
  g.orbs.push(makeOrb('frenzy', u.x, u.y));
  step(g, 0.2);
  check('C4 拾取狂暴球', u.frenzyTimer > 0, `timer=${u.frenzyTimer}`);
  check('C5 狂暴球提升攻击', u.effDmg() > baseEff, `${baseEff}→${u.effDmg()}`);

  // goldrain（工人采金可能同时入账，用 >= 判定）
  u.frenzyTimer = 0;
  const gold0 = g.factions[0].gold;
  g.orbs.push(makeOrb('goldrain', u.x, u.y));
  step(g, 0.2);
  check('C6 金雨球加金', g.factions[0].gold >= gold0 + 100, `${gold0}→${g.factions[0].gold}`);

  // 过期消失
  const far = g.spawnUnitAt({ ...g.units[0].def, id: 'testu2', name: '远处兵', kind: 'melee', supply: 0 } as never, 0, 2700, 2700) as Unit;
  rebuild(g);
  g.orbs.push(makeOrb('haste', far.x + 800, far.y + 800));
  step(g, 31);
  check('C7 无人拾取的球会过期', g.orbs.length === 0, `orbs=${g.orbs.length}`);
}

// ================= 场景 D：Boss 击杀 → 掉球 + 转换推线 =================
{
  const g = new Game();
  const killer = g.spawnUnitAt({ ...g.units[0].def, id: 'testu', name: '测试兵', kind: 'melee', supply: 0 } as never, 0, 3000, 3000) as Unit;
  const boss = g.spawnUnitAt({
    id: 'boss', name: '深渊领主', kind: 'melee', tier: 1,
    costGold: 0, costCrystal: 0, buildTime: 0,
    hp: 1300, armor: 3, dmg: 35, range: 36, attackSpeed: 0.7, speed: 60,
    radius: 15, projectile: false, bounty: 0, color: 0x9a4dc9,
  } as never, 2, 2000, 2000) as Unit;
  boss.isCreep = true;
  rebuild(g);
  g.dealDamage(killer, boss, 99999);
  check('D1 Boss 必掉魔法球', g.orbs.length === 1, `orbs=${g.orbs.length}`);
  const conv = g.units.find(u => !u.dead && u.faction === 0 && u.def.id === 'boss');
  check('D2 Boss 转换为我方狂暴单位', !!conv, conv ? conv.def.name : '未找到');
  const enemyMain = g.getMain(1)!;
  if (conv) {
    const d0 = Math.hypot(conv.x - enemyMain.x, conv.y - enemyMain.y);
    step(g, 8);
    const d1 = Math.hypot(conv.x - enemyMain.x, conv.y - enemyMain.y);
    check('D3 狂暴 Boss 向敌方基地推进', d1 < d0 - 100, `${Math.round(d0)}→${Math.round(d1)}`);
  }
}

// ================= 场景 E：侦查开雾 =================
{
  const g = new Game();
  // 地图对角某未探索点
  const tx = 80, ty = 80;
  const fogIdx = ty * g.map.w + tx;
  check('E1 目标区域初始未探索', g.fog[fogIdx] !== 2, `fog=${g.fog[fogIdx]}`);
  g.revealArea(tx * TILE + 16, ty * TILE + 16, 0);
  check('E2 侦查后立即可见', g.fog[fogIdx] === 2, `fog=${g.fog[fogIdx]}`);
  check('E3 侦查区域有计时', g.reveals.length === 1 && g.reveals[0].timer > 0);
  step(g, 9);
  check('E4 侦查效果到期', g.reveals.length === 0, `n=${g.reveals.length}`);
}

// ================= 场景 F：AI 全流程（含占领/推线） =================
{
  const g = new Game();
  const ai = new AIController(g);
  let err: unknown = null;
  try {
    for (let i = 0; i < 200 * 30; i++) {
      g.update(1 / 30);
      ai.update(1 / 30);
      if (g.over) break;
    }
  } catch (e) { err = e; }
  check('F1 AI 200s 无崩溃', !err, String(err));
  const capped = [...g.resourceNodes.values()].some(n => n.owner === 1) ||
    g.buildings.some(b => b.def.kind === 'stronghold' && b.faction === 1);
  console.log(`  AI 状态: tech=${g.factions[1].tech} gold=${Math.floor(g.factions[1].gold)} time=${Math.round(g.time)}s over=${!!g.over} 占领=${capped}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
