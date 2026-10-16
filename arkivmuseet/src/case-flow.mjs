import flow from '../cases/leadership-flow.json' with {type: 'json'};

export const stageNames = ['Hva skjedde?', 'Hvor sviktet kontrollen?', 'Hva ble følgen?', 'Hva må følges opp?', 'Ditt neste ledergrep'];
export const flowIntroduction = flow.introduction;
export const flowClosing = flow.closing;
export const flowBoundary = flow.boundary;
const byId = new Map(flow.cases.map(item => [item.id, item]));
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function flowFor(id) {
  const item = byId.get(id);
  if (!item) throw new Error(`Mangler lederflyt for saken: ${id}`);
  return item;
}

function reference(c, ids, locator, legal) {
  const sources = [...c.sources, ...legal];
  const links = ids.map(id => {
    const s = sources.find(source => source.id === id);
    if (!s) throw new Error(`Mangler kilde ${id} i ${c.id}`);
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.institution)}</a>`;
  }).join(', ');
  return `${links} · ${esc(locator)}`;
}

function claimsHtml(c, claims, legal) {
  return claims.map(claim => `<div class="case-finding"><p class="narrative">${esc(claim.text)}</p><p class="evidence-label">${claim.kind === 'risk' ? 'Dokumentert risiko' : claim.kind === 'interpretation' ? 'Faglig tolkning' : 'Kildefunn'} · ${reference(c, claim.sourceIds, claim.locator, legal)}</p></div>`).join('');
}

function perspective(c, heading, text, legal, possible = false) {
  const f = flowFor(c.id);
  return `<section class="leader-perspective"><h3>${esc(heading)}</h3><p>${esc(text)}</p><p class="caption">${possible ? 'Mulig følge, ikke dokumentert hendelsesforløp.' : 'Museets faglige tolkning og anbefaling.'} Grunnlag: ${reference(c, [f.sourceId], f.locator, legal)}</p></section>`;
}

/** The same five chapters are used in the interactive and no-JavaScript editions. */
export function renderCaseStep(c, step, legal = []) {
  const f = flowFor(c.id);
  if (!Number.isInteger(step) || step < 0 || step >= stageNames.length) throw new RangeError('Ugyldig fortellingsdel');
  if (step === 0) return claimsHtml(c, [c.shortNarrative], legal) + perspective(c, 'Dette står på spill for lederen', f.opening, legal);
  if (step === 1) return claimsHtml(c, c.documentedFacts, legal) + (c.displayMetric ? `<div class="data-emphasis">${esc(c.displayMetric.value)} <span>${esc(c.displayMetric.label)}</span></div>` : '') + perspective(c, 'Kontrollpunktet', f.control, legal);
  if (step === 2) return claimsHtml(c, c.consequence, legal) + perspective(c, 'Hva dette kan bety for deg som leder', f.leaderConsequence, legal, true);
  if (step === 3) return claimsHtml(c, c.authorityFindings, legal) + perspective(c, 'Fra myndighetens funn til din oppfølging', f.response, legal);
  return `<section class="leader-perspective leader-action"><h3>Bestill en konkret kontroll</h3><p class="narrative lesson">${esc(f.action)}</p><h3>Be om å få se</h3><p>${esc(f.proof)}</p><p class="leader-reflection"><strong>Spør deg selv:</strong> ${esc(f.reflection)}</p><p class="caption">Museets faglige tolkning: anbefalt ledergrep, ikke et nytt lovkrav. Grunnlag: ${reference(c, [f.sourceId], f.locator, legal)}</p></section><p class="case-bridge">${esc(f.bridge)}</p>`;
}

export function renderLeaderSummary(cases) {
  return `<div class="leader-summary"><p class="lead">${esc(flowClosing)}</p><dl>${cases.map(c => `<div><dt>${esc(c.organization)}</dt><dd>${esc(flowFor(c.id).theme)}</dd></div>`).join('')}</dl><p class="caption">${esc(flowBoundary)}</p></div>`;
}
