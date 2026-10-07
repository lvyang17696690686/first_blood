import { STEP_DT } from './config';
import { Game } from './game';
import { Renderer } from './renderer';
import { InputController, Camera } from './input';
import { UI } from './ui';
import { AIController } from './ai';
import { Lobby } from './lobby';
import type { Deck, Race } from './types';

/** P4：AI 随机可用种族 */
const AI_RACES: Race[] = ['elf', 'blood', 'undead'];

async function startGame(playerDeck: Deck, playerRace: Race) {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.remove('hidden');
  const container = document.getElementById('game-container')!;

  const game = new Game({
    decks: [playerDeck, null], // AI 卡组由 AIController 随机生成
    races: [playerRace, AI_RACES[Math.floor(Math.random() * AI_RACES.length)]], // P4：AI 随机种族
  });
  const start = game.map.startPositions[0];
  const camera = new Camera(start.x, start.y + 80);

  const renderer = await Renderer.create(game, camera, container);
  const input = new InputController(game, renderer);
  const ui = new UI(game, input, renderer);
  input.ui = ui;
  renderer.input = input;
  const ai = new AIController(game);

  // 调试句柄
  (window as any).__game = game;
  (window as any).__ai = ai;
  (window as any).__dbg = { renderer, input, camera };

  game.onLog = msg => ui.log(msg);
  game.onVictory = win => ui.showVictory(win);
  ui.hideLoading();

  // 主循环：固定步长模拟 + 每帧渲染
  let acc = 0;
  let last = performance.now();
  renderer.app.ticker.add(() => {
    const now = performance.now();
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > 0.25) frameDt = 0.25; // 切后台回来防暴走

    input.tick(frameDt);

    acc += frameDt;
    let steps = 0;
    while (acc >= STEP_DT && steps < 5) {
      game.update(STEP_DT);
      ai.update(STEP_DT);
      acc -= STEP_DT;
      steps++;
    }
    if (steps >= 5) acc = 0; // 性能不足时丢弃

    ui.tick(frameDt);
  });
}

// 开局流程：主界面 → 选族 → 选卡 → 开战
new Lobby((deck, race) => {
  startGame(deck, race).catch(err => {
    console.error(err);
    const el = document.getElementById('loading');
    if (el) el.textContent = '加载失败：' + (err instanceof Error ? err.message : String(err));
  });
});
