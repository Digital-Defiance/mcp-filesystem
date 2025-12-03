/**
 * MCP tool definitions for filesystem operations
 *
 * Provides 12 MCP tools for advanced filesystem operations:
 * 1. fs_batch_operations - Execute multiple filesystem operations atomically
 * 2. fs_watch_directory - Watch directory for filesystem changes
 * 3. fs_get_watch_events - Get accumulated watch events
 * 4. fs_stop_watch - Stop watching a directory
 * 5. fs_search_files - Search for files by name, content, or metadata
 * 6. fs_build_index - Build file index for fast searching
 * 7. fs_create_symlink - Create symbolic links
 * 8. fs_compute_checksum - Compute file checksums
 * 9. fs_verify_checksum - Verify file checksums
 * 10. fs_analyze_disk_usage - Analyze disk usage
 * 11. fs_copy_directory - Copy directories recursively
 * 12. fs_sync_directory - Sync directories
 */

import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { SecurityManager } from "./SecurityManager";
import { BatchOperationManager } from "./BatchOperationManager";
import { DirectoryWatcher } from "./DirectoryWatcher";
import { FileIndexer } from "./FileIndexer";
import { ChecksumManager } from "./ChecksumManager";
import { DiskUsageAnalyzer } from "./DiskUsageAnalyzer";
import { SymlinkManager } from "./SymlinkManager";
import { DirectoryOperations } from "./DirectoryOperations";
import {
  BatchOperation,
  BatchOperationResult,
} from "../interfaces/IBatchOperationManager";
import { FileSystemEvent, WatchOptions } from "../interfaces/IDirectoryWatcher";
import { SearchOptions, FileMetadata } from "../interfaces/IFileIndexer";
import { ChecksumAlgorithm } from "../interfaces/IChecksumManager";
import { CopyOptions, SyncOptions } from "../interfaces/IDirectoryOperations";
import { ValidationError } from "../types";

/**
 * MCP Tools class
 * Provides all tool implementations for the MCP Filesystem Server
 */
export class MCPTools {
  private securityManager: SecurityManager;
  private batchOperationManager: BatchOperationManager;
  private directoryWatcher: DirectoryWatcher;
  private fileIndexer: FileIndexer;
  private checksumManager: ChecksumManager;
  private diskUsageAnalyzer: DiskUsageAnalyzer;
  private symlinkManager: SymlinkManager;
  private directoryOperations: DirectoryOperations;

  constructor(
    securityManager: SecurityManager,
    batchOperationManager: BatchOperationManager,
    directoryWatcher: DirectoryWatcher,
    fileIndexer: FileIndexer,
    checksumManager: ChecksumManager,
    diskUsageAnalyzer: DiskUsageAnalyzer,
    symlinkManager: SymlinkManager,
    directoryOperations: DirectoryOperations
  ) {
    this.securityManager = securityManager;
    this.batchOperationManager = batchOperationManager;
    this.directoryWatcher = directoryWatcher;
    this.fileIndexer = fileIndexer;
    this.checksumManager = checksumManager;
    this.diskUsageAnalyzer = diskUsageAnalyzer;
    this.symlinkManager = symlinkManager;
    this.directoryOperations = directoryOperations;
  }

  /**
   * Tool 1: fs_batch_operations
   * Execute multiple filesystem operations atomically
   */
  async fsBatchOperations(args: {
    operations: Array<{
      type: "copy" | "move" | "delete";
      source: string;
      destination?: string;
    }>;
    atomic?: boolean;
  }): Promise<{
    status: string;
    results: Array<{
      operation: BatchOperation;
      success: boolean;
      error?: string;
    }>;
  }> {
    // Validate input
    if (!args.operations || !Array.isArray(args.operations)) {
      throw new ValidationError("Operations must be an array");
    }

    if (args.operations.length === 0) {
      throw new ValidationError("Operations array cannot be empty");
    }

    // Validate each operation
    for (const op of args.operations) {
      if (!op.type || !["copy", "move", "delete"].includes(op.type)) {
        throw new ValidationError(
          `Invalid operation type: ${op.type}. Must be copy, move, or delete`
        );
      }

      if (!op.source || typeof op.source !== "string") {
        throw new ValidationError(
          "Source path is required and must be a string"
        );
      }

      if ((op.type === "copy" || op.type === "move") && !op.destination) {
        throw new ValidationError(
          `Destination is required for ${op.type} operation`
        );
      }
    }

    const operations: BatchOperation[] = args.operations.map((op) => ({
      type: op.type,
      source: op.source,
      destination: op.destination,
    }));

    const atomic = args.atomic !== false; // default to true

    const results = await this.batchOperationManager.executeBatch(
      operations,
      atomic
    );

    return {
      status: "success",
      results,
    };
  }

