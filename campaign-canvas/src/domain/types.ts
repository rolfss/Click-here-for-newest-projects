export const NODE_TYPES = ['pc', 'npc', 'faction'] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const RELATIONSHIP_TYPES = [
  'Friendly', 'Allied', 'Loyal', 'Neutral', 'Suspicious', 'Rival', 'Hostile',
  'Family', 'Romantic', 'Employer', 'Employee', 'Member', 'Leader',
  'Owes a debt', 'Custom',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type RelationshipStatus = 'Active' | 'Ended' | 'Unknown';
export type InteractionMode = 'select' | 'hand';
export type SelectionState = { kind: 'node' | 'relationship'; id: string } | null;
export type Point = { x: number; y: number };
export type CanvasViewport = Point & { zoom: number };

export interface CommonNodeData {
  name: string;
  status: string;
  location: string;
  description: string;
  goals: string;
  secrets: string;
  notes: string;
  tags: string[];
}
export interface PlayerCharacterData extends CommonNodeData {
  playerName: string;
  className: string;
  level: number;
  species: string;
  alignment: string;
}
export interface NPCData extends CommonNodeData {
  role: string;
  faction: string;
  attitude: string;
  motivation: string;
}
export interface FactionData extends CommonNodeData {
  category: string;
  leader: string;
  headquarters: string;
  influence: string;
  resources: string;
}
export type CampaignNode =
  | { id: string; type: 'pc'; position: Point; data: PlayerCharacterData }
  | { id: string; type: 'npc'; position: Point; data: NPCData }
  | { id: string; type: 'faction'; position: Point; data: FactionData };

export interface RelationshipHistoryEntry {
  id: string;
  title: string;
  description: string;
  sessionRef: string;
  createdAt: string;
  delta: number;
  strengthBefore: number;
  strengthAfter: number;
}
export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  customLabel: string;
  strength: number;
  status: RelationshipStatus;
  description: string;
  history: RelationshipHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface CanvasInfo {
  name: string;
  campaignName: string;
  description: string;
  tags: string[];
}
export interface CampaignCanvas {
  schemaVersion: 1;
  id: string;
  info: CanvasInfo;
  nodes: CampaignNode[];
  relationships: Relationship[];
  viewport: CanvasViewport;
}
export interface HistoryDraft {
  title: string;
  description: string;
  sessionRef: string;
  delta: number;
}
