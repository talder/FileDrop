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

export const FILE_NAMING_PRESETS: { label: string; mode: FileNaming["mode"]; mask: string }[] = [
  { label: "Keep original", mode: "original", mask: "" },
  { label: "DateTime + Original", mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{ORIGINAL}{EXT}" },
  { label: "DateTime + UUID", mode: "mask", mask: "{YYYY}{MM}{DD}-{HH}{mm}{ss}_{UUID8}{EXT}" },
  { label: "European Date + Original", mode: "mask", mask: "{DD}{MM}{YYYY}_{ORIGINAL}{EXT}" },
  { label: "UUID only", mode: "mask", mask: "{UUID}{EXT}" },
  { label: "ISO DateTime + Original", mode: "mask", mask: "{YYYY}-{MM}-{DD}T{HH}{mm}{ss}_{UUID8}_{ORIGINAL}{EXT}" },
];

// === Drop Endpoints ===

export type EndpointType = "api" | "sftp" | "sftp-server";

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  /** AES-256-GCM encrypted password */
  passwordEncrypted?: string;
  /** PEM private key (stored as-is, not encrypted — consider using key files) */
  privateKey?: string;
  /** Remote directory path */
  remotePath: string;
  /** "pull" = fetch files FROM remote, "push" = send files TO remote */
  direction: "pull" | "push";
}

export interface PollConfig {
  /** Whether polling is enabled */
  enabled: boolean;
  /** Interval in seconds (minimum 10) */
  intervalSeconds: number;
  /** For non-SFTP: path to poll for new files */
  sourcePath?: string;
  /** Delete source files after successful transfer */
  deleteAfterTransfer: boolean;
}

export interface DropEndpoint {
  id: string;
  /** URL slug, e.g. "invoices" → /api/drop/invoices */
  slug: string;
  description: string;
  /** Endpoint type: "api" (HTTP upload) or "sftp" */
  type: EndpointType;
  /** ID of the destination to write files to */
  destinationId: string;
  /** Subdirectory within the destination (optional) */
  subdirectory?: string;
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
  /** SFTP configuration (only when type === "sftp") */
  sftp?: SftpConfig;
  /** Polling configuration (pull files on interval) */
  poll?: PollConfig;
  /** Email notification config */
  notifications?: {
    /** Email address to send notifications to */
    email: string;
    /** When to send: "all" = every upload, "failures" = only failures, "none" = disabled */
    on: "all" | "failures" | "none";
  };
  createdAt: string;
  updatedAt?: string;
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "FileDrop",
  maxFileSize: 52428800, // 50MB
  fileRetentionDays: 0,
  rateLimitPerKey: 60,
  allowedOrigins: [],
  sftpServerEnabled: false,
  sftpServerPort: 2222,
};
