import { Application, Container, Graphics } from 'pixi.js';
import { TILE, FACTION_COLORS, BUILDINGS, UNITS } from './config';
import type { Game } from './game';
import { Unit, Building } from './entities';
import { Camera } from './input';
import type { InputController } from './input';
import { T_TREE } from './map';

interface Marker {
  x: number; y: number;
  life: number;
  maxLife: number;
  color: number;
  ring: boolean;
}

export class Renderer {
  app = new Application();
  camera: Camera;
  world = new Container();
  screenLayer = new Container();
  terrain = new Graphics();
  fogGfx = new Graphics();
  nodeGfx = new Graphics();
  entityGfx = new Graphics();
  fxGfx = new Graphics();
  selGfx = new Graphics(); // 屏幕层：框选
  viewW = 1;
  viewH = 1;
  private lastFogVersion = -1;
  private markers: Marker[] = [];
  private game: Game;
  input: InputController | null = null;

  private constructor(game: Game, camera: Camera) {
    this.game = game;
    this.camera = camera;
  }

  static async create(game: Game, camera: Camera, container: HTMLElement): Promise<Renderer> {
    const r = new Renderer(game, camera);
    await r.app.init({ resizeTo: container, background: 0x10151f, antialias: true });
    container.appendChild(r.app.canvas);
    r.viewW = r.app.screen.width;
    r.viewH = r.app.screen.height;
    r.buildLayers();
    r.app.ticker.add(t => r.frame(t.deltaMS / 1000));
    window.addEventListener('resize', () => {
      r.viewW = r.app.screen.width;
      r.viewH = r.app.screen.height;
    });
    return r;
  }

