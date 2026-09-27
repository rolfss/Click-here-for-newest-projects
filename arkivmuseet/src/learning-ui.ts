import {learningSummary, missionReview} from './journey-state';
import type {Mission, JourneyState, Review} from './journey-state';

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function scoreGuideHtml(){
  return `<details class="learning-guide"><summary>Slik vurderes lederøvelsen · inntil 6 poeng</summary>
    <p>Skåren gir tilbakemelding på valgene i øvelsen. Den måler ikke lederkompetansen din eller virksomhetens etterlevelse.</p>
    <ul><li><strong>Kildegrunnlag · 0–2:</strong> Ett poeng per avgjørende spor, minus ett per spor som ikke besvarer spørsmålet. Aldri under null.</li>
    <li><strong>Ledergrep · 0–2:</strong> Fra et tiltak som lar hovedrisikoen stå åpen, via et delvis tiltak, til et grep som møter risikoen og avklarer ansvar.</li>
    <li><strong>Etterprøvbar oppfølging · 0–2:</strong> Fra ingen kontroll, via en begrenset kontroll, til en dokumentert prøve med håndtering av avvik.</li></ul>
    <p>Første gjennomgang bruker ditt første sporvalg og det første ledervalget du følger til slutten. Senere forsøk viser hva du har forbedret. Fart, 3D-ferdigheter og antall klikk gir ingen poeng.</p>
  </details>`;
}

export function rubricHtml(m:Mission, review:Review|null, heading='Tilbakemelding på ledervalget'){
  const score=missionReview(m,review);
  if(!score||!review)return '';
  const a=m.options[review.choice].assessment;
  return `<section class="learning-feedback" aria-label="Vurdering av ledervalget"><h3>${esc(heading)}</h3>
    <dl class="learning-rubric"><div><dt>Kildegrunnlag</dt><dd>${score.evidence} / 2</dd></div><div><dt>Ledergrep</dt><dd>${score.decision} / 2</dd></div><div><dt>Etterprøvbar oppfølging</dt><dd>${score.followUp} / 2</dd></div></dl>
    <p><strong>${score.total} av 6 poeng.</strong> ${esc(a.reason)}</p><p><strong>Neste grep:</strong> ${esc(a.nextStep)}</p></section>`;
}

export function learningProfileHtml(missions:Mission[],state:JourneyState){
  const s=learningSummary(missions,state);
  return `<section class="learning-profile"><h3>Din læringsprofil</h3>
    <p class="lead">${s.assessed?`${s.current} av ${s.assessedMax} mulige poeng i vurderte øvelser`:'Ingen ledervalg er vurdert ennå'}</p>
    <p>${s.assessed} av ${missions.length} øvelser har en gjennomgått konsekvensrekke. Hver øvelse kan gi 6 poeng; alle fem til sammen 30. Uprøvde øvelser er ikke vurdert.</p>
    ${s.firstCount?`<p>Første gjennomgang: ${s.first} av ${s.firstCount*6} poeng i ${s.firstCount} øvelser. Nyeste gjennomgang erstatter forrige skår; poeng kan ikke samles ved å gjenta et valg.</p>`:''}
    ${scoreGuideHtml()}
    <div class="learning-results">${missions.map(m=>{const a=state.attempts[m.id],latest=missionReview(m,a?.latestReview??null),first=missionReview(m,a?.firstReview??null);return `<details><summary>${esc(m.badge)} <span>${latest?`${latest.total} / 6`:'Ikke vurdert'}</span></summary><p>${esc(m.learningGoal)}</p>${latest?`${first?`<p>Første gjennomgang: ${first.total} / 6. Nyeste: ${latest.total} / 6.</p>`:'<p>Første gjennomgang er ikke registrert for denne lagrede øvelsen.</p>'}${rubricHtml(m,a.latestReview)}`:'<p>Åpne oppgaven, ta et ledervalg og følg de tre tidspunktene for å få tilbakemelding.</p>'}</details>`;}).join('')}</div>
  </section>`;
}
