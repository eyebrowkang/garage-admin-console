/**
 * Semantic action icons for the S3 Browser, mirroring the Admin Console's
 * lib/action-icons. Octicons stay reserved for file/folder *content* glyphs
 * (see file-browser/icons.ts) — every generic action/chrome icon is
 * lucide, the same family @garage/ui ships with.
 */
import {
  Copy,
  Download,
  ExternalLink,
  FolderInput,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  SquareCheck,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export const CopyActionIcon = Copy;
export const DownloadActionIcon = Download;
export const UploadActionIcon = Upload;
export const DeleteActionIcon = Trash2;
export const RenameActionIcon = Pencil;
export const MoveActionIcon = FolderInput;
export const OpenExternalActionIcon = ExternalLink;
export const MoreActionIcon = MoreHorizontal;
export const SearchActionIcon = Search;
export const RefreshActionIcon = RefreshCw;
export const SelectActionIcon = SquareCheck;

export type { LucideIcon };
