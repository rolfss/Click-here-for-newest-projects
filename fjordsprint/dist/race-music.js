// The three arrangements use original melodies and synthesized percussion.
const stages = ['fjord', 'pass', 'aurora'];
const tempos = { fjord: 148, pass: 156, aurora: 174 };

const fjordHarmony = [
  { root: 42, notes: [66, 69, 73, 76, 80] }, // F-sharp minor ninth
  { root: 38, notes: [66, 69, 73, 74, 81] }, // D major seventh
  { root: 45, notes: [64, 69, 71, 73, 76] }, // A added ninth
  { root: 40, notes: [64, 68, 71, 78, 83] }, // E added ninth
];
const passHarmony = [
  { root: 36, notes: [63, 67, 70, 72] },
  { root: 34, notes: [62, 65, 69, 70] },
  { root: 32, notes: [63, 67, 68, 72] },
  { root: 31, notes: [62, 67, 71, 77] },
];
const auroraHarmony = [
  { root: 41, notes: [60, 63, 67, 68] },
  { root: 37, notes: [60, 63, 65, 68] },
  { root: 44, notes: [60, 63, 67, 70] },
  { root: 39, notes: [58, 60, 65, 67] },
];

const fjordArps = [
  [0, 2, 3, 4, 2, 1, 3, 2],
  [0, 2, 3, 1, 4, 3, 1, 2],
  [1, 2, 3, 4, 2, 3, 1, 0],
  [2, 3, 4, 2, 1, 2, 3, 1],
];
const passMotif = [0, 3, 1, 2, 3, 2, 1];
const passHits = [0, 3, 5, 6, 9, 12, 14];
const passFill = [74, 77, 79, 83];

// The late kick and quiet snare doubles move over a steady backbeat.
const jungleBreaks = [
  { kicks: [0, 6, 10], ghosts: [3, 7, 11, 15] },
  { kicks: [0, 5, 10, 14], ghosts: [2, 7, 9, 15] },
  { kicks: [0, 6, 8, 11], ghosts: [3, 7, 13, 15] },
  { kicks: [0, 5, 10], ghosts: [2, 7, 9, 11, 13, 15] },
];
const jungleBass = [
  [[0, 0, 4.5], [6, 0, 1.5], [8, 0, 3], [13, 7, 2]],
  [[0, 0, 5], [7, 0, 2.5], [11, 12, 1.6], [14, 7, 1.5]],
];

function stageName(stage) {
  if (typeof stage === 'number') return stages[stage] ?? 'fjord';
  return Object.hasOwn(tempos, stage) ? stage : 'fjord';
}

export function raceTempo(stage) {
  return tempos[stageName(stage)];
}

function voice(audio, note, time, length, level, type, options) {
  audio._tone(note, time, length, level, type, audio.musicBus, options);
}

function hat(audio, time, level, length = 0.037, frequency = 5700) {
  audio._noiseHit(time, length, level, 'highpass', frequency);
}

function clap(audio, time, level) {
  audio._noiseHit(time, 0.075, level * 0.53, 'bandpass', 2350);
  audio._noiseHit(time + 0.012, 0.135, level, 'bandpass', 1600);
}

function wash(audio, notes, time, duration, level, bright = false) {
  notes.forEach((note, index) => {
    voice(audio, note, time, duration, level, index === 0 ? 'sine' : 'triangle', {
      attack: 0.27,
      release: 0.46,
      filter: bright ? 2400 : 1350,
      pan: (index - 1.5) * 0.32,
      detune: index % 2 ? 5 : -5,
    });
  });
}

