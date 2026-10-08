// P6 表现层：WebAudio 全合成音效 + 环境 BGM（零外部音频资源，无加载开销）
// 所有声音均为振荡器/噪声实时合成；unlock() 需在首次用户交互后调用（浏览器自动播放策略）

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private muted = false;
  private lastHitAt = 0;
  private bgmTimer: ReturnType<typeof setInterval> | null = null;
  private chordIdx = 0;

  /** 首次交互时创建/恢复 AudioContext（幂等，可常驻监听） */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.startBgm();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }

  get isMuted() { return this.muted; }

  /** 播放命名音效（未知名称忽略） */
  play(name: string) {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click': // 选择单位
        this.tone(660, 0.05, 'square', 0.05);
        break;
      case 'confirm': // 指令确认（两连升调）
        this.tone(520, 0.06, 'square', 0.06);
        this.tone(780, 0.09, 'square', 0.055, t + 0.05);
        break;
      case 'place': // 放置建筑（低沉落锤）
        this.tone(150, 0.18, 'sine', 0.22, t, 60);
        this.noise(0.12, 0.08, 500);
        break;
      case 'train': // 训练排队
        this.tone(440, 0.07, 'triangle', 0.09);
        this.tone(660, 0.09, 'triangle', 0.08, t + 0.06);
        break;
      case 'build': // 建造完成（三连上行琶音）
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.09, t + i * 0.09));
        break;
      case 'tech': // 科技升级完成
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.14, 'sine', 0.08, t + i * 0.08));
        break;
      case 'orb': // 拾取魔法球（清脆双音）
        this.tone(1180, 0.08, 'sine', 0.08);
        this.tone(1560, 0.1, 'sine', 0.065, t + 0.06);
        break;
      case 'wave': // 敌方波次来袭（低鸣号角）
        this.tone(196, 0.7, 'sawtooth', 0.075, t, 185);
        this.tone(294, 0.55, 'sawtooth', 0.045, t + 0.14);
        break;
      case 'hit': // 战斗命中（噪声脉冲，90ms 节流 + 随机音色）
        {
          const now = performance.now();
          if (now - this.lastHitAt < 90) return;
          this.lastHitAt = now;
          this.noise(0.06, 0.075, 900 + Math.random() * 700);
        }
        break;
      case 'win': // 胜利号角
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.11, t + i * 0.12));
        break;
      case 'lose': // 失败低鸣
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.09, t + i * 0.18));
        break;
    }
  }

  // ===== 合成原语 =====
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at?: number, slideTo?: number) {
    const ctx = this.ctx!;
    const t0 = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, lowpass: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start();
  }

  // ===== BGM：环境 pad 和弦循环（低音量氛围垫底） =====
  private startBgm() {
    if (this.bgmTimer) return;
    // 低音区四和弦循环（Am → F → G → Em），8.5s 一换
    const chords: number[][] = [
      [110, 164.8, 220],
      [87.3, 130.8, 174.6],
      [98, 146.8, 196],
      [82.4, 123.5, 164.8],
    ];
    const next = () => {
      if (!this.ctx || !this.musicBus) return;
      const ch = chords[this.chordIdx++ % chords.length];
      ch.forEach(f => this.pad(f, 9.5));
    };
    next();
    this.bgmTimer = setInterval(next, 8500);
  }

  /** 双失谐振荡器 + 慢包络 → 柔和 pad */
  private pad(freq: number, dur: number) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.028, t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 620;
    g.connect(f).connect(this.musicBus!);
    for (const detune of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    }
  }
}

export const audio = new AudioManager();
