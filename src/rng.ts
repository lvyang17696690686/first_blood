/** P5-d 确定性随机：模拟层统一使用种子随机（回放/联机前提） */

let state = 0;

export function setSeed(seed: number) {
  state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
}

export function getSeed(): number {
  return state;
}

/** mulberry32 — 与 map.ts 同款实现 */
export function rand(): number {
  let a = state;
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state = ((t ^ (t >>> 14)) >>> 0);
  return state / 4294967296;
}
