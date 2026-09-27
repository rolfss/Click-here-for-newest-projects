import { BUILD_INFO as BASE_BUILD, SOURCES as BASE_SOURCES, ARKADE_RELEASE_SOURCE } from './data-sources.mjs';
import { INTENTS as BASE_INTENTS, SUGGESTED_QUESTIONS as BASE_QUESTIONS, TOPICS as BASE_TOPICS } from './data-reference.mjs';
import { RECORDS_1 } from './data-records-1.mjs';
import { RECORDS_2 } from './data-records-2.mjs';
import { RECORDS_3 } from './data-records-3.mjs';
import { RECORDS_4 } from './data-records-4.mjs';
import { GUIDANCE_SOURCES, GUIDANCE_RECORDS, FORMAT_RECORDS } from './guidance-data.mjs';
import { PRESERVATION_PLAN_SOURCES, PRESERVATION_PLAN_RECORDS } from './preservation-plan-data.mjs';
import { ARCHIVAL_MAINTENANCE_RECORDS } from './archival-maintenance-data.mjs';

export const BUILD_INFO = Object.freeze({ ...BASE_BUILD, version: '1.5.0', corpusVersion: '2026-09-26' });
// Explicit, temporary compatibility for the already-deployed Worker. Never accept arbitrary versions.
export const LEGACY_CORPUS_VERSION = '2026-09-02';
const originalRecords = [...RECORDS_1, ...RECORDS_2, ...RECORDS_3, ...RECORDS_4];
export const LEGACY_RECORD_IDS = new Set(originalRecords.map((r) => r.id));
export const SOURCES = Object.freeze([...BASE_SOURCES, ...GUIDANCE_SOURCES, ...PRESERVATION_PLAN_SOURCES, ARKADE_RELEASE_SOURCE]);
export const RECORDS = Object.freeze([...originalRecords, ...GUIDANCE_RECORDS, ...FORMAT_RECORDS, ...PRESERVATION_PLAN_RECORDS, ...ARCHIVAL_MAINTENANCE_RECORDS]);
export const TOPICS = Object.freeze([...BASE_TOPICS, 'Internkontroll', 'Dokumentasjonsplan', 'Mediekonvertering']);
export const SUGGESTED_QUESTIONS = Object.freeze([
  'Kan DOCX og XLSX avleveres til Nasjonalarkivet?',
  'Er PDF/A-3 akseptert ved avlevering?',
  'Hva må kontrolleres før papiroriginaler destrueres etter skanning?',
  'Hvordan kartlegger vi dokumentasjon i Teams og fagsystemer?',
  'Hvordan etablerer vi internkontroll med dokumentasjonsforvaltningen?',
  ...BASE_QUESTIONS.slice(0, 5),
]);
export const INTENTS = Object.freeze([
  { id: 'delivery-formats', patterns: ['hvilke filformater', 'aksepterte filformater', 'godkjente filformater', 'formater ved avlevering'],
    lead: 'Bruk Nasjonalarkivets aktuelle formatliste og avklar vilkårene for avleveringen. Originalfiler på listen trenger ikke særskilt formatavtale; konvertering skal vurderes uten informasjonstap.',
    recordIds: ['guide-format-agreement', 'guide-format-conversion'] },
  ...BASE_INTENTS,
]);
