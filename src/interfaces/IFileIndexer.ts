/**
 * File indexer interface
 *
 * Provides fast file search capabilities using Lunr.js full-text search engine.
 * Indexes file metadata and optionally file contents for quick retrieval.
 */

/**
 * Metadata for an indexed file
 */
export interface FileMetadata {
  /** Absolute path to the file */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modification time */
  mtime: Date;
  /** File extension (e.g., ".ts", ".js") */
  type: string;
  /** Optional checksum (if computed) */
  checksum?: string;
  /** Optional file content (for text files when includeContent is true) */
  content?: string;
}

/**
 * Statistics about the file index
 */
export interface IndexStatistics {
  /** Total number of files in index */
  fileCount: number;
  /** Total size of all indexed files in bytes */
  totalSize: number;
  /** Timestamp of last index update */
  lastUpdate: Date;
  /** Size of the index itself in bytes */
  indexSize: number;
}

/**
 * Options for file search operations
 */
export interface SearchOptions {
  /** Search query string (supports Lunr.js query syntax) */
  query: string;
  /** Type of search to perform */
  searchType: "name" | "content" | "both";
  /** Optional array of file extensions to filter (e.g., [".ts", ".js"]) */
  fileTypes?: string[];
  /** Optional minimum file size in bytes */
  minSize?: number;
  /** Optional maximum file size in bytes */
  maxSize?: number;
  /** Optional filter for files modified after this date */
  modifiedAfter?: Date;
}

/**
 * File indexer interface
 *
 * Manages a searchable index of files for fast retrieval. The index can include
 * file metadata and optionally file contents for full-text search.
 *
 * Performance: Indexed searches typically complete in <100ms for workspaces with
 * <10,000 files. Filesystem searches may take several seconds for large directories.
 */
export interface IFileIndexer {
  /**
   * Build file index for a directory
   *
   * Recursively scans the directory and builds a searchable index using Lunr.js.
   * Text files can optionally have their contents indexed for full-text search.
   *
   * @param rootPath - Root directory to index (relative to workspace root)
   * @param includeContent - Whether to index file content (text files only, <1MB)
   * @throws SecurityError if rootPath is outside workspace
   * @throws FileSystemError if directory cannot be read
   *
   * @example
   * ```typescript
   * // Index metadata only (fast)
   * await indexer.buildIndex("src", false);
   *
   * // Index with content (slower, enables full-text search)
   * await indexer.buildIndex("src", true);
   * ```
   */
  buildIndex(rootPath: string, includeContent: boolean): Promise<void>;

  /**
   * Search files using the index
   *
   * Performs fast search using the built index. Supports filename search,
   * content search (if indexed), and metadata filtering.
   *
   * Query syntax supports Lunr.js features:
   * - Wildcards: "test*"
   * - Fuzzy matching: "test~1"
   * - Field search: "name:test"
   * - Boolean operators: "test AND file"
   *
   * @param options - Search options including query and filters
   * @returns Promise resolving to array of matching file metadata
   * @throws ValidationError if search options are invalid
   *
   * @example
   * ```typescript
   * // Search by filename
   * const results = await indexer.search({
   *   query: "component",
   *   searchType: "name",
   *   fileTypes: [".tsx", ".ts"]
   * });
   *
   * // Full-text content search
   * const results = await indexer.search({
   *   query: "TODO",
   *   searchType: "content",
   *   minSize: 1024,
   *   modifiedAfter: new Date("2024-01-01")
   * });
   * ```
   */
  search(options: SearchOptions): Promise<FileMetadata[]>;

  /**
   * Update index for a specific file
   *
   * Updates or adds a file to the index. Called automatically when files change
   * if directory watching is enabled. Can also be called manually to refresh
   * specific files.
   *
   * @param filePath - File to update in index (relative to workspace root)
   * @throws SecurityError if filePath is outside workspace
   * @throws FileSystemError if file cannot be read
   *
   * @example
   * ```typescript
   * await indexer.updateFile("src/components/Button.tsx");
   * ```
   */
  updateFile(filePath: string): Promise<void>;

  /**
   * Remove file from index
   *
   * Removes a file from the index. Called automatically when files are deleted
   * if directory watching is enabled. Can also be called manually.
   *
   * @param filePath - File to remove from index (relative to workspace root)
   *
   * @example
   * ```typescript
   * indexer.removeFile("src/old-component.tsx");
   * ```
   */
  removeFile(filePath: string): void;

  /**
   * Get index statistics
   *
   * Returns information about the current index including file count, total size,
   * last update time, and index size.
   *
   * @returns Index statistics
   *
   * @example
   * ```typescript
   * const stats = indexer.getStatistics();
   * console.log(`Indexed ${stats.fileCount} files (${stats.totalSize} bytes)`);
   * console.log(`Index size: ${stats.indexSize} bytes`);
   * console.log(`Last updated: ${stats.lastUpdate}`);
   * ```
   */
  getStatistics(): IndexStatistics;

  /**
   * Clear the entire index
   *
   * Removes all files from the index. Use before rebuilding or when changing
   * index configuration.
   *
   * @example
   * ```typescript
   * indexer.clearIndex();
   * await indexer.buildIndex("src", true); // Rebuild with new settings
   * ```
   */
  clearIndex(): void;
}
