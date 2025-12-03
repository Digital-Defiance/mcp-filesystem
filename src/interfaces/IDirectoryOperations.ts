/**
 * Directory operations interface
 */

export interface CopyOptions {
  preserveMetadata?: boolean;
  exclusions?: string[];
}

export interface SyncOptions {
  exclusions?: string[];
}

export interface CopyResult {
  filesCopied: number;
  bytesTransferred: number;
  duration: number;
}

export interface SyncResult {
  filesCopied: number;
  filesSkipped: number;
  bytesTransferred: number;
  duration: number;
}

export interface IDirectoryOperations {
  /**
   * Copy a directory recursively
   * @param source Source directory path
   * @param destination Destination directory path
   * @param options Copy options (preserve metadata, exclusions)
   * @returns Copy statistics
   */
  copyDirectory(
    source: string,
    destination: string,
    options?: CopyOptions
  ): Promise<CopyResult>;

  /**
   * Sync directories (copy only newer or missing files)
   * @param source Source directory path
   * @param destination Destination directory path
   * @param options Sync options (exclusions)
   * @returns Sync statistics
   */
  syncDirectory(
    source: string,
    destination: string,
    options?: SyncOptions
  ): Promise<SyncResult>;

  /**
   * Atomically replace a file
   * @param targetPath Target file path
   * @param content Content to write
   * @returns void
   */
  atomicReplace(targetPath: string, content: Buffer | string): Promise<void>;
}
