import { STEP_DT } from './config';
import { Game } from './game';
import type { SaveData } from './game';
import { Renderer } from './renderer';
import { InputController, Camera } from './input';
import { UI } from './ui';
import { AIController } from './ai';
import { Lobby } from './lobby';
import { gameCtl, cycleSpeed } from './ctl';
import type { Deck, Faction, Race } from './types';

/** P4：AI 随机可用种族 */
const AI_RACES: Race[] = ['elf', 'blood', 'undead'];

const SAVE_KEY = 'wc_save_v1';

interface StartOpts {
  deck: Deck | null;
  race: Race;
  teamSize?: 1 | 2 | 3;
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

  // P5 多阵营：nF = 2*teamSize + 1（编号：0=P1, 1=E1, 3=P2, 4=E2, 5=P3, 6=E3, 2=野怪）
  const teamSize = (opts.load?.teamSize as 1 | 2 | 3 | undefined) ?? opts.teamSize ?? 1;
  const nF = 2 * teamSize + 1;
  const aiRaces = () => AI_RACES[Math.floor(Math.random() * AI_RACES.length)];
  const races: (Race | null)[] = new Array(nF).fill(null);
  races[0] = opts.race;
  for (let f = 1; f < nF; f++) if (f !== 2) races[f] = aiRaces();

  const game = new Game({
    decks: races.map(r => null), // 卡组由 AIController 随机生成；玩家卡组下面写回
    races: races as Race[],
    teamSize,
    load: opts.load, // P5 存档恢复（存在时忽略上面的初始配置）
  });
  // 玩家卡组写回（读档时忽略）
  if (!opts.load) game.decks[0] = opts.deck;
  const start = game.map.startPositions[game.startSlot[0] ?? 0];
  const camera = new Camera(start.x, start.y + 80);

  const renderer = await Renderer.create(game, camera, container);
  const input = new InputController(game, renderer);
  const ui = new UI(game, input, renderer);
  input.ui = ui;
  renderer.input = input;

  // P5：为所有 AI 阵营创建控制器（0=玩家、2=野怪除外）
  const ais: AIController[] = [];
  for (let f = 1; f < nF; f++) {
    if (f === 2) continue;
    ais.push(new AIController(game, f as Faction));
  }

  // 调试句柄
  (window as any).__game = game;
  (window as any).__ai = ais;
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
        for (const a of ais) a.update(STEP_DT);
        acc -= STEP_DT;
        steps++;
      }
      if (steps >= maxSteps) acc = 0; // 性能不足时丢弃
    }

    ui.tick(frameDt);
  });
}

// 开局流程：主界面 → 选模式/选族 → 选卡 → 开战（P5：支持继续游戏）
new Lobby(
  (deck, race, teamSize) => {
    startGame({ deck, race, teamSize }).catch(err => {
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
