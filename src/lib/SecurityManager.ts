/**
 * Security manager implementation
 * Implements multi-layer security validation for filesystem operations
 */

import * as fs from "fs";
import * as path from "path";
import {
  ISecurityManager,
  SecurityConfig,
} from "../interfaces/ISecurityManager";
import { SecurityError } from "../types";

export class SecurityManager implements ISecurityManager {
  private workspaceRoot: string;
  private allowedSubdirectories: Set<string> | null;
  private blockedPaths: Set<string>;
  private blockedPatterns: RegExp[];
  private operationCount: Map<string, number[]> = new Map();
  private config: SecurityConfig;
  private emergencyMode = false;

  // Hardcoded system paths that are ALWAYS blocked
  private readonly SYSTEM_PATHS = [
    "/etc",
    "/sys",
    "/proc",
    "/dev",
    "/boot",
    "/root",
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "/System",
    "/Library",
    "/Applications", // macOS
    "/bin",
    "/sbin",
    "/usr/bin",
    "/usr/sbin",
  ];

  // Hardcoded sensitive file patterns that are ALWAYS blocked
  private readonly SENSITIVE_PATTERNS = [
    /\.ssh\//,
    /\.aws\//,
    /\.kube\//,
    /id_rsa/,
    /\.pem$/,
    /\.key$/,
    /\.p12$/,
    /\.pfx$/,
    /password/i,
    /secret/i,
    /token/i,
    /\.env$/,
  ];

  /**
   * Convert glob pattern to regex pattern
   * @param pattern - Glob pattern (e.g., "*.key", "*secret*")
   * @returns Regex pattern
   */
  private globToRegex(pattern: string): RegExp {
    // If the pattern already looks like a regex (starts and ends with /),
    // try to parse it as-is
    if (pattern.startsWith("/") && pattern.endsWith("/")) {
      return new RegExp(pattern.slice(1, -1));
    }

    // Escape special regex characters except * and ?
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      // Convert glob * to regex .*
      .replace(/\*/g, ".*")
      // Convert glob ? to regex .
      .replace(/\?/g, ".");

    // Match anywhere in the path
    return new RegExp(regexPattern);
  }

  constructor(config: SecurityConfig) {
    this.config = config;
    this.workspaceRoot = path.resolve(config.workspaceRoot);

    // Validate workspace root exists and is a directory
    if (!fs.existsSync(this.workspaceRoot)) {
      throw new Error("Workspace root does not exist");
    }

    const stats = fs.statSync(this.workspaceRoot);
    if (!stats.isDirectory()) {
      throw new Error("Workspace root is not a directory");
    }

    // Set up allowed subdirectories
    if (
      config.allowedSubdirectories &&
      config.allowedSubdirectories.length > 0
    ) {
      this.allowedSubdirectories = new Set(
        config.allowedSubdirectories.map((p) =>
          path.resolve(this.workspaceRoot, p)
        )
      );
    } else {
      this.allowedSubdirectories = null;
    }

    // Set up blocklists
    this.blockedPaths = new Set(
      config.blockedPaths.map((p) => path.resolve(this.workspaceRoot, p))
    );
    this.blockedPatterns = config.blockedPatterns.map((p) =>
      this.globToRegex(p)
    );
  }

