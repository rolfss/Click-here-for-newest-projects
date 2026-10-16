/** Optional driving feedback. It never advances the car or changes race time. */
export function paceNote(track, car) {
  let best = 0, distance = 0;
  for (let d = 15; d <= Math.max(70, car.speed * 1.5); d += 8) {
    const curvature = track.curvature(car.s + d);
    if (Math.abs(curvature) > Math.abs(best)) { best = curvature; distance = d; }
  }
  if (track.length - car.s < 100) return { icon: '⚑', text: 'MÅL RETT FREM', distance: Math.max(0, Math.round(track.length - car.s)), severe: false };
  const severe = Math.abs(best) > .012;
  return { icon: Math.abs(best) < .005 ? '↑' : best > 0 ? '↗' : '↖', text: Math.abs(best) < .005 ? 'FINN FLYTEN' : `${severe ? 'SKARP' : 'LANG'} ${best > 0 ? 'HØYRE' : 'VENSTRE'}`, distance: Math.round(distance / 10) * 10, severe };
}
export function resultBadges({ crashes = 0, correct = 0, airtime = 0, driftTime = 0, medal = 3, maxSpeed = 0 }) {
  return [crashes === 0 && ['Uten avvik', 'Ingen sammenstøt eller gjenoppretting'], correct >= 3 && ['Saksflyt', 'Minst tre riktige svar'], airtime >= 4 && ['Luftig innsyn', 'Minst fire sekunder i luften'], driftTime >= 2 && ['Kontrollert avvik', 'Minst to sekunder med drift'], medal === 0 && ['Før fristen', 'Gulltid på etappen'], maxSpeed >= 90 && ['Ekspressbehandling', 'Over 324 km/t']].filter(Boolean);
}
export class RaceDirector {
  constructor() { this.reset(); this.previousButtons = []; this.navCooldown = 0; }
  reset(reference = []) { this.splits = []; this.reference = reference; this.driftTime = 0; this.tick = 0; }
  step(car, dt) { if (car.drift > .3 && car.air < .1) this.driftTime += dt; }
  checkpoint(time) { this.splits.push(Math.round(time * 1000)); }
  update(car, track, mode, dt, enabled = true) {
    const panel = document.getElementById('pace-note');
    if (panel) panel.classList.toggle('hidden', !enabled || mode !== 'race');
    this.tick += dt;
    if (!enabled || mode !== 'race' || this.tick < .18) return;
    this.tick = 0;
    const note = paceNote(track, car);
    if (panel) { panel.dataset.severe = String(note.severe); panel.querySelector('b').textContent = note.icon; panel.querySelector('span').textContent = note.text; panel.querySelector('small').textContent = `${note.distance} M`; }
    const gear = document.getElementById('gear');
    if (gear) gear.textContent = car.speed < 1 ? 'N' : String(Math.min(6, Math.floor(car.speed * 3.6 / 60) + 1));
  }
  results(stats) {
    const host = document.getElementById('run-badges');
    if (host) { host.replaceChildren(); for (const [title, explanation] of resultBadges({ ...stats, driftTime: this.driftTime })) { const badge = document.createElement('span'); badge.className = 'run-badge'; badge.title = explanation; badge.textContent = title; host.append(badge); } }
    const root = document.getElementById('sector-results'); if (!root) return;
    root.replaceChildren();
    [...this.splits, Math.round(stats.time * 1000)].forEach((time, index, values) => {
      const row = document.createElement('div'); row.className = 'sector-result';
      const title = document.createElement('span'); title.textContent = index === 3 ? 'MÅL' : `SEKTOR ${index + 1}`;
      const value = document.createElement('b'); value.textContent = ((time - (values[index - 1] || 0)) / 1000).toFixed(2) + ' s';
      const delta = document.createElement('small'); const previous = this.reference[index];
      if (Number.isFinite(previous)) { const diff = (time - previous) / 1000; delta.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(2)} s`; delta.dataset.ahead = String(diff <= 0); } else delta.textContent = '—';
      row.append(title, value, delta); root.append(row);
    });
  }
  gamepadMenu(mode, dt) {
    const pad = navigator.getGamepads?.()?.find(p => p?.connected); if (!pad) return;
    const buttons = pad.buttons.map(b => b.pressed);
    const hit = n => buttons[n] && !this.previousButtons[n];
    this.navCooldown -= dt;
    if (['menu', 'results', 'paused'].includes(mode) && !document.activeElement?.matches('input,select,textarea')) {
      const modal = !document.getElementById('modal-backdrop').classList.contains('hidden');
      const root = document.querySelector(modal ? '#modal' : mode === 'results' ? '#results' : '#menu');
      const targets = [...(root?.querySelectorAll('button:not(:disabled),a') || [])].filter(el => el.getClientRects().length);
      let index = targets.indexOf(document.activeElement);
      const next = buttons[13] || buttons[15] || (pad.axes[1] || 0) > .6;
      const previous = buttons[12] || buttons[14] || (pad.axes[1] || 0) < -.6;
      if ((next || previous) && this.navCooldown <= 0 && targets.length) { index = index < 0 ? (next ? 0 : targets.length - 1) : (index + (next ? 1 : -1) + targets.length) % targets.length; targets[index].focus(); targets[index].scrollIntoView({ block: 'nearest' }); this.navCooldown = .22; }
      if (hit(0)) (targets[index] || targets.find(el => el.id === 'play-btn') || targets[0])?.click();
    }
    this.previousButtons = buttons;
  }
}
