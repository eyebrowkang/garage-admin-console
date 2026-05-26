import {
  ArrowRight,
  Camera,
  Copy,
  Edit2,
  Eye,
  Info,
  Link2,
  Link2Off,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const AddActionIcon = Plus;
export const EditActionIcon = Edit2;
export const DeleteActionIcon = Trash2;
export const RefreshActionIcon = RefreshCw;
export const SearchActionIcon = Search;
export const InspectActionIcon = Eye;
export const InfoActionIcon = Info;
export const CopyActionIcon = Copy;
export const SaveActionIcon = Save;
export const RevertActionIcon = RotateCcw;
export const RepairActionIcon = Wrench;
export const SnapshotActionIcon = Camera;
export const ConnectActionIcon = Link2;
export const SettingsActionIcon = Settings;
export const OpenActionIcon = ArrowRight;
export const DisconnectActionIcon = Link2Off;

export type ActionType =
  | 'add'
  | 'edit'
  | 'delete'
  | 'refresh'
  | 'search'
  | 'inspect'
  | 'info'
  | 'copy'
  | 'save'
  | 'revert'
  | 'repair'
  | 'snapshot'
  | 'connect'
  | 'settings'
  | 'open'
  | 'disconnect';

export const ACTION_ICON_MAP: Record<ActionType, LucideIcon> = {
  add: AddActionIcon,
  edit: EditActionIcon,
  delete: DeleteActionIcon,
  refresh: RefreshActionIcon,
  search: SearchActionIcon,
  inspect: InspectActionIcon,
  info: InfoActionIcon,
  copy: CopyActionIcon,
  save: SaveActionIcon,
  revert: RevertActionIcon,
  repair: RepairActionIcon,
  snapshot: SnapshotActionIcon,
  connect: ConnectActionIcon,
  settings: SettingsActionIcon,
  open: OpenActionIcon,
  disconnect: DisconnectActionIcon,
};
