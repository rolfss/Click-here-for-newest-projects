import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { Crown, UserRound, UsersRound } from 'lucide-react';
import { NODE_REGISTRY } from '../domain/registry';
import type { CampaignNode } from '../domain/types';

export type CampaignFlowNode = Node<{
  record: CampaignNode;
  endpoint: boolean;
  hand: boolean;
}, 'campaign'>;

function CampaignNodeViewInner({ data, selected }: NodeProps<CampaignFlowNode>): JSX.Element {
  const node = data.record;
  const definition = NODE_REGISTRY[node.type];
  const Icon = node.type === 'pc' ? UserRound : node.type === 'faction' ? Crown : UsersRound;
  return (
    <div
      className={'campaign-node' + (selected ? ' is-selected' : '') +
        (data.endpoint ? ' is-endpoint' : '')}
      style={{ '--node-accent': definition.accent } as React.CSSProperties}
      aria-label={definition.label + ': ' + (node.data.name || 'Unnamed')}
    >
      <Handle
        id="target-left" type="target" position={Position.Left}
        className="campaign-handle" isConnectable={!data.hand}
      />
      <div className="node-head">
        <span className="node-icon"><Icon size={16} strokeWidth={1.8} /></span>
        <span className="node-name" title={node.data.name || 'Unnamed'}>
          {node.data.name || 'Unnamed'}
        </span>
      </div>
      <div className="node-footer">
        <span>{definition.label}</span>
        {node.data.status !== 'Unknown' && (
          <span className="node-status">{node.data.status}</span>
        )}
      </div>
      <Handle
        id="source-right" type="source" position={Position.Right}
        className="campaign-handle" isConnectable={!data.hand}
      />
    </div>
  );
}
export const CampaignNodeView = memo(CampaignNodeViewInner);