  /**
   * Get the Zod schema for fs_batch_operations tool
   */
  static getFsBatchOperationsSchema() {
    return {
      name: "fs_batch_operations",
      description: "Execute multiple filesystem operations atomically",
      inputSchema: z.object({
        operations: z
          .array(
            z.object({
              type: z
                .enum(["copy", "move", "delete"])
                .describe("Operation type"),
              source: z.string().describe("Source path"),
              destination: z.string().optional().describe("Destination path"),
            })
          )
          .describe("Array of operations to execute"),
        atomic: z
          .boolean()
          .optional()
          .describe(
            "If true, rollback all operations on any failure (default: true)"
          ),
      }),
    };
  }

  /**
   * Tool 2: fs_watch_directory
   * Watch directory for filesystem changes
   */
  async fsWatchDirectory(args: {
    path: string;
    recursive?: boolean;
    filters?: string[];
  }): Promise<{
    status: string;
    sessionId: string;
    path: string;
  }> {
    // Validate input
    if (!args.path || typeof args.path !== "string") {
      throw new ValidationError("Path is required and must be a string");
    }

    // Validate path
    const validPath = this.securityManager.validatePath(args.path, "read");

    // Generate session ID
    const sessionId = uuidv4();

    // Start watching
    const options: WatchOptions = {
      recursive: args.recursive !== false, // default to true
      filters: args.filters,
    };

    await this.directoryWatcher.watch(sessionId, validPath, options);

    return {
      status: "success",
      sessionId,
      path: validPath,
    };
  }

  /**
   * Get the Zod schema for fs_watch_directory tool
   */
  static getFsWatchDirectorySchema() {
    return {
      name: "fs_watch_directory",
      description: "Watch directory for filesystem changes",
      inputSchema: z.object({
        path: z.string().describe("Directory path to watch"),
        recursive: z
          .boolean()
          .optional()
          .describe("Watch subdirectories recursively (default: true)"),
        filters: z
          .array(z.string())
          .optional()
          .describe("File patterns to filter events"),
      }),
    };
  }

  /**
   * Tool 3: fs_get_watch_events
   * Get accumulated watch events
   */
  async fsGetWatchEvents(args: {
    sessionId: string;
    clear?: boolean;
  }): Promise<{
    status: string;
    sessionId: string;
    events: FileSystemEvent[];
  }> {
    // Validate input
    if (!args.sessionId || typeof args.sessionId !== "string") {
      throw new ValidationError("Session ID is required and must be a string");
    }

    const events = this.directoryWatcher.getEvents(args.sessionId);

    if (args.clear !== false) {
      // default to clearing events
      this.directoryWatcher.clearEvents(args.sessionId);
    }

    return {
      status: "success",
      sessionId: args.sessionId,
      events,
    };
  }

  /**
   * Get the Zod schema for fs_get_watch_events tool
   */
  static getFsGetWatchEventsSchema() {
    return {
      name: "fs_get_watch_events",
      description: "Get accumulated watch events",
      inputSchema: z.object({
        sessionId: z.string().describe("Watch session ID"),
        clear: z
          .boolean()
          .optional()
          .describe("Clear events after retrieving (default: true)"),
      }),
    };
  }

  /**
   * Tool 4: fs_stop_watch
   * Stop watching a directory
   */
  async fsStopWatch(args: { sessionId: string }): Promise<{
    status: string;
    sessionId: string;
  }> {
    // Validate input
    if (!args.sessionId || typeof args.sessionId !== "string") {
      throw new ValidationError("Session ID is required and must be a string");
    }

    await this.directoryWatcher.stopWatch(args.sessionId);

    return {
      status: "success",
      sessionId: args.sessionId,
    };
  }

