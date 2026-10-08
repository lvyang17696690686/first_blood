import {
  TILE, FACTION_COLORS, BUILDINGS, UNITS, TECH_UPGRADES, POP_CAP,
  UNIT_TECH_MAX, HERO_SKILL_MAX, BUILD_MENU, BUILD_MENU_BLOOD, BUILD_MENU_UNDEAD,
} from './config';
import type { Game } from './game';
import { Unit, Building } from './entities';
import type { Entity } from './entities';
import type { InputController } from './input';
import type { Renderer } from './renderer';
import { traitLabels } from './traits';

const HOTKEYS: Record<string, string> = {
  house: 'Q', barracks: 'W', extractor: 'E', arcane: 'R', tower: 'T',
  worker: 'Q', swordsman: 'Q', archer: 'W', druid: 'E', panther: 'R', chariot: 'T',
  treant: 'A', fawn: 'S', firedrake: 'D',
  golem: 'Q', thunderer: 'W', teacher: 'E', assassin: 'R',
  hero: 'Q', princess: 'W', greendragon: 'E', elder: 'R',
  // P3 血兽族
  pen: 'Q', bloodcamp: 'W', lavaaltar: 'E', prophecy: 'R', bloodtower: 'T',
  bworker: 'Q', bfighter: 'Q', spearfrog: 'W', shieldbull: 'E', witchdoc: 'R', fangwolf: 'T',
  axethrower: 'A', crushercart: 'S', firewitch: 'D',
  dragoon: 'Q', shaman: 'W', chainknight: 'E', lavabeast: 'R', cyclops: 'T',
  brade: 'Q', syl: 'W', dukun: 'E', kada: 'R',
  // P4 亡灵族
  graveyard: 'Q', boneyard: 'W', wellspring: 'E', cursetemple: 'R', ghosttower: 'T',
  ghoul: 'Q', skelpioneer: 'Q', bonearcher: 'W', demonmage: 'E', demonguard: 'R', plaguecart: 'T',
  bonequeen: 'A', succubus: 'S', zombiegiant: 'D',
  devourer: 'Q', ghosttongue: 'W', skeletonlord: 'E',
  pope: 'Q', necromancer: 'W', demonlord: 'E', deathgod: 'R',
};

export class UI {
  game: Game;
  input: InputController;
  renderer: Renderer;

  private elGold = document.getElementById('res-gold')!;
  private elCrystal = document.getElementById('res-crystal')!;
  private elSupply = document.getElementById('res-supply')!;
  private elTime = document.getElementById('res-time')!;
  private elInfo = document.getElementById('info-panel')!;
  private elCard = document.getElementById('command-card')!;
  private elLog = document.getElementById('message-log')!;
  private elOverlay = document.getElementById('overlay')!;
  private elOverlayTitle = document.getElementById('overlay-title')!;
  private elOverlaySub = document.getElementById('overlay-sub')!;
  private elLoading = document.getElementById('loading')!;

  private minimap = document.getElementById('minimap') as HTMLCanvasElement;
  private mmCtx: CanvasRenderingContext2D;
  private mmTerrain: HTMLCanvasElement;
  private mmFog: HTMLCanvasElement;
  private lastFogVersion = -1;

  private buildTab = false;
  private techTab = false;
  private cardSig = '';
  private infoTimer = 0;

  constructor(game: Game, input: InputController, renderer: Renderer) {
    this.game = game;
    this.input = input;
    this.renderer = renderer;
    this.mmCtx = this.minimap.getContext('2d')!;
    this.mmTerrain = document.createElement('canvas');
    this.mmFog = document.createElement('canvas');
    this.mmTerrain.width = this.mmTerrain.height = 180;
    this.mmFog.width = this.mmFog.height = 180;
    this.drawMinimapTerrain();
    this.bindMinimap();
    this.bindOverlay();
    game.onLog = msg => this.log(msg);
  }

  hideLoading() { this.elLoading.classList.add('hidden'); }

