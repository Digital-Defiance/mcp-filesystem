/**
 * Disk usage analyzer interface
 */

export interface DiskUsageReport {
  path: string;
  totalSize: number;
  fileCount: number;
  largestFiles: Array<{ path: string; size: number }>;
  largestDirectories: Array<{ path: string; size: number }>;
  fileTypeBreakdown?: Map<string, number>;
}

export interface DiskSpaceInfo {
  total: number;
  used: number;
  available: number;
  percentUsed: number;
}

export interface IDiskUsageAnalyzer {
  /**
   * Analyze disk usage for a directory
   * @param dirPath - Directory to analyze
   * @param depth - Maximum depth to analyze
   * @param groupByType - Whether to group by file type
   * @returns Disk usage report
   */
  analyzeDiskUsage(
    dirPath: string,
    depth?: number,
    groupByType?: boolean
  ): Promise<DiskUsageReport>;

  /**
   * Get available disk space
   * @param path - Path to check (defaults to workspace root)
   * @returns Disk space information
   */
  getDiskSpace(path?: string): Promise<DiskSpaceInfo>;

  /**
   * Calculate directory size recursively
   * @param dirPath - Directory path
   * @param maxDepth - Maximum depth to traverse
   * @returns Total size in bytes
   */
  calculateDirectorySize(dirPath: string, maxDepth?: number): Promise<number>;
}
