// 诊断亡灵 AI 0 胜根因：1 局亡灵 vs 精灵，每 30s 打印 AI 状态快照
import { Game } from '../src/game';
import { AIController } from '../src/ai';

function stepAI(g: Game, sec: number, ais: AIController[]) {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    g.update(1 / 30);
    for (const ai of ais) ai.update(1 / 30);
    if (g.over) break;
  }
}

function snap(g: Game, ais: AIController[], t: number) {
  for (const ai of ais) {
    const f = ai.faction;
    const race = g.races[f];
    const fac = g.factions[f];
    const bld = g.buildings.filter(b => !b.dead && b.faction === f).map(b => `${b.def.id}${b.built ? '' : '(中)'}${b.techUpgrade ? '+T' + b.techUpgrade.to : ''}`);
    const units = g.units.filter(u => !u.dead && u.faction === f);
    const byKind: Record<string, number> = {};
    for (const u of units) byKind[u.def.id] = (byKind[u.def.id] || 0) + 1;
    const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const u of units) byTier[u.def.tier] = (byTier[u.def.tier] || 0) + 1;
    console.log(`  t=${Math.round(t)}s [${race} f${f}] g=${fac.gold} c=${fac.crystal} techT${fac.tech} sup=${g.supplyUsed(f)}/${g.supplyCap(f)}`);
    console.log(`    建筑: ${bld.join(', ') || '(无)'}`);
    console.log(`    兵: ${units.length}  按等级: T1=${byTier[1]} T2=${byTier[2]} T3=${byTier[3]}`);
    console.log(`    组成: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(', ')}`);
  }
  console.log('');
}

const g = new Game({ races: ['elf', 'undead'] });
const ai0 = new AIController(g, 0);
const ai1 = new AIController(g, 1);
const ais = [ai0, ai1];

console.log('=== 对局开始：精灵(f0) vs 亡灵(f1) ===\n');
for (let sec = 0; sec < 480; sec += 30) {
  snap(g, ais, sec);
  stepAI(g, 30, ais);
  if (g.over) { snap(g, ais, g.time); break; }
}
if (!g.over) console.log('*** 480s 未分胜负 ***');
else console.log(g.over.win ? '*** 精灵胜 ***' : '*** 亡灵胜 ***');
