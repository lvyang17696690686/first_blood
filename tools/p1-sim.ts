// P1 卡组与对战内科技无头验证（node 运行，不依赖渲染）
import { Game } from '../src/game';
import { UNITS, BUILDINGS, UNIT_TECH_TIME, UNIT_TECH_MAX, HERO_SKILL_COST, STEP_DT } from '../src/config';
import { Unit, Building } from '../src/entities';
import { AIController, randomElfDeck } from '../src/ai';
import type { Deck } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}

// ---- T1 卡组限制训练 ----
{
  const deck: Deck = {
    units: ['swordsman', 'archer', 'treant', 'fawn', 'firedrake', 'thunderer'],
    heroes: ['hero', 'princess', 'elder'],
  };
  const g = new Game({ decks: [deck, null] });
  // 在主基地旁放置已完工兵营/科技所
  const main = g.getMain(0)!;
  const bx = Math.floor(main.x / 32) + 5, by = Math.floor(main.y / 32);
  const bar = new Building(BUILDINGS.barracks, 0, bx, by, true);
  g.buildings.push(bar);
  g.map.blockRect(bx, by, 3, 3, 2);
  const ax = bx + 4;
  const arc = new Building(BUILDINGS.arcane, 0, ax, by, true);
  g.buildings.push(arc);
  g.map.blockRect(ax, by, 2, 2, 2);
  g.factions[0].gold = 5000;
  g.factions[0].crystal = 2000;
  g.factions[0].tech = 3;

  check('卡组内单位可训练', g.trainUnit(0, bar, 'swordsman'));
  bar.queue.length = 0;
  check('卡组外单位被拒绝', !g.trainUnit(0, bar, 'golem'));
  check('卡组外单位被拒绝(兵营2)', !g.trainUnit(0, bar, 'chariot'));
  check('卡组内英雄可训练', g.trainUnit(0, arc, 'hero'));
  arc.queue.length = 0;
  check('卡组外英雄被拒绝', !g.trainUnit(0, arc, 'greendragon'));
  check('工人不受卡组限制', g.trainUnit(0, g.getMain(0)!, 'worker'));
}

// ---- T2 兵种科技：+10%/级 攻/血 ----
{
  const g = new Game();
  const main = g.getMain(0)!;
  const bx = Math.floor(main.x / 32) + 5, by = Math.floor(main.y / 32);
  const bar = new Building(BUILDINGS.barracks, 0, bx, by, true);
  g.buildings.push(bar);
  g.map.blockRect(bx, by, 3, 3, 2);
  g.factions[0].gold = 5000;

  const u = new Unit(UNITS.swordsman, 0, main.x + 120, main.y);
  g.units.push(u);
  const baseDmg = u.effDmg();
  const baseHp = u.maxHp;

  check('科技可开始研究', g.startUnitTech(0, bar, 'swordsman'));
  check('研究期间不能二次研究', !g.startUnitTech(0, bar, 'archer'));
  check('研究字段已建立', bar.research !== null && bar.research.unitId === 'swordsman');

  // 推进时间直到研究完成
  let steps = Math.ceil(UNIT_TECH_TIME / STEP_DT) + 5;
  while (steps-- > 0 && bar.research) g.update(STEP_DT);
  check('研究完成科技+1', g.unitTechLevel(0, 'swordsman') === 2, `lv=${g.unitTechLevel(0, 'swordsman')}`);
  check('存量单位等级同步', u.techLevel === 2);
  check('攻击+10%', Math.abs(u.effDmg() - baseDmg * 1.1) < 0.01, `${u.effDmg()} vs ${baseDmg * 1.1}`);
  check('血量+10%', Math.abs(u.maxHp - baseHp * 1.1) <= 1, `${u.maxHp} vs ${baseHp * 1.1}`);

  // 升到 3 级
  check('可继续升3级', g.startUnitTech(0, bar, 'swordsman'));
  steps = Math.ceil(UNIT_TECH_TIME / STEP_DT) + 5;
  while (steps-- > 0 && bar.research) g.update(STEP_DT);
  check('满级3', g.unitTechLevel(0, 'swordsman') === UNIT_TECH_MAX);
  check('满级后不能再升', !g.startUnitTech(0, bar, 'swordsman'));

  // 新训练单位继承等级
  g.trainUnit(0, bar, 'swordsman');
  const item = bar.queue[0];
  item.timer = 0.01;
  g.update(STEP_DT);
  const fresh = g.units.find(x => x.def.id === 'swordsman' && x !== u);
  check('新训练单位继承科技', !!fresh && fresh.techLevel === 3, `lv=${fresh?.techLevel}`);

  // 与队列并行：训练时也能研究
  check('队列与研究并行', g.trainUnit(0, bar, 'archer') && g.startUnitTech(0, bar, 'archer'));
}

