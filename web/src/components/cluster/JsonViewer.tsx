import { useState } from 'react';
import { Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
}

export function JsonViewer({ data, collapsed = false }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          JSON
        </button>
        <div className="flex items-center gap-2">
          {copied && <span className="text-xs text-green-600">Copied!</span>}
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
      </div>
      {!isCollapsed && (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-4 font-mono text-xs leading-relaxed">
          {jsonString}
        </pre>
      )}
    </div>
  );
}