function playTrance(audio, bar, beat, time, tick) {
  const harmonyIndex = Math.floor(bar / 2) % fjordHarmony.length;
  const { root, notes } = fjordHarmony[harmonyIndex];
  const breakdown = bar % 16 === 12 || bar % 16 === 13;
  const lift = bar % 16 >= 8 && !breakdown;
  const turnaround = bar % 8 === 7;
  const reprise = bar >= 16;

  if (beat === 0 && bar % 2 === 0) {
    wash(audio, notes.slice(0, 4), time, 29 * tick, breakdown ? 0.025 : 0.017, lift);
    if (bar % 8 === 0) hat(audio, time, 0.043, 0.62, 3600);
  }
  if (beat % 4 === 0 && (!breakdown || beat === 0)) audio._kick(time, 0.194, 47);
  if (beat % 4 === 2) {
    hat(audio, time, breakdown ? 0.018 : 0.042, 0.116, 5400);
    if (!breakdown) {
      const bass = root + (turnaround && beat === 14 ? 12 : 0);
      voice(audio, bass, time, 1.48 * tick, 0.099, 'triangle', { release: 0.045 });
      voice(audio, bass + 12, time, 1.15 * tick, 0.048, 'sawtooth', {
        filter: { frequency: 840, endFrequency: 260, Q: 1.2 }, decay: 0.052, sustainLevel: 0.3, release: 0.033,
      });
    }
  }
  if ((beat === 4 || beat === 12) && !breakdown) clap(audio, time, 0.066);
  if (beat % 2 === 1 && (lift || beat % 4 === 3)) hat(audio, time, 0.02, 0.03, 6500);

  if (beat % 2 === 0 || (turnaround && beat >= 13)) {
    const arp = fjordArps[harmonyIndex];
    const position = (Math.floor(beat / 2) + (reprise && bar % 2 ? 2 : 0)) % arp.length;
    const note = notes[arp[position]] + (turnaround && beat >= 14 ? 12 : 0);
    const cutoff = breakdown ? 1400 : lift ? 4250 : 2650;
    voice(audio, note, time, tick * 1.14, lift ? 0.063 : 0.051, 'sawtooth', {
      attack: 0.006, decay: 0.09, sustainLevel: 0.27, release: 0.12,
      filter: { frequency: cutoff, endFrequency: cutoff * 0.4, Q: 1.0 },
      echo: true, pan: beat % 4 === 0 ? -0.23 : 0.23,
    });
    if (lift && beat % 4 === 0) {
      voice(audio, note, time, tick * 1.32, 0.032, 'sawtooth', { filter: 2700, release: 0.16, detune: 11, pan: 0.41 });
    }
  }
  if (reprise && lift && (beat === 3 || beat === 11)) {
    const note = notes[beat === 3 ? 1 : 4] + 12;
    voice(audio, note, time, tick * 2.1, 0.037, 'triangle', { echo: true, release: 0.2, pan: -0.31 });
  }
}

function playRaceTechno(audio, bar, beat, time, tick) {
  const { root, notes } = passHarmony[Math.floor(bar / 2) % passHarmony.length];
  const breakbeatFill = bar % 8 === 7;
  const sparse = bar % 16 === 14;
  const highGear = bar % 16 >= 4 && bar % 16 < 12;
  const reprise = bar >= 16;

  if (beat % 4 === 0 || (breakbeatFill && beat === 15)) {
    audio._kick(time, beat === 15 ? 0.116 : 0.225, 49);
    if (beat !== 15) audio._noiseHit(time, 0.028, 0.036, 'bandpass', 1150);
  }
  if (beat === 4 || beat === 12) clap(audio, time, 0.078);
  if (reprise && highGear && beat === 15) hat(audio, time + tick * 0.38, 0.027, 0.045, 7100);
  if (beat % 4 === 2) hat(audio, time, 0.044, 0.095, 5200);
  if (beat % 2 === 1 && (!sparse || beat % 4 === 3)) hat(audio, time + tick * 0.045, beat % 4 === 3 ? 0.029 : 0.019);
  if (breakbeatFill && beat >= 12) audio._noiseHit(time + tick * 0.1, 0.07, 0.042 + (beat - 12) * 0.012, 'bandpass', 1900);
  if (beat === 0 && bar % 8 === 0) hat(audio, time, 0.046, 0.48, 3700);

  if (!sparse && (beat % 4 === 2 || beat % 4 === 3)) {
    const bass = root + (beat === 15 && bar % 2 === 1 ? 12 : 0);
    voice(audio, bass, time, 0.82 * tick, 0.112, 'triangle', { attack: 0.004, release: 0.032 });
    voice(audio, bass + 12, time, 0.83 * tick, beat % 4 === 2 ? 0.077 : 0.055, 'sawtooth', {
      filter: { frequency: highGear ? 1450 : 900, endFrequency: 330, Q: 2.4 },
      decay: 0.045, sustainLevel: 0.33, release: 0.036,
    });
  }
  const hit = passHits.indexOf(beat);
  if (hit !== -1 && (!sparse || beat % 4 === 0)) {
    const note = notes[passMotif[hit]] + (highGear && beat >= (reprise ? 5 : 9) ? 12 : 0);
    voice(audio, note, time, tick * 0.73, 0.055, 'square', {
      attack: 0.008, decay: 0.045, sustainLevel: 0.21, release: 0.082,
      filter: { frequency: highGear ? 3250 : 2050, endFrequency: 780, Q: 1.6 },
      echo: beat === 3 || beat === 14, pan: beat % 2 === 0 ? -0.27 : 0.27,
    });
  }
  if (beat % 8 === 0 && highGear) {
    for (const note of notes.slice(0, 3)) {
      voice(audio, note + 12, time, tick * 2.2, 0.025, 'sawtooth', {
        filter: { frequency: 3900, endFrequency: 1350, Q: 0.65 }, decay: 0.12, sustainLevel: 0.25, release: 0.16,
      });
    }
  }
  if (breakbeatFill && beat >= 12) {
    voice(audio, passFill[beat - 12], time, tick * 0.8, 0.038, 'triangle', { echo: true, release: 0.14, pan: 0.34 });
  }
}

