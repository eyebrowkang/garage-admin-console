// Cluster management
export interface ClusterSummary {
  id: string;
  name: string;
  endpoint: string;
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
  bucketLocalAliases?: string[];
}

export interface BucketInfo {
  id: string;
  created?: string;
  globalAliases: string[];
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
    indexDocument?: string | null;
    errorDocument?: string | null;
  };
  quotas?: BucketQuotas;
}

export interface CreateBucketLocalAlias {
  accessKeyId: string;
  alias: string;
  allow?: {
    read?: boolean;
    write?: boolean;
    owner?: boolean;
  };
}

export interface CreateBucketRequest {
  globalAlias?: string | null;
  localAlias?: CreateBucketLocalAlias | null;
}

export type BucketAliasRequest =
  | {
      bucketId: string;
      globalAlias: string;
    }
  | {
      bucketId: string;
      localAlias: string;
      accessKeyId: string;
    };

export interface BucketAliasInput {
  bucketId: string;
  alias: string;
  accessKeyId?: string; // If provided, uses local alias
}

export interface CleanupIncompleteUploadsRequest {
  bucketId: string;
  olderThanSecs: number;
}

export interface CleanupIncompleteUploadsResponse {
  uploadsDeleted: number;
  bytesDeleted: number;
}

// Key types
export interface KeyPerm {
  createBucket?: boolean;
}

export interface CreateKeyRequest {
  allow?: KeyPerm | null;
  deny?: KeyPerm | null;
  expiration?: string | null;
  name?: string | null;
  neverExpires?: boolean;
}

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
  permissions: KeyPerm;
  secretAccessKey?: string | null;
  buckets?: KeyBucketPerm[];
}

export type UpdateKeyRequest = CreateKeyRequest;

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

export interface NodeInfoResponse {
  nodeId: string;
  garageVersion: string;
  rustVersion: string;
  dbEngine: string;
  garageFeatures?: string[] | null;
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

export type ScrubCommand = 'start' | 'pause' | 'resume' | 'cancel';

export type RepairType =
  | 'tables'
  | 'blocks'
  | 'versions'
  | 'multipartUploads'
  | 'blockRefs'
  | 'blockRc'
  | 'rebalance'
  | 'aliases'
  | 'clearResyncQueue'
  | { scrub: ScrubCommand };

export interface LaunchRepairOperationRequest {
  repairType: RepairType;
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

export interface ApplyClusterLayoutRequest {
  version: number;
}

export interface ApplyClusterLayoutResponse {
  message: string[];
  layout: GetClusterLayoutResponse;
}

export interface UpdateClusterLayoutRequest {
  parameters?: LayoutParameters | null;
  roles?: NodeRoleChange[];
}

export type PreviewClusterLayoutChangesResponse =
  | {
      error: string;
    }
  | {
      message: string[];
      newLayout: GetClusterLayoutResponse;
    };

export interface ClusterLayoutSkipDeadNodesRequest {
  version: number;
  allowMissingData: boolean;
}

export interface ClusterLayoutSkipDeadNodesResponse {
  ackUpdated: string[];
  syncUpdated: string[];
}

export type ClusterLayoutVersionStatus = 'Current' | 'Draining' | 'Historical';

export interface ClusterLayoutVersion {
  version: number;
  status: ClusterLayoutVersionStatus;
  storageNodes: number;
  gatewayNodes: number;
}

export interface NodeUpdateTrackers {
  ack: number;
  sync: number;
  syncAck: number;
}

export interface GetClusterLayoutHistoryResponse {
  currentVersion: number;
  minAck: number;
  updateTrackers?: Record<string, NodeUpdateTrackers> | null;
  versions: ClusterLayoutVersion[];
}

// Admin Token types
export type AdminTokenScope = string[];
export type AdminTokenScopeInput = string[] | null;

export interface AdminTokenInfo {
  id?: string | null;
  name: string;
  expired: boolean;
  expiration?: string | null;
  scope: AdminTokenScope;
  created?: string | null;
}

export interface CreateAdminTokenRequest {
  name?: string | null;
  scope?: AdminTokenScopeInput;
  expiration?: string | null;
  neverExpires?: boolean;
}

export interface CreateAdminTokenResponse extends AdminTokenInfo {
  secretToken: string;
}

export interface UpdateAdminTokenRequest {
  name?: string | null;
  scope?: AdminTokenScopeInput;
  expiration?: string | null;
  neverExpires?: boolean;
}

// Block types
export interface BlockError {
  blockHash: string;
  refcount: number;
  errorCount: number;
  lastTry: string;
  nextTry: string;
}

export type BlockVersionBacklink =
  | {
      object: {
        bucketId: string;
        key: string;
      };
    }
  | {
      upload: {
        bucketId?: string | null;
        key?: string | null;
        uploadId: string;
        uploadDeleted: boolean;
        uploadGarbageCollected: boolean;
      };
    };

export interface BlockVersion {
  versionId: string;
  refDeleted: boolean;
  versionDeleted: boolean;
  garbageCollected: boolean;
  backlink?: BlockVersionBacklink | null;
}

export interface BlockInfo {
  blockHash: string;
  refcount: number;
  versions: BlockVersion[];
}

export type PurgeBlocksRequest = string[];

// Block errors response from ListBlockErrors
export interface BlockErrorsResponse {
  blockErrors: BlockError[];
}

// Block info response from GetBlockInfo (per-node)
export interface BlockInfoResponse {
  blockHash: string;
  refcount: number;
  versions: BlockVersion[];
}

// Worker types
export interface WorkerLastError {
  message: string;
  secsAgo: number;
}

export type WorkerState =
  | 'busy'
  | 'idle'
  | 'done'
  | {
      throttled: {
        durationSecs: number;
      };
    };

export interface WorkerInfo {
  id: number;
  name: string;
  state: WorkerState;
  errors: number;
  consecutiveErrors: number;
  freeform: string[];
  lastError?: WorkerLastError | null;
  persistentErrors?: number | null;
  progress?: string | null;
  queueLength?: number | null;
  tranquility?: number | null;
}

// Workers response from ListWorkers
export type WorkersResponse = WorkerInfo[];

export type WorkerVariableResponse = Record<string, string>;

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
