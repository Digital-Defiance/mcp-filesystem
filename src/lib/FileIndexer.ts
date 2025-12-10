/**
 * File indexer implementation
 */

import * as fs from "fs";
import * as path from "path";
import lunr from "lunr";
import {
  IFileIndexer,
  FileMetadata,
  IndexStatistics,
  SearchOptions,
} from "../interfaces/IFileIndexer";

export class FileIndexer implements IFileIndexer {
  private index: lunr.Index | null = null;
  private files: Map<string, FileMetadata> = new Map();
  private includeContent: boolean = false;
  private lastUpdate: Date = new Date();
  private readonly TEXT_FILE_EXTENSIONS = new Set([
    ".txt",
    ".md",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".json",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".conf",
    ".sh",
    ".bash",
    ".py",
    ".rb",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".php",
    ".sql",
  ]);
  private readonly MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

  async buildIndex(rootPath: string, includeContent: boolean): Promise<void> {
    this.includeContent = includeContent;
    this.files.clear();

    // Scan directory and collect file metadata
    const files = await this.scanDirectory(rootPath);

    // Build lunr index
    this.index = lunr(function () {
      this.ref("path");
      this.field("name");
      this.field("type");
      if (includeContent) {
        this.field("content");
      }

      files.forEach((file) => {
        this.add({
          path: file.path,
          name: path.basename(file.path),
          type: file.type,
          content: file.content || "",
        });
      });
    });

    // Store file metadata
    files.forEach((file) => {
      this.files.set(file.path, file);
    });

    this.lastUpdate = new Date();
  }

  private async scanDirectory(dirPath: string): Promise<FileMetadata[]> {
    const files: FileMetadata[] = [];

    try {
      const entries = await fs.promises.readdir(dirPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.promises.stat(fullPath);
            const metadata: FileMetadata = {
              path: fullPath,
              size: stats.size,
              mtime: stats.mtime,
              type: path.extname(entry.name),
            };

            // Index text file content if enabled and file is small enough
            if (
              this.includeContent &&
              this.isTextFile(entry.name) &&
              stats.size < this.MAX_CONTENT_SIZE
            ) {
              try {
                metadata.content = await fs.promises.readFile(
                  fullPath,
                  "utf-8"
                );
              } catch (error) {
                // Skip files that can't be read as text
                metadata.content = undefined;
              }
            }

            files.push(metadata);
          } catch (error: any) {
            // Skip files that were deleted between readdir and stat (race condition)
            if (error.code !== "ENOENT") {
              console.error(`Error processing file ${fullPath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
  }

  private isTextFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return this.TEXT_FILE_EXTENSIONS.has(ext);
  }

  async search(options: SearchOptions): Promise<FileMetadata[]> {
    if (!this.index) {
      return [];
    }

    let results: FileMetadata[] = [];

    // Perform lunr search based on search type
    if (options.searchType === "name" || options.searchType === "both") {
      // Try multiple search strategies for better matching
      try {
        const nameResults = this.index.search(`name:${options.query}*`);
        results = nameResults
          .map((r) => this.files.get(r.ref))
          .filter((f): f is FileMetadata => f !== undefined);
      } catch (error) {
        // If search fails, fall back to manual filtering
        results = [];
      }

      // If no results from Lunr or for substring matches, use manual filtering
      if (results.length === 0) {
        results = Array.from(this.files.values()).filter((f) => {
          const basename = path.basename(f.path);
          return basename.toLowerCase().includes(options.query.toLowerCase());
        });
      }
    }

    if (options.searchType === "content" || options.searchType === "both") {
      const contentResults = this.index.search(`content:${options.query}`);
      const contentFiles = contentResults
        .map((r) => this.files.get(r.ref))
        .filter((f): f is FileMetadata => f !== undefined);

      // Merge results, avoiding duplicates
      const existingPaths = new Set(results.map((f) => f.path));
      for (const file of contentFiles) {
        if (!existingPaths.has(file.path)) {
          results.push(file);
        }
      }
    }

    // Apply filters
    results = this.applyFilters(results, options);

    return results;
  }

  private applyFilters(
    files: FileMetadata[],
    options: SearchOptions
  ): FileMetadata[] {
    let filtered = files;

    // Filter by file types
    if (options.fileTypes && options.fileTypes.length > 0) {
      filtered = filtered.filter((f) => options.fileTypes!.includes(f.type));
    }

    // Filter by size
    if (options.minSize !== undefined) {
      filtered = filtered.filter((f) => f.size >= options.minSize!);
    }
    if (options.maxSize !== undefined) {
      filtered = filtered.filter((f) => f.size <= options.maxSize!);
    }

    // Filter by modification date
    if (options.modifiedAfter) {
      filtered = filtered.filter((f) => f.mtime >= options.modifiedAfter!);
    }

    return filtered;
  }

  async updateFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(filePath);

      if (!stats.isFile()) {
        return;
      }

      const metadata: FileMetadata = {
        path: filePath,
        size: stats.size,
        mtime: stats.mtime,
        type: path.extname(filePath),
      };

      // Index text file content if enabled
      if (
        this.includeContent &&
        this.isTextFile(filePath) &&
        stats.size < this.MAX_CONTENT_SIZE
      ) {
        try {
          metadata.content = await fs.promises.readFile(filePath, "utf-8");
        } catch (error) {
          metadata.content = undefined;
        }
      }

      // Update in-memory storage
      this.files.set(filePath, metadata);

      // Rebuild index to include the updated file
      // Note: lunr doesn't support incremental updates, so we rebuild
      await this.rebuildIndexFromMemory();

      this.lastUpdate = new Date();
    } catch (error) {
      // File doesn't exist or can't be accessed
      this.removeFile(filePath);
    }
  }

  private async rebuildIndexFromMemory(): Promise<void> {
    const files = Array.from(this.files.values());

    this.index = lunr(function () {
      this.ref("path");
      this.field("name");
      this.field("type");
      if (files.some((f) => f.content !== undefined)) {
        this.field("content");
      }

      files.forEach((file) => {
        this.add({
          path: file.path,
          name: path.basename(file.path),
          type: file.type,
          content: file.content || "",
        });
      });
    });
  }

  removeFile(filePath: string): void {
    this.files.delete(filePath);

    // Rebuild index without the removed file
    if (this.index) {
      this.rebuildIndexFromMemory().catch((error) => {
        console.error("Error rebuilding index after file removal:", error);
      });
    }

    this.lastUpdate = new Date();
  }

  getStatistics(): IndexStatistics {
    let totalSize = 0;
    let indexSize = 0;

    for (const file of this.files.values()) {
      totalSize += file.size;
      // Estimate index size (path + name + type + content if present)
      indexSize += file.path.length;
      indexSize += path.basename(file.path).length;
      indexSize += file.type.length;
      if (file.content) {
        indexSize += file.content.length;
      }
    }

    return {
      fileCount: this.files.size,
      totalSize,
      lastUpdate: this.lastUpdate,
      indexSize,
    };
  }

  clearIndex(): void {
    this.index = null;
    this.files.clear();
    this.lastUpdate = new Date();
  }
}
