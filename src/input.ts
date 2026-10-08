import { TILE, BUILDINGS } from './config';
import type { Game } from './game';
import { Unit, Building } from './entities';
import type { Entity } from './entities';
import type { Renderer } from './renderer';
import type { UI } from './ui';
import type { Vec2, Order } from './types';
import { gameCtl, cycleSpeed } from './ctl';
import { recCmd } from './replay';
import type { OrdEntry } from './replay';
import { audio } from './audio';

export class Camera {
  x: number; y: number; // 屏幕中心对应的世界坐标
  zoom = 1;
  minZoom = 0.45;
  maxZoom = 2.2;

  constructor(x: number, y: number) { this.x = x; this.y = y; }

  screenToWorld(sx: number, sy: number, vw: number, vh: number): Vec2 {
    return {
      x: this.x + (sx - vw / 2) / this.zoom,
      y: this.y + (sy - vh / 2) / this.zoom,
    };
  }
  worldToScreen(wx: number, wy: number, vw: number, vh: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + vw / 2,
      y: (wy - this.y) * this.zoom + vh / 2,
    };
  }
  clamp(vw: number, vh: number, worldW: number, worldH: number) {
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
      this.x = worldW / 2; this.y = worldH / 2; this.zoom = 1;
    }
    const halfW = vw / 2 / this.zoom, halfH = vh / 2 / this.zoom;
    this.x = Math.max(halfW, Math.min(worldW - halfW, this.x));
    this.y = Math.max(halfH, Math.min(worldH - halfH, this.y));
  }
}

export class InputController {
  game: Game;
  renderer: Renderer;
  ui!: UI;
  camera: Camera;

  mouse = { sx: 0, sy: 0, wx: 0, wy: 0, down: false, button: 0 };
  dragStart: Vec2 | null = null;
  dragging = false;
  /** A 键待攻击移动 */
  attackMovePending = false;
  /** P2 全局指令待确认模式 */
  revealPending = false; // R：侦查
  rallyPending = false;  // G：集合
  focusPending = false;  // F：集火
  /** 建造摆放模式 */
  placement: string | null = null;
  ghostTx = 0; ghostTy = 0; ghostValid = false;

