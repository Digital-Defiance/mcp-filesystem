/**
 * Security manager interface for filesystem operations
 */

/**
 * Operation permission levels
 */
export type OperationPermission = "allow" | "deny" | "confirm";

/**
 * Operation-specific permissions
 */
export interface OperationPermissions {
  /** Permission for read operations (search, checksum, watch) */
  read: OperationPermission;
  /** Permission for write operations (copy, create, modify) */
  write: OperationPermission;
  /** Permission for delete operations */
  delete: OperationPermission;
  /** Permission for move operations */
  move: OperationPermission;
  /** Permission for batch operations */
  batch: OperationPermission;
  /** Permission for symlink creation */
  symlink: OperationPermission;
  /** Permission for directory operations (recursive copy/delete) */
  directory: OperationPermission;
  /** Permission for index building */
  index: OperationPermission;
}

/**
 * Time window for operation restrictions (cron-like)
 */
export interface TimeWindow {
  /** Days of week (0-6, 0=Sunday) */
  days?: number[];
  /** Start hour (0-23) */
  startHour?: number;
  /** End hour (0-23) */
  endHour?: number;
  /** Timezone (e.g., "America/New_York") */
  timezone?: string;
}

/**
 * Comprehensive security configuration - Enterprise-grade fine-grained controls
 */
export interface SecurityConfig {
  // === WORKSPACE CONTROL (REQUIRED) ===
  /** Workspace root - all operations confined to this directory */
  workspaceRoot: string;

  /** Explicit allowlist of subdirectories within workspace (empty = entire workspace) */
  allowedSubdirectories?: string[];

  /** Paths that are explicitly blocked (e.g., .git, .env, node_modules) */
  blockedPaths: string[];

  /** Blocked file patterns (e.g., *.key, *.pem, *.env) */
  blockedPatterns: string[];

  /** Additional blocked patterns beyond hardcoded sensitive patterns */
  additionalBlockedPatterns?: string[];

  // === OPERATION PERMISSIONS ===
  /** Fine-grained operation permissions (allow, deny, confirm) */
  operationPermissions: OperationPermissions;

  /** Specific paths that require confirmation even if operation is allowed */
  requireConfirmationForPaths?: string[];

  /** Specific patterns that require confirmation */
  requireConfirmationForPatterns?: string[];

  /** Auto-approve after N successful operations on same path */
  autoApproveAfterCount?: number;

  /** Dry-run mode (simulate operations without executing) */
  dryRunMode?: boolean;

  // === FILE SIZE LIMITS ===
  /** Maximum file size for operations (bytes) */
  maxFileSize: number; // default: 100MB

  /** Maximum total size for batch operations (bytes) */
  maxBatchSize: number; // default: 1GB

  /** Maximum file size for content indexing (bytes) */
  maxIndexFileSize?: number; // default: 1MB

  /** Maximum total index size (bytes) */
  maxIndexSize?: number; // default: 100MB

  // === OPERATION LIMITS ===
  /** Maximum operations per minute per agent */
  maxOperationsPerMinute: number; // default: 100

  /** Maximum operations per hour per agent */
  maxOperationsPerHour?: number;

  /** Maximum concurrent watch sessions per agent */
  maxWatchSessionsPerAgent?: number; // default: 10

  /** Maximum files in a single batch operation */
  maxBatchOperationSize?: number; // default: 1000

  /** Maximum depth for recursive operations */
  maxRecursionDepth?: number; // default: 100

  /** Maximum search results to return */
  maxSearchResults?: number; // default: 1000

  // === RATE LIMITING ===
  /** Cooldown period in seconds after rate limit hit */
  rateLimitCooldownSeconds?: number;

  /** Maximum total operations (lifetime of server) */
  maxTotalOperations?: number;

  // === CONTENT RESTRICTIONS ===
  /** Block binary file operations (only allow text files) */
  blockBinaryFiles?: boolean;

  /** Allowed file extensions (empty = all allowed) */
  allowedFileExtensions?: string[];

  /** Blocked file extensions beyond hardcoded sensitive patterns */
  blockedFileExtensions?: string[];

  /** Maximum line length for text files (prevent malformed files) */
  maxLineLength?: number;

  /** Block files with null bytes (potential binary/malicious content) */
  blockNullBytes?: boolean;

  // === SYMLINK CONTROL ===
  /** Allow symlink creation */
  allowSymlinks: boolean; // default: true

  /** Allow following symlinks during operations */
  followSymlinks: boolean; // default: true

  /** Maximum symlink chain depth */
  maxSymlinkDepth?: number; // default: 10

