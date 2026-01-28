// Cluster management
export interface ClusterSummary {
  id: string;
  name: string;
  endpoint: string;
  region?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// Bucket types
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

export interface BucketQuotas {
  maxObjects?: number | null;
  maxSize?: number | null;
}

export interface BucketWebsiteConfig {
  indexDocument: string;
  errorDocument?: string | null;
}

export interface BucketKeyPerm {
  accessKeyId: string;
  name: string;
  permissions: {
    read: boolean;
    write: boolean;
    owner: boolean;
  };
}

export interface BucketInfo {
  id: string;
  globalAliases: string[];
  localAliases: BucketLocalAlias[];
  websiteAccess: boolean;
  websiteConfig?: BucketWebsiteConfig | null;
  keys: BucketKeyPerm[];
  objects: number;
  bytes: number;
  unfinishedUploads: number;
  unfinishedMultipartUploads: number;
  unfinishedMultipartUploadParts: number;
  unfinishedMultipartUploadBytes: number;
  quotas: BucketQuotas;
}

export interface UpdateBucketRequest {
  websiteAccess?: {
    enabled: boolean;
    indexDocument?: string;
    errorDocument?: string;
  };
  quotas?: BucketQuotas;
}

export interface AddBucketAliasRequest {
  bucketId: string;
  alias: string;
  accessKeyId?: string; // If provided, creates local alias
}

export interface RemoveBucketAliasRequest {
  bucketId: string;
  alias: string;
  accessKeyId?: string; // If provided, removes local alias
}

export interface CleanupIncompleteUploadsRequest {
  olderThanSecs: number;
}

export interface CleanupIncompleteUploadsResponse {
  uploadsDeleted: number;
  bytesDeleted: number;
}

// Key types
export interface ListKeysResponseItem {
  id: string;
  name: string;
  expired: boolean;
  created?: string | null;
  expiration?: string | null;
}

export interface KeyBucketPerm {
  id: string;
  globalAliases: string[];
  localAliases: string[];
  permissions: {
    read: boolean;
    write: boolean;
    owner: boolean;
  };
}

export interface GetKeyInfoResponse {
  accessKeyId: string;
  name: string;
  expired: boolean;
  created?: string | null;
  expiration?: string | null;
  secretAccessKey?: string | null;
  buckets?: KeyBucketPerm[];
}

export interface ImportKeyRequest {
  accessKeyId: string;
  secretAccessKey: string;
  name?: string;
}

export interface AllowBucketKeyRequest {
  bucketId: string;
  accessKeyId: string;
  permissions: {
    read: boolean;
    write: boolean;
    owner: boolean;
  };
}

export interface DenyBucketKeyRequest {
  bucketId: string;
  accessKeyId: string;
  permissions: {
    read: boolean;
    write: boolean;
    owner: boolean;
  };
}

// Node types
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

export interface ConnectClusterNodesRequest {
  nodes: string[]; // Format: node_id@address
}

export interface LaunchRepairOperationRequest {
  operation: string;
}

export interface SkipDeadNodesRequest {
  nodeIds: string[];
}

// Multi-node response wrapper
export interface MultiNodeResponse<T> {
  success: Record<string, T>;
  error: Record<string, string>;
}

export interface NodeStatisticsResponse {
  freeform: string;
}

// Layout types
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

export interface LayoutHistoryEntry {
  version: number;
  applyDate: string;
  roles: LayoutNodeRole[];
}

export interface LayoutHistory {
  current: LayoutHistoryEntry;
  versions: LayoutHistoryEntry[];
}

export interface LayoutPreviewResponse {
  layout: {
    version: number;
    roles: LayoutNodeRole[];
    parameters: LayoutParameters;
    partitionSize: number;
  };
  messages: string[];
}

// Admin Token types
export interface AdminTokenScope {
  createBucket?: boolean;
}

export interface AdminTokenInfo {
  id: string;
  name: string;
  expiration?: string | null;
  scope: AdminTokenScope;
  created: string;
}

export interface CreateAdminTokenRequest {
  name: string;
  scope?: AdminTokenScope;
  expiration?: string;
}

export interface CreateAdminTokenResponse extends AdminTokenInfo {
  secretToken: string;
}

export interface UpdateAdminTokenRequest {
  name?: string;
  scope?: AdminTokenScope;
  expiration?: string | null;
}

// Block types
export interface BlockError {
  blockHash: string;
  refcount: number;
  errorCount: number;
  lastTry: string;
  nextTry: string;
}

export interface BlockVersionBacklink {
  id: string;
  type: string;
}

export interface BlockVersion {
  versionId: string;
  deleted: boolean;
  backlinkCount: number;
  backlinks: BlockVersionBacklink[];
}

export interface BlockInfo {
  blockHash: string;
  refcount: number;
  versions: BlockVersion[];
}

export interface PurgeBlocksRequest {
  blocks: string[];
}

// Block errors response from ListBlockErrors
export interface BlockErrorsResponse {
  blockErrors: BlockError[];
}

// Block info response from GetBlockInfo (per-node)
export interface BlockInfoResponse {
  refcount?: number;
  versions?: BlockVersion[];
  freeform?: string;
}

// Worker types
export interface WorkerListItem {
  id: number;
  name: string;
  state: string;
  tranquility?: number | null;
  progress?: number | null;
  freeform?: string | null;
}

// Workers response from ListWorkers
export interface WorkersResponse {
  workers: WorkerListItem[];
}

export interface WorkerInfo {
  id: number;
  name: string;
  state: string;
  errors: number;
  tranquility?: number | null;
  progress?: number | null;
  freeform?: string | null;
}

export interface WorkerVariableResponse {
  value: string;
}

export interface WorkerVariable {
  name: string;
  value: string;
}

export interface SetWorkerVariableRequest {
  variable: string;
  value: string;
}

// Object inspection
export interface InspectObjectResponse {
  bucket: string;
  key: string;
  versionId?: string;
  size: number;
  uploadTimestamp: string;
  etag?: string;
  contentType?: string;
}
