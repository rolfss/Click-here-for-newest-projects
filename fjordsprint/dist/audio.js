/**
 * Original, asset-free soundtrack and vehicle audio for a mountain time trial.
 * Call start() from a user gesture, then update() once per simulation frame.
 * speed is km/h; throttle, boost and drift accept booleans or values from 0–1.
 * No nodes are created by update(). Sequenced notes disconnect when they end.
 */
export class RaceAudio {
  constructor() {
    this.volume = 0.3;
    this.musicEnabled = true;
    this.ctx = null;
    this._timer = null;
    this._voices = new Set();
    this._suspended = true;
    this._starting = null;
    this._suspending = null;
    this._generation = 0;
    this._startGeneration = -1;
    this._step = 0;
    this._nextNote = 0;
    this._speed = 0;
    this._throttle = 0;
    this._boost = 0;
    this._drift = 0;
    this._active = false;
    this._lastCue = new Map();
    this._beat = 60 / 98;
    this._cueTranspose = 0;
  }

  async start() {
    const generation = this._generation;
    if (this._starting && this._startGeneration === generation) return this._starting;
    this._startGeneration = generation;
    const attempt = this._start(generation);
    this._starting = attempt;
    try { return await attempt; }
    finally { if (this._starting === attempt) this._starting = null; }
  }

  async _start(generation) {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    try {
      if (!this.ctx) this._create(Context);
      if (!this._suspended && this.ctx.state === 'running') return true;
      if (this._suspending) await this._suspending;
      if (generation !== this._generation) return false;
      // resume() is initiated synchronously on the first gesture.
      await this.ctx.resume();
      if (this.ctx.state !== 'running' || generation !== this._generation) return false;
      this._suspended = false;
      this._nextNote = this.ctx.currentTime + 0.055;
      this._target(this.master.gain, this.volume, 0.06);
      this._target(this.musicBus.gain, this._musicLevel(), 0.15);
      if (!this._timer) this._timer = setInterval(() => this._schedule(), 40);
      this._schedule();
      return true;
    } catch (_) {
      // Audio may be blocked by an embedding browser. Racing remains usable.
      return false;
    }
  }

  _create(Context) {
    const c = this.ctx = new Context({ latencyHint: 'interactive' });
    this.master = c.createGain();
    this.master.gain.value = 0;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.16;
    this.master.connect(limiter).connect(c.destination);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = this._musicLevel();
    this.musicFilter = c.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2400;
    this.musicFilter.Q.value = 0.45;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.fxBus = c.createGain();
    this.fxBus.gain.value = 0.8;
    this.fxBus.connect(this.master);

    // A short, dark stereo echo gives the arpeggio depth without a large asset.
    this.echoIn = c.createGain();
    this.echoIn.gain.value = 0.24;
    const delayL = c.createDelay(1);
    const delayR = c.createDelay(1);
    this._echoDelays = [delayL, delayR];
    delayL.delayTime.value = this._beat * 0.75;
    delayR.delayTime.value = this._beat * 1.25;
    const returnL = c.createGain();
    const returnR = c.createGain();
    returnL.gain.value = 0.24;
    returnR.gain.value = 0.16;
    const damp = c.createBiquadFilter();
    damp.frequency.value = 1700;
    damp.Q.value = 0.2;
    this.echoIn.connect(delayL).connect(damp).connect(returnL).connect(delayL);
    this.echoIn.connect(delayR).connect(returnR);
    if (c.createStereoPanner) {
      const left = c.createStereoPanner(); left.pan.value = -0.65;
      const right = c.createStereoPanner(); right.pan.value = 0.65;
      damp.connect(left).connect(this.musicBus);
      returnR.connect(right).connect(this.musicBus);
    } else {
      damp.connect(this.musicBus);
      returnR.connect(this.musicBus);
    }

    // One reusable, softly coloured noise buffer for wind and percussion.
    this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = this.noise.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      previous = 0.93 * previous + 0.07 * white;
      data[i] = white * 0.48 + previous * 1.4;
    }

    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineFilter.Q.value = 0.65;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineA = c.createOscillator();
    this.engineA.type = 'sawtooth';
    this.engineA.frequency.value = 42;
    this.engineB = c.createOscillator();
    this.engineB.type = 'triangle';
    this.engineB.frequency.value = 84;
    this.engineB.detune.value = 9;
    const engineMixA = c.createGain(); engineMixA.gain.value = 0.65;
    const engineMixB = c.createGain(); engineMixB.gain.value = 0.35;
    this.engineA.connect(engineMixA).connect(this.engineFilter);
    this.engineB.connect(engineMixB).connect(this.engineFilter);
    this.engineA.start();
    this.engineB.start();