  /** Block symlinks to specific paths */
  blockedSymlinkTargets?: string[];

  // === WATCH CONTROL ===
  /** Allow directory watching */
  allowWatching: boolean; // default: true

  /** Maximum events to buffer per watch session */
  maxWatchEventBuffer?: number; // default: 1000

  /** Auto-stop watch sessions after inactivity (seconds) */
  watchSessionTimeout?: number;

  // === AUDIT & MONITORING ===
  /** Enable audit logging */
  enableAuditLog: boolean; // default: true

  /** Audit log file path */
  auditLogPath?: string;

  /** Log level (error, warn, info, debug) */
  auditLogLevel?: "error" | "warn" | "info" | "debug";

  /** Enable real-time security alerts */
  enableSecurityAlerts?: boolean;

  /** Alert webhook URL for security violations */
  securityAlertWebhook?: string;

  /** Log all file access (verbose, may impact performance) */
  logAllAccess?: boolean;

  // === CONFIRMATION & APPROVAL ===
  /** Require explicit confirmation for destructive operations */
  requireConfirmation: boolean; // default: true

  /** Confirmation timeout in seconds (auto-deny after timeout) */
  confirmationTimeoutSeconds?: number; // default: 30

  /** Require confirmation for operations above this size (bytes) */
  requireConfirmationAboveSize?: number;

  // === TIME RESTRICTIONS ===
  /** Allowed time windows for operations (cron-like) */
  allowedTimeWindows?: TimeWindow[];

  /** Blocked time windows (maintenance windows, etc.) */
  blockedTimeWindows?: TimeWindow[];

  // === MODE CONTROLS ===
  /** Read-only mode (no write/delete operations) */
  readOnly: boolean; // default: false

  /** Paranoid mode (maximum security, requires confirmation for everything) */
  paranoidMode?: boolean;

  /** Permissive mode (minimal restrictions, for trusted environments) */
  permissiveMode?: boolean;

  // === CHECKSUM & INTEGRITY ===
  /** Require checksum verification before operations on critical files */
  requireChecksumVerification?: boolean;

  /** Paths that require checksum verification */
  checksumVerificationPaths?: string[];

  /** Auto-compute checksums for all write operations */
  autoComputeChecksums?: boolean;

  // === BACKUP & RECOVERY ===
  /** Auto-backup files before destructive operations */
  autoBackup?: boolean;

  /** Backup directory path (relative to workspace or absolute) */
  backupDirectory?: string;

  /** Maximum backup retention (number of backups per file) */
  maxBackupRetention?: number;

  /** Backup file naming pattern */
  backupNamingPattern?: string; // e.g., "{filename}.{timestamp}.bak"

  // === ADVANCED SECURITY ===
  /** Enable content scanning for malicious patterns */
  enableContentScanning?: boolean;

  /** Malicious content patterns to detect */
  maliciousPatterns?: string[];

  /** Quarantine directory for suspicious files */
  quarantineDirectory?: string;

  /** Enable file integrity monitoring (detect unauthorized changes) */
  enableIntegrityMonitoring?: boolean;

  /** Integrity check interval in seconds */
  integrityCheckInterval?: number;

  // === AGENT-SPECIFIC CONTROLS ===
  /** Per-agent operation limits */
  agentLimits?: Record<
    string,
    {
      maxOperationsPerMinute?: number;
      maxFileSize?: number;
      allowedOperations?: string[];
      blockedPaths?: string[];
    }
  >;

  // === EMERGENCY CONTROLS ===
  /** Emergency stop - block all operations */
  emergencyStop?: boolean;

  /** Emergency read-only - allow only read operations */
  emergencyReadOnly?: boolean;

  /** Lockdown paths - completely block access to these paths */
  lockdownPaths?: string[];
}

/**
 * Operation context for validation and confirmation
 */
export interface OperationContext {
  /** Operation type */
  operation:
    | "read"
    | "write"
    | "delete"
    | "move"
    | "batch"
    | "symlink"
    | "directory"
    | "index";
  /** Paths involved in the operation */
  paths: string[];
  /** Agent identifier */
  agentId: string;
  /** Additional operation details */
  details?: Record<string, any>;
  /** Whether this is a dry-run */
  dryRun?: boolean;
}

/**
 * Confirmation request for user approval
 */
export interface ConfirmationRequest {
  /** Unique request ID */
  id: string;
  /** Operation context */
  context: OperationContext;
  /** Human-readable description */
  description: string;
  /** Risk level (low, medium, high, critical) */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Timestamp when request was created */
  timestamp: Date;
  /** Timeout in seconds */
  timeoutSeconds: number;
}

