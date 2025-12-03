/**
 * Batch operation manager interface
 *
 * Provides atomic batch operations for filesystem operations with automatic rollback support.
 * All operations are validated against security policies before execution.
 */

/**
 * Represents a single filesystem operation in a batch
 */
export interface BatchOperation {
  /** Type of operation to perform */
  type: "copy" | "move" | "delete";
  /** Source file or directory path (relative to workspace root) */
  source: string;
  /** Destination path (required for copy/move, not used for delete) */
  destination?: string;
}

/**
 * Result of a single batch operation
 */
export interface BatchOperationResult {
  /** The operation that was executed */
  operation: BatchOperation;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
}

/**
 * Batch operation manager interface
 *
 * Manages execution of multiple filesystem operations with atomic semantics.
 * When atomic mode is enabled, all operations succeed or all are rolled back.
 */
export interface IBatchOperationManager {
  /**
   * Execute a batch of filesystem operations
   *
   * Operations are executed sequentially. If atomic mode is enabled and any operation
   * fails, all completed operations are rolled back to maintain consistency.
   *
   * @param operations - Array of operations to execute (copy, move, delete)
   * @param atomic - If true, rollback all operations on any failure (default: true)
   * @returns Promise resolving to results for each operation
   * @throws SecurityError if any path validation fails
   * @throws ValidationError if operations array is invalid
   * @throws FileSystemError if rollback fails in atomic mode
   *
   * @example
   * ```typescript
   * const results = await manager.executeBatch([
   *   { type: "copy", source: "file1.txt", destination: "backup/file1.txt" },
   *   { type: "move", source: "temp.txt", destination: "archive/temp.txt" },
   *   { type: "delete", source: "old.txt" }
   * ], true);
   * ```
   */
  executeBatch(
    operations: BatchOperation[],
    atomic: boolean
  ): Promise<BatchOperationResult[]>;

  /**
   * Rollback completed operations
   *
   * Reverses the effects of completed operations. Used internally for atomic batch
   * operations but can also be called manually for custom rollback scenarios.
   *
   * Rollback operations:
   * - Copy: Delete the destination file
   * - Move: Move the file back to original location
   * - Delete: Cannot be rolled back (file is permanently deleted)
   *
   * @param completed - Operations to rollback
   * @throws FileSystemError if rollback operations fail
   *
   * @example
   * ```typescript
   * await manager.rollback([
   *   { type: "copy", source: "file1.txt", destination: "backup/file1.txt" }
   * ]);
   * ```
   */
  rollback(completed: BatchOperation[]): Promise<void>;
}
