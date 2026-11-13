export const RUN_BOARD = 'fjordsprint-three-stage-v1';
export const RUN_STAGES = Object.freeze(['fjord', 'pass', 'aurora']);
export const CONFERENCE_RULESET = 'fjord-stage-v1';
export const CONFERENCE_STAGES = Object.freeze(['fjord']);

const stageRules = {
  fjord: { minimumTimeMs: 24000, fastTimeMs: 53000, slowTimeMs: 150000, boostTargetM: 450, maximumDistanceM: 3500, questions: 5 },
  pass: { minimumTimeMs: 31000, fastTimeMs: 72000, slowTimeMs: 184000, boostTargetM: 500, maximumDistanceM: 4500, questions: 6 },
  aurora: { minimumTimeMs: 34000, fastTimeMs: 78000, slowTimeMs: 190000, boostTargetM: 550, maximumDistanceM: 4800, questions: 7 }
};
export const MINIMUM_RUN_TIME_MS = RUN_STAGES.reduce((total, stage) => total + stageRules[stage].minimumTimeMs, 0);
export const MINIMUM_CONFERENCE_TIME_MS = stageRules.fjord.minimumTimeMs;
const fullRunFastTimeMs = RUN_STAGES.reduce((total, stage) => total + stageRules[stage].fastTimeMs, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createStageTelemetry(stage) {
  return { stage, furthestS: 0, steadyDistance: 0, boostDistance: 0 };
}

export function recordDriving(telemetry, { before, car, track, input }) {
  const advance = car.s - Math.max(before.s, telemetry.furthestS);
  if (advance <= 0) return;
  // A checkpoint recovery must not let the same stretch earn points twice.
  telemetry.furthestS = car.s;
  const travelAngle = Math.abs(car.travelHeading);
  const slip = Math.abs(car.slip);
  const stability = clamp(1 - 2.7 * travelAngle - 1.25 * slip, 0, 1);
  telemetry.steadyDistance += advance * stability;

  if (!input.boost || !car.boosting || car.turbo > 0 ||
      input.brake > 0.08 || car.crashes > before.crashes || car.stagger > 0 ||
      car.speed < 22 || stability < 0.65) return;
  const lookahead = Math.min(60, car.speed * 0.8);
  const curvature = Math.max(
    Math.abs(track.curvature(car.s)),
    Math.abs(track.curvature(car.s + lookahead))
  );
  if (curvature * car.speed ** 2 <= 21) telemetry.boostDistance += advance;
}

export function completeStageTelemetry(telemetry, { car, challenge }) {
  return {
    stage: telemetry.stage,
    timeMs: Math.round(car.time * 1000),
    crashes: car.crashes,
    bumps: challenge.bumps,
    correct: challenge.correct,
    cleared: challenge.cleared,
    lineQuality: Math.round(1000 * telemetry.steadyDistance / Math.max(1, telemetry.furthestS)),
    boostDistanceM: Math.round(telemetry.boostDistance)
  };
}

export function validStageTelemetry(value, expectedStage) {
  if (!RUN_STAGES.includes(expectedStage) || value?.stage !== expectedStage) return false;
  const rules = stageRules[expectedStage];
  const { timeMs, crashes, bumps, correct, cleared, lineQuality, boostDistanceM } = value;
  return [timeMs, crashes, bumps, correct, cleared, lineQuality, boostDistanceM].every(Number.isSafeInteger) &&
    timeMs >= rules.minimumTimeMs && timeMs <= 1800000 &&
    crashes >= 0 && crashes <= Math.ceil(timeMs / 700) &&
    bumps >= 0 && cleared >= 0 && bumps + cleared <= 12 &&
    correct >= 0 && correct <= rules.questions &&
    lineQuality >= 0 && lineQuality <= 1000 &&
    boostDistanceM >= 0 && boostDistanceM <= Math.min(rules.maximumDistanceM, Math.ceil(timeMs * 0.112));
}

export function scoreStage({ stage, timeMs, crashes, bumps, correct, cleared, lineQuality, boostDistanceM }) {
  const { fastTimeMs, slowTimeMs, boostTargetM, questions } = stageRules[stage];
  const pace = (slowTimeMs - timeMs) / (slowTimeMs - fastTimeMs);
  const breakdown = {
    finish: 400,
    pace: Math.round(3400 * clamp(pace, 0, 1)),
    control: Math.round(2100 * 0.85 ** crashes * 0.92 ** bumps),
    line: Math.round(1250 * lineQuality / 1000),
    boost: Math.round(1300 * Math.min(1, boostDistanceM / boostTargetM)),
    knowledge: Math.round(1000 * correct / questions),
    trolls: 50 * cleared
  };
  return { stage, timeMs, score: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown };
}

export function scoreStages(stages) {
  const scored = stages.map(scoreStage);
  return {
    score: scored.reduce((sum, stage) => sum + stage.score, 0),
    timeMs: scored.reduce((sum, stage) => sum + stage.timeMs, 0),
    stages: scored
  };
}

export function scoreConferenceRun(stages, ruleset) {
  const summary = scoreStages(stages);
  if (ruleset !== CONFERENCE_RULESET) return summary;
  const multiplier = RUN_STAGES.length;
  return {
    ...summary,
    score: summary.score * multiplier,
    stages: summary.stages.map(stage => ({
      ...stage,
      score: stage.score * multiplier,
      breakdown: Object.fromEntries(Object.entries(stage.breakdown).map(([key, value]) => [key, value * multiplier]))
    }))
  };
}

export function conferenceRankingTime(timeMs, ruleset) {
  // Compare the same fraction of each format's fast reference time.
  return ruleset === CONFERENCE_RULESET ? Math.round(timeMs * fullRunFastTimeMs / stageRules.fjord.fastTimeMs) : timeMs;
}