  /**
   * Get the Zod schema for fs_stop_watch tool
   */
  static getFsStopWatchSchema() {
    return {
      name: "fs_stop_watch",
      description: "Stop watching a directory",
      inputSchema: z.object({
        sessionId: z.string().describe("Watch session ID"),
      }),
    };
  }

  /**
   * Tool 5: fs_search_files
   * Search for files by name, content, or metadata
   */
  async fsSearchFiles(args: {
    query: string;
    searchType?: "name" | "content" | "both";
    fileTypes?: string[];
    minSize?: number;
    maxSize?: number;
    modifiedAfter?: string;
    useIndex?: boolean;
  }): Promise<{
    status: string;
    results: FileMetadata[];
    count: number;
  }> {
    const options: SearchOptions = {
      query: args.query,
      searchType: args.searchType || "both",
      fileTypes: args.fileTypes,
      minSize: args.minSize,
      maxSize: args.maxSize,
      modifiedAfter: args.modifiedAfter
        ? new Date(args.modifiedAfter)
        : undefined,
    };

    const results = await this.fileIndexer.search(options);

    return {
      status: "success",
      results,
      count: results.length,
    };
  }

  /**
   * Get the Zod schema for fs_search_files tool
   */
  static getFsSearchFilesSchema() {
    return {
      name: "fs_search_files",
      description: "Search for files by name, content, or metadata",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        searchType: z
          .enum(["name", "content", "both"])
          .optional()
          .describe("Type of search (default: both)"),
        fileTypes: z
          .array(z.string())
          .optional()
          .describe("File extensions to filter"),
        minSize: z.number().optional().describe("Minimum file size in bytes"),
        maxSize: z.number().optional().describe("Maximum file size in bytes"),
        modifiedAfter: z
          .string()
          .optional()
          .describe("ISO date string for modification filter"),
        useIndex: z
          .boolean()
          .optional()
          .describe("Use file index for faster search (default: true)"),
      }),
    };
  }

  /**
   * Tool 6: fs_build_index
   * Build file index for fast searching
   */
  async fsBuildIndex(args: {
    path: string;
    includeContent?: boolean;
  }): Promise<{
    status: string;
    path: string;
    statistics: {
      fileCount: number;
      totalSize: number;
      lastUpdate: string;
      indexSize: number;
    };
  }> {
    // Validate path
    const validPath = this.securityManager.validatePath(args.path, "read");

    // Build index
    await this.fileIndexer.buildIndex(
      validPath,
      args.includeContent !== false // default to true
    );

    // Get statistics
    const stats = this.fileIndexer.getStatistics();

    return {
      status: "success",
      path: validPath,
      statistics: {
        fileCount: stats.fileCount,
        totalSize: stats.totalSize,
        lastUpdate: stats.lastUpdate.toISOString(),
        indexSize: stats.indexSize,
      },
    };
  }

  /**
   * Get the Zod schema for fs_build_index tool
   */
  static getFsBuildIndexSchema() {
    return {
      name: "fs_build_index",
      description: "Build file index for fast searching",
      inputSchema: z.object({
        path: z.string().describe("Directory path to index"),
        includeContent: z
          .boolean()
          .optional()
          .describe("Index file content for full-text search (default: true)"),
      }),
    };
  }

  /**
   * Tool 7: fs_create_symlink
   * Create symbolic links
   */
  async fsCreateSymlink(args: {
    linkPath: string;
    targetPath: string;
  }): Promise<{
    status: string;
    linkPath: string;
    targetPath: string;
    message?: string;
  }> {
    const result = await this.symlinkManager.createSymlink(
      args.linkPath,
      args.targetPath
    );

    return {
      status: result.success ? "success" : "error",
      linkPath: result.linkPath,
      targetPath: result.targetPath,
      message: result.message,
    };
  }

  /**
   * Get the Zod schema for fs_create_symlink tool
   */
  static getFsCreateSymlinkSchema() {
    return {
      name: "fs_create_symlink",
      description: "Create symbolic links",
      inputSchema: z.object({
        linkPath: z.string().describe("Path where symlink will be created"),
        targetPath: z.string().describe("Target path for the symlink"),
      }),
    };
  }

  /**
   * Tool 8: fs_compute_checksum
   * Compute file checksums
   */
  async fsComputeChecksum(args: {
    path: string;
    algorithm?: "md5" | "sha1" | "sha256" | "sha512";
  }): Promise<{
    status: string;
    path: string;
    algorithm: string;
    checksum: string;
  }> {
    // Validate path
    const validPath = this.securityManager.validatePath(args.path, "read");

    const algorithm: ChecksumAlgorithm = args.algorithm || "sha256";

    const result = await this.checksumManager.computeChecksum(
      validPath,
      algorithm
    );

    return {
      status: "success",
      path: result.path,
      algorithm: result.algorithm,
      checksum: result.checksum,
    };
  }

  /**
   * Get the Zod schema for fs_compute_checksum tool
   */
  static getFsComputeChecksumSchema() {
    return {
      name: "fs_compute_checksum",
      description: "Compute file checksums",
      inputSchema: z.object({
        path: z.string().describe("File path"),
        algorithm: z
          .enum(["md5", "sha1", "sha256", "sha512"])
          .optional()
          .describe("Hash algorithm (default: sha256)"),
      }),
    };
  }

  /**
   * Tool 9: fs_verify_checksum
   * Verify file checksums
   */
  async fsVerifyChecksum(args: {
    path: string;
    checksum: string;
    algorithm?: "md5" | "sha1" | "sha256" | "sha512";
  }): Promise<{
    status: string;
    path: string;
    algorithm: string;
    expected: string;
    actual: string;
    match: boolean;
  }> {
    // Validate path
    const validPath = this.securityManager.validatePath(args.path, "read");

    const algorithm: ChecksumAlgorithm = args.algorithm || "sha256";

    const result = await this.checksumManager.verifyChecksum(
      validPath,
      args.checksum,
      algorithm
    );

    return {
      status: "success",
      path: result.path,
      algorithm: result.algorithm,
      expected: result.expected,
      actual: result.actual,
      match: result.match,
    };
  }

  /**
   * Get the Zod schema for fs_verify_checksum tool
   */
  static getFsVerifyChecksumSchema() {
    return {
      name: "fs_verify_checksum",
      description: "Verify file checksums",
      inputSchema: z.object({
        path: z.string().describe("File path"),
        checksum: z.string().describe("Expected checksum value"),
        algorithm: z
          .enum(["md5", "sha1", "sha256", "sha512"])
          .optional()
          .describe("Hash algorithm (default: sha256)"),
      }),
    };
  }

  /**
   * Tool 10: fs_analyze_disk_usage
   * Analyze disk usage
   */
  async fsAnalyzeDiskUsage(args: {
    path: string;
    depth?: number;
    groupByType?: boolean;
  }): Promise<{
    status: string;
    path: string;
    totalSize: number;
    fileCount: number;
    largestFiles: Array<{ path: string; size: number }>;
    largestDirectories: Array<{ path: string; size: number }>;
    fileTypeBreakdown?: Record<string, number>;
  }> {
    // Validate path
    const validPath = this.securityManager.validatePath(args.path, "read");

    const report = await this.diskUsageAnalyzer.analyzeDiskUsage(
      validPath,
      args.depth,
      args.groupByType
    );

    // Convert Map to object for JSON serialization
    const fileTypeBreakdown = report.fileTypeBreakdown
      ? Object.fromEntries(report.fileTypeBreakdown)
      : undefined;

    return {
      status: "success",
      path: report.path,
      totalSize: report.totalSize,
      fileCount: report.fileCount,
      largestFiles: report.largestFiles,
      largestDirectories: report.largestDirectories,
      fileTypeBreakdown,
    };
  }

  /**
   * Get the Zod schema for fs_analyze_disk_usage tool
   */
  static getFsAnalyzeDiskUsageSchema() {
    return {
      name: "fs_analyze_disk_usage",
      description: "Analyze disk usage",
      inputSchema: z.object({
        path: z.string().describe("Directory path to analyze"),
        depth: z
          .number()
          .optional()
          .describe("Maximum depth to analyze (default: unlimited)"),
        groupByType: z
          .boolean()
          .optional()
          .describe("Group files by type (default: false)"),
      }),
    };
  }

  /**
   * Tool 11: fs_copy_directory
   * Copy directories recursively
   */
  async fsCopyDirectory(args: {
    source: string;
    destination: string;
    preserveMetadata?: boolean;
    exclusions?: string[];
  }): Promise<{
    status: string;
    source: string;
    destination: string;
    filesCopied: number;
    bytesTransferred: number;
    duration: number;
  }> {
    // Validate paths
    const validSource = this.securityManager.validatePath(args.source, "read");
    const validDestination = this.securityManager.validatePath(
      args.destination,
      "write"
    );

    const options: CopyOptions = {
      preserveMetadata: args.preserveMetadata,
      exclusions: args.exclusions,
    };

    const result = await this.directoryOperations.copyDirectory(
      validSource,
      validDestination,
      options
    );

    return {
      status: "success",
      source: validSource,
      destination: validDestination,
      filesCopied: result.filesCopied,
      bytesTransferred: result.bytesTransferred,
      duration: result.duration,
    };
  }

  /**
   * Get the Zod schema for fs_copy_directory tool
   */
  static getFsCopyDirectorySchema() {
    return {
      name: "fs_copy_directory",
      description: "Copy directories recursively",
      inputSchema: z.object({
        source: z.string().describe("Source directory path"),
        destination: z.string().describe("Destination directory path"),
        preserveMetadata: z
          .boolean()
          .optional()
          .describe(
            "Preserve file timestamps and permissions (default: false)"
          ),
        exclusions: z
          .array(z.string())
          .optional()
          .describe("File patterns to exclude"),
      }),
    };
  }

  /**
   * Tool 12: fs_sync_directory
   * Sync directories
   */
  async fsSyncDirectory(args: {
    source: string;
    destination: string;
    exclusions?: string[];
  }): Promise<{
    status: string;
    source: string;
    destination: string;
    filesCopied: number;
    filesSkipped: number;
    bytesTransferred: number;
    duration: number;
  }> {
    // Validate paths
    const validSource = this.securityManager.validatePath(args.source, "read");
    const validDestination = this.securityManager.validatePath(
      args.destination,
      "write"
    );

    const options: SyncOptions = {
      exclusions: args.exclusions,
    };

    const result = await this.directoryOperations.syncDirectory(
      validSource,
      validDestination,
      options
    );

    return {
      status: "success",
      source: validSource,
      destination: validDestination,
      filesCopied: result.filesCopied,
      filesSkipped: result.filesSkipped,
      bytesTransferred: result.bytesTransferred,
      duration: result.duration,
    };
  }

  /**
   * Get the Zod schema for fs_sync_directory tool
   */
  static getFsSyncDirectorySchema() {
    return {
      name: "fs_sync_directory",
      description: "Sync directories (copy only newer or missing files)",
      inputSchema: z.object({
        source: z.string().describe("Source directory path"),
        destination: z.string().describe("Destination directory path"),
        exclusions: z
          .array(z.string())
          .optional()
          .describe("File patterns to exclude"),
      }),
    };
  }

  /**
   * Get all tool schemas
   */
  static getAllSchemas() {
    return [
      MCPTools.getFsBatchOperationsSchema(),
      MCPTools.getFsWatchDirectorySchema(),
      MCPTools.getFsGetWatchEventsSchema(),
      MCPTools.getFsStopWatchSchema(),
      MCPTools.getFsSearchFilesSchema(),
      MCPTools.getFsBuildIndexSchema(),
      MCPTools.getFsCreateSymlinkSchema(),
      MCPTools.getFsComputeChecksumSchema(),
      MCPTools.getFsVerifyChecksumSchema(),
      MCPTools.getFsAnalyzeDiskUsageSchema(),
      MCPTools.getFsCopyDirectorySchema(),
      MCPTools.getFsSyncDirectorySchema(),
    ];
  }
}
