/**
 * Symlink manager implementation
 * Handles symbolic links, hard links, and link resolution
 */

import * as fs from "fs";
import * as path from "path";
import {
  ISymlinkManager,
  SymlinkCreationResult,
  SymlinkResolutionResult,
  HardLinkCreationResult,
} from "../interfaces/ISymlinkManager";
import { ISecurityManager } from "../interfaces/ISecurityManager";
import { FileSystemError } from "../types";

export class SymlinkManager implements ISymlinkManager {
  constructor(private securityManager: ISecurityManager) {}

  /**
   * Create a symbolic link
   * Validates targets are within workspace and handles platform differences
   */
  async createSymlink(
    linkPath: string,
    targetPath: string
  ): Promise<SymlinkCreationResult> {
    try {
      // Validate symlink creation through security manager
      this.securityManager.validateSymlink(linkPath, targetPath);

      // Get validated paths
      const validatedLinkPath = this.securityManager.validatePath(
        linkPath,
        "write"
      );

      // Resolve target path relative to link directory
      const linkDir = path.dirname(validatedLinkPath);
      const resolvedTarget = path.resolve(linkDir, targetPath);

      // Ensure target is within workspace
      const validatedTargetPath = this.securityManager.validatePath(
        resolvedTarget,
        "read"
      );

      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(validatedLinkPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if link already exists
      if (fs.existsSync(validatedLinkPath)) {
        const stats = fs.lstatSync(validatedLinkPath);
        if (stats.isSymbolicLink()) {
          throw new FileSystemError(
            `Symbolic link already exists at ${linkPath}`
          );
        } else {
          throw new FileSystemError(`File already exists at ${linkPath}`);
        }
      }

      // Create the symbolic link
      // Use relative path for better portability
      const relativePath = path.relative(linkDir, validatedTargetPath);
      fs.symlinkSync(relativePath, validatedLinkPath);

      // Audit the operation
      this.securityManager.auditOperation(
        "create_symlink",
        [linkPath, targetPath],
        "success"
      );

      return {
        success: true,
        linkPath: validatedLinkPath,
        targetPath: validatedTargetPath,
        message: "Symbolic link created successfully",
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "SecurityError" || error.name === "FileSystemError")
      ) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to create symbolic link: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Resolve a symbolic link to its target
   * Returns absolute paths and handles broken symlinks
   */
  async resolveSymlink(linkPath: string): Promise<SymlinkResolutionResult> {
    try {
      // Validate the link path
      const validatedLinkPath = this.securityManager.validatePath(
        linkPath,
        "read"
      );

      // Check if path exists using lstat (which works for broken symlinks)
      let stats;
      try {
        stats = fs.lstatSync(validatedLinkPath);
      } catch (error) {
        throw new FileSystemError(`Path does not exist: ${linkPath}`);
      }

      // Check if it's a symbolic link
      if (!stats.isSymbolicLink()) {
        throw new FileSystemError(`Path is not a symbolic link: ${linkPath}`);
      }

      // Read the symlink target
      const target = fs.readlinkSync(validatedLinkPath);

      // Resolve to absolute path
      const linkDir = path.dirname(validatedLinkPath);
      const absoluteTarget = path.resolve(linkDir, target);

      // Check if target exists
      const targetExists = fs.existsSync(absoluteTarget);
      const isBroken = !targetExists;

      // Audit the operation
      this.securityManager.auditOperation(
        "resolve_symlink",
        [linkPath],
        "success"
      );

      return {
        linkPath: validatedLinkPath,
        targetPath: target,
        absoluteTargetPath: absoluteTarget,
        exists: targetExists,
        isBroken,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "SecurityError" || error.name === "FileSystemError")
      ) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to resolve symbolic link: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create a hard link
   * Validates source files exist
   */
  async createHardLink(
    linkPath: string,
    sourcePath: string
  ): Promise<HardLinkCreationResult> {
    try {
      // Validate both paths
      const validatedSourcePath = this.securityManager.validatePath(
        sourcePath,
        "read"
      );
      const validatedLinkPath = this.securityManager.validatePath(
        linkPath,
        "write"
      );

      // Check if source exists and is a file
      if (!fs.existsSync(validatedSourcePath)) {
        throw new FileSystemError(`Source file does not exist: ${sourcePath}`);
      }

      const sourceStats = fs.statSync(validatedSourcePath);
      if (!sourceStats.isFile()) {
        throw new FileSystemError(
          `Source path is not a file: ${sourcePath}. Hard links can only be created for files.`
        );
      }

      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(validatedLinkPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if link already exists
      if (fs.existsSync(validatedLinkPath)) {
        throw new FileSystemError(`File already exists at ${linkPath}`);
      }

      // Create the hard link
      fs.linkSync(validatedSourcePath, validatedLinkPath);

      // Audit the operation
      this.securityManager.auditOperation(
        "create_hardlink",
        [linkPath, sourcePath],
        "success"
      );

      return {
        success: true,
        linkPath: validatedLinkPath,
        sourcePath: validatedSourcePath,
        message: "Hard link created successfully",
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "SecurityError" || error.name === "FileSystemError")
      ) {
        throw error;
      }

      throw new FileSystemError(
        `Failed to create hard link: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
