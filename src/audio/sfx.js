// Web Audio 程序化音效（无音频文件），含轻量循环 BGM

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** 基础发声：振荡器 + 音量包络 + 可选滑音 */
  tone({ freq = 440, end = null, dur = 0.15, type = 'sine', vol = 0.3, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t0);
  }

  jump() { this.tone({ freq: 320, end: 640, dur: 0.18, type: 'square', vol: 0.12 }); }
  land() { this.noise({ dur: 0.08, vol: 0.08 }); }
  slide() { this.noise({ dur: 0.25, vol: 0.1 }); }
  coin() {
    this.tone({ freq: 1318, dur: 0.07, type: 'sine', vol: 0.16 });
    this.tone({ freq: 1760, dur: 0.14, type: 'sine', vol: 0.16, delay: 0.06 });
  }
  power() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.16, delay: i * 0.07 }));
  }
  shieldBreak() {
    this.tone({ freq: 800, end: 200, dur: 0.3, type: 'sawtooth', vol: 0.18 });
    this.noise({ dur: 0.15, vol: 0.12 });
  }
  die() {
    this.tone({ freq: 400, end: 60, dur: 0.5, type: 'sawtooth', vol: 0.2 });
    this.noise({ dur: 0.4, vol: 0.18 });
  }
  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.18, delay: i * 0.12 }));
  }
  click() { this.tone({ freq: 660, dur: 0.05, type: 'sine', vol: 0.1 }); }
  count() { this.tone({ freq: 880, dur: 0.1, type: 'sine', vol: 0.12 }); }

  /** 轻量 BGM：五声音阶琶音 + 低音，120 BPM 十六分音符 */
  startBgm() {
    if (!this.ensure() || this.bgmTimer) return;
    const scale = [220, 262, 294, 330, 392, 440, 524, 587];
    const bass = [110, 110, 147, 131];
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const s = this.bgmStep++;
      if (s % 4 === 0) {
        this.tone({ freq: bass[(s / 4) % 4], dur: 0.4, type: 'triangle', vol: 0.05 });
      }
      const n = scale[(s * 3 + Math.floor(s / 8) * 2) % scale.length];
      this.tone({ freq: n, dur: 0.14, type: 'sine', vol: 0.035 });
      if (s % 2 === 1) this.noise({ dur: 0.03, vol: 0.012 });
    }, 125);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
