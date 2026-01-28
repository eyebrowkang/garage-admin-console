import { useNodes } from '@/hooks/useNodes';
import { formatShortId } from '@/lib/format';

interface NodeSelectorProps {
  clusterId: string;
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  includeSelf?: boolean;
}

export function NodeSelector({
  clusterId,
  value,
  onChange,
  includeAll = true,
  includeSelf = true,
}: NodeSelectorProps) {
  const { data: status } = useNodes(clusterId);
  const nodes = status?.nodes ?? [];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {includeAll && <option value="">All Nodes</option>}
      {includeSelf && <option value="self">Self</option>}
      {nodes.map((node) => (
        <option key={node.id} value={node.id}>
          {node.hostname || formatShortId(node.id, 12)} {node.isUp ? '(up)' : '(down)'}
        </option>
      ))}
    </select>
  );
}
