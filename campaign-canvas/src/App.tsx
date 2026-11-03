import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Layers3, Map, ShieldCheck, X } from 'lucide-react';
import { CampaignFlow } from './canvas/CampaignFlow';
import { useAutosave } from './hooks/useAutosave';
import { useKeyboard } from './hooks/useKeyboard';
import { LeftSidebar } from './sidebars/LeftSidebar';
import { RightSidebar } from './sidebars/RightSidebar';
import { repository } from './storage/repository';
import { useCanvasStore } from './store/canvasStore';
import type { NodeType } from './domain/types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import type { ConfirmRequest } from './ui/ConfirmDialog';

export function App(): JSX.Element {
  const hydrated = useCanvasStore((s) => s.hydrated);
  const hydrate = useCanvasStore((s) => s.hydrate);
  const storageWarning = useCanvasStore((s) => s.storageWarning);
  const dismissStorageWarning = useCanvasStore((s) => s.dismissStorageWarning);
  const notice = useCanvasStore((s) => s.notice);
  const dismissNotice = useCanvasStore((s) => s.dismissNotice);
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  useAutosave();

  useEffect(() => {
    let active = true;
    void repository.load().then((result) => {
      if (active) hydrate(result);
    }).catch(() => {
      if (active) hydrate({
        canvas: useCanvasStore.getState().canvas,
        warning: 'Could not open browser storage. Changes may not persist.',
      });
    });
    return () => { active = false; };
  }, [hydrate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismissNotice, 4000);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  const requestDeleteNode = useCallback((id: string) => {
    const { canvas, deleteNode } = useCanvasStore.getState();
    const count = canvas.relationships.filter((r) => r.sourceId === id || r.targetId === id).length;
    if (count === 0) { deleteNode(id); return; }
    setConfirmation({
      title: 'Delete this node?',
      message: 'Deleting this node will also remove ' + count + ' connected ' +
        (count === 1 ? 'relationship.' : 'relationships.'),
      confirmLabel: 'Delete node and connections',
      destructive: true,
      onConfirm: () => deleteNode(id),
    });
  }, []);

  const requestDeleteRelationship = useCallback((id: string) => {
    const { canvas, deleteRelationship } = useCanvasStore.getState();
    const relation = canvas.relationships.find((r) => r.id === id);
    if (!relation) return;
    if (!relation.history.length) { deleteRelationship(id); return; }
    setConfirmation({
      title: 'Delete this relationship?',
      message: 'This will permanently delete the relationship and its ' +
        relation.history.length + ' history ' +
        (relation.history.length === 1 ? 'event.' : 'events.'),
      confirmLabel: 'Delete relationship',
      destructive: true,
      onConfirm: () => deleteRelationship(id),
    });
  }, []);

  const requestDeleteHistory = useCallback((relationshipId: string, entryId: string) => {
    setConfirmation({
      title: 'Delete history event?',
      message: 'Remaining strength changes will be replayed chronologically from 0, ' +
        'and the relationship strength will be recalculated.',
      confirmLabel: 'Delete and recalculate',
      destructive: true,
      onConfirm: () => useCanvasStore.getState().removeHistory(relationshipId, entryId),
    });
  }, []);

  const requestChangeType = useCallback((
    nodeId: string, nextType: NodeType, lostFields: string[],
  ) => {
    setConfirmation({
      title: 'Change node type?',
      message: 'The following populated fields are incompatible with the new type ' +
        'and will be discarded. Shared fields remain unchanged.',
      details: lostFields,
      confirmLabel: 'Change type',
      destructive: true,
      onConfirm: () => useCanvasStore.getState().setNodeType(nodeId, nextType),
    });
  }, []);

  const requestReset = useCallback(() => {
    setConfirmation({
      title: 'Reset the entire canvas?',
      message: 'This removes all nodes, relationships, history, positions and campaign details. ' +
        'This action cannot be undone.',
      confirmLabel: 'Reset canvas',
      destructive: true,
      onConfirm: () => {
        useCanvasStore.getState().resetCanvas();
        setCanvasKey((key) => key + 1);
        void repository.reset().catch(() => {
          useCanvasStore.getState().notify('Could not clear browser storage. Check IndexedDB permissions.');
        });
      },
    });
  }, []);

  const requestSelectedDeletion = useCallback(() => {
    const selection = useCanvasStore.getState().selection;
    if (selection?.kind === 'node') requestDeleteNode(selection.id);
    if (selection?.kind === 'relationship') requestDeleteRelationship(selection.id);
  }, [requestDeleteNode, requestDeleteRelationship]);

  useKeyboard({ dialogOpen: confirmation !== null, onDelete: requestSelectedDeletion });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="Campaign Canvas">
          <span className="brand-icon"><Layers3 size={19} strokeWidth={1.9} /></span>
          <div>
            <strong>Campaign Canvas</strong>
            <span>Relationships & politics</span>
          </div>
        </div>
        <div className="header-info">
          <span className="header-note"><Map size={14} /> One canvas</span>
          <span className="header-local"><ShieldCheck size={15} /> Stored in your browser</span>
        </div>
      </header>
      {!hydrated ? (
        <div className="loading-state" role="status">Opening your campaign canvas…</div>
      ) : (
        <div className="workspace">
          <LeftSidebar onDeleteNode={requestDeleteNode} onReset={requestReset}
            onChangeType={requestChangeType} />
          <main className="canvas-column" aria-label="Relationship map">
            {storageWarning && (
              <div className="alert-banner" role="alert">
                <AlertCircle size={17} aria-hidden="true" />
                <span>{storageWarning}</span>
                <button type="button" aria-label="Dismiss storage warning"
                  onClick={dismissStorageWarning}><X size={16} /></button>
              </div>
            )}
            {notice && (
              <div className="toast" role="status">
                <span>{notice}</span>
                <button type="button" aria-label="Dismiss notice"
                  onClick={dismissNotice}><X size={15} /></button>
              </div>
            )}
            <CampaignFlow key={canvasKey} />
          </main>
          <RightSidebar onDeleteRelationship={requestDeleteRelationship}
            onDeleteHistory={requestDeleteHistory} />
        </div>
      )}
      <ConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  );
}
