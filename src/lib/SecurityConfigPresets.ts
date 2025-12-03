/**
 * Security Configuration Presets
 *
 * Provides pre-configured security profiles for different use cases
 */

import {
  SecurityConfig,
  OperationPermissions,
} from "../interfaces/ISecurityManager";

/**
 * Default operation permissions (balanced security)
 */
const DEFAULT_PERMISSIONS: OperationPermissions = {
  read: "allow",
  write: "confirm",
  delete: "confirm",
  move: "confirm",
  batch: "confirm",
  symlink: "confirm",
  directory: "confirm",
  index: "allow",
};

/**
 * Permissive operation permissions (trusted environment)
 */
const PERMISSIVE_PERMISSIONS: OperationPermissions = {
  read: "allow",
  write: "allow",
  delete: "confirm",
  move: "allow",
  batch: "confirm",
  symlink: "allow",
  directory: "confirm",
  index: "allow",
};

/**
 * Restrictive operation permissions (high security)
 */
const RESTRICTIVE_PERMISSIONS: OperationPermissions = {
  read: "allow",
  write: "confirm",
  delete: "deny",
  move: "confirm",
  batch: "deny",
  symlink: "deny",
  directory: "deny",
  index: "allow",
};

/**
 * Paranoid operation permissions (maximum security)
 */
const PARANOID_PERMISSIONS: OperationPermissions = {
  read: "confirm",
  write: "confirm",
  delete: "deny",
  move: "deny",
  batch: "deny",
  symlink: "deny",
  directory: "deny",
  index: "confirm",
};

/**
 * Development environment preset (permissive)
 */
export function createDevelopmentConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    blockedPaths: [".git", "node_modules"],
    blockedPatterns: ["*.env"],
    operationPermissions: PERMISSIVE_PERMISSIONS,
    maxFileSize: 104857600, // 100 MB
    maxBatchSize: 1073741824, // 1 GB
    maxOperationsPerMinute: 200,
    maxOperationsPerHour: 10000,
    allowSymlinks: true,
    followSymlinks: true,
    allowWatching: true,
    enableAuditLog: true,
    auditLogLevel: "info",
    requireConfirmation: true,
    confirmationTimeoutSeconds: 60,
    readOnly: false,
    dryRunMode: false,
    maxBatchOperationSize: 1000,
    maxRecursionDepth: 100,
    maxSearchResults: 1000,
    maxWatchSessionsPerAgent: 20,
    blockBinaryFiles: false,
    blockNullBytes: false,
    enableContentScanning: false,
    autoBackup: false,
  };
}

/**
 * Production environment preset (restrictive)
 */
export function createProductionConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    allowedSubdirectories: ["logs", "public", "uploads"],
    blockedPaths: [
      ".git",
      ".env",
      "config",
      "secrets",
      "database",
      "node_modules",
      ".ssh",
      ".aws",
      ".kube",
    ],
    blockedPatterns: [
      "*.key",
      "*.pem",
      "*.env",
      "*secret*",
      "*password*",
      "*.config.*",
      "*.prod.*",
    ],
    additionalBlockedPatterns: ["*credential*", "*token*", "*.cert"],
    operationPermissions: RESTRICTIVE_PERMISSIONS,
    requireConfirmationForPaths: ["config", "database"],
    requireConfirmationForPatterns: ["*.sql", "*.db"],
    maxFileSize: 10485760, // 10 MB
    maxBatchSize: 104857600, // 100 MB
    maxOperationsPerMinute: 50,
    maxOperationsPerHour: 2000,
    maxWatchSessionsPerAgent: 5,
    maxBatchOperationSize: 100,
    maxRecursionDepth: 50,
    maxSearchResults: 500,
    allowSymlinks: false,
    followSymlinks: false,
    allowWatching: true,
    enableAuditLog: true,
    auditLogLevel: "info",
    auditLogPath: "/var/log/mcp-filesystem/audit.log",
    enableSecurityAlerts: true,
    requireConfirmation: true,
    confirmationTimeoutSeconds: 30,
    requireConfirmationAboveSize: 1048576, // 1 MB
    readOnly: false,
    blockBinaryFiles: true,
    blockNullBytes: true,
    enableContentScanning: true,
    autoBackup: true,
    backupDirectory: ".backups",
    maxBackupRetention: 5,
    rateLimitCooldownSeconds: 60,
  };
}

/**
 * Read-only analysis preset (safe for code review)
 */
export function createReadOnlyConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    allowedSubdirectories: ["src", "tests", "docs"],
    blockedPaths: [".git", ".env", "node_modules"],
    blockedPatterns: ["*.key", "*.pem", "*.env"],
    operationPermissions: {
      read: "allow",
      write: "deny",
      delete: "deny",
      move: "deny",
      batch: "deny",
      symlink: "deny",
      directory: "deny",
      index: "allow",
    },
    maxFileSize: 52428800, // 50 MB
    maxBatchSize: 524288000, // 500 MB
    maxOperationsPerMinute: 100,
    maxSearchResults: 2000,
    allowSymlinks: false,
    followSymlinks: true,
    allowWatching: true,
    enableAuditLog: true,
    auditLogLevel: "info",
    requireConfirmation: false,
    readOnly: true,
    blockBinaryFiles: false,
    enableContentScanning: false,
  };
}

/**
 * Paranoid mode preset (maximum security)
 */
