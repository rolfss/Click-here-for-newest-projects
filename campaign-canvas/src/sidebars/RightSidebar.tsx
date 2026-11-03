import { useState } from 'react';
import { ArrowRight, Plus, Trash2, Check, X, Link2, Pencil } from 'lucide-react';
import {
  NODE_REGISTRY, displayRelationshipLabel, relationColor,
} from '../domain/registry';
import { clampStrength } from '../domain/rules';
import { RELATIONSHIP_TYPES } from '../domain/types';
import type { HistoryDraft, Relationship, RelationshipHistoryEntry } from '../domain/types';
import { useCanvasStore } from '../store/canvasStore';

interface RightSidebarProps {
  onDeleteRelationship: (id: string) => void;
  onDeleteHistory: (relationshipId: string, entryId: string) => void;
}
const STRENGTH_VALUES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
function formatDelta(delta: number): string {
  return delta > 0 ? '+' + delta : String(delta);
}
function HistoryEditor({ relationship }: { relationship: Relationship }): JSX.Element {
  const [draft, setDraft] = useState<HistoryDraft>({
    title: '', description: '', sessionRef: '', delta: 0,
  });
  const addHistory = useCanvasStore((state) => state.addHistory);
  const next = clampStrength(relationship.strength + draft.delta);
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    addHistory(relationship.id, draft);
    setDraft({ title: '', description: '', sessionRef: '', delta: 0 });
  };
  return (
    <form className="history-form" onSubmit={save} aria-label="Add relationship history">
      <h3><Plus size={15} /> Add history</h3>
      <label className="form-group">
        <span className="form-label">Event title <span aria-hidden="true">*</span></span>
        <input className="form-control" required maxLength={180} value={draft.title}
          placeholder="What happened?"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>
      <label className="form-group">
        <span className="form-label">Session / in-world date</span>
        <input className="form-control" value={draft.sessionRef} placeholder="e.g. Session 7"
          onChange={(event) => setDraft({ ...draft, sessionRef: event.target.value })} />
      </label>
      <label className="form-group">
        <span className="form-label">Description</span>
        <textarea className="form-control form-textarea" rows={3} value={draft.description}
          placeholder="Context and consequences"
          onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </label>
      <div className="delta-row">
        <label className="form-group">
          <span className="form-label">Strength change</span>
          <input className="form-control" type="number" step={1} value={draft.delta}
            onChange={(event) => setDraft({
              ...draft, delta: Math.round(Number(event.target.value) || 0),
            })} />
        </label>
        <div className="delta-preview" aria-live="polite">
          <span className="form-label">Preview</span>
          <strong>{formatDelta(draft.delta)} <ArrowRight size={13} /> {next}</strong>
          <span>From {relationship.strength}</span>
        </div>
      </div>
      <button className="button button-primary button-wide" type="submit">
        <Plus size={14} /> Add event
      </button>
    </form>
  );
}
function HistoryItem({
  relationship, entry, onDelete,
}: {
  relationship: Relationship;
  entry: RelationshipHistoryEntry;
  onDelete: (relationshipId: string, entryId: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description);
  const [sessionRef, setSessionRef] = useState(entry.sessionRef);
  const updateHistory = useCanvasStore((state) => state.updateHistory);
  const deltaClass = entry.delta < 0 ? 'negative' : entry.delta > 0 ? 'positive' : '';
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    updateHistory(relationship.id, entry.id, { title: title.trim(), description, sessionRef });
    setEditing(false);
  };
  return (
    <article className="history-item">
      <div className="history-topline">
        <span className={'history-delta ' + deltaClass}>{formatDelta(entry.delta)}</span>
        <span className="history-transition">{entry.strengthBefore} → {entry.strengthAfter}</span>
        <span className="history-spacer" />
        <button className="icon-action" type="button" aria-label={'Edit ' + entry.title}
          title="Edit event" onClick={() => setEditing(!editing)}><Pencil size={13} /></button>
        <button className="icon-action destructive" type="button" aria-label={'Delete ' + entry.title}
          title="Delete event" onClick={() => onDelete(relationship.id, entry.id)}><Trash2 size={13} /></button>
      </div>
      {editing ? (
        <form className="history-edit" onSubmit={save}>
          <label className="form-group">
            <span className="form-label">Title</span>
            <input required className="form-control" value={title}
              onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Session / date</span>
            <input className="form-control" value={sessionRef}
              onChange={(event) => setSessionRef(event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Description</span>
            <textarea rows={3} className="form-control form-textarea" value={description}
              onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="inline-actions">
            <button type="submit" className="button button-primary"><Check size={13} /> Save</button>
            <button type="button" className="button button-quiet" onClick={() => {
              setTitle(entry.title); setDescription(entry.description);
              setSessionRef(entry.sessionRef); setEditing(false);
            }}><X size={13} /> Cancel</button>
          </div>
          <p className="helper-copy">Strength changes are fixed after creation.</p>
        </form>
      ) : (
        <>
          <h4>{entry.title}</h4>
          {entry.sessionRef && <div className="history-session">{entry.sessionRef}</div>}
          {entry.description && <p>{entry.description}</p>}
        </>
      )}
    </article>
  );
}
function RelationshipEditor({
  relationship, onDeleteRelationship, onDeleteHistory,
}: { relationship: Relationship } & RightSidebarProps): JSX.Element {
  const nodes = useCanvasStore((state) => state.canvas.nodes);
  const select = useCanvasStore((state) => state.setSelection);
  const update = useCanvasStore((state) => state.updateRelationship);
  const source = nodes.find((n) => n.id === relationship.sourceId);
  const target = nodes.find((n) => n.id === relationship.targetId);
  const label = displayRelationshipLabel(relationship.type, relationship.customLabel);
  return (
    <>
      <div className="sidebar-heading">
        <div className="section-eyebrow">SELECTED RELATIONSHIP</div>
        <div className="sidebar-title-row">
          <Link2 size={19} style={{ color: relationColor(relationship.type) }} />
          <h2 title={label}>{label}</h2>
        </div>
        <p>Directed connection · Source → Target</p>
      </div>
      <div className="sidebar-scroll">
        <div className="endpoint-row">
          {[source, target].map((node, index) => (
            <div className="endpoint-slot" key={index}>
              {node ? (
                <button
                  type="button" className="endpoint-button"
                  onClick={() => select({ kind: 'node', id: node.id })}
                  title={'Edit ' + node.data.name}
                >
                  <span className="endpoint-type" style={{ color: NODE_REGISTRY[node.type].accent }}>
                    {NODE_REGISTRY[node.type].label}
                  </span>
                  <strong>{node.data.name || 'Unnamed'}</strong>
                </button>
              ) : <span className="missing-endpoint">Missing node</span>}
              {index === 0 && <ArrowRight size={16} className="endpoint-arrow" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <label className="form-group" htmlFor="relationship-type">
          <span className="form-label">Relationship type</span>
          <select id="relationship-type" className="form-control" value={relationship.type}
            onChange={(event) => update(relationship.id, 'type', event.target.value)}>
            {RELATIONSHIP_TYPES.map((type) =>
              <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        {relationship.type === 'Custom' && (
          <label className="form-group" htmlFor="relationship-custom-label">
            <span className="form-label">Custom label</span>
            <input id="relationship-custom-label" className="form-control"
              value={relationship.customLabel} placeholder="e.g. Secret patron"
              onChange={(event) => update(relationship.id, 'customLabel', event.target.value)} />
          </label>
        )}
        <div className="strength-row">
          <label className="form-group" htmlFor="relationship-strength">
            <span className="form-label">Strength</span>
            <select id="relationship-strength" className="form-control" value={relationship.strength}
              onChange={(event) => update(relationship.id, 'strength', Number(event.target.value))}>
              {STRENGTH_VALUES.map((strength) =>
                <option key={strength} value={strength}>
                  {strength > 0 ? '+' + strength : strength}
                </option>)}
            </select>
          </label>
          <div className="strength-meter" aria-label={'Strength ' + relationship.strength}>
            <div className="strength-meter-track">
              <span className="strength-meter-zero" />
              <span className="strength-meter-marker"
                style={{ left: ((relationship.strength + 5) / 10 * 100) + '%' }} />
            </div>
            <div className="strength-labels"><span>−5 Hostility</span><span>+5 Trust</span></div>
          </div>
        </div>
        <p className="helper-copy">Changing strength automatically creates a history event.</p>
        <label className="form-group" htmlFor="relationship-status">
          <span className="form-label">Status</span>
          <select id="relationship-status" className="form-control" value={relationship.status}
            onChange={(event) => update(relationship.id, 'status', event.target.value)}>
            {['Active', 'Ended', 'Unknown'].map((status) =>
              <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="form-group" htmlFor="relationship-description">
          <span className="form-label">Short description</span>
          <textarea id="relationship-description" rows={3} className="form-control form-textarea"
            value={relationship.description}
            onChange={(event) => update(relationship.id, 'description', event.target.value)} />
        </label>
        <div className="section-divider">HISTORY <span>{relationship.history.length}</span></div>
        {relationship.history.length > 0 ? (
          <div className="timeline">
            {[...relationship.history].reverse().map((entry) =>
              <HistoryItem key={entry.id} entry={entry} relationship={relationship}
                onDelete={onDeleteHistory} />)}
          </div>
        ) : <p className="history-empty">No events yet. Document what changes this relationship over time.</p>}
        <HistoryEditor key={relationship.id} relationship={relationship} />
        <div className="editor-footer">
          <button type="button" className="link-danger"
            onClick={() => onDeleteRelationship(relationship.id)}>
            <Trash2 size={14} /> Delete relationship
          </button>
        </div>
      </div>
    </>
  );
}
export function RightSidebar({
  onDeleteRelationship, onDeleteHistory,
}: RightSidebarProps): JSX.Element {
  const selection = useCanvasStore((state) => state.selection);
  const relationships = useCanvasStore((state) => state.canvas.relationships);
  const relationship = selection?.kind === 'relationship' ?
    relationships.find((rel) => rel.id === selection.id) : undefined;
  if (!relationship) {
    return (
      <aside className="sidebar sidebar-right collapsed" aria-label="Relationship editor closed">
        <Link2 size={18} aria-hidden="true" />
        <span className="collapsed-label">Relationships</span>
      </aside>
    );
  }
  return (
    <aside className="sidebar sidebar-right" aria-label="Relationship editor">
      <RelationshipEditor
        key={relationship.id}
        relationship={relationship}
        onDeleteRelationship={onDeleteRelationship}
        onDeleteHistory={onDeleteHistory}
      />
    </aside>
  );
}
