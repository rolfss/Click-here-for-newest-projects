import type { NodeType } from './types';

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'tags';
export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  min?: number;
  max?: number;
  placeholder?: string;
}
export interface NodeDefinition {
  id: NodeType;
  label: string;
  icon: 'user-round' | 'users-round' | 'crown';
  accent: string;
  statusOptions: readonly string[];
  fields: readonly FieldDefinition[];
}

const beingStatuses = ['Unknown', 'Alive', 'Dead', 'Missing'] as const;
const factionStatuses = ['Unknown', 'Active', 'Weakened', 'Disbanded'] as const;
const common: readonly FieldDefinition[] = [
  { key: 'name', label: 'Name', kind: 'text', placeholder: 'Enter a name' },
  { key: 'status', label: 'Status', kind: 'select' },
  { key: 'location', label: 'Location', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'textarea' },
  { key: 'goals', label: 'Goals', kind: 'textarea' },
  { key: 'secrets', label: 'Secrets', kind: 'textarea' },
  { key: 'notes', label: 'Notes', kind: 'textarea' },
  { key: 'tags', label: 'Tags', kind: 'tags', placeholder: 'Comma-separated tags' },
];
const pcFields: readonly FieldDefinition[] = [
  { key: 'playerName', label: 'Player name', kind: 'text' },
  { key: 'className', label: 'Class', kind: 'text' },
  { key: 'level', label: 'Level', kind: 'number', min: 1, max: 20 },
  { key: 'species', label: 'Ancestry / species', kind: 'text' },
  {
    key: 'alignment', label: 'Alignment', kind: 'select',
    options: ['Unaligned', 'Lawful Good', 'Neutral Good', 'Chaotic Good',
      'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
      'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'],
  },
];
const npcFields: readonly FieldDefinition[] = [
  { key: 'role', label: 'Role / occupation', kind: 'text' },
  { key: 'faction', label: 'Faction (free text)', kind: 'text' },
  {
    key: 'attitude', label: 'Attitude toward party', kind: 'select',
    options: ['Unknown', 'Friendly', 'Neutral', 'Hostile'],
  },
  { key: 'motivation', label: 'Motivation', kind: 'textarea' },
];
const factionFields: readonly FieldDefinition[] = [
  { key: 'category', label: 'Category', kind: 'text' },
  { key: 'leader', label: 'Leader (free text)', kind: 'text' },
  { key: 'headquarters', label: 'Headquarters', kind: 'text' },
  { key: 'influence', label: 'Area of influence', kind: 'textarea' },
  { key: 'resources', label: 'Resources', kind: 'textarea' },
];
export const NODE_REGISTRY: Record<NodeType, NodeDefinition> = {
  pc: {
    id: 'pc', label: 'Player Character', icon: 'user-round', accent: '#7aa8f8',
    statusOptions: beingStatuses, fields: [...common, ...pcFields],
  },
  npc: {
    id: 'npc', label: 'NPC', icon: 'users-round', accent: '#e4b66b',
    statusOptions: beingStatuses, fields: [...common, ...npcFields],
  },
  faction: {
    id: 'faction', label: 'Faction', icon: 'crown', accent: '#b59bf1',
    statusOptions: factionStatuses, fields: [...common, ...factionFields],
  },
};
export const RELATIONSHIP_COLORS: Record<string, string> = {
  Friendly: '#75b896', Allied: '#75b896', Loyal: '#75b896',
  Suspicious: '#d3aa68', Rival: '#d3aa68',
  Hostile: '#d97877',
  Family: '#7eabd9', Romantic: '#7eabd9',
};
export function relationColor(type: string): string {
  return RELATIONSHIP_COLORS[type] ?? '#8b949f';
}
export function displayRelationshipLabel(type: string, customLabel: string): string {
  return type === 'Custom' ? (customLabel.trim() || 'Custom') : type;
}
