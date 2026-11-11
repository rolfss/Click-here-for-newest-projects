import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEncounters, stepEncounters } from '../dist/encounters.js';
import { mobileAssist } from '../dist/mobile-drive.js';
import { createDemoDriver, initialState, stepCar } from '../dist/rally-physics.js';
import { awardAnswer, createChallenge, stepChallenge } from '../dist/rally-rules.js';
import {
  completeStageTelemetry, createStageTelemetry, recordDriving, RUN_STAGES, scoreStage, scoreStages
} from '../dist/run-scoring.js';
import { courses, Track } from '../dist/tracks.js';

test('only new distance covered with controlled manual boost earns boost points', () => {
  const telemetry = createStageTelemetry('fjord');
  const car = { ...initialState(), speed: 50, boosting: true, boost: 80 };
  const drive = (from, to, { brake = 0, turbo = 0, curvature = 0 } = {}) => {
    recordDriving(telemetry, {
      before: { ...car, s: from },
      car: { ...car, s: to, turbo },
      track: { curvature: () => curvature },
      input: { boost: true, brake }
    });
  };
  drive(0, 100);
  drive(20, 90);
  drive(90, 130);
  drive(130, 160, { brake: 0.5 });
  drive(160, 190, { turbo: 2 });
  drive(190, 220, { curvature: 0.02 });
  assert.equal(telemetry.furthestS, 220);
  assert.equal(telemetry.boostDistance, 130);
});

test('each stage can earn the same maximum and collisions reduce points at the same time', () => {
  const perfect = [
    { stage: 'fjord', timeMs: 53000, correct: 5 },
    { stage: 'pass', timeMs: 72000, correct: 6 },
    { stage: 'aurora', timeMs: 78000, correct: 7 }
  ].map(stage => ({ ...stage, lineQuality: 1000, boostDistanceM: 600, cleared: 12, crashes: 0, bumps: 0 }));
  assert.deepEqual(scoreStages(perfect).stages.map(stage => stage.score), [10050, 10050, 10050]);
  const run = perfect[0];
  const original = scoreStage(run);
  const bumped = scoreStage({ ...run, crashes: 2, bumps: 1, cleared: 11 });
  assert.ok(bumped.breakdown.control < original.breakdown.control);
  assert.equal(bumped.breakdown.pace, original.breakdown.pace);
  assert.equal(scoreStages(perfect).score, 30150);
});

function driveRun({ skilled, timingOffset = 0 }) {
  return courses.map((course, index) => {
    const track = new Track(course);
    const car = initialState();
    const challenge = createChallenge(track, index);
    const encounters = createEncounters(track, index);
    const driver = createDemoDriver();
    const telemetry = createStageTelemetry(course.id);
    const dt = 1 / 120;

    for (let frame = 0; frame < 120 * 240 && !car.finished; frame++) {
      const guide = driver(car, track, true);
      const phase = car.time + timingOffset + index;
      const curvatureAhead = Math.max(...[0, 20, 45, 80].map(distance => Math.abs(track.curvature(car.s + distance))));
      const boost = skilled
        ? car.speed > 29 && Math.abs(car.travelHeading) < 0.11 && curvatureAhead < 0.0048 && car.speed < 78 && car.boost > 0
        : car.time > 10 && (car.time + timingOffset * 3) % 19 < 1.5;
      const input = mobileAssist({
        ...guide,
        steer: guide.steer + (skilled ? 0 : Math.sin(car.time * 1.3 + timingOffset + index) * 0.07),
        brake: skilled ? 0 : Math.max(0, Math.sin(phase * 0.48) - 0.63) * 1.3,
        boost, fire: false
      }, car, track, challenge, { enabled: true });

      const before = { ...car };
      const events = stepCar(car, input, dt, track, { assist: true });
      stepChallenge(challenge, car, before, input, dt);
      recordDriving(telemetry, { before, car, track, input });
      for (const event of stepEncounters(encounters, car, before, dt, track)) {
        if (event.type !== 'hit') continue;
        // Keep the archive answers identical so driving earns the score gap.
        awardAnswer(challenge, false);
        car.speed *= 0.6;
        car.stagger = 1.4;
      }
      if (events.includes('checkpoint')) {
        const correct = car.checkpoint !== 2;
        awardAnswer(challenge, correct);
        if (correct) car.boost = Math.min(100, car.boost + 35);
      }
    }

    assert.equal(car.finished, true, course.name);
    return completeStageTelemetry(telemetry, { car, challenge });
  });
}

test('a repeatable three-stage run rewards good boost timing and pace at the same quiz accuracy', () => {
  const skilled = driveRun({ skilled: true });
  const typicalRuns = [0, 1, 2].map(timingOffset => driveRun({ skilled: false, timingOffset }));
  assert.deepEqual(skilled.map(result => result.stage), RUN_STAGES);
  const highScore = scoreStages(skilled);
  for (const typical of typicalRuns) {
    assert.deepEqual(typical.map(stage => stage.correct), skilled.map(stage => stage.correct));
    const baseline = scoreStages(typical);
    assert.ok(highScore.score > baseline.score * 1.15, `${highScore.score} vs. ${baseline.score}`);
    assert.ok(highScore.timeMs < baseline.timeMs);
    assert.ok(highScore.stages.every(stage => stage.score > highScore.score * 0.29));
  }
});