export function createParanoidConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    allowedSubdirectories: ["src"],
    blockedPaths: [
      ".git",
      ".env",
      "config",
      "secrets",
      "node_modules",
      ".ssh",
      ".aws",
      ".kube",
      ".gcloud",
    ],
    blockedPatterns: [
      "*.key",
      "*.pem",
      "*.env",
      "*secret*",
      "*password*",
      "*token*",
      "*credential*",
      "*.config.*",
      "*.prod.*",
      "*.cert",
      "*.crt",
    ],
    operationPermissions: PARANOID_PERMISSIONS,
    requireConfirmationForPaths: ["src"],
    requireConfirmationForPatterns: ["*"],
    maxFileSize: 5242880, // 5 MB
    maxBatchSize: 52428800, // 50 MB
    maxOperationsPerMinute: 20,
    maxOperationsPerHour: 500,
    maxWatchSessionsPerAgent: 3,
    maxBatchOperationSize: 10,
    maxRecursionDepth: 20,
    maxSearchResults: 100,
    allowSymlinks: false,
    followSymlinks: false,
    allowWatching: true,
    maxWatchEventBuffer: 100,
    enableAuditLog: true,
    auditLogLevel: "debug",
    auditLogPath: "/var/log/mcp-filesystem/audit.log",
    enableSecurityAlerts: true,
    logAllAccess: true,
    requireConfirmation: true,
    confirmationTimeoutSeconds: 15,
    requireConfirmationAboveSize: 102400, // 100 KB
    readOnly: false,
    paranoidMode: true,
    blockBinaryFiles: true,
    blockNullBytes: true,
    maxLineLength: 1000,
    enableContentScanning: true,
    enableIntegrityMonitoring: true,
    integrityCheckInterval: 300, // 5 minutes
    autoBackup: true,
    backupDirectory: ".backups",
    maxBackupRetention: 10,
    rateLimitCooldownSeconds: 120,
  };
}

/**
 * Shared team environment preset (balanced)
 */
export function createTeamConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    allowedSubdirectories: ["src", "tests", "docs", "scripts"],
    blockedPaths: [
      ".git",
      ".env",
      "node_modules",
      "config/production",
      "secrets",
    ],
    blockedPatterns: [
      "*.key",
      "*.pem",
      "*.env",
      "*secret*",
      "*password*",
      "*.prod.*",
    ],
    operationPermissions: DEFAULT_PERMISSIONS,
    requireConfirmationForPaths: ["config", "scripts"],
    maxFileSize: 52428800, // 50 MB
    maxBatchSize: 524288000, // 500 MB
    maxOperationsPerMinute: 75,
    maxOperationsPerHour: 3000,
    maxWatchSessionsPerAgent: 10,
    maxBatchOperationSize: 500,
    maxRecursionDepth: 75,
    maxSearchResults: 1000,
    allowSymlinks: true,
    followSymlinks: true,
    maxSymlinkDepth: 5,
    allowWatching: true,
    enableAuditLog: true,
    auditLogLevel: "info",
    requireConfirmation: true,
    confirmationTimeoutSeconds: 45,
    requireConfirmationAboveSize: 5242880, // 5 MB
    readOnly: false,
    blockBinaryFiles: false,
    blockNullBytes: true,
    enableContentScanning: true,
    autoBackup: true,
    backupDirectory: ".backups",
    maxBackupRetention: 3,
  };
}

/**
 * CI/CD environment preset (automated, restrictive)
 */
export function createCICDConfig(workspaceRoot: string): SecurityConfig {
  return {
    workspaceRoot,
    allowedSubdirectories: ["src", "tests", "build", "dist"],
    blockedPaths: [".git", ".env", "node_modules", "secrets"],
    blockedPatterns: ["*.key", "*.pem", "*.env", "*secret*", "*password*"],
    operationPermissions: {
      read: "allow",
      write: "allow",
      delete: "allow",
      move: "allow",
      batch: "allow",
      symlink: "deny",
      directory: "allow",
      index: "allow",
    },
    maxFileSize: 104857600, // 100 MB
    maxBatchSize: 1073741824, // 1 GB
    maxOperationsPerMinute: 500,
    maxOperationsPerHour: 20000,
    maxBatchOperationSize: 5000,
    maxRecursionDepth: 100,
    allowSymlinks: false,
    followSymlinks: false,
    allowWatching: false,
    enableAuditLog: true,
    auditLogLevel: "warn",
    requireConfirmation: false, // Automated environment
    readOnly: false,
    blockBinaryFiles: false,
    enableContentScanning: false,
  };
}

/**
 * Create custom config with sensible defaults
 */
export function createCustomConfig(
  workspaceRoot: string,
  overrides: Partial<SecurityConfig>
): SecurityConfig {
  const defaults = createDevelopmentConfig(workspaceRoot);
  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(config: SecurityConfig): string[] {
  const errors: string[] = [];

  if (!config.workspaceRoot) {
    errors.push("workspaceRoot is required");
  }

  if (config.maxFileSize <= 0) {
    errors.push("maxFileSize must be positive");
  }

  if (config.maxBatchSize <= 0) {
    errors.push("maxBatchSize must be positive");
  }

  if (config.maxOperationsPerMinute <= 0) {
    errors.push("maxOperationsPerMinute must be positive");
  }

  if (
    config.confirmationTimeoutSeconds &&
    config.confirmationTimeoutSeconds <= 0
  ) {
    errors.push("confirmationTimeoutSeconds must be positive");
  }

  if (config.maxBatchOperationSize && config.maxBatchOperationSize <= 0) {
    errors.push("maxBatchOperationSize must be positive");
  }

  if (config.maxRecursionDepth && config.maxRecursionDepth <= 0) {
    errors.push("maxRecursionDepth must be positive");
  }

  // Check for conflicting settings
  if (config.readOnly && config.operationPermissions.write === "allow") {
    errors.push("Cannot have readOnly=true with write permission=allow");
  }

  if (config.permissiveMode && config.paranoidMode) {
    errors.push("Cannot enable both permissiveMode and paranoidMode");
  }

  return errors;
}
