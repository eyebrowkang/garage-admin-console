import {
  CopyIcon,
  DownloadIcon,
  FileMovedIcon,
  HashIcon,
  KebabHorizontalIcon,
  LinkExternalIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from '@primer/octicons-react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@garage/ui';
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
  const { openDelete, openPresign, openRename, openMove, openCopy, showToast, http, bucket } =
    useBrowser();
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
    if (item.type === 'file') void download(item.key, item.name);
  };

  const handleShare = () => {
    if (item.type === 'file') openPresign(item);
  };

  return (
    <div className={cn('flex items-center justify-end gap-1', className)}>
      {item.type === 'file' && (
        <div
          className={cn(
            'flex items-center gap-1 opacity-100 transition-opacity',
            'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
          )}
        >
          <ActionButton label="Download" onClick={handleDownload}>
            <DownloadIcon size={14} />
          </ActionButton>
          <ActionButton label="Share link" onClick={handleShare}>
            <LinkExternalIcon size={14} />
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
            <KebabHorizontalIcon size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {item.type === 'file' && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openRename(item);
                }}
              >
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openMove(item);
                }}
              >
                <FileMovedIcon />
                Move to...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openCopy(item);
                }}
              >
                <CopyIcon />
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
            <HashIcon />
            Copy key
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              void copyText('S3 URI', `s3://${bucket}/${itemKey}`);
            }}
          >
            <LinkIcon />
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
            <TrashIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
