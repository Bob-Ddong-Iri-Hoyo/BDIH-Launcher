export const DATA_SCHEMA_RESOURCES = [
  "settings",
  "bottleRegistry",
  "bottleMetadata",
  "executionDescriptor",
] as const;

export type DataSchemaResource = (typeof DATA_SCHEMA_RESOURCES)[number];

export interface DataSchemaRange {
  minimumReadable: number;
  maximumReadable: number;
  current: number;
}

export interface AppDataCompatibilityContract {
  contractVersion: 1;
  appVersion: string;
  schemas: Record<DataSchemaResource, DataSchemaRange>;
}

export type CompatibilityStatus =
  | "compatible"
  | "needs-transform"
  | "incompatible"
  | "unknown";

export interface CompatibilityIssue {
  resource: DataSchemaResource | "returnPoint";
  resourceId?: string;
  status: Exclude<CompatibilityStatus, "compatible">;
  code:
    | "schema-too-new"
    | "schema-too-old"
    | "invalid-metadata"
    | "missing-return-point";
  message: string;
  currentVersion?: number;
  supportedMinimum?: number;
  supportedMaximum?: number;
}

export interface CompatibilityReport {
  status: CompatibilityStatus;
  targetAppVersion?: string;
  checkedAt: string;
  issues: CompatibilityIssue[];
  observedSchemas: Partial<Record<DataSchemaResource, number>>;
  preservesUserMetadata: true;
}

export interface MetadataSnapshotEntry {
  sourcePath: string;
  snapshotPath?: string;
  existed: boolean;
}

export interface PrefixSnapshotEntry {
  bottleId: string;
  originalPath: string;
  snapshotPath?: string;
  existed: boolean;
  createdAt: string;
}

export interface StableReturnPoint {
  schemaVersion: 1;
  id: string;
  state: "active" | "completed";
  stableVersion: string;
  createdAt: string;
  completedAt?: string;
  returnRequestedAt?: string;
  dataRootPath: string;
  snapshotRootPath: string;
  contract: AppDataCompatibilityContract;
  metadata: {
    settings: MetadataSnapshotEntry;
    bottleRegistry: MetadataSnapshotEntry;
    prefixMetadata: MetadataSnapshotEntry[];
  };
  prefixes: PrefixSnapshotEntry[];
}

export interface ChannelTransitionRequest {
  channel: "stable" | "beta";
  allowUnsafe?: boolean;
}

export interface ChannelTransitionResult {
  ok: boolean;
  applied: boolean;
  previousChannel: "stable" | "beta";
  channel: "stable" | "beta";
  requiresConfirmation?: boolean;
  returnPoint?: Pick<StableReturnPoint, "id" | "stableVersion" | "createdAt">;
  compatibility?: CompatibilityReport;
  error?: string;
}
