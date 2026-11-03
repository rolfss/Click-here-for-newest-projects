import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { displayRelationshipLabel, relationColor } from '../domain/registry';
import type { Relationship } from '../domain/types';
import { useCanvasStore } from '../store/canvasStore';

export type CampaignFlowEdge = Edge<{
  record: Relationship;
  offset: number;
}, 'relationship'>;

function RelationshipEdgeInner({
  id, sourceX, sourceY, targetX, targetY, markerEnd, data, selected,
}: EdgeProps<CampaignFlowEdge>): JSX.Element {
  const relationship = data?.record;
  const offset = data?.offset ?? 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const controlX = (sourceX + targetX) / 2 - dy / length * offset;
  const controlY = (sourceY + targetY) / 2 + dx / length * offset;
  const path = 'M ' + sourceX + ',' + sourceY + ' Q ' + controlX + ',' + controlY +
    ' ' + targetX + ',' + targetY;
  const labelX = (sourceX + 2 * controlX + targetX) / 4;
  const labelY = (sourceY + 2 * controlY + targetY) / 4;
  const color = selected ? '#eaf1f6' : relationColor(relationship?.type ?? 'Neutral');
  const label = relationship ?
    displayRelationshipLabel(relationship.type, relationship.customLabel) : '';
  return (
    <>
      <BaseEdge
        id={id} path={path} markerEnd={markerEnd} interactionWidth={24}
        style={{ stroke: color, strokeWidth: selected ? 2.6 : 1.7 }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={'edge-label nodrag nopan' + (selected ? ' is-selected' : '')}
          style={{
            transform: 'translate(-50%, -50%) translate(' + labelX + 'px,' + labelY + 'px)',
            pointerEvents: 'all',
          }}
          onClick={() => useCanvasStore.getState().setSelection({ kind: 'relationship', id })}
          aria-label={'Select ' + label + ' relationship'}
          title={label}
        >{label}</button>
      </EdgeLabelRenderer>
    </>
  );
}
export const RelationshipEdge = memo(RelationshipEdgeInner);