  selection: Entity[] = [];
  controlGroups = new Map<number, number[]>();
  /** 待施放的英雄技能（点地施法模式） */
  skillPending: { unit: Unit; idx: number } | null = null;
  private keys = new Set<string>();
  private lastClickTime = 0;
  private lastClickId = 0;
  private middleDrag: Vec2 | null = null;
  /** P5-d 当前指令批次（录制中） */
  private ordBatch: OrdEntry[] | null = null;
  /** P6 触屏多点跟踪（双指捏合缩放/平移） */
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; world: Vec2 } | null = null;

  /** 应用并录制单位指令（live 与回放共用同一最终状态） */
  private ord(u: Unit, order: Order, opts: { resume?: Order; gather?: 'null'; clearPath?: boolean } = {}) {
    u.order = order;
    if (opts.resume !== undefined) u.resume = opts.resume;
    if (opts.gather === 'null') u.gather = null;
    if (opts.clearPath) u.path = null;
    this.ordBatch?.push([u.id, order, u.resume, u.gather, opts.clearPath ? 1 : 0]);
  }
  private beginOrds() { this.ordBatch = []; }
  private flushOrds() {
    if (this.ordBatch && this.ordBatch.length > 0) recCmd('ords', this.ordBatch);
    this.ordBatch = null;
  }

  constructor(game: Game, renderer: Renderer) {
    this.game = game;
    this.renderer = renderer;
    this.camera = renderer.camera;
    const main = game.getMain(0);
    this.camera.x = main ? main.x : 48 * TILE;
    this.camera.y = main ? main.y : 48 * TILE;
    this.bind();
  }

  get vw() { return this.renderer.viewW; }
  get vh() { return this.renderer.viewH; }

  // ===== 事件绑定 =====
  private bind() {
    const canvas = this.renderer.app.canvas;

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.mouse.sx = e.offsetX; this.mouse.sy = e.offsetY;
      this.updateWorldPos();
      this.mouse.down = true;
      this.mouse.button = e.button;

      // P6 双指触屏：进入捏合模式（取消框选/点击），捏合对回放模式同样可用
      if (this.pointers.size === 2) {
        this.dragStart = null;
        this.dragging = false;
        this.mouse.down = false;
        this.pinch = this.pinchStart();
        return;
      }
      if (this.pointers.size > 2) return;

      // P5-d 回放模式：只允许中键拖动镜头
      if (this.game.replayMode) {
        if (e.button === 1) { this.middleDrag = { x: e.offsetX, y: e.offsetY }; e.preventDefault(); }
        return;
      }

      if (e.button === 0) {
        if (this.placement) {
          this.tryPlace();
          return;
        }
        if (this.skillPending) {
          const { unit, idx } = this.skillPending;
          this.skillPending = null;
          this.ui.setCursor('');
          recCmd('cast', unit.id, idx, this.mouse.wx, this.mouse.wy);
          unit.castSkillAt(this.game, idx, this.mouse.wx, this.mouse.wy);
          audio.play('confirm');
          return;
        }
        if (this.attackMovePending) {
          this.issueAttackMove(this.mouse.wx, this.mouse.wy);
          this.attackMovePending = false;
          this.ui.setCursor('');
          return;
        }
        if (this.revealPending) {
          this.revealPending = false;
          this.ui.setCursor('');
          recCmd('reveal', this.mouse.wx, this.mouse.wy);
          this.game.revealArea(this.mouse.wx, this.mouse.wy, 0);
          return;
        }
        if (this.rallyPending) {
          this.rallyPending = false;
          this.ui.setCursor('');
          this.issueRally(this.mouse.wx, this.mouse.wy);
          return;
        }
        if (this.focusPending) {
          this.focusPending = false;
          this.ui.setCursor('');
          this.issueFocus(this.mouse.wx, this.mouse.wy);
          return;
        }
        this.dragStart = { x: e.offsetX, y: e.offsetY };
        this.dragging = false;
      } else if (e.button === 1) {
        this.middleDrag = { x: e.offsetX, y: e.offsetY };
        e.preventDefault();
      } else if (e.button === 2) {
        if (this.placement) { this.cancelPlacement(); return; }
        if (this.skillPending) { this.skillPending = null; this.ui.setCursor(''); return; }
        if (this.attackMovePending) { this.attackMovePending = false; return; }
        if (this.revealPending || this.rallyPending || this.focusPending) {
          this.revealPending = this.rallyPending = this.focusPending = false;
          this.ui.setCursor('');
          return;
        }
        this.issueContextCommand(this.mouse.wx, this.mouse.wy);
      }
    });

    canvas.addEventListener('pointermove', e => {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.x = e.offsetX; p.y = e.offsetY; }
      this.mouse.sx = e.offsetX; this.mouse.sy = e.offsetY;
      this.updateWorldPos();
      // P6 双指捏合：以起始中点对应的世界坐标为锚，缩放 + 平移
      if (this.pinch && this.pointers.size >= 2) { this.applyPinch(); return; }
      if (this.middleDrag) {
        const dx = (e.offsetX - this.middleDrag.x) / this.camera.zoom;
        const dy = (e.offsetY - this.middleDrag.y) / this.camera.zoom;
        this.camera.x -= dx; this.camera.y -= dy;
        this.camera.clamp(this.vw, this.vh, this.game.map.w * TILE, this.game.map.h * TILE);
        this.middleDrag = { x: e.offsetX, y: e.offsetY };
      }
      if (this.mouse.down && this.dragStart && this.mouse.button === 0) {
        const d = Math.hypot(e.offsetX - this.dragStart.x, e.offsetY - this.dragStart.y);
        if (d > 8) this.dragging = true;
      }
      if (this.placement) this.updateGhost();
    });

    canvas.addEventListener('pointerup', e => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pinch) return; // 捏合中不触发选择
      if (e.button === 1) this.middleDrag = null;
      if (e.button !== 0) { this.mouse.down = false; return; }
      this.mouse.down = false;
      if (this.dragStart && this.dragging) {
        this.boxSelect(this.dragStart, { x: e.offsetX, y: e.offsetY });
      } else if (this.dragStart) {
        this.clickSelect(this.mouse.wx, this.mouse.wy, e.shiftKey);
      }
      this.dragStart = null;
      this.dragging = false;
    });

    // P6 触屏：手指取消（系统手势打断）时清理多点状态
    canvas.addEventListener('pointercancel', e => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      this.mouse.down = false;
      this.dragStart = null;
      this.dragging = false;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const px = Number.isFinite(e.offsetX) ? e.offsetX : this.vw / 2;
      const py = Number.isFinite(e.offsetY) ? e.offsetY : this.vh / 2;
      const oldZoom = this.camera.zoom;
      const nz = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, oldZoom * factor));
      // 以鼠标为中心缩放
      const before = this.camera.screenToWorld(px, py, this.vw, this.vh);
      this.camera.zoom = nz;
      const after = this.camera.screenToWorld(px, py, this.vw, this.vh);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
      this.camera.clamp(this.vw, this.vh, this.game.map.w * TILE, this.game.map.h * TILE);
      this.updateWorldPos();
      if (this.placement) this.updateGhost();
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.onKeyDown(k, e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onKeyDown(k: string, e: KeyboardEvent) {
    // P5-d 回放模式：仅允许暂停/倍速
    if (this.game.replayMode) {
      if (k === 'p') document.getElementById('btn-pause')?.click();
      else if (k === '=' || k === '+') cycleSpeed();
      else if (k === '-') gameCtl.speed = 1;
      return;
    }
    if (this.game.over) return;
    // 编队
    if (k >= '1' && k <= '9') {
      const n = parseInt(k, 10);
      if (e.ctrlKey || e.metaKey) {
        this.controlGroups.set(n, this.selection.filter(s => s instanceof Unit && s.faction === 0).map(s => s.id));
        this.ui.log(`编队 ${n} 已设置（${this.controlGroups.get(n)!.length} 单位）`);
      } else {
        const ids = this.controlGroups.get(n);
        if (ids) {
          this.selection = ids.map(id => this.game.byId(id)).filter((x): x is Unit => x instanceof Unit && !x.dead);
          this.ui.syncSelection(this.selection);
        }
      }
      return;
    }
    switch (k) {
      case 'a':
        if (this.selection.some(s => s instanceof Unit && s.faction === 0 && s.def.kind !== 'worker')) {
          this.attackMovePending = true;
          this.ui.setCursor('attack');
        }
        break;
      case 's': {
        this.beginOrds();
        for (const s of this.selection) {
          if (s instanceof Unit && s.faction === 0) {
            this.ord(s, { type: 'idle' }, { resume: { type: 'idle' }, clearPath: true });
          }
        }
        this.flushOrds();
        break;
      }
      case 'h': {
        this.beginOrds();
        for (const s of this.selection) {
          if (s instanceof Unit && s.faction === 0) this.ord(s, { type: 'hold' });
        }
        this.flushOrds();
        break;
      }
      case 'b': {
        const worker = this.selection.find(s => s instanceof Unit && s.faction === 0 && s.def.kind === 'worker');
        if (worker) this.ui.toggleBuildTab();
        break;
      }
      // ===== P2 全局指令 =====
      case 't': {
        // 回城：选中兵各自移动到最近己方建筑
        const units = this.selection.filter((s): s is Unit => s instanceof Unit && s.faction === 0 && s.def.kind !== 'worker');
        if (units.length === 0) break;
        this.beginOrds();
        for (const u of units) {
          const b = this.nearestOwnBuilding(u.x, u.y);
          if (b) this.ord(u, { type: 'move', target: { x: b.x, y: b.y } }, { resume: { type: 'idle' }, gather: 'null' });
        }
        this.flushOrds();
        this.ui.log('回城：返回最近己方建筑');
        break;
      }
      case 'r': {
        this.revealPending = true;
        this.ui.setCursor('attack');
        this.ui.log('选择侦查区域（右键取消）');
        break;
      }
      case 'g': {
        if (this.selection.some(s => s instanceof Unit && s.faction === 0)) {
          this.rallyPending = true;
          this.ui.setCursor('attack');
          this.ui.log('选择集合点（右键取消）');
        }
        break;
      }
      case 'f': {
        if (this.selection.some(s => s instanceof Unit && s.faction === 0 && s.def.kind !== 'worker')) {
          this.focusPending = true;
          this.ui.setCursor('attack');
          this.ui.log('选择集火目标（点空地为攻击移动）');
        }
        break;
      }
      case ' ': {
        e.preventDefault();
        const main = this.game.getMain(0);
        if (main) { this.camera.x = main.x; this.camera.y = main.y; }
        break;
      }
      // ===== P5 暂停/倍速 =====
      case 'p':
        document.getElementById('btn-pause')?.click();
        break;
      case '=':
      case '+':
        cycleSpeed();
        break;
      case '-':
        gameCtl.speed = 1;
        break;
      case 'escape':
        if (this.placement) this.cancelPlacement();
        else if (this.skillPending) { this.skillPending = null; this.ui.setCursor(''); }
        else if (this.attackMovePending) { this.attackMovePending = false; this.ui.setCursor(''); }
        else if (this.revealPending || this.rallyPending || this.focusPending) {
          this.revealPending = this.rallyPending = this.focusPending = false;
          this.ui.setCursor('');
        }
        else this.setSelection([]);
        break;
    }
  }

  private updateWorldPos() {
    const w = this.camera.screenToWorld(this.mouse.sx, this.mouse.sy, this.vw, this.vh);
    this.mouse.wx = w.x; this.mouse.wy = w.y;
  }

  /** P6 捏合手势锚点：起始指距 / 起始缩放 / 起始中点世界坐标 */
  private pinchStart() {
    const [a, b] = [...this.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.camera.zoom,
      world: this.camera.screenToWorld(mid.x, mid.y, this.vw, this.vh),
    };
  }

  /** P6 捏合更新：缩放 = 起始缩放 × 指距比，起始世界点跟随双指中点 */
  private applyPinch() {
    const pinch = this.pinch!;
    const [a, b] = [...this.pointers.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, pinch.zoom * dist / pinch.dist));
    this.camera.x = pinch.world.x - (mid.x - this.vw / 2) / this.camera.zoom;
    this.camera.y = pinch.world.y - (mid.y - this.vh / 2) / this.camera.zoom;
    this.camera.clamp(this.vw, this.vh, this.game.map.w * TILE, this.game.map.h * TILE);
    this.updateWorldPos();
    if (this.placement) this.updateGhost();
  }

  // ===== 选择 =====
  private pickAt(wx: number, wy: number): Entity | null {
    let best: Entity | null = null;
    let bd = Infinity;
    for (const u of this.game.units) {
      if (u.dead) continue;
      if (u.faction !== 0 && !this.visibleAt(u.x, u.y)) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < u.radius + 8 && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      if (b.faction !== 0 && !b.seenBy[0]) continue;
      if (wx >= b.tx * TILE && wx < (b.tx + b.w) * TILE &&
          wy >= b.ty * TILE && wy < (b.ty + b.h) * TILE) return b;
    }
    return null;
  }

  private visibleAt(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.game.map.w || ty >= this.game.map.h) return false;
    return this.game.fog[ty * this.game.map.w + tx] === 2;
  }

  private clickSelect(wx: number, wy: number, additive: boolean) {
    const hit = this.pickAt(wx, wy);
    const now = performance.now();
    // 双击：选屏幕内同类
    if (hit instanceof Unit && hit.faction === 0 && hit.id === this.lastClickId && now - this.lastClickTime < 350) {
      const same = this.game.units.filter(u =>
        !u.dead && u.faction === 0 && u.def.id === hit.def.id &&
        this.onScreen(u.x, u.y));
      this.setSelection(same);
      this.lastClickTime = now;
      return;
    }
    this.lastClickTime = now;
    this.lastClickId = hit ? hit.id : 0;

    if (!hit) { this.setSelection([]); return; }
    if (additive && hit.faction === 0) {
      const sel = [...this.selection];
      const i = sel.indexOf(hit);
      if (i >= 0) sel.splice(i, 1); else sel.push(hit);
      this.setSelection(sel);
    } else {
      this.setSelection(hit.faction === 0 && hit instanceof Unit
        ? [hit]
        : [hit]);
    }
  }

  private onScreen(wx: number, wy: number): boolean {
    const s = this.camera.worldToScreen(wx, wy, this.vw, this.vh);
    return s.x >= 0 && s.y >= 0 && s.x <= this.vw && s.y <= this.vh;
  }

  private boxSelect(a: Vec2, b: Vec2) {
    const w1 = this.camera.screenToWorld(Math.min(a.x, b.x), Math.min(a.y, b.y), this.vw, this.vh);
    const w2 = this.camera.screenToWorld(Math.max(a.x, b.x), Math.max(a.y, b.y), this.vw, this.vh);
    const sel = this.game.units.filter(u =>
      !u.dead && u.faction === 0 &&
      u.x >= w1.x && u.x <= w2.x && u.y >= w1.y && u.y <= w2.y);
    // 框选里含战斗单位则排除工人
    const combat = sel.filter(u => u.def.kind !== 'worker');
    this.setSelection(combat.length > 0 ? combat : sel);
  }

  setSelection(sel: Entity[]) {
    for (const s of this.selection) s.selected = false;
    this.selection = sel.slice(0, 48);
    for (const s of this.selection) s.selected = true;
    if (this.selection.length > 0) audio.play('click'); // P6 选择音
    this.ui.syncSelection(this.selection);
  }

  // ===== 技能施法 =====
  beginSkillCast(unit: Unit, idx: number) {
    const sk = unit.heroSkillDefs[idx];
    if (!sk) return;
    if (sk.targeted) {
      this.skillPending = { unit, idx };
      this.ui.setCursor('attack');
      this.ui.log(`选择${sk.name}的目标地点（右键取消）`);
    } else {
      recCmd('cast', unit.id, idx, null, null);
      unit.castSkill(this.game, idx);
      audio.play('confirm');
    }
  }

  // ===== 指令 =====
  private issueContextCommand(wx: number, wy: number) {
    const own = this.selection.filter(s => s.faction === 0);
    if (own.length === 0) return;

    // 选中建筑 → 设置集结点
    if (own.length === 1 && own[0] instanceof Building && (own[0] as Building).built) {
      const b = own[0] as Building;
      b.rally = { x: wx, y: wy };
      recCmd('rally', b.id, wx, wy);
      this.ui.log(`${b.def.name} 集结点已设置`);
      this.ui.spawnRallyMarker(b, wx, wy);
      audio.play('confirm');
      return;
    }

    const units = own.filter((s): s is Unit => s instanceof Unit);
    if (units.length === 0) return;

    this.beginOrds();
    const hit = this.pickAt(wx, wy);

    // 攻击敌人（友军/队友单位 → 视为移动；飞行目标：不能对空的单位改为跟随移动）
    if (hit && hit.faction !== 2 && !this.game.sameTeam(hit.faction, 0)) {
      const hitFlying = hit instanceof Unit && hit.flying;
      for (const u of units) {
        if (hitFlying && !u.canAir) {
          this.ord(u, { type: 'move', target: { x: hit.x, y: hit.y } }, { resume: { type: 'idle' }, gather: 'null' });
        } else {
          this.ord(u, { type: 'attack', targetId: hit.id }, { resume: { type: 'idle' } });
        }
      }
      this.flushOrds();
      if (hitFlying) {
        const n = units.filter(u => !u.canAir).length;
        if (n > 0) this.ui.log(`${n} 个地面近战单位无法攻击飞行目标`);
      }
      audio.play('confirm');
      return;
    }

    // 工人采集
    const workers = units.filter(u => u.def.kind === 'worker');
    if (hit instanceof Building && hit.faction === 0 && !hit.built) {
      // 继续建造
      for (const u of workers) this.ord(u, { type: 'build', buildingId: hit.id });
      for (const u of units.filter(u => u.def.kind !== 'worker')) {
        this.ord(u, { type: 'move', target: { x: wx, y: wy } });
      }
      this.flushOrds();
      audio.play('confirm');
      return;
    }
    if (workers.length > 0 && !hit) {
      // 点在地上附近有金矿？直接采
      const node = this.game.findNearestNode(wx, wy);
      if (node && Math.hypot(node.x - wx, node.y - wy) < TILE * 2.5) {
        for (const u of workers) this.ord(u, { type: 'gather', nodeId: node.id }, { gather: 'null' });
        if (workers.length === units.length) { this.flushOrds(); audio.play('confirm'); return; }
      }
    }

    // 其余：移动（编队阵型偏移）
    const targets = this.formation(wx, wy, units.length);
    units.forEach((u, i) => {
      this.ord(u, { type: 'move', target: targets[i] }, { resume: { type: 'idle' }, gather: 'null' });
    });
    this.flushOrds();
    this.ui.spawnMoveMarker(wx, wy);
    audio.play('confirm');
  }

  private issueAttackMove(wx: number, wy: number) {
    const units = this.selection.filter((s): s is Unit => s instanceof Unit && s.faction === 0);
    this.beginOrds();
    const targets = this.formation(wx, wy, units.length);
    units.forEach((u, i) => {
      this.ord(u, { type: 'attackMove', target: targets[i] }, { resume: { type: 'idle' } });
    });
    this.flushOrds();
    this.ui.spawnMoveMarker(wx, wy, true);
    audio.play('confirm');
  }

  /** P2 回城：最近己方已建成建筑 */
  private nearestOwnBuilding(x: number, y: number): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.game.buildings) {
      if (b.dead || b.faction !== 0 || !b.built) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** P2 G 集合：选中单位在目标点集结 */
  private issueRally(wx: number, wy: number) {
    const units = this.selection.filter((s): s is Unit => s instanceof Unit && s.faction === 0);
    if (units.length === 0) return;
    this.beginOrds();
    const targets = this.formation(wx, wy, units.length);
    units.forEach((u, i) => {
      this.ord(u, { type: 'move', target: targets[i] }, { resume: { type: 'idle' }, gather: 'null' });
    });
    this.flushOrds();
    this.ui.spawnMoveMarker(wx, wy);
    this.ui.log('集合！');
    audio.play('confirm');
  }

  /** P2 F 集火：点敌方单位全员攻击，点空地退化为攻击移动 */
  private issueFocus(wx: number, wy: number) {
    const units = this.selection.filter((s): s is Unit => s instanceof Unit && s.faction === 0 && s.def.kind !== 'worker');
    if (units.length === 0) return;
    const hit = this.pickAt(wx, wy);
    this.beginOrds();
    if (hit && hit.faction !== 2 && !this.game.sameTeam(hit.faction, 0) && hit instanceof Unit) {
      const fly = hit.flying;
      for (const u of units) {
        if (fly && !u.canAir) {
          this.ord(u, { type: 'move', target: { x: hit.x, y: hit.y } }, { resume: { type: 'idle' } });
        } else {
          this.ord(u, { type: 'attack', targetId: hit.id }, { resume: { type: 'idle' } });
        }
      }
      this.flushOrds();
      this.ui.spawnMoveMarker(hit.x, hit.y, true);
      this.ui.log(`集火 ${hit.def.name}`);
      audio.play('confirm');
    } else {
      // 点空地 → 攻击移动
      const targets = this.formation(wx, wy, units.length);
      units.forEach((u, i) => {
        this.ord(u, { type: 'attackMove', target: targets[i] }, { resume: { type: 'idle' } });
      });
      this.flushOrds();
      this.ui.spawnMoveMarker(wx, wy, true);
      audio.play('confirm');
    }
  }

  /** 简单方阵偏移 */
  private formation(wx: number, wy: number, n: number): Vec2[] {
    const cols = Math.ceil(Math.sqrt(n));
    const gap = 30;
    const out: Vec2[] = [];
    const r0 = Math.floor((cols - 1) / 2);
    for (let i = 0; i < n; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      out.push({
        x: wx + (cx - r0) * gap,
        y: wy + (cy - Math.floor((n - 1) / cols / 2)) * gap,
      });
    }
    return out;
  }

  // ===== 建造摆放 =====
  startPlacement(defId: string) {
    this.placement = defId;
    this.updateGhost();
  }
  cancelPlacement() {
    this.placement = null;
    this.ui.setCursor('');
  }
  private updateGhost() {
    const def = this.placement ? BUILDINGS[this.placement] : null;
    if (!def) return;
    this.ghostTx = Math.floor(this.mouse.wx / TILE) - Math.floor(def.w / 2);
    this.ghostTy = Math.floor(this.mouse.wy / TILE) - Math.floor(def.h / 2);
    this.ghostValid = this.game.canPlace(this.ghostTx, this.ghostTy, def.w, def.h) &&
      this.game.canAfford(0, def.costGold, def.costCrystal);
  }
  private tryPlace() {
    if (!this.placement) return;
    const defId = this.placement;
    const builder = this.selection.find(s => s instanceof Unit && s.faction === 0 && s.def.kind === 'worker') as Unit | undefined;
    const b = this.game.placeBuilding(0, defId, this.ghostTx, this.ghostTy, builder);
    if (b) {
      recCmd('place', defId, this.ghostTx, this.ghostTy, builder ? builder.id : -1);
      // 其他选中的工人也帮忙
      this.beginOrds();
      for (const s of this.selection) {
        if (s instanceof Unit && s !== builder && s.def.kind === 'worker') {
          this.ord(s, { type: 'build', buildingId: b.id });
        }
      }
      this.flushOrds();
      this.ui.log(`${b.def.name} 开始建造`);
    }
    this.cancelPlacement();
  }

  // ===== 帧更新（镜头滚动） =====
  tick(dt: number) {
    if (this.game.over) return;
    const speed = 620 / this.camera.zoom * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('arrowup')) dy -= speed;
    if (this.keys.has('arrowdown')) dy += speed;
    if (this.keys.has('arrowleft')) dx -= speed;
    if (this.keys.has('arrowright')) dx += speed;
    // 边缘滚动
    const m = 14;
    if (this.mouse.sx >= 0 && this.mouse.sy >= 0) {
      if (this.mouse.sx < m) dx -= speed;
      if (this.mouse.sx > this.vw - m) dx += speed;
      if (this.mouse.sy < m) dy -= speed;
      if (this.mouse.sy > this.vh - m) dy += speed;
    }
    if (dx || dy) {
      this.camera.x += dx; this.camera.y += dy;
      this.camera.clamp(this.vw, this.vh, this.game.map.w * TILE, this.game.map.h * TILE);
    }
  }
}
