/**
 * Directory watcher implementation
 */

import chokidar, { FSWatcher } from "chokidar";
import { minimatch } from "minimatch";
import * as fs from "fs";
import {
  IDirectoryWatcher,
  FileSystemEvent,
  WatchOptions,
  WatchSession,
} from "../interfaces/IDirectoryWatcher";
import { ValidationError, FileSystemError } from "../types";

export class DirectoryWatcher implements IDirectoryWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private sessions: Map<string, WatchSession> = new Map();

  /**
   * Start watching a directory
   * @param sessionId - Unique session identifier
   * @param dirPath - Directory to watch
   * @param options - Watch options
   */
  async watch(
    sessionId: string,
    dirPath: string,
    options: WatchOptions
  ): Promise<void> {
    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      throw new ValidationError(`Watch session ${sessionId} already exists`);
    }

    // Validate directory exists
    try {
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new ValidationError(`Path is not a directory: ${dirPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileSystemError(`Directory not found: ${dirPath}`);
      }
      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        throw new FileSystemError(
          `Permission denied accessing directory: ${dirPath}`
        );
      }
      throw error;
    }

    // Create watch session
    const session: WatchSession = {
      id: sessionId,
      path: dirPath,
      recursive: options.recursive,
      filters: options.filters || [],
      events: [],
    };

    // Create chokidar watcher
    // Note: chokidar watches recursively by default, we control depth via the path pattern
    const watchPath = options.recursive ? dirPath : dirPath;
    const watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true,
      depth: options.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // Set up event handlers
    watcher
      .on("add", (path) => this.recordEvent(sessionId, "create", path))
      .on("change", (path) => this.recordEvent(sessionId, "modify", path))
      .on("unlink", (path) => this.recordEvent(sessionId, "delete", path))
      .on("addDir", (path) => this.recordEvent(sessionId, "create", path))
      .on("unlinkDir", (path) => this.recordEvent(sessionId, "delete", path));

    // Store watcher and session
    this.watchers.set(sessionId, watcher);
    this.sessions.set(sessionId, session);

    // Wait for watcher to be ready
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Watcher initialization timeout"));
        }, 5000);

        watcher.on("ready", () => {
          clearTimeout(timeout);
          resolve();
        });

        watcher.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      // Clean up on failure
      await watcher.close();
      this.watchers.delete(sessionId);
      this.sessions.delete(sessionId);

      throw new FileSystemError(
        `Failed to initialize directory watcher: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Record a filesystem event
   * @param sessionId - Session identifier
   * @param type - Event type
   * @param filePath - File path
   * @param oldPath - Old path for rename events
   */
  private recordEvent(
    sessionId: string,
    type: FileSystemEvent["type"],
    filePath: string,
    oldPath?: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Apply event filtering
    if (!this.shouldIncludeEvent(filePath, session.filters)) {
      return;
    }

    const event: FileSystemEvent = {
      type,
      path: filePath,
      timestamp: new Date(),
    };

    if (oldPath) {
      event.oldPath = oldPath;
    }

    session.events.push(event);
  }

  /**
   * Check if an event should be included based on filters
   * @param filePath - File path
   * @param filters - Filter patterns
   * @returns True if event should be included
   */
  private shouldIncludeEvent(filePath: string, filters: string[]): boolean {
    // If no filters, include all events
    if (!filters || filters.length === 0) {
      return true;
    }

    // Check if path matches any filter pattern
    return filters.some((filter) => minimatch(filePath, filter));
  }

  /**
   * Get events for a watch session
   * @param sessionId - Session identifier
   * @returns Array of events
   */
  getEvents(sessionId: string): FileSystemEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ValidationError(`Watch session ${sessionId} not found`);
    }

    return [...session.events];
  }

  /**
   * Clear events for a watch session
   * @param sessionId - Session identifier
   */
  clearEvents(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ValidationError(`Watch session ${sessionId} not found`);
    }

    session.events = [];
  }

  /**
   * Stop watching a directory
   * @param sessionId - Session identifier
   */
  async stopWatch(sessionId: string): Promise<void> {
    const watcher = this.watchers.get(sessionId);
    if (!watcher) {
      throw new ValidationError(`Watch session ${sessionId} not found`);
    }

    try {
      await watcher.close();
      this.watchers.delete(sessionId);
      this.sessions.delete(sessionId);
    } catch (error) {
      // Log error but still clean up
      console.error(
        `Error closing watcher for session ${sessionId}:`,
        error instanceof Error ? error.message : String(error)
      );
      this.watchers.delete(sessionId);
      this.sessions.delete(sessionId);
      throw new FileSystemError(
        `Failed to stop watch session: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stop all watch sessions
   */
  async stopAll(): Promise<void> {
    const errors: Error[] = [];

    // Close all watchers, collecting errors
    for (const [sessionId, watcher] of this.watchers.entries()) {
      try {
        await watcher.close();
      } catch (error) {
        console.error(
          `Error closing watcher for session ${sessionId}:`,
          error instanceof Error ? error.message : String(error)
        );
        errors.push(
          error instanceof Error
            ? error
            : new Error(`Failed to close watcher: ${String(error)}`)
        );
      }
    }

    // Clear all sessions regardless of errors
    this.watchers.clear();
    this.sessions.clear();

    // If there were errors, throw a combined error
    if (errors.length > 0) {
      throw new FileSystemError(
        `Failed to stop ${errors.length} watch session(s): ${errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }
  }
}
