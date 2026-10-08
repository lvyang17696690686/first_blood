import { STEP_DT } from './config';
import { Game } from './game';
import type { SaveData } from './game';
import { SCENARIOS } from './scenario';
import { Renderer } from './renderer';
import { InputController, Camera } from './input';
import { UI } from './ui';
import { AIController } from './ai';
import { Lobby } from './lobby';
import { gameCtl, cycleSpeed } from './ctl';
import { recStart, recStop, saveReplay, applyCmd } from './replay';
import type { ReplayData } from './replay';
import { setSeed } from './rng';
import { audio } from './audio';
import type { Deck, Faction, Race } from './types';

/** P4：AI 随机可用种族 */
const AI_RACES: Race[] = ['elf', 'blood', 'undead'];

const SAVE_KEY = 'wc_save_v1';

interface StartOpts {
  deck: Deck | null;
  race: Race;
  teamSize?: 1 | 2 | 3;
  load?: SaveData;
  scenario?: string; // P5-c 战役关卡 id
  replay?: ReplayData; // P5-d 回放复现
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
  const replay = opts.replay ?? null;
  const teamSize = replay ? replay.header.teamSize
    : (opts.load?.teamSize as 1 | 2 | 3 | undefined) ?? opts.teamSize ?? 1;
  const nF = 2 * teamSize + 1;
  const aiRaces = () => AI_RACES[Math.floor(Math.random() * AI_RACES.length)];
  let races: (Race | null)[];
  if (replay) {
    races = [...replay.header.races];
  } else {
    races = new Array(nF).fill(null);
    races[0] = opts.race;
    for (let f = 1; f < nF; f++) if (f !== 2) races[f] = aiRaces();
  }

  // P5-c 战役：敌方种族固定 + 关卡注入（读档时由 SaveData.scn 恢复）
  const scenario = replay
    ? SCENARIOS.find(s => s.id === replay.header.scenario) ?? null
    : opts.load ? null : SCENARIOS.find(s => s.id === opts.scenario) ?? null;
  if (!replay && scenario) races[1] = scenario.enemyRace;

  // P5-d 确定性：开局先播种（模拟层 rand() 全程走种子随机）
  const seed = replay ? replay.header.seed : (Math.random() * 0xffffffff) >>> 0;
  setSeed(seed);

  const game = new Game({
    decks: replay ? replay.header.decks : races.map(r => null), // 卡组由 AIController 随机生成；玩家卡组下面写回
    races: races as Race[],
    teamSize,
    load: opts.load, // P5 存档恢复（存在时忽略上面的初始配置）
    scenario: scenario ?? undefined,
  });
  // 玩家卡组写回（读档/回放时忽略）
  if (!opts.load && !replay) game.decks[0] = opts.deck;
  if (replay) game.replayMode = true;
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

  // ===== P6 音频：解锁 + 命名音效接线 + 顶栏开关 =====
  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());
  game.onSound = name => audio.play(name);
  const elSound = document.getElementById('btn-sound') as HTMLButtonElement | null;
  elSound?.addEventListener('click', () => {
    audio.unlock();
    elSound.textContent = audio.toggleMute() ? '🔇' : '🔊';
  });
  window.addEventListener('keydown', e => {
    if (!e.repeat && e.key.toLowerCase() === 'm') {
      audio.unlock();
      if (elSound) elSound.textContent = audio.toggleMute() ? '🔇' : '🔊';
    }
  });
  ui.hideLoading();

  // ===== P5-d 回放录制（全新对局才录，读档/回放不录） =====
  let recFlag = false;
  if (!opts.load && !replay) {
    recStart(game, {
      v: 1,
      name: new Date().toLocaleString('zh-CN', { hour12: false }),
      date: new Date().toISOString(),
      seed,
      teamSize,
      races: races as Race[],
      decks: game.decks.map(k => (k ? { units: [...k.units], heroes: [...k.heroes] } : null)),
      scenario: scenario?.id ?? null,
    });
    recFlag = true;
  }
  const flushReplay = () => {
    if (!recFlag) return;
    recFlag = false;
    const data = recStop();
    if (data) saveReplay(data, game.time, game.over?.win ?? false);
  };
  game.onVictory = win => {
    audio.play(win ? 'win' : 'lose'); // P6 胜负 stinger
    ui.showVictory(win);
    flushReplay(); // 胜负结算即保存回放
  };
  window.addEventListener('beforeunload', flushReplay); // 直接退菜单也保存
  if (replay) {
    const badge = document.createElement('div');
    badge.id = 'replay-badge';
    badge.textContent = `▶ 回放 · ${replay.header.name}`;
    document.getElementById('app')!.appendChild(badge);
  }

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
        // P5-d 回放：先应用本步指令再推进（live 点击落在本步与下一步之间）
        if (replay) {
          const next = game.stepCount + 1;
          for (const { s, c } of replay.cmds) if (s === next) applyCmd(game, c);
        }
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

// 开局流程：主界面 → 选模式/选族 → 选卡 → 开战（P5：支持继续游戏 / 战役 PVE）
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
  // P5-c 战役：关卡开战（无需选卡，玩家种族由关卡决定）
  scenarioId => {
    const s = SCENARIOS.find(x => x.id === scenarioId);
    if (!s) return;
    startGame({ deck: null, race: s.playerRace, teamSize: 1, scenario: s.id }).catch(err => {
      console.error(err);
      const el = document.getElementById('loading');
      if (el) el.textContent = '加载失败：' + (err instanceof Error ? err.message : String(err));
    });
  },
  // P5-d 回放：复现历史对局
  data => {
    startGame({ deck: null, race: data.header.races[0], replay: data }).catch(err => {
      console.error(err);
      const el = document.getElementById('loading');
      if (el) el.textContent = '回放失败：' + (err instanceof Error ? err.message : String(err));
    });
  },
);
