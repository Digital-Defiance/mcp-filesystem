/**
 * Checksum manager interface
 */

export type ChecksumAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

export interface ChecksumResult {
  path: string;
  algorithm: ChecksumAlgorithm;
  checksum: string;
}

export interface VerificationResult {
  path: string;
  algorithm: ChecksumAlgorithm;
  expected: string;
  actual: string;
  match: boolean;
}

export interface IChecksumManager {
  /**
   * Compute checksum for a file
   * @param filePath - Path to file
   * @param algorithm - Hash algorithm to use
   * @returns Checksum result
   */
  computeChecksum(
    filePath: string,
    algorithm: ChecksumAlgorithm
  ): Promise<ChecksumResult>;

  /**
   * Verify file checksum
   * @param filePath - Path to file
   * @param expectedChecksum - Expected checksum value
   * @param algorithm - Hash algorithm to use
   * @returns Verification result
   */
  verifyChecksum(
    filePath: string,
    expectedChecksum: string,
    algorithm: ChecksumAlgorithm
  ): Promise<VerificationResult>;

  /**
   * Compute checksums for multiple files
   * @param filePaths - Array of file paths
   * @param algorithm - Hash algorithm to use
   * @returns Array of checksum results
   */
  computeBatchChecksums(
    filePaths: string[],
    algorithm: ChecksumAlgorithm
  ): Promise<ChecksumResult[]>;
}
