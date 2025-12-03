/**
 * Property-based tests for ChecksumManager
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { ChecksumManager } from "./ChecksumManager";
import { ChecksumAlgorithm } from "../interfaces/IChecksumManager";

describe("ChecksumManager Property-Based Tests", () => {
  let tempDir: string;
  let checksumManager: ChecksumManager;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-checksum-test-"));
    checksumManager = new ChecksumManager();
  });

  afterEach(() => {
    // Cleanup disabled to prevent race conditions
    // Temp directories will be cleaned up by OS
  });

  /**
   * Feature: mcp-filesystem, Property 10: Checksum computation accuracy
   * Validates: Requirements 7.1
   *
   * For any file and hash algorithm, the computed checksum should match
   * the expected hash for that file and algorithm.
   */
  describe("Property 10: Checksum computation accuracy", () => {
    const algorithms: ChecksumAlgorithm[] = ["md5", "sha1", "sha256", "sha512"];

    algorithms.forEach((algorithm) => {
      it(`should compute correct ${algorithm.toUpperCase()} checksums for any file content`, () => {
        let iterationCounter = 0;
        fc.assert(
          fc.asyncProperty(
            fc.uint8Array({ minLength: 0, maxLength: 10000 }),
            async (content) => {
              const testId = `checksum-${algorithm}-${iterationCounter++}`;
              const testFile = path.join(tempDir, testId, "test.bin");
              fs.mkdirSync(path.dirname(testFile), { recursive: true });
              fs.writeFileSync(testFile, Buffer.from(content));

              // Compute expected checksum using Node.js crypto directly
              const expectedHash = crypto
                .createHash(algorithm)
                .update(Buffer.from(content))
                .digest("hex");

              // Compute checksum using ChecksumManager
              const result = await checksumManager.computeChecksum(
                testFile,
                algorithm
              );

              // Verify the checksum matches
              expect(result.path).toBe(testFile);
              expect(result.algorithm).toBe(algorithm);
              expect(result.checksum).toBe(expectedHash);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    it("should compute correct checksums for text files with various encodings", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 0, maxLength: 1000 }),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([content, algorithm]) => {
            const testId = `checksum-text-${iterationCounter++}`;
            const testFile = path.join(tempDir, testId, "test.txt");
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, content, "utf-8");

            // Compute expected checksum
            const expectedHash = crypto
              .createHash(algorithm as ChecksumAlgorithm)
              .update(content, "utf-8")
              .digest("hex");

            // Compute checksum using ChecksumManager
            const result = await checksumManager.computeChecksum(
              testFile,
              algorithm as ChecksumAlgorithm
            );

            // Verify the checksum matches
            expect(result.checksum).toBe(expectedHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle empty files correctly", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.constantFrom("md5", "sha1", "sha256", "sha512"),
          async (algorithm) => {
            const testId = `checksum-empty-${iterationCounter++}`;
            const testFile = path.join(tempDir, testId, "empty.txt");
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, "");

            // Compute expected checksum for empty file
            const expectedHash = crypto
              .createHash(algorithm as ChecksumAlgorithm)
              .update("")
              .digest("hex");

            // Compute checksum using ChecksumManager
            const result = await checksumManager.computeChecksum(
              testFile,
              algorithm as ChecksumAlgorithm
            );

            // Verify the checksum matches
            expect(result.checksum).toBe(expectedHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject non-existent files", () => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([filename, algorithm]) => {
            const nonExistentFile = path.join(tempDir, "nonexistent", filename);

            // Should throw an error for non-existent file
            await expect(
              checksumManager.computeChecksum(
                nonExistentFile,
                algorithm as ChecksumAlgorithm
              )
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject directories", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.constantFrom("md5", "sha1", "sha256", "sha512"),
          async (algorithm) => {
            const testId = `checksum-dir-${iterationCounter++}`;
            const testDir = path.join(tempDir, testId);
            fs.mkdirSync(testDir, { recursive: true });

            // Should throw an error for directories
            await expect(
              checksumManager.computeChecksum(
                testDir,
                algorithm as ChecksumAlgorithm
              )
            ).rejects.toThrow(/not a file/i);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 11: Checksum verification correctness
   * Validates: Requirements 7.2
   *
   * For any file and provided checksum, verification should return success
   * if checksums match and failure if they don't.
   */
  describe("Property 11: Checksum verification correctness", () => {
    it("should verify matching checksums correctly", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.uint8Array({ minLength: 0, maxLength: 10000 }),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([content, algorithm]) => {
            const testId = `verify-match-${iterationCounter++}`;
            const testFile = path.join(tempDir, testId, "test.bin");
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, Buffer.from(content));

            // Compute the correct checksum
            const correctChecksum = crypto
              .createHash(algorithm as ChecksumAlgorithm)
              .update(Buffer.from(content))
              .digest("hex");

            // Verify with correct checksum
            const result = await checksumManager.verifyChecksum(
              testFile,
              correctChecksum,
              algorithm as ChecksumAlgorithm
            );

            // Should match
            expect(result.match).toBe(true);
            expect(result.expected).toBe(correctChecksum.toLowerCase());
            expect(result.actual).toBe(correctChecksum);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should detect mismatched checksums correctly", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.uint8Array({ minLength: 1, maxLength: 10000 }),
            fc.constantFrom("md5", "sha1", "sha256", "sha512"),
            fc.array(fc.integer({ min: 0, max: 15 }), {
              minLength: 32,
              maxLength: 128,
            })
          ),
          async ([content, algorithm, wrongChecksumArray]) => {
            const testId = `verify-mismatch-${iterationCounter++}`;
            const testFile = path.join(tempDir, testId, "test.bin");
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, Buffer.from(content));

            // Convert array to hex string
            const wrongChecksum = wrongChecksumArray
              .map((n) => n.toString(16))
              .join("");

            // Compute the correct checksum
            const correctChecksum = crypto
              .createHash(algorithm as ChecksumAlgorithm)
              .update(Buffer.from(content))
              .digest("hex");

            // Skip if the wrong checksum happens to match (very unlikely)
            if (wrongChecksum.toLowerCase() === correctChecksum.toLowerCase()) {
              return;
            }

            // Verify with wrong checksum
            const result = await checksumManager.verifyChecksum(
              testFile,
              wrongChecksum,
              algorithm as ChecksumAlgorithm
            );

            // Should not match
            expect(result.match).toBe(false);
            expect(result.expected).toBe(wrongChecksum.toLowerCase());
            expect(result.actual).toBe(correctChecksum);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle case-insensitive checksum comparison", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.uint8Array({ minLength: 0, maxLength: 1000 }),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([content, algorithm]) => {
            const testId = `verify-case-${iterationCounter++}`;
            const testFile = path.join(tempDir, testId, "test.bin");
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
            fs.writeFileSync(testFile, Buffer.from(content));

            // Compute the correct checksum
            const correctChecksum = crypto
              .createHash(algorithm as ChecksumAlgorithm)
              .update(Buffer.from(content))
              .digest("hex");

            // Test with uppercase version
            const uppercaseChecksum = correctChecksum.toUpperCase();
            const result = await checksumManager.verifyChecksum(
              testFile,
              uppercaseChecksum,
              algorithm as ChecksumAlgorithm
            );

            // Should match despite case difference
            expect(result.match).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle batch checksum computation for multiple files", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.tuple(
                fc
                  .stringMatching(/^[a-zA-Z0-9_]+$/)
                  .filter((s) => s.length >= 2),
                fc.uint8Array({ minLength: 0, maxLength: 1000 })
              ),
              { minLength: 1, maxLength: 10 }
            ),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([fileData, algorithm]) => {
            const testId = `batch-${iterationCounter++}`;
            const testDir = path.join(tempDir, testId);
            fs.mkdirSync(testDir, { recursive: true });

            const filePaths: string[] = [];
            const expectedChecksums: string[] = [];

            // Create test files and compute expected checksums
            for (const [filename, content] of fileData) {
              const filePath = path.join(testDir, filename);
              fs.writeFileSync(filePath, Buffer.from(content));
              filePaths.push(filePath);

              const expectedChecksum = crypto
                .createHash(algorithm as ChecksumAlgorithm)
                .update(Buffer.from(content))
                .digest("hex");
              expectedChecksums.push(expectedChecksum);
            }

            // Compute batch checksums
            const results = await checksumManager.computeBatchChecksums(
              filePaths,
              algorithm as ChecksumAlgorithm
            );

            // Verify all results
            expect(results).toHaveLength(filePaths.length);
            results.forEach((result, idx) => {
              expect(result.path).toBe(filePaths[idx]);
              expect(result.algorithm).toBe(algorithm);
              expect(result.checksum).toBe(expectedChecksums[idx]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle batch checksums with some invalid files", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              { minLength: 3, maxLength: 5 }
            ),
            fc.integer({ min: 0, max: 10 }),
            fc.constantFrom("md5", "sha1", "sha256", "sha512")
          ),
          async ([filenames, invalidIndex, algorithm]) => {
            const testId = `batch-invalid-${iterationCounter++}`;
            const testDir = path.join(tempDir, testId);
            fs.mkdirSync(testDir, { recursive: true });

            const actualInvalidIndex = invalidIndex % filenames.length;
            const filePaths: string[] = [];

            // Create test files, skipping the invalid one
            for (let idx = 0; idx < filenames.length; idx++) {
              const filePath = path.join(testDir, filenames[idx]);
              filePaths.push(filePath);

              if (idx !== actualInvalidIndex) {
                fs.writeFileSync(filePath, `content-${idx}`);
              }
            }

            // Compute batch checksums
            const results = await checksumManager.computeBatchChecksums(
              filePaths,
              algorithm as ChecksumAlgorithm
            );

            // Verify we got results for all files
            expect(results).toHaveLength(filePaths.length);

            // Verify the invalid file has an error
            const invalidResult = results[actualInvalidIndex];
            expect(invalidResult.checksum).toMatch(/^ERROR:/);

            // Verify other files have valid checksums
            results.forEach((result, idx) => {
              if (idx !== actualInvalidIndex) {
                expect(result.checksum).not.toMatch(/^ERROR:/);
                expect(result.checksum).toMatch(/^[a-f0-9]+$/);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
