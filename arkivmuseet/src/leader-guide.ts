/** Shared, side-effect-free presentation for the 3D visit and no-JavaScript guide. */
export type GuideSource = {
  id: string; label: string; url: string; kind: string; verificationUrl?: string;
};
export type Benefit = {
  id: string; title: string; opportunity: string; pitfall: string;
  question: string; sourceIds: string[];
};
export type CaseLens = {
  caseId: string; theme: string; opportunity: string; risk: string;
  question: string; dutyId: string;
};
export type Duty = {
  id: string; title: string; requirement: string; distinction: string;
  ask: string; sourceIds: string[];
};
export type LeaderGuide = {
  reviewed: string; title: string; intro: string; framing: string;
  benefits: Benefit[]; lenses: CaseLens[]; scope: string;
  commencement: string; boundary: string; duties: Duty[]; sources: GuideSource[];
};
export const escapeGuide = (s: string): string => s.replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
const esc = escapeGuide;

/** Never turn untrusted schemes into active links, even if future content changes. */
function safeUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Guide sources must use HTTPS');
  return esc(url);
}
export function guideReferences(guide: LeaderGuide, ids: string[]): string {
  return `<ul class="guide-references" aria-label="Kildegrunnlag">${ids.map(id => {
    const source = guide.sources.find(s => s.id === id);
    if (!source) throw new Error(`Unknown guide source: ${id}`);
    return `<li><a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a><span> · ${esc(source.kind)}</span></li>`;
  }).join('')}</ul>`;
}
export function renderBenefits(guide: LeaderGuide): string {
  return `<div class="leader-guide"><p class="guide-lead">${esc(guide.intro)}</p>
    <p class="guide-boundary">${esc(guide.framing)}</p>
    <div class="benefit-grid">${guide.benefits.map((b, i) => `<section class="benefit-card">
      <p class="guide-kicker">MULIGHET ${String(i + 1).padStart(2, '0')}</p><h3>${esc(b.title)}</h3>
      <p>${esc(b.opportunity)}</p><details><summary>Fallgruven å unngå</summary><p>${esc(b.pitfall)}</p></details>
      <p class="guide-question">${esc(b.question)}</p>${guideReferences(guide,b.sourceIds)}
    </section>`).join('')}</div></div>`;
}
export function renderCaseLens(lens: CaseLens): string {
  return `<section class="case-leader-lens" aria-label="Lederblikk">
    <p class="guide-kicker">LEDERBLIKK · MUSEETS FAGLIGE TOLKNING</p><h3>${esc(lens.theme)}</h3>
    <dl><div><dt>Dette kan bli mulig</dt><dd>${esc(lens.opportunity)}</dd></div>
    <div><dt>Dette kan stå på spill</dt><dd>${esc(lens.risk)}</dd></div></dl>
    <p class="guide-question">${esc(lens.question)}</p>
    <p class="guide-boundary">Muligheter og risiko ved lignende situasjoner. Ikke nye funn om virksomheten i den historiske saken.</p>
  </section>`;
}
export function renderLegalGuide(guide: LeaderGuide, openDuty?: string): string {
  return `<div class="leader-guide legal-guide">
    <p class="guide-kicker">NORSKE KRAV · KILDEGJENNOMGANG ${esc(guide.reviewed)}</p>
    <p class="guide-lead">Seks spørsmål som hører hjemme i ledelsen.</p>
    <p>${esc(guide.scope)}</p>${guideReferences(guide,['law'])}
    <p class="guide-boundary">${esc(guide.boundary)}</p>
    <div class="duty-list">${guide.duties.map((d,i) => `<details class="guide-duty" id="krav-${esc(d.id)}" ${openDuty === d.id ? 'open' : ''}>
      <summary><span class="duty-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span>${esc(d.title)}</span></summary>
      <div class="duty-content"><p class="guide-kicker">RETTSLIG HOVEDTREKK</p><p>${esc(d.requirement)}</p>
      <p class="guide-distinction"><strong>Viktig skille:</strong> ${esc(d.distinction)}</p>
      ${guideReferences(guide,d.sourceIds)}
      <div class="guide-action"><p class="guide-kicker">MUSEETS FORSLAG TIL LEDERGREP</p><p>${esc(d.ask)}</p></div></div>
    </details>`).join('')}</div>
    <details class="guide-transition"><summary>Regelverket da og nå – og hva som ikke er dekket</summary>
      <p>${esc(guide.commencement)}</p>${guideReferences(guide,['law'])}
      <p>Oversikten dekker ikke alle sektorregler, personvernkrav, sikkerhetskrav eller avtaleforhold. Den erstatter ikke faglig og juridisk vurdering av en konkret løsning.</p>
    </details></div>`;
}

/** Validate editorial structure and provenance, not legal compliance. */
export function validateLeaderGuide(guide: LeaderGuide, caseIds: string[]): true {
  const unique = (ids: string[]) => ids.length === new Set(ids).size;
  const meaningful = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  const safeId = (id: string) => /^[a-z][a-z0-9-]*$/.test(id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.reviewed)) throw new Error('Missing review date');
  if (!unique(guide.sources.map(s=>s.id)) || !unique(guide.duties.map(d=>d.id))) throw new Error('Duplicate guide IDs');
  if (!unique(guide.benefits.map(b=>b.id))) throw new Error('Duplicate benefit IDs');
  if (![guide.title,guide.intro,guide.framing,guide.scope,guide.commencement,guide.boundary].every(meaningful)) throw new Error('Missing guide context');
  for (const s of guide.sources) {
    if (!safeId(s.id) || !meaningful(s.label) || !meaningful(s.kind)) throw new Error('Incomplete source');
    safeUrl(s.url); if (s.verificationUrl) safeUrl(s.verificationUrl);
  }
  for (const entry of [...guide.benefits,...guide.duties]) {
    if (!safeId(entry.id) || !entry.sourceIds.length) throw new Error('Missing provenance');
    guideReferences(guide,entry.sourceIds);
    if (!Object.values(entry).filter(v=>!Array.isArray(v)).every(meaningful)) throw new Error('Empty guide content');
  }
  if (guide.lenses.length !== caseIds.length || !unique(guide.lenses.map(l=>l.caseId))) throw new Error('Each case needs exactly one leadership lens');
  for (const lens of guide.lenses) {
    if (!caseIds.includes(lens.caseId) || !guide.duties.some(d=>d.id===lens.dutyId)) throw new Error('Unknown case or duty');
    if (!Object.values(lens).every(meaningful)) throw new Error('Incomplete leadership lens');
  }
  return true;
}
