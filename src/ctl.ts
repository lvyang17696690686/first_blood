/** P5 对局运行控制（暂停/倍速）：main 与 input 共享的单例状态 */
export const gameCtl = { paused: false, speed: 1 };
export const SPEEDS = [1, 2, 4];

export function cycleSpeed(): number {
  const i = SPEEDS.indexOf(gameCtl.speed);
  gameCtl.speed = SPEEDS[(i + 1) % SPEEDS.length];
  return gameCtl.speed;
}
