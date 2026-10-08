import {
  DECK_UNIT_POOL, DECK_HERO_POOL, DECK_UNITS, DECK_HEROES, UNITS,
  DECK_UNIT_POOL_BLOOD, DECK_HERO_POOL_BLOOD,
  DECK_UNIT_POOL_UNDEAD, DECK_HERO_POOL_UNDEAD,
} from './config';
import type { Deck, Race } from './types';

const LS_KEY = 'wc_decks_v1';

type StoredDecks = Record<string, Deck>;

function loadStored(): StoredDecks {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return typeof obj === 'object' && obj ? obj as StoredDecks : {};
  } catch { return {}; }
}
function saveStored(d: StoredDecks) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* 忽略 */ }
}

const RACES = [
  { id: 'elf', name: '精灵族', desc: '夜精灵军团：灵活多变，英雄全能。', playable: true },
  { id: 'blood', name: '血兽族', desc: '嗜血野兽军团：反伤、冲锋与灵魂操控，前期压制。', playable: true },
  { id: 'undead', name: '亡灵族', desc: '不死亡灵军团：廉价海量、自爆、瘟疫与亡者复苏。', playable: true },
] as const;

/** 出战卡组界面：主界面 → 选族 → 选卡 → 开战（P5：支持继续游戏） */
export class Lobby {
  private root: HTMLDivElement;
  private onStart: (deck: Deck, race: Race, teamSize: 1 | 2 | 3) => void;
  private onContinue: (() => void) | null;
  private step: 'race' | 'deck' = 'race';
  private race: Race = 'elf';
  private teamSize: 1 | 2 | 3 = 1;
  private selectedUnits = new Set<string>();
  private selectedHeroes = new Set<string>();

  constructor(onStart: (deck: Deck, race: Race, teamSize: 1 | 2 | 3) => void, onContinue?: () => void) {
    this.onStart = onStart;
    this.onContinue = onContinue ?? null;
    this.root = document.createElement('div');
    this.root.id = 'lobby';
    document.getElementById('app')!.appendChild(this.root);
    // 大厅就绪后隐藏加载遮罩
    document.getElementById('loading')?.classList.add('hidden');
    this.renderRace();
  }

  destroy() { this.root.remove(); }

  // ===== 步骤 1：选族 =====
  private renderRace() {
    this.step = 'race';
    const modes: Array<[1 | 2 | 3, string, string]> = [
      [1, '1 v 1', '标准对决'],
      [2, '2 v 2', '与队友 AI 并肩作战'],
      [3, '3 v 3', '三方混战团战'],
    ];
    this.root.innerHTML = `
      <div class="lobby-card">
        <h1>第一滴血</h1>
        <p class="lobby-sub">First Blood · 选择你的种族</p>
        <div class="race-row">
          ${RACES.map(r => `
            <div class="race-card ${r.playable ? '' : 'locked'}" data-race="${r.id}">
              <div class="race-icon race-${r.id}"></div>
              <h3>${r.name}</h3>
              <p>${r.desc}</p>
              ${r.playable ? '' : '<span class="soon">敬请期待</span>'}
            </div>`).join('')}
        </div>
        <div class="mode-row">
          <h4>对战模式</h4>
          <div class="mode-cards">
            ${modes.map(([n, name, desc]) => `
              <div class="mode-card ${this.teamSize === n ? 'on' : ''}" data-mode="${n}">
                <b>${name}</b><span>${desc}</span>
              </div>`).join('')}
          </div>
        </div>
        ${this.onContinue ? '<button id="lobby-continue" class="lobby-btn continue">⏵ 继续上次游戏</button>' : ''}
      </div>`;
    const cont = this.root.querySelector('#lobby-continue');
    cont?.addEventListener('click', () => {
      const cb = this.onContinue;
      this.destroy();
      cb?.();
    });
    this.root.querySelectorAll('.mode-card').forEach(el => {
      el.addEventListener('click', () => {
        this.teamSize = Number((el as HTMLElement).dataset.mode) as 1 | 2 | 3;
        this.root.querySelectorAll('.mode-card').forEach(m => m.classList.remove('on'));
        el.classList.add('on');
      });
    });
    this.root.querySelectorAll('.race-card.playable, .race-card:not(.locked)').forEach(el => {
      el.addEventListener('click', () => {
        this.race = (el as HTMLElement).dataset.race as Race;
        this.renderDeck();
      });
    });
  }

