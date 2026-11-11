import { RaceAudio as BaseAudio } from './audio.js?v=3.3.2';
import { playRaceStep, raceTempo } from './race-music.js';

const musicLevels = { menu: 0.72, countdown: 0.48, race: 0.79, quiz: 0.24, finish: 0.34, results: 0.36 };
const cueTranspose = { fjord: 4, pass: -2, aurora: 3 };

export class RaceAudio extends BaseAudio {
  constructor() {
    super();
    this.raceStage = null;
    this._scene = 'menu';
  }

  setRaceStage(stage) {
    if (stage === null && this.raceStage === null) return;
    this.raceStage = stage;
    this._scene = stage === null ? 'menu' : 'countdown';
    this._beat = 60 / (stage === null ? 98 : raceTempo(stage));
    this._cueTranspose = cueTranspose[stage] ?? 0;
    this._step = 0;
    if (!this.ctx) return;
    this._fadeMusicVoices();
    this._nextNote = this.ctx.currentTime + 0.055;
    this._target(this._echoDelays[0].delayTime, this._beat * 0.75, 0.06);
    this._target(this._echoDelays[1].delayTime, this._beat * 1.25, 0.06);
    this._target(this.musicBus.gain, this._musicLevel(), 0.1);
  }

  update(state = {}, dt) {
    if (state.mode && state.mode !== this._scene) {
      this._scene = state.mode;
      if (this.ctx) this._target(this.musicBus.gain, this._musicLevel(), 0.11);
    }
    super.update(state.mode === 'quiz' ? { ...state, active: false } : state, dt);
  }

  _musicLevel() {
    return this.musicEnabled ? (musicLevels[this._scene] ?? 0.45) : 0;
  }

  _musicCutoff(speed, active) {
    if (this.raceStage === null) return super._musicCutoff(speed, active);
    if (this._scene === 'quiz') return 3800;
    return 5800 + Math.min(speed / 280, 1) * 2300 + this._boost * 850;
  }

  _scoreStep(step, time) {
    if (this.raceStage === null) super._scoreStep(step, time);
    else playRaceStep(this, this.raceStage, step, time);
  }

  cue(name) {
    if (!['water', 'splash'].includes(name)) return super.cue(name);
    if (!this.ctx || this._suspended || this.ctx.state !== 'running') return;
    const at = this.ctx.currentTime + 0.005;
    if (at - (this._lastCue.get(name) ?? -100) < 0.12) return;
    this._lastCue.set(name, at);
    this._noiseHit(at, name === 'water' ? 0.12 : 0.19, name === 'water' ? 0.065 : 0.09,
      'bandpass', name === 'water' ? 1700 : 900, this.fxBus);
  }
}
