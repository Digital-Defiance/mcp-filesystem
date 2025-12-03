/**
 * Enhanced Security Manager Implementation
 * Enterprise-grade security with fine-grained controls, user confirmation, and comprehensive audit logging
 *
 * Security Layers:
 * 1. Absolute path resolution
 * 2. Workspace boundary check
 * 3. Path traversal detection
 * 4. System path blocklist (hardcoded)
 * 5. Sensitive pattern blocklist (hardcoded)
 * 6. Subdirectory restrictions
 * 7. User blocklist
 * 8. User pattern blocklist
 * 9. Operation permission check
 * 10. Time window validation
 * 11. Content validation
 * 12. Rate limiting
 * 13. User confirmation (if required)
 * 14. Symlink validation
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  ISecurityManager,
  SecurityConfig,
  OperationContext,
  ConfirmationRequest,
  ConfirmationResponse,
  OperationPermission,
  TimeWindow,
} from "../interfaces/ISecurityManager";
import { SecurityError } from "../types";

export class EnhancedSecurityManager implements ISecurityManager {
  private workspaceRoot: string;
  private allowedSubdirectories: Set<string> | null;
  private blockedPaths: Set<string>;
  private blockedPatterns: RegExp[];
  private additionalBlockedPatterns: RegExp[];
  private config: SecurityConfig;

  // Operation tracking
  private operationCount: Map<string, number[]> = new Map();
  private hourlyOperationCount: Map<string, number[]> = new Map();
  private totalOperations = 0;
  private blockedOperations = 0;
  private confirmedOperations = 0;
  private deniedOperations = 0;
  private securityViolations = 0;
  private activeWatchSessions = 0;

  // Confirmation tracking
  private pendingConfirmations: Map<string, ConfirmationRequest> = new Map();
  private confirmedOperationsMap: Map<string, boolean> = new Map(); // Hash -> approved
  private confirmationCallbacks: Map<
    string,
    (response: ConfirmationResponse) => void
  > = new Map();

  // Emergency mode
  private emergencyMode = false;

  // Agent-specific tracking
  private agentOperationCounts: Map<string, Map<string, number>> = new Map();

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
    /\.gcloud\//,
    /id_rsa/,
    /id_dsa/,
    /id_ecdsa/,
    /id_ed25519/,
    /\.pem$/,
    /\.key$/,
    /\.p12$/,
    /\.pfx$/,
    /\.crt$/,
    /\.cer$/,
    /password/i,
    /secret/i,
    /token/i,
    /credential/i,
    /\.env$/,
    /\.env\./,
    /private.*key/i,
  ];

  // Malicious content patterns
  private readonly MALICIOUS_PATTERNS = [
    /<script[^>]*>[\s\S]*?<\/script>/gi, // Script tags
    /eval\s*\(/gi, // eval() calls
    /exec\s*\(/gi, // exec() calls
    /system\s*\(/gi, // system() calls
    /\$\{.*\}/g, // Template injection
    /\$\(.*\)/g, // Command substitution
    /`.*`/g, // Backtick execution
  ];

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
    this.blockedPatterns = config.blockedPatterns.map((p) => new RegExp(p));
    this.additionalBlockedPatterns = (
      config.additionalBlockedPatterns || []
    ).map((p) => new RegExp(p));

    // Initialize emergency mode if configured
    if (config.emergencyStop) {
      this.emergencyMode = true;
    }
  }

  /**
   * Validate a file path against all security layers
   */
  validatePath(
    filePath: string,
    operation: "read" | "write" | "delete"
  ): string {
    // Check emergency mode
    if (this.emergencyMode) {
      throw new SecurityError("Emergency mode active - all operations blocked");
    }

    if (this.config.emergencyReadOnly && operation !== "read") {
      throw new SecurityError(
        "Emergency read-only mode active - only read operations allowed"
      );
    }

    // Layer 1: Resolve to absolute path (prevents relative path tricks)
    const resolved = path.resolve(this.workspaceRoot, filePath);

    // Layer 2: Check workspace boundary (CRITICAL)
    if (
      !resolved.startsWith(this.workspaceRoot + path.sep) &&
      resolved !== this.workspaceRoot
    ) {
      this.auditSecurityViolation("workspace_escape", filePath, resolved);
      this.securityViolations++;
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
      this.securityViolations++;
      throw new SecurityError("Path contains traversal sequences");
    }

    // Layer 4: Check against system paths (ALWAYS blocked)
    for (const systemPath of this.SYSTEM_PATHS) {
      if (resolved.startsWith(systemPath)) {
        this.auditSecurityViolation("system_path_access", filePath, resolved);
        this.securityViolations++;
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
        this.securityViolations++;
        throw new SecurityError("Cannot access sensitive files");
      }
    }

    // Check additional blocked patterns
    for (const pattern of this.additionalBlockedPatterns) {
      if (pattern.test(resolved)) {
        this.auditSecurityViolation(
          "additional_blocked_pattern",
          filePath,
          resolved
        );
        this.securityViolations++;
        throw new SecurityError("Path matches additional blocked pattern");
      }
    }

    // Layer 6: Check lockdown paths (emergency)
    if (this.config.lockdownPaths) {
      for (const lockdownPath of this.config.lockdownPaths) {
        const resolvedLockdown = path.resolve(this.workspaceRoot, lockdownPath);
        if (resolved.startsWith(resolvedLockdown)) {
          this.auditSecurityViolation("lockdown_path", filePath, resolved);
          this.securityViolations++;
          throw new SecurityError("Path is in lockdown - access denied");
        }
      }
    }

    // Layer 7: Check allowed subdirectories (if configured)
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
        this.securityViolations++;
        throw new SecurityError("Path not in allowed subdirectories");
      }
    }

    // Layer 8: Check user-configured blocklist
    for (const blocked of this.blockedPaths) {
      if (resolved.startsWith(blocked)) {
        this.auditSecurityViolation("blocked_path", filePath, resolved);
        this.securityViolations++;
        throw new SecurityError("Path is blocked by security policy");
      }
    }

    // Layer 9: Check user-configured patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(resolved)) {
        this.auditSecurityViolation("blocked_pattern", filePath, resolved);
        this.securityViolations++;
        throw new SecurityError("Path matches blocked pattern");
      }
    }

    // Layer 10: Check read-only mode
    if (
      this.config.readOnly &&
      (operation === "write" || operation === "delete")
    ) {
      throw new SecurityError("Filesystem is in read-only mode");
    }

    // Layer 11: Check file extension
    if (!this.isExtensionAllowed(resolved)) {
      this.auditSecurityViolation("blocked_extension", filePath, resolved);
      this.securityViolations++;
      throw new SecurityError("File extension is not allowed");
    }

    // Layer 12: Resolve symlinks and validate target
    if (fs.existsSync(resolved)) {
      const stats = fs.lstatSync(resolved);
      if (stats.isSymbolicLink()) {
        if (!this.config.followSymlinks) {
          throw new SecurityError("Following symlinks is disabled");
        }

        const target = fs.readlinkSync(resolved);
        const resolvedTarget = path.resolve(path.dirname(resolved), target);

        // Recursively validate symlink target
        this.validatePath(resolvedTarget, operation);
      }
    }

    return resolved;
  }

  /**
   * Validate an operation against security policies
   */
  async validateOperation(context: OperationContext): Promise<boolean> {
    // Check emergency mode
    if (this.emergencyMode) {
      throw new SecurityError("Emergency mode active - all operations blocked");
    }

    // Check time window
    if (!this.isWithinTimeWindow()) {
      throw new SecurityError("Operation not allowed in current time window");
    }

    // Check operation permission
    const permission = this.getOperationPermission(context.operation);

    if (permission === "deny") {
      this.blockedOperations++;
      throw new SecurityError(
        `Operation '${context.operation}' is denied by policy`
      );
    }

    // Check paranoid mode
    if (this.config.paranoidMode && permission === "allow") {
      // In paranoid mode, everything requires confirmation
      return this.requiresConfirmation(context);
    }

    // Check if confirmation is required
    if (permission === "confirm" || this.requiresConfirmation(context)) {
      const request = await this.requestConfirmation(context);
      // Wait for confirmation (this would be handled by the caller)
      return false; // Indicates confirmation is pending
    }

    return true; // Operation allowed
  }

  /**
   * Get operation permission from config
   */
  private getOperationPermission(operation: string): OperationPermission {
    const permissions = this.config.operationPermissions;

    switch (operation) {
      case "read":
        return permissions.read;
      case "write":
        return permissions.write;
      case "delete":
        return permissions.delete;
      case "move":
        return permissions.move;
      case "batch":
        return permissions.batch;
      case "symlink":
        return permissions.symlink;
      case "directory":
        return permissions.directory;
      case "index":
        return permissions.index;
      default:
        return "deny";
    }
  }

  /**
   * Check if operation requires user confirmation
   */
  requiresConfirmation(context: OperationContext): boolean {
    // Always require confirmation if configured
    if (this.config.requireConfirmation) {
      // Check if this is a destructive operation
      if (
        context.operation === "delete" ||
        context.operation === "move" ||
        (context.operation === "batch" &&
          context.details?.["operations"]?.some(
            (op: any) => op.type === "delete" || op.type === "move"
          ))
      ) {
        return true;
      }
    }

    // Check if paths require confirmation
    if (this.config.requireConfirmationForPaths) {
      for (const confPath of this.config.requireConfirmationForPaths) {
        const resolvedConfPath = path.resolve(this.workspaceRoot, confPath);
        if (
          context.paths.some((p) => {
            const resolved = path.resolve(this.workspaceRoot, p);
            return resolved.startsWith(resolvedConfPath);
          })
        ) {
          return true;
        }
      }
    }

    // Check if patterns require confirmation
    if (this.config.requireConfirmationForPatterns) {
      for (const pattern of this.config.requireConfirmationForPatterns) {
        const regex = new RegExp(pattern);
        if (context.paths.some((p) => regex.test(p))) {
          return true;
        }
      }
    }

    // Check if operation size requires confirmation
    if (
      this.config.requireConfirmationAboveSize &&
      context.details?.["totalSize"] &&
      context.details["totalSize"] > this.config.requireConfirmationAboveSize
    ) {
      return true;
    }

    // Check if auto-approve applies
    if (this.config.autoApproveAfterCount) {
      const hash = this.hashOperation(context);
      const count =
        this.agentOperationCounts.get(context.agentId)?.get(hash) || 0;
      if (count >= this.config.autoApproveAfterCount) {
        return false; // Auto-approved
      }
    }

    return false;
  }

  /**
   * Request user confirmation for an operation
   */
  async requestConfirmation(
    context: OperationContext
  ): Promise<ConfirmationRequest> {
    const requestId = crypto.randomBytes(16).toString("hex");
    const riskLevel = this.assessRiskLevel(context);
    const timeoutSeconds = this.config.confirmationTimeoutSeconds || 30;

    const request: ConfirmationRequest = {
      id: requestId,
      context,
      description: this.generateOperationDescription(context),
      riskLevel,
      timestamp: new Date(),
      timeoutSeconds,
    };

    this.pendingConfirmations.set(requestId, request);

    // Set timeout to auto-deny
    setTimeout(() => {
      if (this.pendingConfirmations.has(requestId)) {
        this.pendingConfirmations.delete(requestId);
        this.deniedOperations++;
        this.auditOperation(
          "confirmation_timeout",
          context.paths,
          "denied",
          context.agentId,
          { requestId, reason: "timeout" }
        );
      }
    }, timeoutSeconds * 1000);

    return request;
  }

  /**
   * Process user confirmation response
   */
  processConfirmation(response: ConfirmationResponse): boolean {
    const request = this.pendingConfirmations.get(response.requestId);

    if (!request) {
      throw new SecurityError("Invalid or expired confirmation request");
    }

    this.pendingConfirmations.delete(response.requestId);

    if (response.approved) {
      this.confirmedOperations++;

      // Remember decision if requested
      if (response.remember && this.config.autoApproveAfterCount) {
        const hash = this.hashOperation(request.context);
        const agentCounts =
          this.agentOperationCounts.get(request.context.agentId) || new Map();
        agentCounts.set(hash, (agentCounts.get(hash) || 0) + 1);
        this.agentOperationCounts.set(request.context.agentId, agentCounts);
      }

      this.auditOperation(
        "confirmation_approved",
        request.context.paths,
        "approved",
        request.context.agentId,
        { requestId: response.requestId }
      );

      return true;
    } else {
      this.deniedOperations++;

      this.auditOperation(
        "confirmation_denied",
        request.context.paths,
        "denied",
        request.context.agentId,
        { requestId: response.requestId, reason: response.reason }
      );

      return false;
    }
  }

  /**
   * Assess risk level of an operation
   */
  private assessRiskLevel(
    context: OperationContext
  ): "low" | "medium" | "high" | "critical" {
    // Critical: Batch delete, recursive directory delete
    if (context.operation === "delete" && context.details?.["recursive"]) {
      return "critical";
    }

    if (
      context.operation === "batch" &&
      context.details?.["operations"]?.some((op: any) => op.type === "delete")
    ) {
      return "critical";
    }

    // High: Delete operations, large batch operations
    if (context.operation === "delete") {
      return "high";
    }

    if (
      context.operation === "batch" &&
      context.details?.["operations"]?.length > 10
    ) {
      return "high";
    }

    // Medium: Write operations, move operations
    if (context.operation === "write" || context.operation === "move") {
      return "medium";
    }

    // Low: Read operations
    return "low";
  }

  /**
   * Generate human-readable operation description
   */
  private generateOperationDescription(context: OperationContext): string {
    const pathCount = context.paths.length;
    const pathList =
      pathCount <= 3
        ? context.paths.join(", ")
        : `${context.paths.slice(0, 3).join(", ")} and ${pathCount - 3} more`;

    switch (context.operation) {
      case "delete":
        return `Delete ${pathCount} file(s): ${pathList}`;
      case "write":
        return `Write to ${pathCount} file(s): ${pathList}`;
      case "move":
        return `Move ${pathCount} file(s): ${pathList}`;
      case "batch":
        const opCount = context.details?.["operations"]?.length || 0;
        return `Execute batch of ${opCount} operations on: ${pathList}`;
      case "directory":
        return `Recursive directory operation on: ${pathList}`;
      default:
        return `${context.operation} operation on: ${pathList}`;
    }
  }

  /**
   * Hash operation for tracking
   */
  private hashOperation(context: OperationContext): string {
    const data = JSON.stringify({
      operation: context.operation,
      paths: context.paths.sort(),
    });
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Check if operation is within allowed time window
   */
  isWithinTimeWindow(): boolean {
    // If no time windows configured, always allow
    if (!this.config.allowedTimeWindows && !this.config.blockedTimeWindows) {
      return true;
    }

    const now = new Date();
    const day = now.getDay(); // 0-6
    const hour = now.getHours(); // 0-23

    // Check blocked windows first
    if (this.config.blockedTimeWindows) {
      for (const window of this.config.blockedTimeWindows) {
        if (this.isInTimeWindow(day, hour, window)) {
          return false; // In blocked window
        }
      }
    }

    // Check allowed windows
    if (this.config.allowedTimeWindows) {
      for (const window of this.config.allowedTimeWindows) {
        if (this.isInTimeWindow(day, hour, window)) {
          return true; // In allowed window
        }
      }
      return false; // Not in any allowed window
    }

    return true; // No restrictions
  }

  /**
   * Check if current time is in a time window
   */
  private isInTimeWindow(
    day: number,
    hour: number,
    window: TimeWindow
  ): boolean {
    // Check day
    if (window.days && !window.days.includes(day)) {
      return false;
    }

    // Check hour
    if (window.startHour !== undefined && window.endHour !== undefined) {
      if (window.startHour <= window.endHour) {
        // Same day window
        if (hour < window.startHour || hour > window.endHour) {
          return false;
        }
      } else {
        // Overnight window
        if (hour < window.startHour && hour > window.endHour) {
          return false;
        }
      }
    }

    return true;
  }

  // Continue in next part...

  /**
   * Validate symlink creation
   */
  validateSymlink(linkPath: string, targetPath: string): void {
    if (!this.config.allowSymlinks) {
      throw new SecurityError("Symlink creation is disabled");
    }

    const resolvedLink = this.validatePath(linkPath, "write");
    const resolvedTarget = path.resolve(path.dirname(resolvedLink), targetPath);

    // Ensure symlink target is within workspace
    if (!resolvedTarget.startsWith(this.workspaceRoot + path.sep)) {
      this.auditSecurityViolation("symlink_escape", linkPath, resolvedTarget);
      this.securityViolations++;
      throw new SecurityError("Symlink target outside workspace");
    }

    // Check blocked symlink targets
    if (this.config.blockedSymlinkTargets) {
      for (const blocked of this.config.blockedSymlinkTargets) {
        const resolvedBlocked = path.resolve(this.workspaceRoot, blocked);
        if (resolvedTarget.startsWith(resolvedBlocked)) {
          this.auditSecurityViolation(
            "blocked_symlink_target",
            linkPath,
            resolvedTarget
          );
          this.securityViolations++;
          throw new SecurityError("Symlink target is blocked");
        }
      }
    }

    // Validate target path through normal validation
    this.validatePath(resolvedTarget, "read");
  }

  /**
   * Validate file size
   */
  validateFileSize(size: number, agentId?: string): void {
    // Check agent-specific limits first
    if (agentId && this.config.agentLimits?.[agentId]?.maxFileSize) {
      if (size > this.config.agentLimits[agentId].maxFileSize!) {
        throw new SecurityError(
          `File size ${size} exceeds agent limit ${this.config.agentLimits[agentId].maxFileSize}`
        );
      }
    }

    // Check global limit
    if (size > this.config.maxFileSize) {
      throw new SecurityError(
        `File size ${size} exceeds maximum ${this.config.maxFileSize}`
      );
    }
  }

  /**
   * Validate batch operation size
   */
  validateBatchSize(totalSize: number, operationCount: number): void {
    if (totalSize > this.config.maxBatchSize) {
      throw new SecurityError(
        `Batch size ${totalSize} exceeds maximum ${this.config.maxBatchSize}`
      );
    }

    if (
      this.config.maxBatchOperationSize &&
      operationCount > this.config.maxBatchOperationSize
    ) {
      throw new SecurityError(
        `Batch operation count ${operationCount} exceeds maximum ${this.config.maxBatchOperationSize}`
      );
    }
  }

  /**
   * Check rate limit
   */
  checkRateLimit(agentId: string, operation?: string): void {
    const now = Date.now();

    // Check per-minute limit
    const ops = this.operationCount.get(agentId) || [];
    const recent = ops.filter((t) => now - t < 60000);

    // Check agent-specific limit
    let maxOpsPerMinute = this.config.maxOperationsPerMinute;
    if (this.config.agentLimits?.[agentId]?.maxOperationsPerMinute) {
      maxOpsPerMinute =
        this.config.agentLimits[agentId].maxOperationsPerMinute!;
    }

    if (recent.length >= maxOpsPerMinute) {
      this.auditSecurityViolation(
        "rate_limit",
        agentId,
        `${recent.length} ops/min`
      );
      this.securityViolations++;

      // Apply cooldown if configured
      if (this.config.rateLimitCooldownSeconds) {
        // Mark agent as in cooldown (implementation would track this)
      }

      throw new SecurityError("Rate limit exceeded");
    }

    recent.push(now);
    this.operationCount.set(agentId, recent);

    // Check per-hour limit if configured
    if (this.config.maxOperationsPerHour) {
      const hourlyOps = this.hourlyOperationCount.get(agentId) || [];
      const recentHourly = hourlyOps.filter((t) => now - t < 3600000);

      if (recentHourly.length >= this.config.maxOperationsPerHour) {
        this.auditSecurityViolation(
          "hourly_rate_limit",
          agentId,
          `${recentHourly.length} ops/hour`
        );
        this.securityViolations++;
        throw new SecurityError("Hourly rate limit exceeded");
      }

      recentHourly.push(now);
      this.hourlyOperationCount.set(agentId, recentHourly);
    }
  }

  /**
   * Check operation quota
   */
  checkOperationQuota(agentId: string): void {
    if (this.config.maxTotalOperations) {
      if (this.totalOperations >= this.config.maxTotalOperations) {
        throw new SecurityError("Total operation quota exceeded");
      }
    }
  }

  /**
   * Validate file content
   */
  validateContent(content: string | Buffer, filePath: string): void {
    if (!this.config.enableContentScanning) {
      return;
    }

    const contentStr =
      typeof content === "string" ? content : content.toString("utf-8");

    // Check for null bytes (binary content)
    if (this.config.blockNullBytes && contentStr.includes("\0")) {
      this.auditSecurityViolation("null_bytes_detected", filePath);
      this.securityViolations++;
      throw new SecurityError(
        "File contains null bytes (potential binary content)"
      );
    }

    // Check line length
    if (this.config.maxLineLength) {
      const lines = contentStr.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > this.config.maxLineLength) {
          this.auditSecurityViolation(
            "line_too_long",
            filePath,
            `Line ${i + 1}: ${lines[i].length} chars`
          );
          this.securityViolations++;
          throw new SecurityError(
            `Line ${i + 1} exceeds maximum length ${this.config.maxLineLength}`
          );
        }
      }
    }

    // Check for malicious patterns
    const patterns = [
      ...this.MALICIOUS_PATTERNS,
      ...(this.config.maliciousPatterns || []).map((p) => new RegExp(p, "gi")),
    ];

    for (const pattern of patterns) {
      if (pattern.test(contentStr)) {
        this.auditSecurityViolation(
          "malicious_content_detected",
          filePath,
          pattern.toString()
        );
        this.securityViolations++;

        // Quarantine if configured
        if (this.config.quarantineDirectory) {
          // Implementation would move file to quarantine
        }

        throw new SecurityError("Malicious content pattern detected");
      }
    }
  }

  /**
   * Check if file extension is allowed
   */
  isExtensionAllowed(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();

    // Check blocked extensions
    if (this.config.blockedFileExtensions) {
      if (this.config.blockedFileExtensions.includes(ext)) {
        return false;
      }
    }

    // Check allowed extensions (if configured)
    if (this.config.allowedFileExtensions) {
      if (this.config.allowedFileExtensions.length === 0) {
        return true; // Empty list means all allowed
      }
      return this.config.allowedFileExtensions.includes(ext);
    }

    // Check binary files
    if (this.config.blockBinaryFiles) {
      const textExtensions = [
        ".txt",
        ".md",
        ".json",
        ".xml",
        ".yaml",
        ".yml",
        ".toml",
        ".ini",
        ".conf",
        ".log",
        ".csv",
        ".tsv",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".py",
        ".rb",
        ".go",
        ".rs",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".php",
        ".html",
        ".css",
        ".scss",
        ".sass",
        ".less",
        ".sql",
        ".sh",
        ".bash",
        ".zsh",
        ".fish",
      ];

      return textExtensions.includes(ext);
    }

    return true;
  }

  /**
   * Audit operation
   */
  auditOperation(
    operation: string,
    paths: string[],
    result: string,
    agentId?: string,
    details?: Record<string, any>
  ): void {
    this.totalOperations++;

    if (this.config.enableAuditLog) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: this.config.auditLogLevel || "info",
        operation,
        paths,
        result,
        agentId,
        details,
      };

      if (this.config.auditLogPath) {
        // Write to file (implementation would use fs.appendFile)
        console.log(JSON.stringify(logEntry));
      } else {
        console.log(JSON.stringify(logEntry));
      }
    }

    // Log all access if configured
    if (this.config.logAllAccess) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "debug",
          type: "access",
          operation,
          paths,
          agentId,
        })
      );
    }
  }

  /**
   * Audit security violation
   */
  private auditSecurityViolation(
    type: string,
    input: string,
    resolved?: string
  ): void {
    if (this.config.enableAuditLog) {
      const violation = {
        timestamp: new Date().toISOString(),
        level: "SECURITY_VIOLATION",
        type,
        input,
        resolved,
        workspaceRoot: this.workspaceRoot,
      };

      console.error(JSON.stringify(violation));

      // Send alert if configured
      if (this.config.enableSecurityAlerts) {
        this.sendSecurityAlert(
          "high",
          `Security violation: ${type}`,
          violation
        );
      }
    }
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert(
    severity: "low" | "medium" | "high" | "critical",
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    if (
      !this.config.enableSecurityAlerts ||
      !this.config.securityAlertWebhook
    ) {
      return;
    }

    const alert = {
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
      workspaceRoot: this.workspaceRoot,
    };

    try {
      // Implementation would send HTTP POST to webhook
      console.error("SECURITY ALERT:", JSON.stringify(alert));
    } catch (error) {
      console.error("Failed to send security alert:", error);
    }
  }

  /**
   * Get workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalOperations: number;
    blockedOperations: number;
    confirmedOperations: number;
    deniedOperations: number;
    securityViolations: number;
    activeWatchSessions: number;
  } {
    return {
      totalOperations: this.totalOperations,
      blockedOperations: this.blockedOperations,
      confirmedOperations: this.confirmedOperations,
      deniedOperations: this.deniedOperations,
      securityViolations: this.securityViolations,
      activeWatchSessions: this.activeWatchSessions,
    };
  }

  /**
   * Emergency stop
   */
  emergencyStop(): void {
    this.emergencyMode = true;
    this.auditOperation("emergency_stop", [], "activated", "system", {
      reason: "Emergency stop activated",
    });
    this.sendSecurityAlert(
      "critical",
      "Emergency stop activated - all operations blocked"
    );
  }

  /**
   * Resume operations
   */
  resumeOperations(): void {
    this.emergencyMode = false;
    this.auditOperation("resume_operations", [], "activated", "system", {
      reason: "Operations resumed",
    });
  }

  /**
   * Check if in emergency mode
   */
  isEmergencyMode(): boolean {
    return this.emergencyMode;
  }

  /**
   * Increment active watch sessions
   */
  incrementWatchSessions(): void {
    this.activeWatchSessions++;
  }

  /**
   * Decrement active watch sessions
   */
  decrementWatchSessions(): void {
    this.activeWatchSessions--;
  }
}
