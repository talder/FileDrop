// === User & Auth ===

export interface User {
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  fullName?: string;
  createdAt: string;
  lastLogin?: string;
  failedLoginAttempts?: number;
  lockedAt?: string;
  isLocked?: boolean;
}

export type SanitizedUser = Omit<User, "passwordHash">;

export interface Session {
  username: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt?: string;
}

// === Destinations ===

export type DestinationType = "local" | "nfs" | "smb";

export interface Destination {
  id: string;
  name: string;
  type: DestinationType;
  /** For local: the absolute path. For NFS/SMB: the local mount point. */
  localPath: string;
  /** NFS/SMB: remote host */
  remoteHost?: string;
  /** NFS: remote export path. SMB: share name. */
  remotePath?: string;
  /** SMB: domain */
  smbDomain?: string;
  /** SMB: username (stored plaintext — password is encrypted) */
  smbUsername?: string;
  /** SMB: AES-256-GCM encrypted password (ENC:iv:authTag:ciphertext) */
  smbPasswordEncrypted?: string;
  /** NFS: extra mount options, e.g. "vers=4,rw" */
  mountOptions?: string;
  createdAt: string;
  updatedAt?: string;
}

// === File Naming ===

export interface FileNaming {
  /** "original" = keep original name, "mask" = apply custom mask */
  mode: "original" | "mask";
  /** Mask template, e.g. "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" */
  mask: string;
}
export type NotificationMode = "all" | "failures" | "none";
export interface EmailNotificationConfig {
  /** Email address to send notifications to */
  email: string;
  /** When to send notifications */
  on: NotificationMode;
}
export interface WebhookNotificationConfig {
  /** Fully-qualified webhook URL */
  url: string;
  /** When to send webhook events */
  on: NotificationMode;
  /** Optional shared secret used for signature header */
  secret?: string;
}
export interface RetryPolicy {
  /** Enables retry/dead-letter behavior for this job */
  enabled: boolean;
  /** Total attempts per file operation, including the first attempt */
  maxAttempts: number;
  /** Delay in seconds between retries (linear backoff) */
  backoffSeconds: number;
  /** Dead-letter folder name/path relative to source root */
  deadLetterSubdirectory?: string;
}

export interface ArchivePolicy {
  /** Move each successfully-processed source file into a subfolder instead of deleting it */
  enabled: boolean;
  /** Subdirectory under the source root to move successful files into, e.g. "success" */
  subdirectory: string;
  /** Naming applied to the archived source file (supports timestamp mask tokens) */
  fileNaming: FileNaming;
}