function breakSnare(audio, time, accent) {
  audio._noiseHit(time, accent > 0.65 ? 0.135 : 0.058, 0.092 * accent, 'bandpass', 1900);
  audio._noiseHit(time + 0.006, 0.045, 0.03 * accent, 'highpass', 4200);
  voice(audio, 54, time, 0.031, 0.041 * accent, 'triangle', { attack: 0.003, release: 0.048 });
}

function playJungle(audio, bar, beat, time, tick) {
  const { root, notes } = auroraHarmony[Math.floor(bar / 2) % auroraHarmony.length];
  const pattern = jungleBreaks[(bar + (bar >= 16 ? 1 : 0)) % jungleBreaks.length];
  const airy = bar % 16 === 8 || bar % 16 === 9;
  const octaveAnswer = bar % 8 >= 4;
  const offbeat = time + (beat % 2 === 1 ? tick * 0.13 : 0);

  if (pattern.kicks.includes(beat) && (!airy || beat === 0 || beat === 10)) {
    audio._kick(time, beat === 0 ? 0.2 : 0.16, 51);
    audio._noiseHit(time, 0.026, 0.025, 'bandpass', 970);
  }
  if (beat === 4 || beat === 12) breakSnare(audio, time, beat === 4 ? 1 : 0.92);
  if (pattern.ghosts.includes(beat)) breakSnare(audio, offbeat, beat === 15 && bar % 4 === 3 ? 0.54 : 0.27);
  if (beat % 2 === 0 || beat % 4 === 3 || bar % 4 === 3) {
    hat(audio, offbeat, beat % 4 === 2 ? 0.047 : beat % 2 === 1 ? 0.024 : 0.033,
      beat === 14 ? 0.107 : 0.048, beat % 2 === 1 ? 6800 : 4700);
  }
  if (beat === 0 && bar % 2 === 0) wash(audio, notes, time, tick * 29, airy ? 0.03 : 0.021);
  if (beat === 0 && bar % 8 === 0) hat(audio, time, 0.044, 0.52, 3400);

  const bassHit = jungleBass[(bar + (bar >= 16 ? 1 : 0)) % 2].find(([position]) => position === beat);
  if (bassHit && (!airy || beat === 0)) {
    const [, interval, length] = bassHit;
    const note = root + interval;
    voice(audio, note, time, tick * length, 0.115, 'sine', { attack: 0.008, release: 0.045 });
    for (const detune of [-10, 10]) {
      voice(audio, note, time, tick * length, 0.043, 'sawtooth', {
        attack: 0.013, release: 0.066, detune,
        filter: { frequency: octaveAnswer ? 1050 : 750, endFrequency: 260, Q: 1.5 },
      });
    }
  }
  if (beat === 2 || beat === 8 || (octaveAnswer && beat === 13)) {
    const note = notes[beat === 2 ? 3 : beat === 8 ? 1 : 2] + 12;
    voice(audio, note, offbeat, tick * 1.05, 0.056, 'triangle', {
      attack: 0.008, decay: 0.068, sustainLevel: 0.32, release: 0.17,
      echo: true, pan: beat === 2 ? -0.42 : 0.34,
    });
    if (octaveAnswer) voice(audio, note - 12, offbeat, tick * 1.45, 0.036, 'sine', { echo: true, release: 0.18 });
  }
}

const arrangements = { fjord: playTrance, pass: playRaceTechno, aurora: playJungle };

export function playRaceStep(audio, stage, step, time) {
  const name = stageName(stage);
  const bar = Math.floor(step / 16) % 32;
  const beat = step % 16;
  const tick = 15 / tempos[name];
  arrangements[name](audio, bar, beat, time, tick);
}
