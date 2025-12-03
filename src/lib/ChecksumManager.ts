/**
 * Checksum manager implementation
 */

import * as crypto from "crypto";
import * as fs from "fs";
import {
  IChecksumManager,
  ChecksumAlgorithm,
  ChecksumResult,
  VerificationResult,
} from "../interfaces/IChecksumManager";

export class ChecksumManager implements IChecksumManager {
  /**
   * Compute checksum for a file
   * Supports MD5, SHA-1, SHA-256, and SHA-512 algorithms
   */
  async computeChecksum(
    filePath: string,
    algorithm: ChecksumAlgorithm
  ): Promise<ChecksumResult> {
    return new Promise((resolve, reject) => {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      // Check if it's a file (not a directory)
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        reject(new Error(`Path is not a file: ${filePath}`));
        return;
      }

      // Create hash based on algorithm
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      // Track initial file modification time to detect changes
      const initialMtime = stats.mtime.getTime();

      stream.on("data", (data) => {
        hash.update(data);
      });

      stream.on("end", () => {
        // Check if file was modified during computation
        const currentStats = fs.statSync(filePath);
        if (currentStats.mtime.getTime() !== initialMtime) {
          reject(
            new Error(
              `File was modified during checksum computation: ${filePath}`
            )
          );
          return;
        }

        resolve({
          path: filePath,
          algorithm,
          checksum: hash.digest("hex"),
        });
      });

      stream.on("error", (error) => {
        reject(new Error(`Error reading file ${filePath}: ${error.message}`));
      });
    });
  }

  /**
   * Verify file checksum by computing and comparing
   */
  async verifyChecksum(
    filePath: string,
    expectedChecksum: string,
    algorithm: ChecksumAlgorithm
  ): Promise<VerificationResult> {
    // Compute the actual checksum
    const result = await this.computeChecksum(filePath, algorithm);

    // Compare checksums (case-insensitive)
    const match =
      result.checksum.toLowerCase() === expectedChecksum.toLowerCase();

    return {
      path: filePath,
      algorithm,
      expected: expectedChecksum.toLowerCase(),
      actual: result.checksum,
      match,
    };
  }

  /**
   * Compute checksums for multiple files
   * Processes files sequentially to avoid overwhelming the system
   */
  async computeBatchChecksums(
    filePaths: string[],
    algorithm: ChecksumAlgorithm
  ): Promise<ChecksumResult[]> {
    const results: ChecksumResult[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.computeChecksum(filePath, algorithm);
        results.push(result);
      } catch (error) {
        // Include error information in the result
        results.push({
          path: filePath,
          algorithm,
          checksum: `ERROR: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    return results;
  }
}