export const FILE_NAMING_PRESETS: { label: string; mode: FileNaming["mode"]; mask: string }[] = [
  { label: "Keep original", mode: "original", mask: "" },
  { label: "DateTime + Original", mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" },
  { label: "DateTime + UUID", mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}{EXT}" },
  { label: "European Date + Original", mode: "mask", mask: "{DD}{MM}{YYYY}_{ORIGINAL}{EXT}" },
  { label: "UUID only", mode: "mask", mask: "{UUID}{EXT}" },
  { label: "ISO DateTime + Original", mode: "mask", mask: "{YYYY}-{MM}-{DD}T{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" },
];

// === Drop Endpoints ===

/**
 * Endpoint types are slug-based, externally reachable surfaces:
 *   "api"         → HTTP upload/download at /api/drop/{slug}
 *   "sftp-server" → external parties connect INTO the embedded SFTP server
 * Outbound/remote SFTP movement lives in the separate Transfers feature.
 */
export type EndpointType = "api" | "sftp-server";

/**
 * A routing rule on an endpoint. Incoming files are tested against the
 * endpoint's ordered `filters`; the first matching filter decides which
 * subdirectory (relative to the destination root) the file is written to.
 */
export interface EndpointFilter {
  /** Stable id (React key + reordering). */
  id: string;
  /** Human label, e.g. "Invoices". */
  name: string;
  /** Glob patterns (`*`/`?`) matched against the filename. Empty = no wildcard constraint. */
  wildcards: string[];
  /** Allowed extensions, normalized to lowercase with a leading dot. Empty = no extension constraint. */
  extensions: string[];
  /** Subdirectory (relative to the destination root) matched files are routed into. */
  targetSubdirectory: string;
}

export interface DropEndpoint {
  id: string;
  /** URL slug, e.g. "invoices" → /api/drop/invoices */
  slug: string;
  description: string;
  /** Endpoint type: "api" (HTTP upload) or "sftp-server" (inbound SFTP) */
  type: EndpointType;
  /** ID of the destination to write files to */
  destinationId: string;
  /** Subdirectory within the destination (optional) */
  subdirectory?: string;
  /** Ordered routing filters; the first match decides the target subdirectory. */
  filters?: EndpointFilter[];
  /** Allowed file extensions, e.g. [".pdf", ".xml"]. Empty = allow all. */
  allowedExtensions: string[];
  /** Max file size in bytes. 0 = use global default. */
  maxFileSize: number;
  /** Whether this endpoint accepts uploads */
  enabled: boolean;
  /** File naming configuration */
  fileNaming: FileNaming;
  /** Whether API key holders can retrieve/download files */
  allowRetrieval: boolean;
  /** Email notification config */
  notifications?: EmailNotificationConfig;
  /** Webhook notification config */
  webhook?: WebhookNotificationConfig;
  /** Endpoint-specific retention override in days (undefined = global setting) */
  retentionDays?: number;
  /** Reject duplicate uploads with the same SHA-256 checksum for this endpoint */
  rejectDuplicates?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// === SFTP Servers (reusable remote connections) ===

/**
 * A saved, reusable SFTP server FileDrop connects OUT to. Referenced by
 * Transfers via connectionId. The remote path and direction are NOT stored
 * here — they belong to each Transfer.
 */
export interface SftpConnection {
  id: string;
  /** Human label, e.g. "SAP PE2" */
  name: string;
  host: string;
  port: number;
  username: string;
  /** AES-256-GCM encrypted password (ENC:iv:authTag:ciphertext) */
  passwordEncrypted?: string;
  /** PEM private key (stored as-is) */
  privateKey?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Connection params subset used by the low-level SFTP client. */
export type SftpConnectionParams = Pick<
  SftpConnection,
  "host" | "port" | "username" | "passwordEncrypted" | "privateKey"
>;

// === Transfers (SFTP jobs — no slug) ===

export type TransferDirection = "pull" | "push";

/** How files are selected on the source side. */
export type TransferSelectionMode = "all" | "single" | "glob" | "list";

export interface TransferSelection {
  mode: TransferSelectionMode;
  /** single: exact filename; glob: wildcard pattern e.g. "*.xml" */
  value?: string;
  /** list: explicit filenames */
  list?: string[];
  /** Optional extension filter applied on top of the mode, e.g. [".xml"] */
  extensions?: string[];
  /** Recurse into subdirectories (folder / glob modes) */
  recursive?: boolean;
}

export type TransferScheduleUnit = "seconds" | "minutes" | "hours" | "days";

export interface TransferSchedule {
  /** Whether the transfer runs automatically */
  enabled: boolean;
  /** Interval count (>= 1) */
  every: number;
  /** Interval unit */
  unit: TransferScheduleUnit;
  /** Time of day "HH:MM" (only meaningful for unit === "days") */
  atTime?: string;
}

/** What to do when the target already has a file with the same name. */
export type TransferConflictPolicy = "overwrite" | "rename" | "skip";

export interface Transfer {
  id: string;
  /** Human label, e.g. "POM inbound" */
  name: string;
  description: string;
  /** Whether the transfer is active (schedulable / runnable) */
  enabled: boolean;
  /** Reusable SFTP server this transfer uses */
  connectionId: string;
  /** "pull" = remote → destination, "push" = destination → remote */
  direction: TransferDirection;
  /** Remote directory on the SFTP server (source for pull, target for push) */
  remotePath: string;
  /** Local destination (target for pull, source for push) */
  destinationId: string;
  /** Subdirectory within the destination (optional) */
  subdirectory?: string;
  /** Which files to move */
  selection: TransferSelection;
  /** Naming applied to files written to the target */
  fileNaming: FileNaming;
  /** What to do on target filename conflicts */
  conflictPolicy: TransferConflictPolicy;
  /** Delete each source file after it is transferred successfully */
  deleteSourceAfterTransfer: boolean;
  /** Automatic run schedule */
  schedule: TransferSchedule;
  /** Email notification config */
  notifications?: EmailNotificationConfig;
  /** Webhook notification config */
  webhook?: WebhookNotificationConfig;
  /** Retry/dead-letter behavior */
  retryPolicy?: RetryPolicy;
  createdAt: string;
  updatedAt?: string;
  /** Last run summary (denormalized for list display) */
  lastRunAt?: string;
  lastStatus?: TransferRunStatus;
  lastError?: string;
}

export type TransferRunStatus = "success" | "partial" | "failed" | "running";
export type TransferTrigger = "manual" | "schedule";

export interface TransferRun {
  id: number;
  transferId: string;
  transferName: string;
  direction: TransferDirection;
  trigger: TransferTrigger;
  startedAt: string;
  finishedAt?: string;
  status: TransferRunStatus;
  filesTotal: number;
  filesOk: number;
  filesFailed: number;
  bytes: number;
  errorMessage?: string;
}

// === API Keys ===

export interface ApiKey {
  id: string;
  /** Human label, e.g. "ACME Corp" */
  partyName: string;
  /** SHA-256 hash of the actual key */
  keyHash: string;
  /** First 8 characters of the key for identification */
  keyPrefix: string;
  /** Endpoint slugs this key can access */
  allowedEndpoints: string[];
  /** ISO timestamp — null = never expires */
  expiresAt: string | null;
  /** ISO timestamp — null = not revoked */
  revokedAt: string | null;
  createdAt: string;
}

// === File Log ===

export interface FileLogEntry {
  id: number;
  timestamp: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  sourceIp: string;
  sourceHostname: string;
  apiKeyId: string;
  apiKeyPartyName: string;
  endpointSlug: string;
  destinationPath: string;
  destinationName: string;
  checksumSha256?: string;
  status: "success" | "failed";
  errorMessage?: string;
}

// === Audit Log ===

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  sourceIp: string;
}

// === Connection Log ===

export interface ConnectionLogEntry {
  id: number;
  timestamp: string;
  sourceIp: string;
  hostname: string;
  method: string;
  path: string;
  statusCode: number;
  apiKeyId: string;
  partyName: string;
  userAgent: string;
  responseTimeMs: number;
}

// === SOAP Connections ===

/**
 * A saved SOAP/HTTP endpoint. Used by Integrations as the outbound call target.
 */
export interface SoapConnection {
  id: string;
  /** Human label, e.g. "SAP FMIS" */
  name: string;
  /** Full endpoint URL including port, e.g. "https://host:8443/sap/bc/srt/..." */
  url: string;
  username: string;
  /** AES-256-GCM encrypted password (ENC:iv:authTag:ciphertext) */
  passwordEncrypted?: string;
  /** HTTP SOAPAction header value; use empty string if none required */
  soapAction: string;
  /**
   * "raw"      → the source file IS the complete SOAP envelope
   * "template" → wrap the file content in `envelopeTemplate` at `{PAYLOAD}`
   */
  envelopeMode: "raw" | "template";
  /** SOAP envelope template with `{PAYLOAD}` placeholder (envelopeMode === "template") */
  envelopeTemplate?: string;
  /** When true, strip outer Envelope/Body before saving; when false, save full response */
  extractBody: boolean;
  /** Skip TLS certificate verification (e.g. self-signed internal certs) */
  ignoreTlsErrors: boolean;
  createdAt: string;
  updatedAt?: string;
}

// === FTP Connections ===

/**
 * A saved FTP/FTPS server FileDrop pushes files OUT to. Referenced by
 * Integrations via ftpConnectionId.
 */
export interface FtpConnection {
  id: string;
  /** Human label, e.g. "Ultimo FTP" */
  name: string;
  host: string;
  port: number;
  username: string;
  /** AES-256-GCM encrypted password (ENC:iv:authTag:ciphertext) */
  passwordEncrypted?: string;
  /** Use FTPS (FTP over TLS) */
  secure: boolean;
  /** Skip TLS certificate verification */
  ignoreTlsErrors: boolean;
  createdAt: string;
  updatedAt?: string;
}

// === Integrations ===

/**
 * A pipeline job that:
 *   1. Reads XML files from a local source destination
 *   2. POSTs each to a SOAP endpoint
 *   3. Saves the XML response locally (optional)
 *   4. Pushes the response to an FTP server (optional)
 */
export interface Integration {
  id: string;
  /** Human label */
  name: string;
  description: string;
  enabled: boolean;
  /** Source: local destination to read input files from */
  sourceDestinationId: string;
  sourceSubdirectory?: string;
  /** Which source files to process (reuses existing TransferSelection) */
  sourceSelection: TransferSelection;
  /** SOAP endpoint to call */
  soapConnectionId: string;
  /** Where to write the SOAP response XML locally (optional) */
  responseDestinationId?: string;
  responseSubdirectory?: string;
  /** Naming applied to saved response files */
  responseFileNaming: FileNaming;
  /** FTP server to push the response to (optional) */
  ftpConnectionId?: string;
  ftpRemotePath?: string;
  /** Delete the source file after a successful run */
  deleteSourceAfterRun: boolean;
  /** Archive (move) the source file to a subfolder after a successful run. Takes precedence over deleteSourceAfterRun. */
  archivePolicy?: ArchivePolicy;
  /** Post the raw source bytes unchanged (raw envelope mode only) instead of a UTF-8 round-trip */
  postSourceAsBytes?: boolean;
  /** Automatic run schedule */
  schedule: TransferSchedule;
  /** Email notification config */
  notifications?: EmailNotificationConfig;
  /** Webhook notification config */
  webhook?: WebhookNotificationConfig;
  /** Retry/dead-letter behavior */
  retryPolicy?: RetryPolicy;
  createdAt: string;
  updatedAt?: string;
  /** Last run summary (denormalized for list display) */
  lastRunAt?: string;
  lastStatus?: TransferRunStatus;
  lastError?: string;
}

export interface IntegrationRun {
  id: number;
  integrationId: string;
  integrationName: string;
  trigger: TransferTrigger;
  startedAt: string;
  finishedAt?: string;
  status: TransferRunStatus;
  filesTotal: number;
  filesOk: number;
  filesFailed: number;
  errorMessage?: string;
}

// === Settings ===

export interface AppSettings {
  appName: string;
  /** Global default max file size in bytes (default 50MB) */
  maxFileSize: number;
  /** File retention in days (0 = keep forever) */
  fileRetentionDays: number;
  /** Rate limit: requests per minute per API key */
  rateLimitPerKey: number;
  /** Allowed CORS origins (empty = none) */
  allowedOrigins: string[];
  /** Embedded SFTP server: whether it is enabled */
  sftpServerEnabled: boolean;
  /** Embedded SFTP server: listen port */
  sftpServerPort: number;
  /** VictoriaLogs: forward all events (uploads, transfers, connections, audit) */
  victoriaLogsEnabled: boolean;
  /** VictoriaLogs: target host/IP */
  victoriaLogsHost: string;
  /** VictoriaLogs: target port (syslog 514, HTTP JSON 9428) */
  victoriaLogsPort: number;
  /** VictoriaLogs: ingestion transport */
  victoriaLogsProtocol: "http" | "syslog-udp" | "syslog-tcp";
}

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "FileDrop",
  maxFileSize: 52428800, // 50MB
  fileRetentionDays: 0,
  rateLimitPerKey: 60,
  allowedOrigins: [],
  sftpServerEnabled: false,
  sftpServerPort: 2222,
  victoriaLogsEnabled: true,
  victoriaLogsHost: "vxvictorialog01",
  victoriaLogsPort: 514,
  victoriaLogsProtocol: "syslog-udp",
};

// === Tags & Flow Map ===

/** All node kinds that can appear in the flow map. */
export type NodeKind =
  | "party"
  | "endpoint"
  | "destination"
  | "transfer"
  | "integration"
  | "sftp"
  | "soap"
  | "ftp";

/** Entity kinds that can be assigned to a tag (parties are not taggable). */
export type TaggableKind = Exclude<NodeKind, "party">;

/** A single tagged item reference. */
export interface TagMember {
  type: TaggableKind;
  id: string;
}

/** A user-defined label grouping configured items across modules. */
export interface Tag {
  id: string;
  name: string;
  /** Hex color, e.g. "#3b82f6". */
  color: string;
  description?: string;
  members: TagMember[];
  createdAt: string;
  updatedAt?: string;
}

/** A node in the flow-map graph. */
export interface FlowNode {
  /** Stable id, formatted as `${kind}:${entityId}`. */
  id: string;
  kind: NodeKind;
  entityId: string;
  label: string;
  /** Secondary descriptor line, e.g. host, path, or slug. */
  sub?: string;
  /** Ids of tags this node belongs to (always empty for parties). */
  tagIds: string[];
}

/** A directed edge representing a file-movement relationship. */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Short relationship label, e.g. "writes", "pull", "push", "SOAP". */
  label?: string;
}

/** Full graph payload returned by the flow-graph API. */
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags: Tag[];
}
