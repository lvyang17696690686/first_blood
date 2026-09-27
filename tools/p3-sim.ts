// P3 血兽族无头验证（node 运行，不依赖渲染）
import { Game } from '../src/game';
import { UNITS, BUILDINGS, DECK_UNIT_POOL, DECK_HERO_POOL,
  DECK_UNIT_POOL_BLOOD, DECK_HERO_POOL_BLOOD, RACE_BUILDINGS } from '../src/config';
import { Unit, Building } from '../src/entities';
import { AIController, randomBloodDeck } from '../src/ai';
import { airDamageMult, canHitAir } from '../src/traits';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}
function step(g: Game, sec: number) {
  for (let i = 0; i < Math.round(sec * 30); i++) g.update(1 / 30);
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
/** 高血量测试靶子（enemy 侧） */
function mkDummy(g: Game, faction: 0 | 1, x: number, y: number, hp = 99999, armor = 0): Unit {
  const def = { ...UNITS.bfighter, id: 'dummy', name: '靶子', hp, armor, bounty: 0 } as typeof UNITS.bfighter;
  const u = new Unit(def, faction, x, y);
  u.order = { type: 'idle' };
  g.units.push(u);
  return u;
}
/** 测试空地：远离野怪营地与双方基地 */
const ARENA = { x: 400, y: 2050 };

// ================= 场景 A：血兽开局 =================
{
  console.log('场景 A：血兽开局');
  const g = new Game({ races: ['blood', 'elf'] });
  check('A1 血兽主基地为战争图腾', g.buildings.some(b => b.faction === 0 && b.def.id === 'totem' && b.def.kind === 'main'));
  const bworkers = g.units.filter(u => u.faction === 0 && u.def.id === 'bworker');
  check('A2 血兽初始 5 苦工', bworkers.length === 5, `n=${bworkers.length}`);
  check('A3 精灵方仍为生命古树+工匠',
    g.buildings.some(b => b.faction === 1 && b.def.id === 'main') &&
    g.units.some(u => u.faction === 1 && u.def.id === 'worker'));
  check('A4 RACE_BUILDINGS 血兽映射正确',
    RACE_BUILDINGS.blood.main === 'totem' && RACE_BUILDINGS.blood.house === 'pen' &&
    RACE_BUILDINGS.blood.barracks === 'bloodcamp' && RACE_BUILDINGS.blood.extractor === 'lavaaltar' &&
    RACE_BUILDINGS.blood.arcane === 'prophecy' && RACE_BUILDINGS.blood.tower === 'bloodtower');

  // 血兽兵营出兵（直接放置已完成建筑）
  const hall = g.getMain(0)!;
  const camp = new Building(BUILDINGS.bloodcamp, 0, hall.tx + 5, hall.ty + 5, true);
  g.buildings.push(camp);
  g.factions[0].gold = 2000; g.factions[0].crystal = 500;
  check('A5 血兽兵营可训练血兽兵', g.trainUnit(0, camp, 'bfighter'));
  step(g, 10);
  check('A6 血兽兵入场', g.units.some(u => !u.dead && u.faction === 0 && u.def.id === 'bfighter'));
  // 苦工可从图腾训练
  check('A9 图腾训练苦工', g.trainUnit(0, hall, 'bworker'));
}

// ================= 场景 B：单位特性 =================
{
  console.log('场景 B：单位特性');
  const g = new Game({ races: ['blood', 'elf'] });
  g.factions[0].gold = 3000;

  // B1 反伤
  const bull = new Unit(UNITS.shieldbull, 0, ARENA.x, ARENA.y);
  const atk = mkDummy(g, 1, ARENA.x + 20, ARENA.y, 99999, 0);
  g.units.push(bull);
  rebuild(g);
  const hp0 = atk.hp;
  g.dealDamage(atk, bull, 10);
  const expectBack = Math.max(1, 6 - atk.armor);
  check('B1 巨盾黑牛反伤 6', atk.hp === hp0 - expectBack, `hp=${atk.hp}/${hp0}`);

  // B2 攻速叠层
  const wolf = new Unit(UNITS.fangwolf, 0, ARENA.x, ARENA.y + 200);
  const dummy2 = mkDummy(g, 1, ARENA.x + 2, ARENA.y + 200);
  g.units.push(wolf);
  rebuild(g);
  for (let i = 0; i < 6; i++) wolf.chaseAndAttack(g, dummy2, 1.1);
  check('B2 人狼攻速叠层上限 5', wolf.atkStacksCount === 5, `stacks=${wolf.atkStacksCount}`);
  check('B3 叠层攻速 +30%', Math.abs(wolf.spdMult - 1.3) < 1e-6, `spdMult=${wolf.spdMult}`);

  // B4 冲锋
  const knight = new Unit(UNITS.chainknight, 0, ARENA.x, ARENA.y + 400);
  g.units.push(knight);
  rebuild(g);
  check('B4 冲锋未就绪移速正常', Math.abs(knight.moveSpeed - knight.speed) < 1e-6);
  step(g, 2.3);
  check('B5 静止 2 秒冲锋就绪', knight.chargePrimed, `static=${knight.chargeStatic.toFixed(2)}`);
  check('B6 冲锋移速 ×2.5', Math.abs(knight.moveSpeed - knight.speed * 2.5) < 1e-6,
    `ms=${knight.moveSpeed.toFixed(1)}`);
  const dummy3 = mkDummy(g, 1, knight.x + 10, knight.y);
  rebuild(g);
  const d3hp0 = dummy3.hp;
  knight.chaseAndAttack(g, dummy3, 0.1);
  const expect = Math.max(1, UNITS.chainknight.dmg * 2 - dummy3.armor);
  check('B7 冲锋首击伤害 ×2', dummy3.hp === d3hp0 - expect, `loss=${d3hp0 - dummy3.hp}`);
  check('B8 首击后冲锋消耗', !knight.chargePrimed);

  // B9 暴击（统计 300 次攻击平均倍率 ≈ 1.25）
  const axeman = new Unit(UNITS.axethrower, 0, ARENA.x, ARENA.y + 600);
  const dummy4 = mkDummy(g, 1, ARENA.x + 30, ARENA.y + 600);
  g.units.push(axeman);
  rebuild(g);
  const d4hp0 = dummy4.hp;
  for (let i = 0; i < 300; i++) axeman.chaseAndAttack(g, dummy4, 1.5);
  step(g, 3); // 弹道结算
  const avgMult = (d4hp0 - dummy4.hp) / 300 / UNITS.axethrower.dmg;
  check('B9 掷斧手暴击期望 ≈1.25', avgMult > 1.05 && avgMult < 1.45, `avg=${avgMult.toFixed(3)}`);

  // B10 治疗光环
  const doc = new Unit(UNITS.witchdoc, 0, ARENA.x, ARENA.y + 800);
  const wounded = mkDummy(g, 0, ARENA.x + 20, ARENA.y + 800, 99999);
  wounded.hp = 500;
  g.units.push(doc);
  rebuild(g);
  const whp0 = wounded.hp;
  step(g, 2.1);
  const healed = wounded.hp - whp0;
  check('B10 巫医治疗光环 ≈24/2s', healed > 18 && healed < 30, `healed=${healed.toFixed(1)}`);

  // B11 再生
  const lava = new Unit(UNITS.lavabeast, 0, ARENA.x, ARENA.y + 1000);
  g.units.push(lava);
  rebuild(g);
  lava.hp = 500;
  const lhp0 = lava.hp;
  step(g, 2.1);
  const regen = lava.hp - lhp0;
  check('B11 熔岩巨兽再生 ≈10/2s', regen > 7 && regen < 14, `regen=${regen.toFixed(1)}`);

  // B12 萨满光环
  const shaman = new Unit(UNITS.shaman, 0, ARENA.x, ARENA.y + 1200);
  const ally = mkDummy(g, 0, ARENA.x + 20, ARENA.y + 1200, 99999);
  g.units.push(shaman);
  rebuild(g);
  step(g, 0.6);
  check('B12 萨满光环攻速+20% 移速+15%',
    Math.abs(ally.auraSpd - 0.2) < 1e-6 && Math.abs(ally.auraMove - 0.15) < 1e-6,
    `spd=${ally.auraSpd} mv=${ally.auraMove}`);

  // B13 对空倍率
  const frog = new Unit(UNITS.spearfrog, 0, 0, 0);
  check('B13 矛毒蛙可对空且倍率 1.25', canHitAir(frog) && airDamageMult(frog) === 1.25);
}

// ================= 场景 C：英雄技能 =================
{
  console.log('场景 C：英雄技能');
  const g = new Game({ races: ['blood', 'elf'] });

  // C1/C2 布雷德：旋风斩 + 狂暴
  const brade = new Unit(UNITS.brade, 0, ARENA.x, ARENA.y);
  const foe1 = mkDummy(g, 1, ARENA.x + 30, ARENA.y);
  g.units.push(brade);
  rebuild(g);
  const f1hp0 = foe1.hp;
  brade.castSkill(g, 0);
  check('C1 旋风斩造成 70 伤害', foe1.hp === f1hp0 - Math.max(1, 70 - foe1.armor),
    `loss=${f1hp0 - foe1.hp}`);
  brade.castSkill(g, 1);
  check('C2 狂暴攻速 +50% 持续 5s', brade.rageTimer > 4.5 && Math.abs(brade.spdMult - 1.5) < 1e-6,
    `timer=${brade.rageTimer.toFixed(2)} spd=${brade.spdMult.toFixed(2)}`);

  // C3/C4 西尔：雷暴 3 段 + 熔岩裂隙
  const syl = new Unit(UNITS.syl, 0, ARENA.x, ARENA.y + 300);
  const foe2 = mkDummy(g, 1, ARENA.x + 300, ARENA.y + 300);
  g.units.push(syl);
  rebuild(g);
  syl.castSkillAt(g, 0, foe2.x, foe2.y);
  check('C3a 雷暴进入落雷队列', g.pendingStrikes.length === 1);
  const f2hp0 = foe2.hp;
  step(g, 2.2);
  const f2loss = f2hp0 - foe2.hp;
  check('C3b 雷暴 3 段共 120 伤害', Math.abs(f2loss - 3 * Math.max(1, 40 - foe2.armor)) < 0.01,
    `loss=${f2loss.toFixed(1)}`);
  check('C3c 落雷队列清空', g.pendingStrikes.length === 0);
  syl.castSkillAt(g, 1, foe2.x, foe2.y);
  check('C4a 熔岩裂隙生成', g.dotZones.length === 1);
  const f2hp1 = foe2.hp;
  step(g, 5.6);
  const dotLoss = f2hp1 - foe2.hp;
  check('C4b 裂隙 DoT ≈125/5s', dotLoss >= 110 && dotLoss <= 145, `loss=${dotLoss.toFixed(1)}`);
  check('C4c 裂隙到期消散', g.dotZones.length === 0);

  // C5 妒昆：灵魂操控 + 归还
  const dukun = new Unit(UNITS.dukun, 0, ARENA.x, ARENA.y + 600);
  const foe3 = mkDummy(g, 1, ARENA.x + 610, ARENA.y + 600);
  g.units.push(dukun);
  rebuild(g);
  dukun.castSkillAt(g, 0, foe3.x, foe3.y);
  check('C5a 灵魂操控夺取单位', foe3.faction === 0 && foe3.originalFaction === 1 && foe3.charmedTimer > 7);
  step(g, 8.6);
  check('C5b 8 秒后归还原阵营', foe3.faction === 1 && foe3.originalFaction === null && foe3.charmedTimer === 0,
    `faction=${foe3.faction}`);
  // C6 群体暗愈
  const ally1 = mkDummy(g, 0, dukun.x + 20, dukun.y, 99999);
  ally1.hp = 300;
  rebuild(g);
  dukun.castSkill(g, 1);
  check('C6 群体暗愈 +85', ally1.hp === 300 + Math.min(85, ally1.maxHp - 300) || ally1.hp === 385,
    `hp=${ally1.hp}`);

  // C7/C8 卡达：凝视 + 图腾壁垒
  const kada = new Unit(UNITS.kada, 0, ARENA.x, ARENA.y + 900);
  const foe4 = mkDummy(g, 1, ARENA.x + 930, ARENA.y + 900);
  const ally2 = mkDummy(g, 0, ARENA.x + 20, ARENA.y + 930, 99999); // 位于壁垒半径内
  g.units.push(kada);
  rebuild(g);
  const effBefore = foe4.effDmg();
  kada.castSkillAt(g, 0, foe4.x, foe4.y);
  check('C7a 凝视降攻 40%', Math.abs(foe4.atkDebuffMult - 0.6) < 1e-6 && Math.abs(foe4.effDmg() - effBefore * 0.6) < 1e-6,
    `mult=${foe4.atkDebuffMult}`);
  step(g, 4.2);
  check('C7b 凝视 4s 后恢复', foe4.atkDebuffMult === 1 && Math.abs(foe4.effDmg() - effBefore) < 1e-6);
  kada.castSkill(g, 1);
  check('C8 图腾壁垒护盾 150', ally2.shieldHp === 150, `shield=${ally2.shieldHp}`);

  // C9 护盾优先吸收（配合壁垒验证 dealDamage 护盾路径）
  const kada2 = new Unit(UNITS.kada, 0, ARENA.x, ARENA.y + 1200);
  const shielded = mkDummy(g, 0, ARENA.x + 20, ARENA.y + 1200, 99999);
  g.units.push(kada2);
  rebuild(g);
  kada2.castSkill(g, 1);
  const shp = shielded.hp;
  g.dealDamage(mkDummy(g, 1, ARENA.x + 40, ARENA.y + 1200), shielded, 60);
  check('C9 护盾吸收伤害', shielded.hp === shp && shielded.shieldHp === 90, `shield=${shielded.shieldHp}`);
}

// ================= 场景 D：卡组与血兽 AI =================
{
  console.log('场景 D：卡组与血兽 AI');
  for (let i = 0; i < 20; i++) {
    const d = randomBloodDeck();
    const okUnits = d.units.length === 6 && d.units.every(id => (DECK_UNIT_POOL_BLOOD as readonly string[]).includes(id));
    const okHeroes = d.heroes.length === 3 && d.heroes.every(id => (DECK_HERO_POOL_BLOOD as readonly string[]).includes(id));
    if (!okUnits || !okHeroes) { check('D1 血兽卡组随机生成合规', false, JSON.stringify(d)); break; }
    if (i === 19) check('D1 血兽卡组随机生成合规（20 次）', true);
  }

  // D2 血兽 AI 建造血兽建筑并出兵
  const g = new Game({ races: ['elf', 'blood'] });
  const ai = new AIController(g, 1);
  stepAI(g, 80, [ai]);
  const aiB = g.buildings.filter(b => !b.dead && b.faction === 1);
  check('D2 血兽 AI 建造血兽兵营', aiB.some(b => b.def.id === 'bloodcamp' && b.built),
    `b=${aiB.map(b => b.def.id).join(',')}`);
  check('D3 血兽 AI 不建精灵建筑', !aiB.some(b => b.def.id === 'barracks' || b.def.id === 'arcane'));
  const bloodTroops = g.units.filter(u => !u.dead && u.faction === 1 &&
    (DECK_UNIT_POOL_BLOOD as readonly string[]).includes(u.def.id));
  check('D4 血兽 AI 出血兽兵', bloodTroops.length > 0, `n=${bloodTroops.length}`);
  check('D5 AI 卡组合规', ai.deck.units.every(id => (DECK_UNIT_POOL_BLOOD as readonly string[]).includes(id)) &&
    ai.deck.heroes.every(id => (DECK_HERO_POOL_BLOOD as readonly string[]).includes(id)));
  check('D6 血兽 AI 工人为苦工',
    g.units.filter(u => !u.dead && u.faction === 1 && u.def.kind === 'worker')
      .every(u => u.def.id === 'bworker'));
}

// ================= 场景 E：血兽 vs 精灵 20 局平衡 =================
{
  console.log('场景 E：血兽 vs 精灵 平衡模拟（30 局，上限 480 秒）');
  let elfWin = 0, bloodWin = 0, draw = 0;
  let deckOk = true;
  for (let i = 0; i < 30; i++) {
    const g = new Game({ races: ['elf', 'blood'] });
    const ai0 = new AIController(g, 0);
    const ai1 = new AIController(g, 1);
    stepAI(g, 480, [ai0, ai1]);
    // 卡组合规抽查（首局）
    if (i === 0) {
      for (const f of [0, 1] as const) {
        const race = g.races[f];
        const pool = race === 'blood'
          ? [...DECK_UNIT_POOL_BLOOD, ...DECK_HERO_POOL_BLOOD]
          : [...DECK_UNIT_POOL, ...DECK_HERO_POOL];
        for (const u of g.units) {
          if (u.dead || u.faction !== f || u.isCreep) continue;
          if (u.def.id === 'troll' || u.def.id === 'boss') continue; // P2 转换野怪
          if (u.def.kind === 'worker' || u.def.costGold === 0) continue;
          if (!(pool as readonly string[]).includes(u.def.id)) { deckOk = false; }
        }
      }
    }
    if (!g.over) draw++;
    else if (g.over.win) elfWin++;
    else bloodWin++;
    process.stdout.write(`  局${i + 1}: ${!g.over ? '平局' : g.over.win ? '精灵胜' : '血兽胜'}（${Math.round(g.time)}s）\n`);
  }
  const decided = elfWin + bloodWin;
  const rate = decided > 0 ? bloodWin / decided : 0;
  // 防死锁判据：对局能正常分出胜负即可（精细胜率平衡留到 P4 balance-sim 三族统调）
  check('E1 30 局中 ≥10 局分出胜负（无死锁）', decided >= 10, `elf=${elfWin} blood=${bloodWin} draw=${draw}`);
  // 双向可赢（路线图 P3 验收原意）；精细胜率平衡留到 P4 balance-sim 三族统调
  check('E2 血兽 vs 精灵 双向可赢', elfWin >= 2 && bloodWin >= 2,
    `elf=${elfWin} blood=${bloodWin}（decided 中血兽 ${(rate * 100).toFixed(0)}%）`);
  check('E3 出战单位均在卡组内', deckOk);
}

console.log(`\nP3 模拟结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
