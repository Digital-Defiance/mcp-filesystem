/**
 * Symlink manager interface for link operations
 */

export interface SymlinkCreationResult {
  success: boolean;
  linkPath: string;
  targetPath: string;
  message?: string;
}

export interface SymlinkResolutionResult {
  linkPath: string;
  targetPath: string;
  absoluteTargetPath: string;
  exists: boolean;
  isBroken: boolean;
}

export interface HardLinkCreationResult {
  success: boolean;
  linkPath: string;
  sourcePath: string;
  message?: string;
}

export interface ISymlinkManager {
  /**
   * Create a symbolic link
   * @param linkPath - Path where the symlink will be created
   * @param targetPath - Target path for the symlink
   * @returns Result of the symlink creation
   */
  createSymlink(
    linkPath: string,
    targetPath: string
  ): Promise<SymlinkCreationResult>;

  /**
   * Resolve a symbolic link to its target
   * @param linkPath - Path to the symlink
   * @returns Resolution result with target information
   */
  resolveSymlink(linkPath: string): Promise<SymlinkResolutionResult>;

  /**
   * Create a hard link
   * @param linkPath - Path where the hard link will be created
   * @param sourcePath - Source file path
   * @returns Result of the hard link creation
   */
  createHardLink(
    linkPath: string,
    sourcePath: string
  ): Promise<HardLinkCreationResult>;
}