  private buildLayers() {
    this.world.addChild(this.terrain);
    this.world.addChild(this.nodeGfx);
    this.world.addChild(this.fogGfx);
    this.world.addChild(this.entityGfx);
    this.world.addChild(this.fxGfx);
    this.screenLayer.addChild(this.selGfx);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.screenLayer);
    this.drawTerrain();
  }

  // ===== 静态地形（一次性） =====
  private drawTerrain() {
    const g = this.terrain;
    const map = this.game.map;
    g.clear();
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const t = map.tiles[ty * map.w + tx];
        const x = tx * TILE, y = ty * TILE;
        if (t === T_TREE) {
          g.rect(x, y, TILE, TILE).fill(0x1d3320);
        } else {
          const n = ((tx * 73856093) ^ (ty * 19349663)) & 7;
          const shade = n === 0 ? 0x253528 : n < 3 ? 0x233125 : 0x212e23;
          g.rect(x, y, TILE, TILE).fill(shade);
        }
      }
    }
    // 树冠
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        if (map.tiles[ty * map.w + tx] !== T_TREE) continue;
        const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
        const jx = ((tx * 31 + ty * 17) % 7) - 3;
        g.circle(cx + jx, cy - 2, 10).fill(0x2f4d33);
        g.circle(cx + jx - 3, cy + 2, 7).fill(0x3a5f3e);
        g.rect(cx - 1.5, cy + 6, 3, 6).fill(0x4a3524);
      }
    }
  }

  addMarker(x: number, y: number, color: number, ring = false) {
    this.markers.push({ x, y, life: 0.6, maxLife: 0.6, color, ring });
  }

  // ===== 每帧 =====
  private frame(dt: number) {
    // 镜头
    const cam = this.camera;
    this.world.scale.set(cam.zoom);
    this.world.position.set(
      this.viewW / 2 - cam.x * cam.zoom,
      this.viewH / 2 - cam.y * cam.zoom
    );

    this.drawNodes();
    this.drawEntities();
    this.drawFx(dt);
    this.drawFog();
    this.drawScreenOverlay(dt);
  }

  private drawNodes() {
    const g = this.nodeGfx;
    g.clear();
    for (const n of this.game.resourceNodes.values()) {
      const cx = n.x, cy = n.y;
      const ratio = n.maxAmount > 0 ? n.amount / n.maxAmount : 0;
      if (n.amount <= 0) {
        g.rect(n.tx * TILE, n.ty * TILE, n.w * TILE, n.h * TILE).fill({ color: 0x3a3a30, alpha: 0.9 });
        continue;
      }
      // 矿脉底座
      g.rect(n.tx * TILE + 3, n.ty * TILE + 3, n.w * TILE - 6, n.h * TILE - 6).fill(0x4a4235);
      const size = 8 + ratio * 8;
      g.moveTo(cx, cy - size).lineTo(cx + size, cy).lineTo(cx, cy + size).lineTo(cx - size, cy).closePath()
        .fill({ color: 0xffd34d });
      g.moveTo(cx, cy - size * 0.5).lineTo(cx + size * 0.5, cy).lineTo(cx, cy + size * 0.5).lineTo(cx - size * 0.5, cy).closePath()
        .fill({ color: 0xfff0b3 });
      // P2：被占领的矿画归属环
      if (n.owner !== -1) {
        g.rect(n.tx * TILE + 1, n.ty * TILE + 1, n.w * TILE - 2, n.h * TILE - 2)
          .stroke({ width: 2, color: FACTION_COLORS[n.owner] });
      }
    }
  }

  private drawEntities() {
    const g = this.entityGfx;
    g.clear();
    const game = this.game;

    // P4：尸体（亡灵复苏素材，随时间渐隐）
    for (const c of game.corpses) {
      const a = Math.min(1, c.timer / 5);
      const def = UNITS[c.defId];
      const r = def ? def.radius * 0.8 : 6;
      g.ellipse(c.x, c.y, r, r * 0.5).fill({ color: 0x3d3f47, alpha: 0.55 * a });
      g.rect(c.x - 1.5, c.y - r, 3, r).fill({ color: 0x8d8f99, alpha: 0.85 * a });
      g.rect(c.x - r * 0.5, c.y - r * 0.6, r, 3).fill({ color: 0x8d8f99, alpha: 0.85 * a });
    }

    // 建筑
    for (const b of game.buildings) {
      if (b.dead) continue;
      if (!game.sameTeam(b.faction, 0) && !b.seenBy[0]) continue;
      const x = b.tx * TILE, y = b.ty * TILE, w = b.w * TILE, h = b.h * TILE;
      const base = b.faction === 0 ? b.def.color
        : b.faction === 2 ? b.def.color
        : game.sameTeam(b.faction, 0) ? mix(b.def.color, 0x3fb8c8, 0.35)
        : mix(b.def.color, 0xcc3333, 0.45);
      const alpha = b.built ? 1 : 0.45;
      g.rect(x + 2, y + 2, w - 4, h - 4).fill({ color: base, alpha });
      g.rect(x + 2, y + 2, w - 4, h - 4).stroke({ width: 2, color: FACTION_COLORS[b.faction], alpha: b.faction === 2 ? 0.6 : 1 });
      // 屋顶细节
      g.rect(x + 6, y + 6, w - 12, (h - 12) * 0.42).fill({ color: lighten(base, 0.25), alpha });
      if (b.def.kind === 'main') {
        g.circle(x + w / 2, y + h / 2 - 2, 12).fill({ color: lighten(base, 0.45), alpha });
        g.circle(x + w / 2, y + h / 2 - 2, 12).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
      }
      // P2：据点旗帜标识
      if (b.def.kind === 'stronghold') {
        const fx = x + w / 2, fy = y + h / 2 - 6;
        g.rect(fx - 1.5, fy - 12, 3, 20).fill(0x5a4632);
        g.moveTo(fx + 1.5, fy - 12).lineTo(fx + 15, fy - 8).lineTo(fx + 1.5, fy - 3).closePath()
          .fill(FACTION_COLORS[b.faction]);
        g.circle(fx, fy + 12, 5).fill({ color: lighten(base, 0.35), alpha });
      }
      if (b.def.kind === 'tower' && b.built) {
        g.circle(x + w / 2, y + h / 2, 5).fill(0x222222);
        g.circle(x + w / 2, y + h / 2, 3).fill(0xff5544);
        if (b.selected) {
          g.circle(x + w / 2, y + h / 2, b.def.range ?? 190).stroke({ width: 1, color: 0x88ff88, alpha: 0.5 });
        }
      }
      if (!b.built) {
        const p = b.buildProgress;
        g.rect(x + 4, y + h - 9, (w - 8) * p, 5).fill(0x66ccff);
      }
      // 生产/升级进度
      if (b.built && b.queue.length > 0) {
        const it = b.queue[0];
        g.rect(x + 4, y + h - 9, (w - 8) * (1 - it.timer / it.total), 5).fill(0xffd97a);
      }
      if (b.built && b.techUpgrade) {
        g.rect(x + 4, y + h - 9, (w - 8) * (1 - b.techUpgrade.timer / b.techUpgrade.total), 5).fill(0x9f7fff);
      }
      // 血条
      this.hpBar(g, x + 2, y - 8, w - 4, b.hp, b.maxHp, b.faction, b.selected || b.hp < b.maxHp);
      // 集结点
      if (b.selected && b.rally) {
        g.moveTo(b.x, b.y).lineTo(b.rally.x, b.rally.y).stroke({ width: 1, color: 0x66ff66, alpha: 0.4 });
        g.circle(b.rally.x, b.rally.y, 5).stroke({ width: 1.5, color: 0x66ff66, alpha: 0.8 });
      }
    }

    // 单位
    for (const u of game.units) {
      if (u.dead) continue;
      if (!game.sameTeam(u.faction, 0) && !this.visibleUnit(u)) continue;
      const r = u.radius;
      const fly = u.flying;
      const yo = fly ? -12 : 0; // 飞行悬浮偏移
      const uy = u.y + yo;
      const col = u.faction === 0 ? u.def.color
        : u.faction === 2 ? u.def.color
        : game.sameTeam(u.faction, 0) ? mix(u.def.color, 0x3fb8c8, 0.3)
        : mix(u.def.color, 0xcc3333, 0.4);
      // 影子（飞行时更小更淡）
      g.ellipse(u.x, u.y + r * 0.7, fly ? r * 0.55 : r * 0.9, fly ? r * 0.25 : r * 0.4)
        .fill({ color: 0x000000, alpha: fly ? 0.15 : 0.25 });
      // 身体
      const flash = u.hitFlash > 0;
      g.circle(u.x, uy, r).fill(flash ? 0xffffff : col);
      g.circle(u.x, uy, r).stroke({ width: 1.5, color: FACTION_COLORS[u.faction], alpha: u.isCreep ? 0.7 : 1 });
      // 朝向指示
      g.circle(u.x + Math.cos(u.facing) * r * 0.55, uy + Math.sin(u.facing) * r * 0.55, r * 0.3)
        .fill({ color: 0x111111, alpha: 0.55 });
      // 攻击动画
      if (u.attackAnim > 0) {
        const a = u.attackAnim / 0.15;
        g.circle(u.x + Math.cos(u.facing) * (r + 4), uy + Math.sin(u.facing) * (r + 4), 3 * a)
          .fill({ color: 0xffffff, alpha: a });
      }
      // 英雄标识
      if (u.def.kind === 'hero') {
        g.circle(u.x, uy, r + 4).stroke({ width: 2, color: 0xffd97a, alpha: 0.9 });
      }
      // 护盾指示
      if (u.shieldHp > 0) {
        g.circle(u.x, uy, r + 6).stroke({ width: 1.5, color: 0x9fd8ff, alpha: 0.7 });
      }
      // P2 buff 指示
      if (u.hasteTimer > 0) {
        g.circle(u.x, uy, r + 6).stroke({ width: 1.5, color: 0x66e0ff, alpha: 0.8 });
      }
      if (u.frenzyTimer > 0) {
        g.circle(u.x, uy, r + 8).stroke({ width: 1.5, color: 0xff6644, alpha: 0.8 });
      }
      // 工人携带金子
      if (u.gather && u.gather.carrying > 0) {
        g.circle(u.x, uy - r - 4, 3).fill(0xffd34d);
      }
      // 血条 / 等级
      const showBar = u.selected || u.hp < u.maxHp || u.shieldHp > 0;
      if (showBar) {
        this.hpBar(g, u.x - 12, uy - r - 10, 24, u.hp, u.maxHp, u.faction, u.selected);
      }
      if (u.def.kind === 'hero' && u.level > 1) {
        // 等级角标
        g.circle(u.x + r + 1, uy - r - 1, 6).fill(0x1b2233);
        g.circle(u.x + r + 1, uy - r - 1, 6).stroke({ width: 1, color: 0xffd97a });
        for (let i = 0; i < u.level - 1; i++) {
          g.rect(u.x + r - 2.5 + i * 2.4, uy - r - 4.5, 1.6, 7).fill(0xffd97a);
        }
      }
    }

    // 弹道
    for (const p of game.projectiles) {
      g.circle(p.x, p.y, 3).fill(p.color);
      g.circle(p.x, p.y, 5).stroke({ width: 1, color: p.color, alpha: 0.4 });
    }

    // P2：魔法球（浮动 + 闪烁）
    for (const o of game.orbs) {
      const bob = Math.sin(game.time * 4 + o.id) * 3;
      const oy = o.y - 6 + bob;
      const col = o.type === 'haste' ? 0x66e0ff : o.type === 'frenzy' ? 0xff6644 : 0xffd34d;
      const glow = 0.55 + 0.35 * Math.sin(game.time * 6 + o.id * 2);
      g.circle(o.x, oy, 9).fill({ color: col, alpha: 0.25 * glow + 0.2 });
      g.circle(o.x, oy, 5).fill(col);
      g.circle(o.x, oy, 9).stroke({ width: 1.5, color: col, alpha: glow });
      // 剩余时间环
      g.moveTo(o.x, oy).arc(o.x, oy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, o.life) / 30)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
    }

    // 选中环
    for (const e of game.units) {
      if (e.dead || !e.selected) continue;
      g.circle(e.x, e.y + (e.flying ? -12 : 2), e.radius + 4).stroke({ width: 1.5, color: 0x6dff8a });
    }
    for (const b of game.buildings) {
      if (b.dead || !b.selected) continue;
      if (!game.sameTeam(b.faction, 0) && !b.seenBy[0]) continue;
      g.rect(b.tx * TILE + 1, b.ty * TILE + 1, b.w * TILE - 2, b.h * TILE - 2)
        .stroke({ width: 1.5, color: 0x6dff8a });
    }
  }

  private visibleUnit(u: Unit): boolean {
    if (this.game.sameTeam(u.faction, 0)) return true;
    const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.game.map.w || ty >= this.game.map.h) return false;
    return this.game.fog[ty * this.game.map.w + tx] === 2;
  }

  private hpBar(g: Graphics, x: number, y: number, w: number, hp: number, maxHp: number, faction: number, show: boolean) {
    if (!show || maxHp <= 0) return;
    const p = Math.max(0, hp / maxHp);
    g.rect(x, y, w, 4).fill({ color: 0x111111, alpha: 0.8 });
    const t = this.game.teams[faction];
    const c = t === this.game.teams[0] ? (faction === 0 ? 0x55dd55 : 0x3fb8c8)
      : faction === 2 ? 0xd0a84d : 0xdd5555;
    g.rect(x + 0.5, y + 0.5, (w - 1) * p, 3).fill(c);
  }

  private drawFx(dt: number) {
    const g = this.fxGfx;
    g.clear();
    for (const m of this.markers) {
      m.life -= dt;
      const p = 1 - m.life / m.maxLife;
      if (m.ring) {
        g.circle(m.x, m.y, 6 + p * 14).stroke({ width: 2, color: m.color, alpha: 1 - p });
      } else {
        g.moveTo(m.x, m.y - 8 + p * 4).lineTo(m.x, m.y + 8 - p * 4)
          .moveTo(m.x - 8 + p * 4, m.y).lineTo(m.x + 8 - p * 4, m.y)
          .stroke({ width: 2, color: m.color, alpha: 1 - p });
      }
    }
    this.markers = this.markers.filter(m => m.life > 0);

    for (const fx of this.game.effects) {
      const p = 1 - fx.life / fx.maxLife;
      g.circle(fx.x, fx.y, fx.radius * (0.3 + 0.7 * p))
        .stroke({ width: 3, color: fx.color, alpha: 1 - p });
    }
  }

  private drawFog() {
    if (this.lastFogVersion === this.game.fogVersion) return;
    this.lastFogVersion = this.game.fogVersion;
    const g = this.fogGfx;
    const fog = this.game.fog;
    const w = this.game.map.w, h = this.game.map.h;
    g.clear();
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const f = fog[ty * w + tx];
        if (f === 2) continue;
        g.rect(tx * TILE, ty * TILE, TILE, TILE)
          .fill({ color: 0x05070c, alpha: f === 1 ? 0.45 : 0.94 });
      }
    }
  }

  private drawScreenOverlay(dt: number) {
    const input = this.input;
    const g = this.selGfx;
    g.clear();
    if (!input) return;
    // 框选
    if (input.dragStart && input.dragging) {
      const a = input.dragStart;
      const b = { x: input.mouse.sx, y: input.mouse.sy };
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .fill({ color: 0x6dff8a, alpha: 0.08 });
      g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .stroke({ width: 1, color: 0x6dff8a, alpha: 0.8 });
    }
    // 建造幽灵
    if (input.placement) {
      const def = BUILDINGS[input.placement];
      if (def) {
        const x = input.ghostTx * TILE, y = input.ghostTy * TILE;
        const col = input.ghostValid ? 0x66ff66 : 0xff5555;
        g.rect(x, y, def.w * TILE, def.h * TILE).fill({ color: col, alpha: 0.18 });
        g.rect(x, y, def.w * TILE, def.h * TILE).stroke({ width: 2, color: col, alpha: 0.9 });
      }
    }
    void dt;
  }
}

// ===== 颜色工具 =====
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16 | (ag + (bg - ag) * t) << 8 | (ab + (bb - ab) * t));
}
function lighten(c: number, t: number): number { return mix(c, 0xffffff, t); }
