/**
 * Directory watcher interface
 *
 * Provides real-time filesystem change monitoring using Chokidar.
 * Supports recursive watching, event filtering, and multiple concurrent watch sessions.
 */

/**
 * Represents a filesystem change event
 */
export interface FileSystemEvent {
  /** Type of filesystem event */
  type: "create" | "modify" | "delete" | "rename";
  /** Path to the file or directory that changed */
  path: string;
  /** Timestamp when the event occurred */
  timestamp: Date;
  /** Original path (only for rename events) */
  oldPath?: string;
}

/**
 * Represents an active directory watch session
 */
export interface WatchSession {
  /** Unique session identifier */
  id: string;
  /** Directory being watched */
  path: string;
  /** Whether subdirectories are being watched */
  recursive: boolean;
  /** Glob patterns for filtering events */
  filters: string[];
  /** Accumulated events for this session */
  events: FileSystemEvent[];
}

/**
 * Options for directory watching
 */
export interface WatchOptions {
  /** Watch subdirectories recursively */
  recursive: boolean;
  /** Optional glob patterns to filter events (e.g., ["*.ts", "*.js"]) */
  filters?: string[];
}

/**
 * Directory watcher interface
 *
 * Monitors directories for filesystem changes and reports events in real-time.
 * Uses Chokidar for cross-platform filesystem watching with support for:
 * - Recursive directory watching
 * - Event filtering by glob patterns
 * - Multiple concurrent watch sessions
 * - Event buffering and retrieval
 *
 * Performance: Low overhead, events typically reported within 100ms of change.
 */
export interface IDirectoryWatcher {
  /**
   * Start watching a directory
   *
   * Creates a new watch session that monitors the specified directory for changes.
   * Events are buffered and can be retrieved using getEvents().
   *
   * Supported event types:
   * - create: New file or directory created
   * - modify: File content or metadata changed
   * - delete: File or directory deleted
   * - rename: File or directory renamed (includes oldPath)
   *
   * @param sessionId - Unique session identifier (use UUID)
   * @param dirPath - Directory to watch (relative to workspace root)
   * @param options - Watch options (recursive, filters)
   * @throws SecurityError if dirPath is outside workspace
   * @throws FileSystemError if directory cannot be watched
   * @throws ValidationError if sessionId already exists
   *
   * @example
   * ```typescript
   * // Watch TypeScript files recursively
   * await watcher.watch("session-123", "src", {
   *   recursive: true,
   *   filters: ["*.ts", "*.tsx"]
   * });
   *
   * // Watch single directory (non-recursive)
   * await watcher.watch("session-456", "config", {
   *   recursive: false
   * });
   * ```
   */
  watch(
    sessionId: string,
    dirPath: string,
    options: WatchOptions
  ): Promise<void>;

  /**
   * Get events for a watch session
   *
   * Retrieves all accumulated events since the last call to getEvents() or
   * since the watch session started. Events are returned in chronological order.
   *
   * Note: This method does NOT clear events. Call clearEvents() to remove them.
   *
   * @param sessionId - Session identifier
   * @returns Array of filesystem events (may be empty)
   * @throws ValidationError if session not found
   *
   * @example
   * ```typescript
   * const events = watcher.getEvents("session-123");
   * for (const event of events) {
   *   console.log(`${event.type}: ${event.path} at ${event.timestamp}`);
   * }
   * ```
   */
  getEvents(sessionId: string): FileSystemEvent[];

  /**
   * Clear events for a watch session
   *
   * Removes all accumulated events for the session. The watch session continues
   * to monitor for new events.
   *
   * @param sessionId - Session identifier
   * @throws ValidationError if session not found
   *
   * @example
   * ```typescript
   * const events = watcher.getEvents("session-123");
   * // Process events...
   * watcher.clearEvents("session-123"); // Clear processed events
   * ```
   */
  clearEvents(sessionId: string): void;

  /**
   * Stop watching a directory
   *
   * Stops the watch session and releases resources. Accumulated events are
   * discarded. The session ID can be reused after stopping.
   *
   * @param sessionId - Session identifier
   * @throws ValidationError if session not found
   *
   * @example
   * ```typescript
   * await watcher.stopWatch("session-123");
   * ```
   */
  stopWatch(sessionId: string): Promise<void>;

  /**
   * Stop all watch sessions
   *
   * Stops all active watch sessions and releases all resources. Called
   * automatically during server shutdown.
   *
   * @example
   * ```typescript
   * // Cleanup on shutdown
   * await watcher.stopAll();
   * ```
   */
  stopAll(): Promise<void>;
}
