import { STEP_DT } from './config';
import { Game } from './game';
import type { SaveData } from './game';
import { Renderer } from './renderer';
import { InputController, Camera } from './input';
import { UI } from './ui';
import { AIController } from './ai';
import { Lobby } from './lobby';
import { gameCtl, cycleSpeed } from './ctl';
import type { Deck, Race } from './types';

/** P4：AI 随机可用种族 */
const AI_RACES: Race[] = ['elf', 'blood', 'undead'];

const SAVE_KEY = 'wc_save_v1';

interface StartOpts {
  deck: Deck | null;
  race: Race;
  load?: SaveData;
}

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch { return null; }
}

async function startGame(opts: StartOpts) {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.remove('hidden');
  const container = document.getElementById('game-container')!;

  const game = new Game({
    decks: [opts.deck, null], // AI 卡组由 AIController 随机生成
    races: [opts.race, AI_RACES[Math.floor(Math.random() * AI_RACES.length)]], // P4：AI 随机种族
    load: opts.load, // P5 存档恢复（存在时忽略上面的初始配置）
  });
  const start = game.map.startPositions[game.startSlot[0] ?? 0];
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

  // ===== P5 顶栏控制：暂停 / 倍速 / 存档 / 菜单 =====
  const elPause = document.getElementById('btn-pause') as HTMLButtonElement | null;
  const elSpeed = document.getElementById('btn-speed') as HTMLButtonElement | null;
  const elHint = document.getElementById('pause-hint');
  const syncCtl = () => {
    if (elPause) elPause.textContent = gameCtl.paused ? '▶ 继续' : '⏸ 暂停';
    if (elSpeed) elSpeed.textContent = `${gameCtl.speed}x`;
    if (elHint) elHint.classList.toggle('hidden', !gameCtl.paused);
  };
  elPause?.addEventListener('click', () => { gameCtl.paused = !gameCtl.paused; syncCtl(); });
  elSpeed?.addEventListener('click', () => { cycleSpeed(); syncCtl(); });
  document.getElementById('btn-save')?.addEventListener('click', () => {
    if (game.over) { ui.log('对局已结束，无法存档'); return; }
    try {
      localStorage.setItem(SAVE_KEY, game.serialize());
      ui.log('已保存存档（大厅可继续游戏）');
    } catch { ui.log('存档失败'); }
  });
  document.getElementById('btn-menu')?.addEventListener('click', () => window.location.reload());
  syncCtl();

  // 主循环：固定步长模拟 + 每帧渲染（P5：暂停 + 倍速）
  let acc = 0;
  let last = performance.now();
  renderer.app.ticker.add(() => {
    const now = performance.now();
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > 0.25) frameDt = 0.25; // 切后台回来防暴走

    input.tick(frameDt);

    if (gameCtl.paused) { acc = 0; }
    else {
      acc += frameDt * gameCtl.speed;
      let steps = 0;
      const maxSteps = 2 + Math.ceil(2 * gameCtl.speed);
      while (acc >= STEP_DT && steps < maxSteps) {
        game.update(STEP_DT);
        ai.update(STEP_DT);
        acc -= STEP_DT;
        steps++;
      }
      if (steps >= maxSteps) acc = 0; // 性能不足时丢弃
    }

    ui.tick(frameDt);
  });
}

// 开局流程：主界面 → 选族 → 选卡 → 开战（P5：支持继续游戏）
new Lobby(
  (deck, race) => {
    startGame({ deck, race }).catch(err => {
      console.error(err);
      const el = document.getElementById('loading');
      if (el) el.textContent = '加载失败：' + (err instanceof Error ? err.message : String(err));
    });
  },
  loadSave()
    ? () => {
        const d = loadSave()!;
        startGame({ deck: null, race: 'elf', load: d }).catch(err => {
          console.error(err);
          const el = document.getElementById('loading');
          if (el) el.textContent = '读档失败：' + (err instanceof Error ? err.message : String(err));
        });
      }
    : undefined,
);
