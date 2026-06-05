import { Link2, Tag } from 'lucide-react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@garage/ui';
import {
  CopyActionIcon,
  DeleteActionIcon,
  DownloadActionIcon,
  MoreActionIcon,
  MoveActionIcon,
  OpenExternalActionIcon,
  RenameActionIcon,
} from '@/lib/action-icons';
import { useBrowser } from '../../context';
import { useDownload } from '../../hooks/useDownload';
import type { ListItem } from '../../types';

interface ItemActionsProps {
  item: ListItem;
  itemKey: string;
  className?: string;
  menuClassName?: string;
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/60',
        'bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors',
        'hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function ItemActions({ item, itemKey, className, menuClassName }: ItemActionsProps) {
  const {
    openDelete,
    openPresign,
    openRename,
    openMove,
    openCopy,
    showToast,
    http,
    bucket,
    isNarrow,
  } = useBrowser();
  const download = useDownload(http, (msg) => showToast('err', msg));

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('ok', `${label} copied`);
    } catch {
      showToast('err', 'Clipboard unavailable');
    }
  };

  const handleDownload = () => {
    if (item.type === 'file') void download(item.key, item.name, item.object.size);
  };

  const handleShare = () => {
    if (item.type === 'file') openPresign(item);
  };

  return (
    <div className={cn('flex items-center justify-end gap-1', className)}>
      {/* Inline quick actions — desktop only (hover-revealed). On touch the row
          shows just the ⋯ trigger; Download/Share live inside the menu instead. */}
      {item.type === 'file' && !isNarrow && (
        <div
          className={cn(
            'flex items-center gap-1 opacity-100 transition-opacity',
            'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
          )}
        >
          <ActionButton label="Download" onClick={handleDownload}>
            <DownloadActionIcon size={14} />
          </ActionButton>
          <ActionButton label="Share link" onClick={handleShare}>
            <OpenExternalActionIcon size={14} />
          </ActionButton>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground',
              'transition-colors hover:bg-muted/70 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              menuClassName,
            )}
            onClick={(e) => e.stopPropagation()}
            title="More actions"
            aria-label="More actions"
          >
            <MoreActionIcon size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {item.type === 'file' && isNarrow && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
              >
                <DownloadActionIcon />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleShare();
                }}
              >
                <OpenExternalActionIcon />
                Share link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {item.type === 'file' && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openRename(item);
                }}
              >
                <RenameActionIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openMove(item);
                }}
              >
                <MoveActionIcon />
                Move to...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openCopy(item);
                }}
              >
                <CopyActionIcon />
                Copy to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              void copyText('Key', itemKey);
            }}
          >
            <Tag />
            Copy key
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              void copyText('S3 URI', `s3://${bucket}/${itemKey}`);
            }}
          >
            <Link2 />
            Copy S3 URI
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onClick={(e) => {
              e.stopPropagation();
              openDelete([item]);
            }}
          >
            <DeleteActionIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