/**
 * Confirmation response from user
 */
export interface ConfirmationResponse {
  /** Request ID */
  requestId: string;
  /** Whether operation was approved */
  approved: boolean;
  /** Optional reason for denial */
  reason?: string;
  /** Whether to remember this decision */
  remember?: boolean;
}

export interface ISecurityManager {
  /**
   * Validate a file path against all security layers
   * @param filePath - Path to validate
   * @param operation - Type of operation (read, write, delete)
   * @returns Resolved absolute path if valid
   * @throws SecurityError if validation fails
   */
  validatePath(
    filePath: string,
    operation: "read" | "write" | "delete"
  ): string;

  /**
   * Validate an operation against security policies
   * @param context - Operation context
   * @returns Whether operation is allowed
   * @throws SecurityError if operation is denied
   */
  validateOperation(context: OperationContext): Promise<boolean>;

  /**
   * Check if operation requires user confirmation
   * @param context - Operation context
   * @returns Whether confirmation is required
   */
  requiresConfirmation(context: OperationContext): boolean;

  /**
   * Request user confirmation for an operation
   * @param context - Operation context
   * @returns Confirmation request
   */
  requestConfirmation(context: OperationContext): Promise<ConfirmationRequest>;

  /**
   * Process user confirmation response
   * @param response - Confirmation response
   * @returns Whether operation should proceed
   */
  processConfirmation(response: ConfirmationResponse): boolean;

  /**
   * Check if operation is within allowed time window
   * @returns Whether current time is within allowed window
   */
  isWithinTimeWindow(): boolean;

  /**
   * Validate a symlink creation request
   * @param linkPath - Path where symlink will be created
   * @param targetPath - Target path for the symlink
   * @throws SecurityError if validation fails
   */
  validateSymlink(linkPath: string, targetPath: string): void;

  /**
   * Validate file size against limits
   * @param size - File size in bytes
   * @param agentId - Agent identifier (for agent-specific limits)
   * @throws SecurityError if size exceeds limit
   */
  validateFileSize(size: number, agentId?: string): void;

  /**
   * Validate batch operation total size
   * @param totalSize - Total size in bytes
   * @param operationCount - Number of operations in batch
   * @throws SecurityError if size or count exceeds limit
   */
  validateBatchSize(totalSize: number, operationCount: number): void;

  /**
   * Check rate limit for an agent
   * @param agentId - Agent identifier
   * @param operation - Operation type (for operation-specific limits)
   * @throws SecurityError if rate limit exceeded
   */
  checkRateLimit(agentId: string, operation?: string): void;

  /**
   * Check if agent has reached operation quota
   * @param agentId - Agent identifier
   * @throws SecurityError if quota exceeded
   */
  checkOperationQuota(agentId: string): void;

  /**
   * Validate file content for malicious patterns
   * @param content - File content
   * @param filePath - File path (for context)
   * @throws SecurityError if malicious content detected
   */
  validateContent(content: string | Buffer, filePath: string): void;

  /**
   * Check if file extension is allowed
   * @param filePath - File path
   * @returns Whether extension is allowed
   */
  isExtensionAllowed(filePath: string): boolean;

  /**
   * Audit a filesystem operation
   * @param operation - Operation name
   * @param paths - Paths involved
   * @param result - Operation result
   * @param agentId - Agent identifier
   * @param details - Additional details
   */
  auditOperation(
    operation: string,
    paths: string[],
    result: string,
    agentId?: string,
    details?: Record<string, any>
  ): void;

  /**
   * Send security alert
   * @param severity - Alert severity
   * @param message - Alert message
   * @param details - Additional details
   */
  sendSecurityAlert(
    severity: "low" | "medium" | "high" | "critical",
    message: string,
    details?: Record<string, any>
  ): Promise<void>;

  /**
   * Get the workspace root directory
   * @returns Workspace root path
   */
  getWorkspaceRoot(): string;

  /**
   * Get security statistics
   * @returns Security statistics
   */
  getSecurityStats(): {
    totalOperations: number;
    blockedOperations: number;
    confirmedOperations: number;
    deniedOperations: number;
    securityViolations: number;
    activeWatchSessions: number;
  };

  /**
   * Emergency stop - block all operations
   */
  emergencyStop(): void;

  /**
   * Resume operations after emergency stop
   */
  resumeOperations(): void;

  /**
   * Check if in emergency mode
   * @returns Whether emergency mode is active
   */
  isEmergencyMode(): boolean;
}
