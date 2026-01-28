export interface ClusterSummary {
  id: string;
  name: string;
  endpoint: string;
  region?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface BucketLocalAlias {
  accessKeyId: string;
  alias: string;
}

export interface ListBucketsResponseItem {
  id: string;
  created: string;
  globalAliases: string[];
  localAliases: BucketLocalAlias[];
}

export interface ListKeysResponseItem {
  id: string;
  name: string;
  expired: boolean;
  created?: string | null;
  expiration?: string | null;
}

export interface GetKeyInfoResponse {
  accessKeyId: string;
  name: string;
  expired: boolean;
  created?: string | null;
  expiration?: string | null;
  secretAccessKey?: string | null;
}

export interface FreeSpaceResp {
  total: number;
  available: number;
}

export interface NodeAssignedRole {
  zone: string;
  tags: string[];
  capacity?: number | null;
}

export interface NodeResp {
  id: string;
  isUp: boolean;
  draining: boolean;
  addr?: string | null;
  hostname?: string | null;
  garageVersion?: string | null;
  lastSeenSecsAgo?: number | null;
  role?: NodeAssignedRole | null;
  dataPartition?: FreeSpaceResp | null;
  metadataPartition?: FreeSpaceResp | null;
}

export interface GetClusterStatusResponse {
  layoutVersion: number;
  nodes: NodeResp[];
}

export interface GetClusterHealthResponse {
  status: string;
  knownNodes: number;
  connectedNodes: number;
  storageNodes: number;
  storageNodesUp: number;
  partitions: number;
  partitionsQuorum: number;
  partitionsAllOk: number;
}

export interface GetClusterStatisticsResponse {
  freeform: string;
}

export type ZoneRedundancy = { atLeast: number } | 'maximum';

export interface LayoutParameters {
  zoneRedundancy: ZoneRedundancy;
}

export interface LayoutNodeRole {
  id: string;
  zone: string;
  tags: string[];
  capacity?: number | null;
  storedPartitions?: number | null;
  usableCapacity?: number | null;
}

export type NodeRoleChange = { id: string; remove: true } | ({ id: string } & NodeAssignedRole);

export interface GetClusterLayoutResponse {
  version: number;
  roles: LayoutNodeRole[];
  parameters: LayoutParameters;
  partitionSize: number;
  stagedParameters?: LayoutParameters | null;
  stagedRoleChanges: NodeRoleChange[];
}
