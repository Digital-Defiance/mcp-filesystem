/**
 * Property-based tests for BatchOperationManager
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BatchOperationManager } from "./BatchOperationManager";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";
import { BatchOperation } from "../interfaces/IBatchOperationManager";

describe("BatchOperationManager Property-Based Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;
  let batchManager: BatchOperationManager;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-batch-test-"));

    config = {
      workspaceRoot: tempDir,
      allowedSubdirectories: [],
      blockedPaths: [],
      blockedPatterns: [],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxBatchSize: 1024 * 1024 * 1024, // 1GB
      maxOperationsPerMinute: 100,
      enableAuditLog: false, // Disable for tests
      requireConfirmation: false,
      readOnly: false,
    };

    securityManager = new SecurityManager(config);
    batchManager = new BatchOperationManager(securityManager);
  });

  afterEach(() => {
    // Cleanup disabled to prevent race conditions
    // Temp directories will be cleaned up by OS
  });

  /**
   * Feature: mcp-filesystem, Property 1: Batch copy completeness
   * Validates: Requirements 1.1
   *
   * For any list of valid file copy operations, all files should be copied
   * and results returned for each operation.
   */
  describe("Property 1: Batch copy completeness", () => {
    it("should copy all files and return results for each operation", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              fc.string({ minLength: 0, maxLength: 100 })
            ),
            { minLength: 1, maxLength: 5 }
          ),
          async (fileData) => {
            // Create unique directories for this iteration
            const testId = `test1-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "sources");
            const destDir = path.join(tempDir, testId, "destinations");
            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            const operations: BatchOperation[] = [];

            for (const [filename, content] of fileData) {
              const sourcePath = path.join(sourceDir, filename);
              fs.writeFileSync(sourcePath, content);

              operations.push({
                type: "copy",
                source: path.relative(tempDir, sourcePath),
                destination: path.relative(
                  tempDir,
                  path.join(destDir, filename)
                ),
              });
            }

            // Execute batch copy
            const results = await batchManager.executeBatch(operations, false);

            // Verify all operations succeeded
            expect(results).toHaveLength(operations.length);
            results.forEach((result) => {
              expect(result.success).toBe(true);
            });

            // Verify all files were copied with correct content
            for (const [filename, content] of fileData) {
              const destPath = path.join(destDir, filename);
              expect(fs.existsSync(destPath)).toBe(true);
              const copiedContent = fs.readFileSync(destPath, "utf-8");
              expect(copiedContent).toBe(content);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should handle empty file copies", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (numFiles) => {
          // Create unique directories for this iteration
          const testId = `test2-${iterationCounter++}`;
          const sourceDir = path.join(tempDir, testId, "sources");
          const destDir = path.join(tempDir, testId, "destinations");
          fs.mkdirSync(sourceDir, { recursive: true });
          fs.mkdirSync(destDir, { recursive: true });

          const operations: BatchOperation[] = [];

          for (let i = 0; i < numFiles; i++) {
            const filename = `file${i}.txt`;
            const sourcePath = path.join(sourceDir, filename);
            fs.writeFileSync(sourcePath, "");

            operations.push({
              type: "copy",
              source: path.relative(tempDir, sourcePath),
              destination: path.relative(tempDir, path.join(destDir, filename)),
            });
          }

          // Execute batch copy
          const results = await batchManager.executeBatch(operations, false);

          // Verify all operations succeeded
          if (results.length !== operations.length) {
            console.error(
              `Length mismatch: results.length=${results.length}, operations.length=${operations.length}`
            );
            console.error(`Results:`, results);
          }
          expect(results).toHaveLength(operations.length);
          results.forEach((result, idx) => {
            if (!result.success) {
              console.error(`Operation ${idx} failed:`, result.error);
              console.error(`Operation:`, operations[idx]);
            }
            expect(result.success).toBe(true);
          });

          // Verify all empty files were copied
          for (let i = 0; i < numFiles; i++) {
            const destPath = path.join(destDir, `file${i}.txt`);
            expect(fs.existsSync(destPath)).toBe(true);
            expect(fs.statSync(destPath).size).toBe(0);
          }
        }),
        { numRuns: 10 }
      );
    });

    it("should return failure results for invalid operations in non-atomic mode", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              {
                minLength: 2,
                maxLength: 5,
              }
            ),
            fc.integer({ min: 0, max: 10 })
          ),
          async ([filenames, invalidIndex]) => {
            const testId = `test3-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "sources");
            const destDir = path.join(tempDir, testId, "destinations");
            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            const actualInvalidIndex = invalidIndex % filenames.length;

            const operations: BatchOperation[] = filenames.map(
              (filename, idx) => {
                const sourcePath = path.join(sourceDir, filename);

                // Only create source file if it's not the invalid one
                if (idx !== actualInvalidIndex) {
                  fs.writeFileSync(sourcePath, `content-${idx}`);
                }

                return {
                  type: "copy",
                  source: path.relative(tempDir, sourcePath),
                  destination: path.relative(
                    tempDir,
                    path.join(destDir, filename)
                  ),
                };
              }
            );

            // Execute batch copy in non-atomic mode
            const results = await batchManager.executeBatch(operations, false);

            // Verify we got results for all operations
            expect(results).toHaveLength(operations.length);

            // Verify the invalid operation failed
            const invalidResult = results[actualInvalidIndex];
            expect(invalidResult.success).toBe(false);
            expect(invalidResult.error).toBeDefined();

            // Verify other operations succeeded
            results.forEach((result, idx) => {
              if (idx !== actualInvalidIndex) {
                if (!result.success) {
                  console.error(
                    `Non-invalid operation ${idx} failed:`,
                    result.error
                  );
                  console.error(`Operation:`, operations[idx]);
                  console.error(`actualInvalidIndex:`, actualInvalidIndex);
                }
                expect(result.success).toBe(true);
              }
            });
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 2: Atomic batch operations
   * Validates: Requirements 1.2
   *
   * For any batch of file move operations with atomic flag, either all
   * operations should succeed or all should be rolled back.
   */
  describe("Property 2: Atomic batch operations", () => {
    it("should rollback all operations if any operation fails in atomic mode", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              {
                minLength: 3,
                maxLength: 5,
              }
            ),
            fc.integer({ min: 0, max: 10 })
          ),
          async ([filenames, invalidIndex]) => {
            const testId = `test-atomic-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "sources");
            const destDir = path.join(tempDir, testId, "destinations");
            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            const actualInvalidIndex = invalidIndex % filenames.length;

            // Create source files for all except the invalid one
            const operations: BatchOperation[] = filenames.map(
              (filename, idx) => {
                const sourcePath = path.join(sourceDir, filename);

                // Only create source file if it's not the invalid one
                if (idx !== actualInvalidIndex) {
                  fs.writeFileSync(sourcePath, `content-${idx}`);
                }

                return {
                  type: "move",
                  source: path.relative(tempDir, sourcePath),
                  destination: path.relative(
                    tempDir,
                    path.join(destDir, filename)
                  ),
                };
              }
            );

            // Execute batch move in atomic mode - should fail and rollback
            let threwError = false;
            try {
              await batchManager.executeBatch(operations, true);
            } catch (error) {
              threwError = true;
            }

            // Verify that an error was thrown
            expect(threwError).toBe(true);

            // Verify that ALL source files that existed before are still there
            // (rollback should have restored them)
            for (let idx = 0; idx < filenames.length; idx++) {
              if (idx !== actualInvalidIndex) {
                const sourcePath = path.join(sourceDir, filenames[idx]);
                expect(fs.existsSync(sourcePath)).toBe(true);
                const content = fs.readFileSync(sourcePath, "utf-8");
                expect(content).toBe(`content-${idx}`);
              }
            }

            // Verify that NO destination files exist (rollback should have removed them)
            for (const filename of filenames) {
              const destPath = path.join(destDir, filename);
              expect(fs.existsSync(destPath)).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should complete all operations successfully in atomic mode when all are valid", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
            {
              minLength: 2,
              maxLength: 5,
            }
          ),
          async (filenames) => {
            const testId = `test-atomic-success-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "sources");
            const destDir = path.join(tempDir, testId, "destinations");
            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            // Create all source files
            const operations: BatchOperation[] = filenames.map(
              (filename, idx) => {
                const sourcePath = path.join(sourceDir, filename);
                fs.writeFileSync(sourcePath, `content-${idx}`);

                return {
                  type: "move",
                  source: path.relative(tempDir, sourcePath),
                  destination: path.relative(
                    tempDir,
                    path.join(destDir, filename)
                  ),
                };
              }
            );

            // Execute batch move in atomic mode - should succeed
            const results = await batchManager.executeBatch(operations, true);

            // Verify all operations succeeded
            expect(results).toHaveLength(operations.length);
            results.forEach((result) => {
              expect(result.success).toBe(true);
            });

            // Verify all files were moved (source files gone, dest files exist)
            for (let idx = 0; idx < filenames.length; idx++) {
              const sourcePath = path.join(sourceDir, filenames[idx]);
              const destPath = path.join(destDir, filenames[idx]);

              expect(fs.existsSync(sourcePath)).toBe(false);
              expect(fs.existsSync(destPath)).toBe(true);

              const content = fs.readFileSync(destPath, "utf-8");
              expect(content).toBe(`content-${idx}`);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
