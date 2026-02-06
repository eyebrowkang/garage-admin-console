import { useNodes } from '@/hooks/useNodes';
import { formatShortId } from '@/lib/format';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const { data: status, isLoading } = useNodes(clusterId);
  const nodes = status?.nodes ?? [];
  const options: Array<{ value: string; label: string }> = [];

  if (includeAll) {
    options.push({ value: '*', label: 'All Nodes' });
  }
  if (includeSelf) {
    options.push({ value: 'self', label: 'Self' });
  }
  options.push(
    ...nodes.map((node) => ({
      value: node.id,
      label: `${node.hostname || formatShortId(node.id, 12)} ${node.isUp ? '(up)' : '(down)'}`,
    })),
  );

  const selectedValue = options.some((option) => option.value === value)
    ? value
    : options[0]?.value;

  return (
    <Select value={selectedValue} onValueChange={onChange} disabled={isLoading || !options.length}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading nodes...' : 'Select node'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