// ---- T3 英雄技能升级 +25%/级 ----
{
  const g = new Game();
  g.factions[0].gold = 5000;
  const hero = new Unit(UNITS.hero, 0, 1500, 2400);
  g.units.push(hero);
  const victim = new Unit(UNITS.swordsman, 1, 1500, 2440); // 近身，armor 2
  g.units.push(victim);
  victim.armor = 0;
  victim.hp = victim.maxHp = 1000;

  check('技能初始 Lv1', hero.skillLevels[0] === 1);
  check('升级花费=150×当前级', g.heroSkillCost(1) === HERO_SKILL_COST);
  check('技能可升级', g.upgradeHeroSkill(0, hero, 0));
  check('技能升至 Lv2', hero.skillLevels[0] === 2);
  check('金币已扣', g.factions[0].gold === 5000 - 150);
  // 手动重建空间哈希（跳过 game.update 以免单位 AI 干扰测量）
  g.spatial.clear();
  for (const u of g.units) if (!u.dead) g.spatial.insert(u);
  // Lv1 shockwave 60 → Lv2 75
  check('升级后施放成功', hero.castSkill(g, 0));
  check('伤害+25%（60→75）', Math.abs(victim.maxHp - victim.hp - 75) < 0.01, `实际伤害=${victim.maxHp - victim.hp}`);
  // 满 3 级
  g.upgradeHeroSkill(0, hero, 0);
  check('升至 Lv3', hero.skillLevels[0] === 3);
  check('满级不能再升', !g.upgradeHeroSkill(0, hero, 0));
}

// ---- T4 AI 卡组感知 + 富余升级 ----
{
  const g = new Game();
  const ai = new AIController(g);
  check('AI 自动生成卡组', ai.deck.units.length === 6 && ai.deck.heroes.length === 3);
  check('AI 卡组写回 game.decks', g.decks[1] === ai.deck);
  const rnd = randomElfDeck();
  check('randomElfDeck 结构正确', rnd.units.length === 6 && rnd.heroes.length === 3 &&
    rnd.units.every(id => !id.includes('worker')));

  // 给 AI 巨额资源，跑 6 分钟模拟：训练出的战斗单位必须都在卡组内
  g.factions[1].gold = 99999;
  g.factions[1].crystal = 9999;
  const total = 360 / STEP_DT;
  let violation = 0;
  let trained = 0;
  for (let i = 0; i < total; i++) {
    g.update(STEP_DT);
    ai.update(STEP_DT);
    if (i % 60 === 0) {
      for (const u of g.units) {
        if (u.dead || u.faction !== 1 || u.isCreep) continue;
        if (u.def.kind === 'worker') continue;
        if (u.summonedBy) continue;
        // P2 转换的狂暴野怪（击杀 troll/boss 获得）不属卡组体系
        if (u.def.id === 'troll' || u.def.id === 'boss') continue;
        const ok = u.def.kind === 'hero' ? ai.deck.heroes.includes(u.def.id) : ai.deck.units.includes(u.def.id);
        if (!ok) violation++;
        else if (u.def.kind !== 'hero') trained++;
      }
    }
  }
  check('AI 训练单位全部在卡组内', violation === 0, `违规${violation}`);
  check('AI 有实际产出', trained > 5, `trained=${trained}`);
  const anyTech = Object.values(g.factions[1].unitTech);
  check('AI 富余时升级兵种科技', anyTech.some(lv => lv >= 2), JSON.stringify(g.factions[1].unitTech));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
