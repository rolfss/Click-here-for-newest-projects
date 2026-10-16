import type {MuseumCase, Source} from './types';
export interface CaseFlow {
  id: string;
  kind: string;
  sourceId: string;
  locator: string;
  theme: string;
  question: string;
  opening: string;
  control: string;
  leaderConsequence: string;
  response: string;
  action: string;
  proof: string;
  reflection: string;
  bridge: string;
}
export const stageNames: string[];
export const flowIntroduction: string;
export const flowClosing: string;
export const flowBoundary: string;
export function flowFor(id: string): CaseFlow;
export function renderCaseStep(c: MuseumCase, step: number, legal?: Source[]): string;
export function renderLeaderSummary(cases: MuseumCase[]): string;
