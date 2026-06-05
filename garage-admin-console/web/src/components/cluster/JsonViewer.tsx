import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CopyButton } from '@garage/ui';

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
}

export function JsonViewer({ data, collapsed = false }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          JSON
        </button>
        <CopyButton value={jsonString} label="JSON" compact />
      </div>
      {!isCollapsed && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-xs leading-relaxed">
          {jsonString}
        </pre>
      )}
    </div>
  );
}