  validatePath(
    filePath: string,
    operation: "read" | "write" | "delete"
  ): string {
    // Layer 1: Resolve to absolute path (prevents relative path tricks)
    const resolved = path.resolve(this.workspaceRoot, filePath);

    // Layer 2: Check workspace boundary (CRITICAL)
    if (
      !resolved.startsWith(this.workspaceRoot + path.sep) &&
      resolved !== this.workspaceRoot
    ) {
      this.auditSecurityViolation("workspace_escape", filePath, resolved);
      throw new SecurityError(
        "Path traversal detected - path outside workspace"
      );
    }

    // Layer 3: Check for path traversal sequences
    if (
      filePath.includes("..") ||
      filePath.includes("./") ||
      filePath.includes(".\\")
    ) {
      this.auditSecurityViolation("path_traversal", filePath, resolved);
      throw new SecurityError("Path contains traversal sequences");
    }

    // Layer 4: Check against system paths (ALWAYS blocked)
    for (const systemPath of this.SYSTEM_PATHS) {
      if (resolved.startsWith(systemPath)) {
        this.auditSecurityViolation("system_path_access", filePath, resolved);
        throw new SecurityError("Cannot access system directories");
      }
    }

    // Layer 5: Check against sensitive patterns (ALWAYS blocked)
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.test(resolved)) {
        this.auditSecurityViolation(
          "sensitive_file_access",
          filePath,
          resolved
        );
        throw new SecurityError("Cannot access sensitive files");
      }
    }

    // Layer 6: Check allowed subdirectories (if configured)
    if (this.allowedSubdirectories && this.allowedSubdirectories.size > 0) {
      const isAllowed = Array.from(this.allowedSubdirectories).some(
        (allowed) =>
          resolved.startsWith(allowed + path.sep) || resolved === allowed
      );

      if (!isAllowed) {
        this.auditSecurityViolation(
          "subdirectory_restriction",
          filePath,
          resolved
        );
        throw new SecurityError("Path not in allowed subdirectories");
      }
    }

    // Layer 7: Check user-configured blocklist
    for (const blocked of this.blockedPaths) {
      if (resolved.startsWith(blocked)) {
        this.auditSecurityViolation("blocked_path", filePath, resolved);
        throw new SecurityError("Path is blocked by security policy");
      }
    }

    // Layer 8: Check user-configured patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(resolved)) {
        this.auditSecurityViolation("blocked_pattern", filePath, resolved);
        throw new SecurityError("Path matches blocked pattern");
      }
    }

    // Layer 9: Check read-only mode
    if (
      this.config.readOnly &&
      (operation === "write" || operation === "delete")
    ) {
      throw new SecurityError("Filesystem is in read-only mode");
    }

    // Layer 10: Resolve symlinks and validate target
    if (fs.existsSync(resolved)) {
      const stats = fs.lstatSync(resolved);
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(resolved);
        const resolvedTarget = path.resolve(path.dirname(resolved), target);

        // Recursively validate symlink target
        this.validatePath(resolvedTarget, operation);
      }
    }

    return resolved;
  }

  validateSymlink(linkPath: string, targetPath: string): void {
    const resolvedLink = this.validatePath(linkPath, "write");
    const resolvedTarget = path.resolve(path.dirname(resolvedLink), targetPath);

    // Ensure symlink target is within workspace
    if (!resolvedTarget.startsWith(this.workspaceRoot + path.sep)) {
      this.auditSecurityViolation("symlink_escape", linkPath, resolvedTarget);
      throw new SecurityError("Symlink target outside workspace");
    }

    // Validate target path through normal validation
    this.validatePath(resolvedTarget, "read");
  }

  validateFileSize(size: number): void {
    if (size > this.config.maxFileSize) {
      throw new SecurityError(
        `File size ${size} exceeds maximum ${this.config.maxFileSize}`
      );
    }
  }

  validateBatchSize(totalSize: number, operationCount: number): void {
    if (totalSize > this.config.maxBatchSize) {
      throw new SecurityError(
        `Batch size ${totalSize} exceeds maximum ${this.config.maxBatchSize}`
      );
    }
  }

  checkRateLimit(agentId: string): void {
    const now = Date.now();
    const ops = this.operationCount.get(agentId) || [];

    // Remove operations older than 1 minute
    const recent = ops.filter((t) => now - t < 60000);

    if (recent.length >= this.config.maxOperationsPerMinute) {
      this.auditSecurityViolation(
        "rate_limit",
        agentId,
        `${recent.length} ops/min`
      );
      throw new SecurityError("Rate limit exceeded");
    }

    recent.push(now);
    this.operationCount.set(agentId, recent);
  }

  private auditSecurityViolation(
    type: string,
    input: string,
    resolved: string
  ): void {
    if (this.config.enableAuditLog) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "SECURITY_VIOLATION",
          type,
          input,
          resolved,
          workspaceRoot: this.workspaceRoot,
        })
      );
    }
  }

  auditOperation(operation: string, paths: string[], result: string): void {
    if (this.config.enableAuditLog) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "AUDIT",
          operation,
          paths,
          result,
        })
      );
    }
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async validateOperation(context: any): Promise<boolean> {
    return true;
  }

  requiresConfirmation(context: any): boolean {
    return false;
  }

  async requestConfirmation(context: any): Promise<any> {
    throw new Error("Not implemented");
  }

  processConfirmation(response: any): boolean {
    return false;
  }

  isWithinTimeWindow(): boolean {
    return true;
  }

  checkOperationQuota(agentId: string): void {
    // No-op in basic implementation
  }

  validateContent(content: string | Buffer, filePath: string): void {
    // No-op in basic implementation
  }

  isExtensionAllowed(filePath: string): boolean {
    return true;
  }

  async sendSecurityAlert(
    severity: "low" | "medium" | "high" | "critical",
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    // No-op in basic implementation
  }

  getSecurityStats(): {
    totalOperations: number;
    blockedOperations: number;
    confirmedOperations: number;
    deniedOperations: number;
    securityViolations: number;
    activeWatchSessions: number;
  } {
    return {
      totalOperations: 0,
      blockedOperations: 0,
      confirmedOperations: 0,
      deniedOperations: 0,
      securityViolations: 0,
      activeWatchSessions: 0,
    };
  }

  emergencyStop(): void {
    this.emergencyMode = true;
  }

  resumeOperations(): void {
    this.emergencyMode = false;
  }

  isEmergencyMode(): boolean {
    return this.emergencyMode;
  }
}
