// ===== 单位特性系统（P0 地基） =====
// 三族所有卡通过组合特性实现差异化，禁止卡内写死逻辑。

export interface AuraDef {
  radius: number;
  /** 攻击力加成比例 0.15 = +15% */
  atk?: number;
  /** 攻速加成比例 */
  atkSpeed?: number;
  /** 移速加成比例 */
  move?: number;
  /** 仅对骷髅系（def.skeleton）友军生效（P4） */
  skeletonsOnly?: boolean;
  label: string;
}

export interface Traits {
  /** 飞行：仅可被远程/对空单位攻击，无视地形直线移动 */
  flying?: boolean;
  /** 对空倍率：可攻击飞行单位，对其伤害 × 此值 */
  antiAir?: number;
  /** 溅射半径（周围敌人受一半伤害） */
  splash?: number;
  /** 攻城倍率：对建筑伤害 × 此值 */
  siege?: number;
  /** 每秒回血 */
  regen?: number;
  /** 光环：范围内友军增益 */
  aura?: AuraDef;
  /** 群体治疗：每秒治疗范围内友军 */
  healAura?: { radius: number; rate: number };
  /** 击杀触发：召唤临时单位 */
  onKillSummon?: { unitId: string; max: number; lifetime: number };
  /** 死亡分裂：死亡时生成小单位 */
  deathSplit?: { unitId: string; count: number };
  /** 暴击 */
  crit?: { chance: number; mult: number };
  /** 减速弹：命中减速 */
  slow?: { amount: number; dur: number };
  /** 闪现斩杀 */
  blinkKill?: { radius: number; mult: number; cd: number };
  /** P3 反伤：受击反弹固定伤害（来源为单位时） */
  thorns?: number;
  /** P3 攻速叠层：每次攻击叠加攻速，上限 max 层 */
  atkStacks?: { per: number; max: number };
  /** P3 冲锋：静止 delay 秒后移速×mult，首次攻击伤害×firstHitMult */
  charge?: { delay: number; mult: number; firstHitMult: number };
  // ---- P4 亡灵特性 ----
  /** 自爆：接近目标或死亡时引爆，对半径内敌人造成 dmg 伤害 */
  selfExplode?: { dmg: number; radius: number };
  /** 瘟疫：攻击命中使目标每秒受 dps 伤害，持续 dur 秒（溅射可传播） */
  plague?: { dps: number; dur: number };
  /** 诅咒：攻击命中降低目标 armor 点护甲，持续 dur 秒 */
  armorCurse?: { amt: number; dur: number };
  /** 偷取增益：攻击命中驱散目标正面增益并自身获得加速 */
  stealBuffs?: boolean;
}

/** 攻击方能否攻击飞行单位：有对空标签，或是远程弹道单位 */
export function canHitAir(unit: { def: { projectile: boolean; traits?: Traits } }): boolean {
  if (unit.def.traits?.antiAir) return true;
  return unit.def.projectile;
}

/** 攻击方对飞行目标的伤害倍率 */
export function airDamageMult(unit: { def: { traits?: Traits } }): number {
  return unit.def.traits?.antiAir ?? 1;
}

/** 生成单位特性文案标签（信息面板用） */
export function traitLabels(t: Traits | undefined): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.flying) out.push('飞行');
  if (t.antiAir) out.push(`对空×${t.antiAir}`);
  if (t.splash) out.push('溅射');
  if (t.siege) out.push(`攻城×${t.siege}`);
  if (t.regen) out.push(`再生${t.regen}/s`);
  if (t.aura) out.push(`光环：${t.aura.label}`);
  if (t.healAura) out.push(`治疗光环 ${t.healAura.rate}/s`);
  if (t.onKillSummon) out.push('击杀召唤');
  if (t.deathSplit) out.push('死亡分裂');
  if (t.crit) out.push(`${Math.round(t.crit.chance * 100)}%暴击×${t.crit.mult}`);
  if (t.slow) out.push(`减速${Math.round(t.slow.amount * 100)}%`);
  if (t.blinkKill) out.push('闪现斩杀');
  if (t.thorns) out.push(`反伤${t.thorns}`);
  if (t.atkStacks) out.push(`攻速叠层×${t.atkStacks.max}`);
  if (t.charge) out.push('冲锋');
  if (t.selfExplode) out.push(`自爆 AoE${t.selfExplode.dmg}`);
  if (t.plague) out.push(`瘟疫 ${t.plague.dps}/s`);
  if (t.armorCurse) out.push(`诅咒降甲${t.armorCurse.amt}`);
  if (t.stealBuffs) out.push('偷取增益');
  return out;
}