  // ===== 消息 =====
  log(msg: string) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.textContent = msg;
    this.elLog.appendChild(div);
    setTimeout(() => div.remove(), 3600);
    while (this.elLog.children.length > 5) this.elLog.firstChild?.remove();
  }

  setCursor(mode: string) {
    this.renderer.app.canvas.style.cursor = mode === 'attack' ? 'crosshair' : 'default';
  }

  spawnMoveMarker(x: number, y: number, attack = false) {
    this.renderer.addMarker(x, y, attack ? 0xff8844 : 0x6dff8a);
  }
  spawnRallyMarker(_b: Building, x: number, y: number) {
    this.renderer.addMarker(x, y, 0x66ff66, true);
  }

  toggleBuildTab() { this.buildTab = !this.buildTab; }

  // ===== 胜负 =====
  private bindOverlay() {
    document.getElementById('overlay-restart')!.addEventListener('click', () => {
      window.location.reload();
    });
  }

  showVictory(win: boolean) {
    this.elOverlayTitle.textContent = win ? '胜利！' : '战败…';
    this.elOverlayTitle.className = win ? 'win' : 'lose';
    this.elOverlaySub.textContent = win
      ? '敌方主基地已倒下，这片大陆属于你。'
      : '你的主基地被摧毁了，再接再厉。';
    this.elOverlay.classList.remove('hidden');
  }

  // ===== 小地图 =====
  private drawMinimapTerrain() {
    const ctx = this.mmTerrain.getContext('2d')!;
    const map = this.game.map;
    const s = 180 / (map.w * TILE);
    ctx.fillStyle = '#1a241c';
    ctx.fillRect(0, 0, 180, 180);
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        if (map.tiles[ty * map.w + tx] === 1) {
          ctx.fillStyle = '#2f4d33';
          ctx.fillRect(tx * TILE * s, ty * TILE * s, Math.ceil(TILE * s), Math.ceil(TILE * s));
        }
      }
    }
  }

  private drawMinimapFog() {
    const ctx = this.mmFog.getContext('2d')!;
    const map = this.game.map;
    const s = 180 / (map.w * TILE);
    ctx.clearRect(0, 0, 180, 180);
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const f = this.game.fog[ty * map.w + tx];
        if (f === 2) continue;
        ctx.fillStyle = f === 1 ? 'rgba(5,7,12,0.45)' : '#05070c';
        ctx.fillRect(tx * TILE * s, ty * TILE * s, Math.ceil(TILE * s), Math.ceil(TILE * s));
      }
    }
  }

  private bindMinimap() {
    const toWorld = (e: MouseEvent) => {
      const rect = this.minimap.getBoundingClientRect();
      const s = (this.game.map.w * TILE) / 180;
      return { x: (e.clientX - rect.left) * s, y: (e.clientY - rect.top) * s };
    };
    let down = false;
    const move = (e: MouseEvent) => {
      if (!down) return;
      const w = toWorld(e);
      this.input.camera.x = w.x;
      this.input.camera.y = w.y;
    };
    this.minimap.addEventListener('mousedown', e => { down = true; move(e); });
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', () => down = false);
  }

  private drawMinimap() {
    const ctx = this.mmCtx;
    const map = this.game.map;
    const s = 180 / (map.w * TILE);
    ctx.drawImage(this.mmTerrain, 0, 0);

    // 资源点（P2：被占领的矿按归属着色）
    for (const n of this.game.resourceNodes.values()) {
      if (n.amount <= 0) continue;
      const ot = this.game.teams[n.owner];
      ctx.fillStyle = n.owner >= 0 && ot === this.game.teams[0] ? '#55dd55' : n.owner >= 0 && n.owner !== 2 ? '#dd5555' : '#ffd34d';
      ctx.fillRect(n.x * s - 2, n.y * s - 2, 4, 4);
    }
    // 中立据点始终显示归属色（P2 地标）
    for (const b of this.game.buildings) {
      if (b.dead || b.def.kind !== 'stronghold') continue;
      ctx.fillStyle = FACTION_COLORS[b.faction];
      const size = 6;
      ctx.fillRect(b.x * s - size / 2, b.y * s - size / 2, size, size);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(b.x * s - size / 2, b.y * s - size / 2, size, size);
    }
    // 建筑
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      if (!this.game.sameTeam(b.faction, 0) && !b.seenBy[0]) continue;
      ctx.fillStyle = FACTION_COLORS[b.faction];
      const size = b.def.kind === 'main' ? 7 : 5;
      ctx.fillRect(b.x * s - size / 2, b.y * s - size / 2, size, size);
    }
    // 单位
    for (const u of this.game.units) {
      if (u.dead) continue;
      if (!this.game.sameTeam(u.faction, 0) && !this.fogVisible(u.x, u.y)) continue;
      if (this.game.sameTeam(u.faction, 0) && u.def.kind === 'worker') continue; // 不画己方工人，减少噪点
      ctx.fillStyle = FACTION_COLORS[u.faction];
      ctx.fillRect(u.x * s - 1.5, u.y * s - 1.5, 3, 3);
    }
    // 迷雾
    if (this.lastFogVersion !== this.game.fogVersion) {
      this.lastFogVersion = this.game.fogVersion;
      this.drawMinimapFog();
    }
    ctx.drawImage(this.mmFog, 0, 0);

    // 镜头框
    const cam = this.input.camera;
    const vwW = (this.renderer.viewW / cam.zoom) * s;
    const vwH = (this.renderer.viewH / cam.zoom) * s;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cam.x * s - vwW / 2, cam.y * s - vwH / 2, vwW, vwH);
  }

  private fogVisible(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.game.map.w || ty >= this.game.map.h) return false;
    return this.game.fog[ty * this.game.map.w + tx] === 2;
  }

  // ===== 信息面板 =====
  syncSelection(sel: Entity[]) {
    this.renderInfo(sel);
    this.cardSig = ''; // 强制刷新指令卡
  }

  private renderInfo(sel: Entity[]) {
    if (sel.length === 0) {
      this.elInfo.innerHTML = `<h3>第一滴血</h3>
        <div class="sub">精灵族 · 单机对抗 AI</div>
        <div class="row">目标：摧毁敌方生命古树。小心野怪营地，击杀可获得金币与原石。</div>
        <div class="row">流程：工匠采金 → 树屋/战争古树 → 升级2本 → 智慧古树 → 高级兵与英雄。</div>`;
      return;
    }
    if (sel.length === 1) {
      const e = sel[0];
      if (e instanceof Unit) {
        const u = e;
        let html = `<h3>${u.def.name}</h3><div class="sub">${u.faction === 0 ? '我方' : this.game.sameTeam(u.faction, 0) ? '队友' : u.faction === 2 ? '野怪' : '敌方'} · 等级${u.def.tier}</div>`;
        html += `<div class="row">生命 ${Math.ceil(u.hp)}/${u.maxHp} · 攻击 ${Math.round(u.effDmg())} · 护甲 ${u.armor} · 射程 ${Math.round(u.range)}</div>`;
        if (u.shieldHp > 0) html += `<div class="row" style="color:#9fd8ff">护盾 ${Math.ceil(u.shieldHp)}</div>`;
        const tl = traitLabels(u.def.traits);
        if (tl.length > 0) html += `<div class="row">特性：${tl.join(' / ')}</div>`;
        if (u.def.kind === 'hero') {
          html += `<div class="row">英雄 Lv.${u.level} · 经验 ${u.xp} · 法力 ${Math.floor(u.mana)}/${u.maxMana}</div>`;
          u.heroSkillDefs.forEach((sk, i) => {
            html += `<div class="row">[${sk.hotkey}] ${sk.name} Lv.${u.skillLevels[i] ?? 1}：${sk.desc}</div>`;
          });
        } else if (u.techLevel > 1) {
          html += `<div class="row">兵种科技 Lv.${u.techLevel}（攻/血 +${(u.techLevel - 1) * 10}%）</div>`;
        }
        if (u.def.kind === 'worker') html += `<div class="row">右键金矿采集，或点击下方按钮建造建筑。</div>`;
        if (u.def.desc) html += `<div class="row" style="color:#8b97a5">${u.def.desc}</div>`;
        this.elInfo.innerHTML = html;
        return;
      }
      if (e instanceof Building) {
        const b = e;
        let html = `<h3>${b.def.name}</h3><div class="sub">${b.faction === 0 ? '我方' : this.game.sameTeam(b.faction, 0) ? '队友' : b.faction === 2 ? '中立' : '敌方'}${b.built ? '' : ' · 建造中 ' + Math.round(b.buildProgress * 100) + '%'}</div>`;
        html += `<div class="row">生命 ${Math.ceil(b.hp)}/${b.maxHp} · 护甲 ${b.armor}</div>`;
        if (b.def.supply) html += `<div class="row">人口 +${b.def.supply}</div>`;
        if (b.def.crystalRate) html += `<div class="row">原石产量 ${b.def.crystalRate}/秒</div>`;
        if (b.techUpgrade) html += `<div class="row">升级中… ${Math.ceil(b.techUpgrade.timer)}s</div>`;
        if (b.research) html += `<div class="row">兵种科技研究中：${UNITS[b.research.unitId]?.name ?? ''} ${Math.ceil(b.research.timer)}s</div>`;
        if (b.queue.length > 0) {
          html += `<div class="row">队列：${b.queue.map(q => UNITS[q.unitId].name).join(' → ')}（当前 ${Math.ceil(b.queue[0].timer)}s）</div>`;
        }
        if (b.def.desc) html += `<div class="row" style="color:#8b97a5">${b.def.desc}</div>`;
        this.elInfo.innerHTML = html;
        return;
      }
    }
    // 多选
    const counts = new Map<string, number>();
    for (const e of sel) {
      if (e instanceof Unit) counts.set(e.def.id, (counts.get(e.def.id) ?? 0) + 1);
    }
    let html = `<h3>部队（${sel.length}）</h3><div class="icons">`;
    for (const [id, n] of counts) {
      const def = UNITS[id];
      const c = def.color.toString(16).padStart(6, '0');
      html += `<div class="uicon" data-uid="${id}"><i style="width:16px;height:16px;border-radius:4px;background:#${c};display:block;margin-bottom:2px"></i><span>${def.name}×${n}</span></div>`;
    }
    html += '</div>';
    this.elInfo.innerHTML = html;
    this.elInfo.querySelectorAll('.uicon').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.uid!;
        this.input.setSelection(sel.filter(e => e instanceof Unit && e.def.id === id));
      });
    });
  }

  // ===== 指令卡 =====
  private btn(label: string, sub: string, hotkey: string | undefined, iconColor: number | undefined,
              disabled: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'cmd-btn';
    b.disabled = disabled;
    b.innerHTML = `${hotkey ? `<span class="hk">${hotkey}</span>` : ''}
      ${iconColor !== undefined ? `<span class="icon" style="background:#${iconColor.toString(16).padStart(6, '0')}"></span>` : ''}
      <span>${label}</span>${sub ? `<span class="cost">${sub}</span>` : ''}`;
    b.addEventListener('click', onClick);
    return b;
  }

  private costText(g: number, c: number): string {
    const parts: string[] = [];
    if (g) parts.push(`<span class="g">金${g}</span>`);
    if (c) parts.push(`<span class="c">石${c}</span>`);
    return parts.join(' ');
  }

  private renderCard(sel: Entity[]) {
    this.elCard.innerHTML = '';
    const game = this.game;
    const afford = (g: number, c: number) => game.canAfford(0, g, c);

    // 建筑选中
    const b0 = sel.length === 1 && sel[0] instanceof Building ? sel[0] as Building : null;
    if (b0 && b0.faction === 0 && b0.built) {
      // P1 兵种科技视图
      if (this.techTab) {
        const techable = b0.def.trains.filter(uid => game.unitTechAvailable(uid));
        for (const uid of techable) {
          const def = UNITS[uid];
          const lv = game.unitTechLevel(0, uid);
          const maxed = lv >= UNIT_TECH_MAX;
          const cost = game.unitTechCost(uid, lv);
          this.elCard.appendChild(this.btn(
            `${def.name} ${maxed ? 'MAX' : `Lv${lv}→${lv + 1}`}`,
            maxed ? '攻/血已满级' : this.costText(cost, 0),
            undefined, def.color,
            maxed || !afford(cost, 0) || b0.research !== null,
            () => game.startUnitTech(0, b0, uid)));
        }
        this.elCard.appendChild(this.btn('返回训练', '', 'Esc', undefined, false, () => {
          this.techTab = false;
          this.renderCard(this.input.selection);
        }));
        return;
      }

      // 训练列表（只显示卡组内单位）
      const trains = b0.def.trains.filter(uid => game.deckAllows(0, uid));
      for (const uid of trains) {
        const def = UNITS[uid];
        const needTier = def.tier > game.factions[0].tech;
        const lv = game.unitTechLevel(0, uid);
        this.elCard.appendChild(this.btn(
          `${def.name}${lv > 1 ? ` Lv${lv}` : ''}`,
          this.costText(def.costGold, def.costCrystal),
          HOTKEYS[uid], def.color,
          !afford(def.costGold, def.costCrystal) || needTier || b0.techUpgrade !== null,
          () => game.trainUnit(0, b0, uid)));
      }
      // 兵种科技入口
      if (trains.some(uid => game.unitTechAvailable(uid))) {
        this.elCard.appendChild(this.btn('兵种升级', '攻/血+10%/级', 'V', 0xffd97a, b0.research !== null,
          () => { this.techTab = true; this.renderCard(this.input.selection); }));
      }
      if (b0.def.kind === 'main') {
        const cur = game.factions[0].tech;
        if (cur < 3) {
          const up = TECH_UPGRADES[cur - 1];
          this.elCard.appendChild(this.btn(up.name, this.costText(up.costGold, up.costCrystal),
            'U', 0x9f7fff, !afford(up.costGold, up.costCrystal) || b0.techUpgrade !== null || b0.queue.length > 0,
            () => game.startTechUpgrade(0, b0)));
        }
      }
      this.elCard.appendChild(this.btn('停止训练', '', 'X', undefined, b0.queue.length === 0,
        () => { b0.queue.shift(); }));
      return;
    }

    // 单位选中
    const units = sel.filter((s): s is Unit => s instanceof Unit && s.faction === 0);
    if (units.length === 0) return;
    const hasWorker = units.some(u => u.def.kind === 'worker');
    const hasHero = units.some(u => u.def.kind === 'hero');
    const hasCombat = units.some(u => u.def.kind !== 'worker');

    if (hasWorker && this.buildTab) {
      // 建造菜单（按种族显示，P3）
      const menu = game.races[0] === 'blood' ? BUILD_MENU_BLOOD
        : game.races[0] === 'undead' ? BUILD_MENU_UNDEAD : BUILD_MENU;
      for (const bid of menu) {
        const def = BUILDINGS[bid];
        const needTier = def.tier > game.factions[0].tech;
        this.elCard.appendChild(this.btn(def.name, this.costText(def.costGold, def.costCrystal),
          HOTKEYS[bid], def.color, !afford(def.costGold, def.costCrystal) || needTier,
          () => {
            this.buildTab = false;
            this.input.startPlacement(bid);
          }));
      }
      this.elCard.appendChild(this.btn('返回', '', 'Esc', undefined, false, () => { this.buildTab = false; this.renderCard(this.input.selection); }));
      return;
    }

    if (hasHero) {
      const hero = units.find(u => u.def.kind === 'hero')!;
      hero.heroSkillDefs.forEach((sk, i) => {
        const cd = hero.skillCooldowns[i];
        const lv = hero.skillLevels[i] ?? 1;
        this.elCard.appendChild(this.btn(`${sk.name} Lv${lv}${cd > 0 ? ` ${Math.ceil(cd)}s` : ''}`,
          `法力${sk.manaCost}${sk.targeted ? ' · 点地' : ''}`, sk.hotkey, sk.targetAllies ? 0x7dd87d : 0xff9a4d,
          cd > 0 || hero.mana < sk.manaCost,
          () => this.input.beginSkillCast(hero, i)));
        // P1 技能升级按钮
        if (lv < HERO_SKILL_MAX) {
          const cost = game.heroSkillCost(lv);
          this.elCard.appendChild(this.btn(`升级${sk.name}`, `Lv${lv}→${lv + 1} ${this.costText(cost, 0)}`,
            undefined, 0x9fd8ff, !afford(cost, 0),
            () => game.upgradeHeroSkill(0, hero, i)));
        }
      });
    }
    if (hasCombat) {
      this.elCard.appendChild(this.btn('攻击移动', '', 'A', 0xff8844, false, () => {
        this.input['attackMovePending'] = true;
        this.setCursor('attack');
      }));
      // P2 占领按钮：附近有可占领的矿/据点时显示
      const lead = units.find(u => u.def.kind !== 'worker')!;
      const capTarget = game.findCapturableNear(0, lead.x, lead.y);
      if (capTarget) {
        const st = game.canCapture(0, capTarget);
        const cost = game.captureCost(capTarget);
        const isNode = !(capTarget instanceof Building);
        this.elCard.appendChild(this.btn(
          `占领${isNode ? '金矿' : (capTarget as Building).def.name}`,
          st.ok ? this.costText(cost, 0) : st.reason,
          'C', 0xffd97a, !st.ok || !afford(cost, 0),
          () => game.tryCapture(0, capTarget)));
      }
    }
    this.elCard.appendChild(this.btn('停止', '', 'S', undefined, false, () => {
      for (const u of units) { u.order = { type: 'idle' }; u.resume = { type: 'idle' }; u.path = null; }
    }));
    this.elCard.appendChild(this.btn('坚守', '', 'H', undefined, false, () => {
      for (const u of units) u.order = { type: 'hold' };
    }));
    if (hasWorker) {
      this.elCard.appendChild(this.btn('建造…', '', 'B', 0x66cc66, false, () => {
        this.buildTab = true;
        this.renderCard(this.input.selection);
      }));
    }
  }

  // ===== 每帧 =====
  tick(dt: number) {
    const f = this.game.factions[0];
    this.elGold.textContent = Math.floor(f.gold).toString();
    this.elCrystal.textContent = Math.floor(f.crystal).toString();
    this.elSupply.textContent = `${this.game.supplyUsed(0)}/${this.game.supplyCap(0)} (上限${POP_CAP})`;
    const t = Math.floor(this.game.time);
    const mm = Math.floor(t / 60).toString().padStart(2, '0');
    const ss = (t % 60).toString().padStart(2, '0');
    this.elTime.textContent = `${mm}:${ss}`;

    this.drawMinimap();

    this.infoTimer -= dt;
    if (this.infoTimer <= 0) {
      this.infoTimer = 0.15;
      this.renderInfo(this.input.selection);
      // 指令卡：签名变化才重建
      const sel = this.input.selection;
      const sig = [
        sel.map(e => e.id).join(','),
        this.buildTab ? 'B' : '',
        this.techTab ? 'T' : '',
        this.game.factions[0].tech,
        Object.entries(this.game.factions[0].unitTech).map(([k, v]) => k + v).join(''),
        ...(sel.length === 1 && sel[0] instanceof Building
          ? [sel[0].queue.length, sel[0].techUpgrade ? 1 : 0, sel[0].built ? 1 : 0,
             sel[0].research ? sel[0].research.unitId + Math.ceil(sel[0].research.timer) : ''] : []),
        ...(sel.length === 1 && sel[0] instanceof Unit && sel[0].def.kind === 'hero'
          ? [Math.ceil(sel[0].mana), ...sel[0].skillCooldowns.map(c => Math.ceil(c)),
             ...sel[0].skillLevels.map(l => l)] : []),
      ].join('|');
      if (sig !== this.cardSig) {
        this.cardSig = sig;
        this.renderCard(sel);
      }
    }
  }
}