  // ===== 步骤 2：选卡 =====
  private renderDeck() {
    this.step = 'deck';
    const isBlood = this.race === 'blood';
    const raceName = RACES.find(r => r.id === this.race)?.name ?? '精灵族';
    const unitPool = isBlood ? DECK_UNIT_POOL_BLOOD
      : this.race === 'undead' ? DECK_UNIT_POOL_UNDEAD : DECK_UNIT_POOL;
    const heroPool = isBlood ? DECK_HERO_POOL_BLOOD
      : this.race === 'undead' ? DECK_HERO_POOL_UNDEAD : DECK_HERO_POOL;
    this.root.innerHTML = `
      <div class="lobby-card wide">
        <h1>组建出战卡组</h1>
        <p class="lobby-sub">${raceName} · 兵团卡 <b id="cnt-u">0</b>/${DECK_UNITS} · 英雄卡 <b id="cnt-h">0</b>/${DECK_HEROES}</p>
        <div class="deck-section"><h4>兵团卡（选 ${DECK_UNITS} 张）</h4>
          <div class="card-grid" id="unit-grid">
            ${unitPool.map(id => this.cardHtml(id, 'unit')).join('')}
          </div>
        </div>
        <div class="deck-section"><h4>英雄卡（选 ${DECK_HEROES} 张）</h4>
          <div class="card-grid" id="hero-grid">
            ${heroPool.map(id => this.cardHtml(id, 'hero')).join('')}
          </div>
        </div>
        <div class="deck-templates">
          <select id="deck-select"><option value="">— 载入模板 —</option></select>
          <input id="deck-name" type="text" placeholder="模板名称" maxlength="12" />
          <button id="deck-save" class="lobby-btn small">保存</button>
          <button id="deck-del" class="lobby-btn small danger">删除</button>
        </div>
        <div class="lobby-actions">
          <button id="deck-back" class="lobby-btn">上一步</button>
          <button id="deck-start" class="lobby-btn primary" disabled>开始战斗</button>
        </div>
      </div>`;

    // 模板下拉
    const select = this.root.querySelector('#deck-select') as HTMLSelectElement;
    const stored = loadStored();
    for (const name of Object.keys(stored)) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const d = stored[select.value];
      if (!d) return;
      // 只保留当前种族卡池内的卡（模板可能来自其他种族）
      const pool = isBlood ? DECK_UNIT_POOL_BLOOD
        : this.race === 'undead' ? DECK_UNIT_POOL_UNDEAD : DECK_UNIT_POOL;
      const hp = isBlood ? DECK_HERO_POOL_BLOOD
        : this.race === 'undead' ? DECK_HERO_POOL_UNDEAD : DECK_HERO_POOL;
      this.selectedUnits = new Set(d.units.filter(id => pool.includes(id as never)));
      this.selectedHeroes = new Set(d.heroes.filter(id => hp.includes(id as never)));
      this.refreshDeckUi();
    });
    (this.root.querySelector('#deck-save') as HTMLButtonElement).addEventListener('click', () => {
      if (!this.deckComplete()) return;
      const input = this.root.querySelector('#deck-name') as HTMLInputElement;
      const name = input.value.trim() || `卡组${Object.keys(loadStored()).length + 1}`;
      const all = loadStored();
      all[name] = this.currentDeck();
      saveStored(all);
      if (!select.querySelector(`option[value="${name}"]`)) {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        select.appendChild(opt);
      }
      select.value = name;
      input.value = '';
    });
    (this.root.querySelector('#deck-del') as HTMLButtonElement).addEventListener('click', () => {
      const name = select.value;
      if (!name) return;
      const all = loadStored();
      delete all[name];
      saveStored(all);
      select.querySelector(`option[value="${name}"]`)?.remove();
      select.value = '';
    });

    // 卡片点击
    this.root.querySelectorAll('.deck-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        const kind = (el as HTMLElement).dataset.kind!;
        const set = kind === 'unit' ? this.selectedUnits : this.selectedHeroes;
        if (set.has(id)) set.delete(id);
        else set.add(id);
        this.refreshDeckUi();
      });
    });

    (this.root.querySelector('#deck-back') as HTMLButtonElement).addEventListener('click', () => this.renderRace());
    (this.root.querySelector('#deck-start') as HTMLButtonElement).addEventListener('click', () => {
      if (!this.deckComplete()) return;
      const race = this.race;
      const teamSize = this.teamSize;
      this.destroy();
      this.onStart(this.currentDeck(), race, teamSize);
    });

    this.refreshDeckUi();
  }

  private cardHtml(id: string, kind: 'unit' | 'hero'): string {
    const def = UNITS[id];
    const c = def.color.toString(16).padStart(6, '0');
    const traits = def.traits ? ' <span class="t">特性</span>' : '';
    return `
      <div class="deck-card" data-id="${id}" data-kind="${kind}" title="${def.desc}">
        <i style="background:#${c}"></i>
        <b>${def.name}</b>
        <span>${def.kind === 'hero' ? '英雄' : def.kind === 'melee' ? '近战' : def.kind === 'ranged' ? '远程' : def.kind === 'siege' ? '攻城' : '特殊'} · ${def.costGold}金${def.costCrystal ? '+' + def.costCrystal + '石' : ''}${traits}</span>
      </div>`;
  }

  private deckComplete(): boolean {
    return this.selectedUnits.size === DECK_UNITS && this.selectedHeroes.size === DECK_HEROES;
  }
  private currentDeck(): Deck {
    return { units: [...this.selectedUnits], heroes: [...this.selectedHeroes] };
  }

  private refreshDeckUi() {
    this.root.querySelectorAll('.deck-card').forEach(el => {
      const id = (el as HTMLElement).dataset.id!;
      const kind = (el as HTMLElement).dataset.kind!;
      const on = kind === 'unit' ? this.selectedUnits.has(id) : this.selectedHeroes.has(id);
      el.classList.toggle('on', on);
    });
    (this.root.querySelector('#cnt-u') as HTMLElement).textContent = this.selectedUnits.size.toString();
    (this.root.querySelector('#cnt-h') as HTMLElement).textContent = this.selectedHeroes.size.toString();
    (this.root.querySelector('#deck-start') as HTMLButtonElement).disabled = !this.deckComplete();
  }
}
