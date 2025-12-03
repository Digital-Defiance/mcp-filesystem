/**
 * Disk usage analyzer implementation
 */

import * as fs from "fs";
import * as path from "path";
import {
  IDiskUsageAnalyzer,
  DiskUsageReport,
  DiskSpaceInfo,
} from "../interfaces/IDiskUsageAnalyzer";
import { ISecurityManager } from "../interfaces/ISecurityManager";
import { FileSystemError } from "../types";

interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

export class DiskUsageAnalyzer implements IDiskUsageAnalyzer {
  constructor(private securityManager: ISecurityManager) {}

  /**
   * Analyze disk usage for a directory
   * Requirements: 8.1-8.5
   */
  async analyzeDiskUsage(
    dirPath: string,
    depth: number = Infinity,
    groupByType: boolean = false
  ): Promise<DiskUsageReport> {
    // Validate path
    const validPath = this.securityManager.validatePath(dirPath, "read");

    // Check if path exists and is a directory
    if (!fs.existsSync(validPath)) {
      throw new FileSystemError(`Directory does not exist: ${dirPath}`);
    }

    const stats = fs.statSync(validPath);
    if (!stats.isDirectory()) {
      throw new FileSystemError(`Path is not a directory: ${dirPath}`);
    }

    // Collect all files and directories
    const entries: FileEntry[] = [];
    const fileTypeMap = new Map<string, number>();
    let totalSize = 0;
    let fileCount = 0;

    await this.scanDirectory(
      validPath,
      0,
      depth,
      entries,
      groupByType ? fileTypeMap : null
    );

    // Calculate totals
    for (const entry of entries) {
      if (!entry.isDirectory) {
        totalSize += entry.size;
        fileCount++;
      }
    }

    // Find largest files (top 10)
    const largestFiles = entries
      .filter((e) => !e.isDirectory)
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((e) => ({ path: e.path, size: e.size }));

    // Find largest directories (top 10)
    const directorySizes = new Map<string, number>();
    for (const entry of entries) {
      if (entry.isDirectory) {
        const dirSize = await this.calculateDirectorySize(entry.path, 1);
        directorySizes.set(entry.path, dirSize);
      }
    }

    const largestDirectories = Array.from(directorySizes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, size]) => ({ path, size }));

    return {
      path: validPath,
      totalSize,
      fileCount,
      largestFiles,
      largestDirectories,
      fileTypeBreakdown: groupByType ? fileTypeMap : undefined,
    };
  }

  /**
   * Get available disk space
   * Requirements: 8.5
   */
  async getDiskSpace(targetPath?: string): Promise<DiskSpaceInfo> {
    // Use workspace root if no path provided
    const checkPath = targetPath
      ? this.securityManager.validatePath(targetPath, "read")
      : this.securityManager.getWorkspaceRoot();

    // Check if path exists
    if (!fs.existsSync(checkPath)) {
      throw new FileSystemError(
        `Path does not exist: ${targetPath || "workspace root"}`
      );
    }

    // Use statfs to get disk space information
    return new Promise((resolve, reject) => {
      fs.statfs(checkPath, (err, stats) => {
        if (err) {
          reject(
            new FileSystemError(`Failed to get disk space: ${err.message}`)
          );
          return;
        }

        const total = stats.blocks * stats.bsize;
        const available = stats.bavail * stats.bsize;
        const used = total - available;
        const percentUsed = total > 0 ? (used / total) * 100 : 0;

        resolve({
          total,
          used,
          available,
          percentUsed,
        });
      });
    });
  }

  /**
   * Calculate directory size recursively
   * Requirements: 8.1, 8.3
   */
  async calculateDirectorySize(
    dirPath: string,
    maxDepth: number = Infinity
  ): Promise<number> {
    // Validate path
    const validPath = this.securityManager.validatePath(dirPath, "read");

    // Check if path exists
    if (!fs.existsSync(validPath)) {
      throw new FileSystemError(`Directory does not exist: ${dirPath}`);
    }

    const stats = fs.statSync(validPath);
    if (!stats.isDirectory()) {
      throw new FileSystemError(`Path is not a directory: ${dirPath}`);
    }

    return this.calculateSizeRecursive(validPath, 0, maxDepth);
  }

  /**
   * Recursively calculate size with depth limit
   */
  private async calculateSizeRecursive(
    dirPath: string,
    currentDepth: number,
    maxDepth: number
  ): Promise<number> {
    if (currentDepth >= maxDepth) {
      return 0;
    }

    let totalSize = 0;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          // Validate each path (but don't throw on validation errors, just skip)
          this.securityManager.validatePath(fullPath, "read");

          if (entry.isSymbolicLink()) {
            // Handle symlinks: get the size of the link itself, not the target
            const linkStats = fs.lstatSync(fullPath);
            totalSize += linkStats.size;
          } else if (entry.isDirectory()) {
            // Recursively calculate directory size
            totalSize += await this.calculateSizeRecursive(
              fullPath,
              currentDepth + 1,
              maxDepth
            );
          } else if (entry.isFile()) {
            const fileStats = fs.statSync(fullPath);
            totalSize += fileStats.size;
          }
        } catch (error) {
          // Skip files/directories that fail validation or stat
          continue;
        }
      }
    } catch (error) {
      // If we can't read the directory, return 0
      return 0;
    }

    return totalSize;
  }

  /**
   * Scan directory and collect file entries
   */
  private async scanDirectory(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    entries: FileEntry[],
    fileTypeMap: Map<string, number> | null
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of dirEntries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          // Validate each path (but don't throw on validation errors, just skip)
          this.securityManager.validatePath(fullPath, "read");

          if (entry.isSymbolicLink()) {
            // Handle symlinks: get the size of the link itself
            const linkStats = fs.lstatSync(fullPath);
            entries.push({
              path: fullPath,
              size: linkStats.size,
              isDirectory: false,
            });
          } else if (entry.isDirectory()) {
            entries.push({
              path: fullPath,
              size: 0,
              isDirectory: true,
            });

            // Recursively scan subdirectory
            await this.scanDirectory(
              fullPath,
              currentDepth + 1,
              maxDepth,
              entries,
              fileTypeMap
            );
          } else if (entry.isFile()) {
            const fileStats = fs.statSync(fullPath);
            entries.push({
              path: fullPath,
              size: fileStats.size,
              isDirectory: false,
            });

            // Track file type if requested
            if (fileTypeMap) {
              const ext =
                path.extname(entry.name).toLowerCase() || "(no extension)";
              fileTypeMap.set(
                ext,
                (fileTypeMap.get(ext) || 0) + fileStats.size
              );
            }
          }
        } catch (error) {
          // Skip files/directories that fail validation or stat
          continue;
        }
      }
    } catch (error) {
      // If we can't read the directory, skip it
      return;
    }
  }
}
