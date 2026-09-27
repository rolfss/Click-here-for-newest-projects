/** State for the fictional case only. Never changes historical museum records. */
export const CASE_STORAGE = 'arkivmuseet-case17-v1';
export const roomIds = ['osen', 'tokke', 'innsyn', 'hanekleiv', 'npe'] as const;
export type CaseState = {
  version: 1; started: boolean; found: string[]; secret: boolean;
  triage: Record<string, string>; access: Record<string, string>;
  redactions: Record<string, boolean>; crisis: (number | null)[];
  reconstruction: number | null;
};
export const freshCase = (): CaseState => ({version: 1, started: false, found: [], secret: false,
  triage: {}, access: {}, redactions: {}, crisis: Array(6).fill(null), reconstruction: null});
export const evidenceIds = Array.from({length: 10}, (_, i) => `e${i + 1}`);
const triageChoices = ['capture', 'review', 'duplicate', 'outside'];
const accessChoices = ['release', 'redact', 'review'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function restoreCase(raw: string | null): CaseState {
  const state = freshCase();
  try {
    if (!raw || raw.length > 20000) return state;
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1) return state;
    state.started = value.started === true;
    state.secret = value.secret === true;
    if (Array.isArray(value.found)) state.found = evidenceIds.filter(id => (value.found as unknown[]).includes(id));
    for (const [key, prefix, count, options] of [['triage', 't', 6, triageChoices], ['access', 'a', 4, accessChoices]] as const) {
      const entries = value[key];
      if (object(entries)) for (let i = 1; i <= count; i++) {
        const id = `${prefix}${i}`, answer = entries[id];
        if (typeof answer === 'string' && (options as readonly string[]).includes(answer)) state[key][id] = answer;
      }
    }
    if (object(value.redactions)) for (const id of ['a2', 'a4']) state.redactions[id] = value.redactions[id] === true;
    if (Array.isArray(value.crisis)) state.crisis = Array.from({length: 6}, (_, i) => value.crisis instanceof Array && (value.crisis[i] === 0 || value.crisis[i] === 1) ? value.crisis[i] : null);
    if (state.found.length === evidenceIds.length && (value.reconstruction === 0 || value.reconstruction === 1 || value.reconstruction === 2)) state.reconstruction = value.reconstruction;
  } catch { /* Unusable or unavailable storage never blocks entry. */ }
  return state;
}
export function collectEvidence(state: CaseState, id: string): boolean {
  if (!evidenceIds.includes(id) || state.found.includes(id)) return false;
  state.found.push(id); state.started = true; return true;
}
export function roomEvidence(state: CaseState, room: string): number {
  const i = roomIds.indexOf(room as typeof roomIds[number]);
  return i < 0 ? 0 : [`e${i * 2 + 1}`, `e${i * 2 + 2}`].filter(id => state.found.includes(id)).length;
}
export type AnswerCard = {id: string; answer: string};
export function workSummary(state: CaseState, triage: AnswerCard[], access: AnswerCard[]) {
  const classified = triage.filter(t => state.triage[t.id] === t.answer).length;
  const disclosed = access.filter(t => state.access[t.id] === t.answer && (t.answer !== 'redact' || state.redactions[t.id] === true)).length;
  const decisions = state.crisis.filter(v => v !== null).length;
  const protectedDecisions = state.crisis.filter(v => v === 1).length;
  const complete = state.found.length === 10 && classified === triage.length && disclosed === access.length && decisions === 6 && state.reconstruction === 1;
  const leadershipQuality:'unassessed'|'needs-follow-up'|'protected' = decisions === 0 ? 'unassessed' : protectedDecisions === 6 ? 'protected' : 'needs-follow-up';
  return {classified, disclosed, decisions, protectedDecisions,complete,leadershipQuality,
    unresolvedDecisions:decisions-protectedDecisions,unansweredDecisions:6-decisions,
    responsibleOutcome:complete&&protectedDecisions===6};
}
export function caseReport(state: CaseState, summary: ReturnType<typeof workSummary>): string {
  return ['ARKIVMUSEET — DET MANGLENDE GRUNNLAGET', 'Fiktiv øvelse. Ikke en vurdering av en virkelig virksomhet.', '',
    `Spor samlet: ${state.found.length}/10`, `Dokumentflyt avklart: ${summary.classified}/6`,
    `Innsynsoppgaver avklart: ${summary.disclosed}/4`, `Ledervalg undersøkt: ${summary.decisions}/6`,
    `Ledervalg som sikrer grunnlaget: ${summary.decisions ? `${summary.protectedDecisions}/${summary.decisions} prøvde valg` : 'Ikke vurdert'}`,
    `Prøvde valg med uavklart oppfølging: ${summary.unresolvedDecisions}`, `Ledervalg som ikke er undersøkt: ${summary.unansweredDecisions}`,
    summary.complete ? 'Alle deler av øvelsen er undersøkt. Gjennomføring er ikke det samme som gode ledervalg.' : 'Deler av øvelsen gjenstår.', '',
    state.found.length === evidenceIds.length && state.reconstruction === 1 ? 'Konklusjon: Overleveringen er dokumentert, men sporene bekrefter ikke utført sluttkontroll.' : 'Konklusjonen er ikke ferdig avklart.', '',
    'Ta med videre:', '1. Hvem eier dokumentasjonen og oppfølgingen?',
    '2. Kan grunnlaget faktisk finnes, åpnes og forstås?',
    '3. Hva vet vi, og hva må fortsatt undersøkes?', '',
    'En etterfølger skal slippe å gjette.'].join('\n');
}
