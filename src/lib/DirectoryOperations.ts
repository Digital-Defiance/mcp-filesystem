/**
 * Directory operations implementation
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  IDirectoryOperations,
  CopyOptions,
  SyncOptions,
  CopyResult,
  SyncResult,
} from "../interfaces/IDirectoryOperations";
import { ISecurityManager } from "../interfaces/ISecurityManager";
import { FileSystemError } from "../types";

export class DirectoryOperations implements IDirectoryOperations {
  private securityManager: ISecurityManager;

  constructor(securityManager: ISecurityManager) {
    this.securityManager = securityManager;
  }

  async copyDirectory(
    source: string,
    destination: string,
    options: CopyOptions = {}
  ): Promise<CopyResult> {
    const startTime = Date.now();
    let filesCopied = 0;
    let bytesTransferred = 0;

    // Validate paths
    const validatedSource = this.securityManager.validatePath(source, "read");
    const validatedDest = this.securityManager.validatePath(
      destination,
      "write"
    );

    // Check source exists and is a directory
    if (!fs.existsSync(validatedSource)) {
      throw new FileSystemError(`Source directory does not exist: ${source}`);
    }

    const sourceStats = fs.statSync(validatedSource);
    if (!sourceStats.isDirectory()) {
      throw new FileSystemError(`Source is not a directory: ${source}`);
    }

    // Compile exclusion patterns
    const exclusionPatterns = options.exclusions
      ? options.exclusions.map((pattern) => this.globToRegex(pattern))
      : [];

    // Perform recursive copy
    const result = await this.recursiveCopy(
      validatedSource,
      validatedDest,
      options.preserveMetadata || false,
      exclusionPatterns
    );

    filesCopied = result.filesCopied;
    bytesTransferred = result.bytesTransferred;

    const duration = Date.now() - startTime;

    // Audit operation
    this.securityManager.auditOperation(
      "copy_directory",
      [validatedSource, validatedDest],
      `success: ${filesCopied} files, ${bytesTransferred} bytes, ${duration}ms`
    );

    return {
      filesCopied,
      bytesTransferred,
      duration,
    };
  }

  async syncDirectory(
    source: string,
    destination: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let filesCopied = 0;
    let filesSkipped = 0;
    let bytesTransferred = 0;

    // Validate paths
    const validatedSource = this.securityManager.validatePath(source, "read");
    const validatedDest = this.securityManager.validatePath(
      destination,
      "write"
    );

    // Check source exists and is a directory
    if (!fs.existsSync(validatedSource)) {
      throw new FileSystemError(`Source directory does not exist: ${source}`);
    }

    const sourceStats = fs.statSync(validatedSource);
    if (!sourceStats.isDirectory()) {
      throw new FileSystemError(`Source is not a directory: ${source}`);
    }

    // Compile exclusion patterns
    const exclusionPatterns = options.exclusions
      ? options.exclusions.map((pattern) => this.globToRegex(pattern))
      : [];

    // Perform recursive sync
    const result = await this.recursiveSync(
      validatedSource,
      validatedDest,
      exclusionPatterns
    );

    filesCopied = result.filesCopied;
    filesSkipped = result.filesSkipped;
    bytesTransferred = result.bytesTransferred;

    const duration = Date.now() - startTime;

    // Audit operation
    this.securityManager.auditOperation(
      "sync_directory",
      [validatedSource, validatedDest],
      `success: ${filesCopied} copied, ${filesSkipped} skipped, ${bytesTransferred} bytes, ${duration}ms`
    );

    return {
      filesCopied,
      filesSkipped,
      bytesTransferred,
      duration,
    };
  }

  async atomicReplace(
    targetPath: string,
    content: Buffer | string
  ): Promise<void> {
    // Validate target path
    const validatedTarget = this.securityManager.validatePath(
      targetPath,
      "write"
    );

    // Create temporary file in the same directory
    const targetDir = path.dirname(validatedTarget);
    const tempFileName = `.tmp-${crypto.randomBytes(16).toString("hex")}`;
    const tempPath = path.join(targetDir, tempFileName);

    try {
      // Write to temporary file
      if (Buffer.isBuffer(content)) {
        fs.writeFileSync(tempPath, content);
      } else {
        fs.writeFileSync(tempPath, content, "utf-8");
      }

      // Atomically rename to target
      fs.renameSync(tempPath, validatedTarget);

      // Audit operation
      this.securityManager.auditOperation(
        "atomic_replace",
        [validatedTarget],
        "success"
      );
    } catch (error) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }

      throw new FileSystemError(
        `Atomic replace failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async recursiveCopy(
    source: string,
    destination: string,
    preserveMetadata: boolean,
    exclusionPatterns: RegExp[]
  ): Promise<{ filesCopied: number; bytesTransferred: number }> {
    let filesCopied = 0;
    let bytesTransferred = 0;

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });

      // Preserve directory metadata if requested
      if (preserveMetadata) {
        const sourceStats = fs.statSync(source);
        fs.utimesSync(destination, sourceStats.atime, sourceStats.mtime);
        fs.chmodSync(destination, sourceStats.mode);
      }
    }

    // Read directory contents
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      // Check if path matches any exclusion pattern
      if (this.shouldExclude(sourcePath, exclusionPatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        const result = await this.recursiveCopy(
          sourcePath,
          destPath,
          preserveMetadata,
          exclusionPatterns
        );
        filesCopied += result.filesCopied;
        bytesTransferred += result.bytesTransferred;
      } else if (entry.isFile()) {
        // Copy file
        const stats = fs.statSync(sourcePath);
        fs.copyFileSync(sourcePath, destPath);

        // Preserve file metadata if requested
        if (preserveMetadata) {
          fs.utimesSync(destPath, stats.atime, stats.mtime);
          fs.chmodSync(destPath, stats.mode);
        }

        filesCopied++;
        bytesTransferred += stats.size;
      }
    }

    return { filesCopied, bytesTransferred };
  }

  private async recursiveSync(
    source: string,
    destination: string,
    exclusionPatterns: RegExp[]
  ): Promise<{
    filesCopied: number;
    filesSkipped: number;
    bytesTransferred: number;
  }> {
    let filesCopied = 0;
    let filesSkipped = 0;
    let bytesTransferred = 0;

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Read directory contents
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      // Check if path matches any exclusion pattern
      if (this.shouldExclude(sourcePath, exclusionPatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively sync subdirectory
        const result = await this.recursiveSync(
          sourcePath,
          destPath,
          exclusionPatterns
        );
        filesCopied += result.filesCopied;
        filesSkipped += result.filesSkipped;
        bytesTransferred += result.bytesTransferred;
      } else if (entry.isFile()) {
        const sourceStats = fs.statSync(sourcePath);

        // Check if destination exists and compare timestamps
        let shouldCopy = true;
        if (fs.existsSync(destPath)) {
          const destStats = fs.statSync(destPath);

          // Only copy if source is newer
          if (sourceStats.mtime <= destStats.mtime) {
            shouldCopy = false;
            filesSkipped++;
          }
        }

        if (shouldCopy) {
          fs.copyFileSync(sourcePath, destPath);
          filesCopied++;
          bytesTransferred += sourceStats.size;
        }
      }
    }

    return { filesCopied, filesSkipped, bytesTransferred };
  }

  private shouldExclude(filePath: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(filePath));
  }

  private globToRegex(glob: string): RegExp {
    // Convert glob pattern to regex
    // This is a simplified implementation
    let regex = glob
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    return new RegExp(regex);
  }
}
