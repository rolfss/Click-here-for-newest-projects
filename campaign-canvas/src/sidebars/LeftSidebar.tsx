import { useEffect } from 'react';
import { BookOpenText, Crown, RotateCcw, Trash2, UserRound, UsersRound } from 'lucide-react';
import { NODE_REGISTRY } from '../domain/registry';
import { fieldsLostOnTypeChange } from '../domain/rules';
import type { NodeType } from '../domain/types';
import { useCanvasStore } from '../store/canvasStore';
import { FormField, TagField } from '../ui/Fields';

interface LeftSidebarProps {
  onDeleteNode: (nodeId: string) => void;
  onReset: () => void;
  onChangeType: (nodeId: string, nextType: NodeType, lostFields: string[]) => void;
}
export function LeftSidebar({ onDeleteNode, onReset, onChangeType }: LeftSidebarProps): JSX.Element {
  const canvas = useCanvasStore((state) => state.canvas);
  const selection = useCanvasStore((state) => state.selection);
  const focusNameId = useCanvasStore((state) => state.focusNameId);
  const updateNode = useCanvasStore((state) => state.updateNode);
  const setNodeType = useCanvasStore((state) => state.setNodeType);
  const setCanvasInfo = useCanvasStore((state) => state.setCanvasInfo);
  const consumeNameFocus = useCanvasStore((state) => state.consumeNameFocus);
  const node = selection?.kind === 'node' ?
    canvas.nodes.find((entry) => entry.id === selection.id) : undefined;

  useEffect(() => {
    if (!node || focusNameId !== node.id) return;
    const input = document.querySelector<HTMLInputElement>('[data-node-name="true"]');
    if (input) {
      input.focus();
      consumeNameFocus();
    }
  }, [node, focusNameId, consumeNameFocus]);

  if (node) {
    const definition = NODE_REGISTRY[node.type];
    const Icon = node.type === 'pc' ? UserRound : node.type === 'faction' ? Crown : UsersRound;
    const values = node.data as unknown as Record<string, string | number | string[]>;
    return (
      <aside className="sidebar sidebar-left" aria-label="Node editor">
        <div className="sidebar-heading">
          <div className="section-eyebrow">SELECTED NODE</div>
          <div className="sidebar-title-row">
            <span className="type-glyph" style={{ color: definition.accent }}><Icon size={19} /></span>
            <h2>{node.data.name || 'Unnamed'}</h2>
          </div>
          <p>{definition.label} · All changes save automatically</p>
        </div>
        <div className="sidebar-scroll">
          {definition.fields.filter((field) => field.key === 'name').map((field) =>
            <FormField key={field.key} field={field} value={values[field.key] ?? ''}
              onChange={(value) => updateNode(node.id, field.key, value)} />)}
          <label className="form-group" htmlFor="node-type-select">
            <span className="form-label">Type</span>
            <select
              id="node-type-select" className="form-control" value={node.type}
              onChange={(event) => {
                const next = event.target.value as NodeType;
                const lostFields = fieldsLostOnTypeChange(node, next);
                if (lostFields.length > 0) {
                  onChangeType(node.id, next, lostFields);
                } else setNodeType(node.id, next);
              }}
            >
              {Object.values(NODE_REGISTRY).map((type) =>
                <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </label>
          <div className="section-divider">DETAILS</div>
          {definition.fields.filter((field) => field.key !== 'name').map((field) =>
            <FormField
              key={field.key} field={field} value={values[field.key] ?? ''}
              options={field.key === 'status' ? definition.statusOptions : undefined}
              onChange={(value) => updateNode(node.id, field.key, value)}
            />)}
          <div className="editor-footer">
            <button type="button" className="link-danger"
              onClick={() => onDeleteNode(node.id)}>
              <Trash2 size={14} /> Delete node
            </button>
          </div>
        </div>
      </aside>
    );
  }
  return (
    <aside className="sidebar sidebar-left" aria-label="Canvas information">
      <div className="sidebar-heading">
        <div className="section-eyebrow">CAMPAIGN WORKSPACE</div>
        <div className="sidebar-title-row">
          <BookOpenText size={19} />
          <h2>Canvas details</h2>
        </div>
        <p>One evolving map for your campaign.</p>
      </div>
      <div className="sidebar-scroll">
        <label className="form-group" htmlFor="canvas-name">
          <span className="form-label">Canvas name</span>
          <input className="form-control" id="canvas-name"
            value={canvas.info.name} onChange={(event) => setCanvasInfo({ name: event.target.value })} />
        </label>
        <label className="form-group" htmlFor="campaign-name">
          <span className="form-label">Campaign name</span>
          <input className="form-control" id="campaign-name" placeholder="e.g. Lost Mine of Phandelver"
            value={canvas.info.campaignName}
            onChange={(event) => setCanvasInfo({ campaignName: event.target.value })} />
        </label>
        <label className="form-group" htmlFor="canvas-description">
          <span className="form-label">Description</span>
          <textarea className="form-control form-textarea" id="canvas-description" rows={4}
            placeholder="A short description of this campaign"
            value={canvas.info.description}
            onChange={(event) => setCanvasInfo({ description: event.target.value })} />
        </label>
        <TagField value={canvas.info.tags}
          onChange={(tags) => setCanvasInfo({ tags })} />
        <div className="canvas-stats">
          <span><strong>{canvas.nodes.length}</strong> nodes</span>
          <span className="stats-divider" aria-hidden="true" />
          <span><strong>{canvas.relationships.length}</strong> relationships</span>
        </div>
        <div className="section-divider">SETTINGS</div>
        <p className="settings-copy">Saved privately in this browser. Clearing browser data will remove this map.</p>
        <button type="button" className="link-danger" onClick={onReset}>
          <RotateCcw size={14} /> Reset canvas
        </button>
      </div>
    </aside>
  );
}