    this.wind = this._continuousNoise('highpass', 550, 0.15);
    this.boost = this._continuousNoise('bandpass', 1600, 0.6);
    this.skid = this._continuousNoise('bandpass', 1000, 1.8);
  }

  _continuousNoise(type, frequency, q) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(0, Math.random());
    return { source, filter, gain };
  }

  _target(param, value, seconds = 0.08) {
    if (!this.ctx || !Number.isFinite(value)) return;
    // All frame changes use AudioParam smoothing, with no per-frame nodes.
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }

  setVolume(value) {
    const n = Number(value);
    this.volume = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.3;
    if (this.master) this._target(this.master.gain, this.volume, 0.05);
  }

  setMusic(enabled) {
    const wasEnabled = this.musicEnabled;
    this.musicEnabled = !!enabled;
    if (!this.ctx) return;
    this._target(this.musicBus.gain, this._musicLevel(), 0.06);
    if (this.musicEnabled && !wasEnabled) this._nextNote = this.ctx.currentTime + 0.055;
    if (!this.musicEnabled && wasEnabled) this._fadeMusicVoices();
  }

  _musicLevel() {
    return this.musicEnabled ? 0.8 : 0;
  }

  _musicCutoff(speed, active) {
    return 2100 + (active ? Math.min(speed / 300, 1) * 1300 : 0);
  }

  update({ speed = 0, throttle = 0, boost = 0, drift = 0, active = false } = {}, dt = 1 / 60) {
    const unit = value => Math.max(0, Math.min(1, Number(value) || 0));
    const delta = Math.max(0, Math.min(0.1, Number(dt) || 1 / 60));
    const blend = 1 - Math.exp(-delta * 8);
    this._speed += (Math.max(0, Math.min(500, Number(speed) || 0)) - this._speed) * blend;
    this._throttle += (unit(throttle) - this._throttle) * blend;
    this._boost += (unit(boost) - this._boost) * blend;
    this._drift += (unit(drift) - this._drift) * blend;
    this._active = !!active;
    if (!this.ctx || this._suspended || this.ctx.state !== 'running') return;
    const v = this._speed;
    const throttleAmount = this._throttle;
    const on = active ? 1 : 0;
    // A soft gear-like saw contour gives acceleration an audible progression.
    const gear = Math.min(5, Math.floor(v / 57));
    const rev = 42 + v * 0.4 + (v - gear * 57) * 1.1 + throttleAmount * 24;
    this._target(this.engineA.frequency, rev, 0.12);
    this._target(this.engineB.frequency, rev * 2.003, 0.12);
    this._target(this.engineFilter.frequency, 260 + v * 2.6 + throttleAmount * 400 + this._boost * 400, 0.16);
    this._target(this.engineGain.gain, on * (0.025 + throttleAmount * 0.034 + Math.min(v / 300, 1) * 0.018), 0.10);
    this._target(this.wind.gain.gain, on * Math.pow(Math.min(v / 330, 1), 1.7) * 0.075, 0.2);
    this._target(this.wind.filter.frequency, 450 + v * 1.6, 0.2);
    this._target(this.boost.gain.gain, on * this._boost * 0.065, 0.1);
    this._target(this.boost.filter.frequency, 1400 + v * 2.1, 0.18);
    this._target(this.skid.gain.gain, on * this._drift * Math.min(v / 90, 1) * 0.037, 0.055);
    this._target(this.skid.filter.frequency, 800 + v * 2, 0.12);
    this._target(this.musicFilter.frequency, this._musicCutoff(v, active), 0.38);
  }

  _schedule() {
    const c = this.ctx;
    if (!c || this._suspended || c.state !== 'running') return;
    if (!this.musicEnabled) { this._nextNote = c.currentTime + 0.055; return; }
    // Dropped frames and tab suspension never cause a burst of overdue notes.
    if (this._nextNote < c.currentTime) this._nextNote = c.currentTime + 0.025;
    let count = 0;
    while (this._nextNote < c.currentTime + 0.15 && count++ < 8) {
      this._scoreStep(this._step++, this._nextNote);
      this._nextNote += this._beat / 4;
    }
  }

  _scoreStep(step, time) {
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16);
    // Dm9 → Bbmaj7 → Fmaj9 → Cadd9. Two bars per chord.
    const chords = [
      { bass: 38, notes: [50, 57, 60, 64, 69] },
      { bass: 34, notes: [53, 57, 60, 62, 65] },
      { bass: 41, notes: [53, 60, 64, 67, 69] },
      { bass: 36, notes: [55, 60, 62, 64, 67] },
    ];
    const chord = chords[Math.floor(bar / 2) % chords.length];
    const phrase = Math.floor(bar / 8) % 4;
    if (sixteenth === 0 && bar % 2 === 0) {
      chord.notes.slice(0, 4).forEach((note, i) => {
        this._tone(note, time, this._beat * 7.9, 0.021, 'sine', this.musicBus,
          { attack: 0.85, release: 1.25, pan: (i - 1.5) * 0.3, detune: (i % 2 ? 1 : -1) * 5 });
      });
    }
    // Spacious eighth-note plucks, changing their answer every other phrase.
    if (sixteenth % 2 === 0) {
      const pattern = phrase % 2 ? [0, 3, 1, 4, 2, 3, 4, 1] : [0, 2, 4, 1, 3, 2, 4, 3];
      const index = pattern[sixteenth / 2];
      const octave = (bar % 2 && sixteenth >= 12) ? 24 : 12;
      this._tone(chord.notes[index] + octave, time, 0.21, sixteenth % 4 === 0 ? 0.043 : 0.03,
        'triangle', this.musicBus, { attack: 0.008, release: 0.2, pan: Math.sin(step * 0.65) * 0.42, echo: true });
      this._noiseHit(time, 0.065, sixteenth % 4 === 0 ? 0.013 : 0.019, 'highpass', 6200);
    }
    if (sixteenth % 4 === 0) {
      this._tone(chord.bass + (sixteenth === 12 && bar % 2 ? 12 : 0), time, 0.26, 0.10,
        'triangle', this.musicBus, { attack: 0.009, release: 0.15 });
    }
    if (sixteenth === 0 || sixteenth === 8 || (phrase === 3 && sixteenth === 14)) this._kick(time);
    if (sixteenth === 4 || sixteenth === 12) {
      this._noiseHit(time, 0.12, 0.044, 'bandpass', 1850);
      this._tone(48, time, 0.065, 0.024, 'triangle', this.musicBus, { release: 0.08 });
    }
    // A restrained four-note upper melody appears once per eight-bar phrase.
    if (bar % 8 === 6 && [0, 5, 8, 12].includes(sixteenth)) {
      const notes = { 0: 81, 5: 79, 8: 76, 12: 74 };
      this._tone(notes[sixteenth], time, 0.4, 0.027, 'sine', this.musicBus,
        { attack: 0.05, release: 0.36, echo: true, pan: 0.16 });
    }
  }

  _tone(midi, time, sustain, level, type = 'sine', destination = this.fxBus, options = {}) {
    const c = this.ctx;
    if (!c || this._voices.size > 100) return;
    const at = Math.max(c.currentTime, time);
    const attack = options.attack ?? 0.007;
    const release = options.release ?? 0.1;
    const length = Math.max(sustain, attack + 0.01);
    const decay = Math.min(options.decay ?? 0, length - attack);
    const heldLevel = decay > 0 ? Math.max(0.0001, level * (options.sustainLevel ?? 1)) : level;
    const oscillator = c.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), at);
    oscillator.detune.value = options.detune || 0;
    const envelope = c.createGain();
    envelope.gain.value = 0;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + attack);
    if (decay > 0) envelope.gain.exponentialRampToValueAtTime(heldLevel, at + attack + decay);
    envelope.gain.setValueAtTime(heldLevel, at + length);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length + release);
    const nodes = [oscillator, envelope];
    if (options.filter) {
      const { frequency, endFrequency, Q = 0.65 } = typeof options.filter === 'number'
        ? { frequency: options.filter } : options.filter;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = Q;
      filter.frequency.setValueAtTime(frequency, at);
      if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, at + length);
      oscillator.connect(filter).connect(envelope);
      nodes.push(filter);
    } else oscillator.connect(envelope);
    if (options.pan && c.createStereoPanner) {
      const panner = c.createStereoPanner();
      panner.pan.value = options.pan;
      envelope.connect(panner).connect(destination);
      nodes.push(panner);
    } else envelope.connect(destination);
    if (options.echo) envelope.connect(this.echoIn);
    this._trackVoice(oscillator, nodes, destination === this.musicBus ? envelope.gain : null);
    oscillator.start(at);
    oscillator.stop(at + length + release + 0.025);
    return oscillator;
  }

  _noiseHit(time, duration, level, filterType = 'bandpass', frequency = 2000, destination = this.musicBus) {
    const c = this.ctx;
    if (!c || this._voices.size > 100) return;
    const at = Math.max(c.currentTime, time);
    const source = c.createBufferSource(); source.buffer = this.noise;
    const filter = c.createBiquadFilter();
    filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = 0.65;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    this._trackVoice(source, [source, filter, gain], destination === this.musicBus ? gain.gain : null);
    source.start(at, Math.random() * 1.5);
    source.stop(at + duration + 0.02);
  }

  _kick(time, level = 0.16, endFrequency = 44) {
    time = Math.max(this.ctx.currentTime, time);
    const oscillator = this._tone(45, time, 0.04, level, 'sine', this.musicBus, { attack: 0.002, release: 0.19 });
    if (oscillator) {
      oscillator.frequency.setValueAtTime(125, time);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + 0.13);
    }
  }

  _trackVoice(source, nodes, musicGain) {
    const voice = { source, nodes, musicGain, fading: false };
    this._voices.add(voice);
    source.onended = () => {
      nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
      this._voices.delete(voice);
    };
  }

  _fadeMusicVoices() {
    const time = this.ctx.currentTime;
    for (const voice of this._voices) {
      if (!voice.musicGain || voice.fading) continue;
      voice.fading = true;
      const gain = voice.musicGain;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(time);
      else gain.cancelScheduledValues(time);
      gain.setTargetAtTime(0, time, 0.009);
      try { voice.source.stop(time + 0.05); } catch (_) {}
    }
  }

  cue(name) {
    if (!this.ctx || this._suspended || this.ctx.state !== 'running') return;
    const at = this.ctx.currentTime + 0.005;
    // Repeated collision checks cannot create an abrasive pile-up of sounds.
    const cooldown = { crash: 0.3, drift: 0.2, jump: 0.35, checkpoint: 0.35, menu: 0.07 }[name] || 0.08;
    if (at - (this._lastCue.get(name) ?? -100) < cooldown) return;
    this._lastCue.set(name, at);
    const note = (midi, offset = 0, duration = 0.09, gain = 0.11, type = 'sine') =>
      this._tone(midi + this._cueTranspose, at + offset, duration, gain, type, this.fxBus, { release: 0.14 });
    switch (name) {
      case 'countdown': note(74, 0, 0.065, 0.10); break;
      case 'go': [74, 81, 86].forEach((n, i) => note(n, i * 0.045, 0.19, 0.095)); break;
      case 'checkpoint': note(81, 0, 0.07, 0.08); note(86, 0.075, 0.11, 0.08); break;
      case 'correct': [74, 77, 81, 86].forEach((n, i) => note(n, i * 0.065, 0.12, 0.09)); break;
      case 'wrong': note(62, 0, 0.12, 0.067, 'triangle'); note(60, 0.13, 0.16, 0.057, 'triangle'); break;
      case 'crash':
        this._noiseHit(at, 0.17, 0.15, 'lowpass', 700, this.fxBus);
        note(30, 0, 0.055, 0.12, 'triangle');
        break;
      case 'finish':
        [74, 77, 81, 86, 89].forEach((n, i) => note(n, i * 0.115, 0.22, 0.08));
        [62, 69, 74].forEach(n => note(n, 0.58, 0.65, 0.055, 'triangle'));
        break;
      case 'jump': {
        const swoop = this._tone(57, at, 0.04, 0.045, 'sine', this.fxBus, { release: 0.18 });
        if (swoop) swoop.frequency.exponentialRampToValueAtTime(600, at + 0.16);
        break;
      }
      case 'menu': note(81, 0, 0.025, 0.044); break;
      default: break;
    }
  }

  suspend() {
    this._generation++;
    this._suspended = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (!this.ctx) return Promise.resolve();
    for (const voice of this._voices) {
      try { voice.source.stop(); } catch (_) {}
      voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} });
    }
    this._voices.clear();
    for (const gain of [this.engineGain, this.wind.gain, this.boost.gain, this.skid.gain]) {
      gain.gain.cancelScheduledValues(this.ctx.currentTime);
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    this._lastCue.clear();
    this._suspending = this.ctx.suspend().catch(() => {}).finally(() => { this._suspending = null; });
    return this._suspending;
  }
}
