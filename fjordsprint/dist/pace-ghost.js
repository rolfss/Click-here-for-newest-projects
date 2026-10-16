import { initialState, stepCar } from './physics.js';
import { createDemoDriver } from './demo.js';
const cache = new Map();
/** A clearly labelled synthetic medal pace, never a player or a leaderboard entry. */
export function medalGhost(track, assist, targetSeconds) {
  const key = `${track.config.id}-${assist}`;
  if (!cache.has(key)) {
    const car = initialState(), drive = createDemoDriver(), frames = [];
    for (let tick = 0; tick < 120 * 240 && !car.finished; tick++) {
      stepCar(car, drive(car, track, assist), 1 / 120, track, { assist });
      if (tick % 10 === 0 || car.finished) frames.push([car.time, car.s, car.x, car.heading, car.air]);
    }
    if (!car.finished) return null;
    cache.set(key, { frames, time: car.time });
  }
  const run = cache.get(key);
  return run.frames.map(frame => [frame[0] * targetSeconds / run.time, ...frame.slice(1)]);
}
