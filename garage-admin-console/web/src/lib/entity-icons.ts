import { Archive, Blocks, Key, Server, Shield, type LucideIcon } from 'lucide-react';

export const BucketIcon = Archive;
export const BlockIcon = Blocks;
export const KeyIcon = Key;
export const TokenIcon = Shield;
export const NodeIcon = Server;

export type EntityType = 'bucket' | 'block' | 'key' | 'token' | 'node';

export const ENTITY_ICON_MAP: Record<EntityType, LucideIcon> = {
  bucket: BucketIcon,
  block: BlockIcon,
  key: KeyIcon,
  token: TokenIcon,
  node: NodeIcon,
};
