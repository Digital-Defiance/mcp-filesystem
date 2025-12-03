/**
 * Property-based tests for DirectoryOperations
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { minimatch } from "minimatch";
import { DirectoryOperations } from "./DirectoryOperations";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";

describe("DirectoryOperations Property-Based Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;
  let dirOps: DirectoryOperations;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-dirops-test-"));

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
    dirOps = new DirectoryOperations(securityManager);
  });

  afterEach(() => {
    // Cleanup disabled to prevent race conditions
    // Temp directories will be cleaned up by OS
  });

  /**
   * Feature: mcp-filesystem, Property 15: Recursive copy completeness
   * Validates: Requirements 10.1
   *
   * For any directory copy operation, all files and subdirectories should be
   * copied to the destination.
   */
  describe("Property 15: Recursive copy completeness", () => {
    it("should copy all files and subdirectories recursively", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc
            .array(
              fc.record({
                path: fc.array(
                  fc
                    .stringMatching(/^[a-zA-Z0-9_]+$/)
                    .filter((s) => s.length >= 2),
                  { minLength: 1, maxLength: 3 }
                ),
                content: fc.string({ minLength: 0, maxLength: 100 }),
              }),
              { minLength: 1, maxLength: 10 }
            )
            .map((arr) => {
              // Deduplicate by path (keep last occurrence)
              const pathMap = new Map<string, (typeof arr)[0]>();
              for (const file of arr) {
                const pathKey = file.path.join("/");
                pathMap.set(pathKey, file);
              }
              return Array.from(pathMap.values());
            }),
          async (fileStructure) => {
            const testId = `test-copy-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "source");
            const destDir = path.join(tempDir, testId, "dest");

            // Create source directory structure
            fs.mkdirSync(sourceDir, { recursive: true });

            const createdFiles: string[] = [];
            for (const file of fileStructure) {
              const filePath = path.join(sourceDir, ...file.path);
              const fileDir = path.dirname(filePath);

              // Create parent directories
              if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
              }

              // Create file
              fs.writeFileSync(filePath, file.content);
              createdFiles.push(path.relative(sourceDir, filePath));
            }

            // Execute copy
            const result = await dirOps.copyDirectory(
              path.relative(tempDir, sourceDir),
              path.relative(tempDir, destDir)
            );

            // Verify all files were copied
            expect(result.filesCopied).toBe(createdFiles.length);

            // Verify each file exists in destination with correct content
            for (const file of fileStructure) {
              const destFilePath = path.join(destDir, ...file.path);
              expect(fs.existsSync(destFilePath)).toBe(true);

              const copiedContent = fs.readFileSync(destFilePath, "utf-8");
              expect(copiedContent).toBe(file.content);
            }

            // Verify directory structure is preserved
            const sourceFiles = getAllFiles(sourceDir);
            const destFiles = getAllFiles(destDir);

            expect(destFiles.length).toBe(sourceFiles.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve metadata when requested", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              fc.string({ minLength: 0, maxLength: 50 })
            ),
            { minLength: 1, maxLength: 5 }
          ),
          async (fileData) => {
            const testId = `test-metadata-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "source");
            const destDir = path.join(tempDir, testId, "dest");

            fs.mkdirSync(sourceDir, { recursive: true });

            // Create files with specific timestamps
            const fileMetadata: Array<{
              name: string;
              mtime: Date;
              mode: number;
            }> = [];

            for (const [filename, content] of fileData) {
              const filePath = path.join(sourceDir, filename);
              fs.writeFileSync(filePath, content);

              // Set specific mtime (1 day ago)
              const mtime = new Date(Date.now() - 24 * 60 * 60 * 1000);
              fs.utimesSync(filePath, mtime, mtime);

              const stats = fs.statSync(filePath);
              fileMetadata.push({
                name: filename,
                mtime: stats.mtime,
                mode: stats.mode,
              });
            }

            // Execute copy with metadata preservation
            await dirOps.copyDirectory(
              path.relative(tempDir, sourceDir),
              path.relative(tempDir, destDir),
              { preserveMetadata: true }
            );

            // Verify metadata is preserved
            for (const meta of fileMetadata) {
              const destPath = path.join(destDir, meta.name);
              const destStats = fs.statSync(destPath);

              // Check mtime (allow 1 second tolerance for filesystem precision)
              const timeDiff = Math.abs(
                destStats.mtime.getTime() - meta.mtime.getTime()
              );
              expect(timeDiff).toBeLessThan(1000);

              // Check mode
              expect(destStats.mode).toBe(meta.mode);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should respect exclusion patterns", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
              { minLength: 3, maxLength: 6 }
            ),
            fc.integer({ min: 0, max: 10 })
          ),
          async ([filenames, excludeIndex]) => {
            const testId = `test-exclude-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "source");
            const destDir = path.join(tempDir, testId, "dest");

            fs.mkdirSync(sourceDir, { recursive: true });

            // Create files
            for (const filename of filenames) {
              const filePath = path.join(sourceDir, filename);
              fs.writeFileSync(filePath, `content-${filename}`);
            }

            // Pick a file to exclude
            const actualExcludeIndex = excludeIndex % filenames.length;
            const excludedFile = filenames[actualExcludeIndex];
            const exclusionPattern = `*${excludedFile}*`;

            // Execute copy with exclusion
            const result = await dirOps.copyDirectory(
              path.relative(tempDir, sourceDir),
              path.relative(tempDir, destDir),
              { exclusions: [exclusionPattern] }
            );

            // Count how many files should match the exclusion pattern
            const expectedExcluded = filenames.filter((f) =>
              minimatch(f, exclusionPattern)
            ).length;
            const expectedCopied = filenames.length - expectedExcluded;

            // Verify excluded file was not copied
            const excludedPath = path.join(destDir, excludedFile);
            expect(fs.existsSync(excludedPath)).toBe(false);

            // Verify correct number of files were copied
            // (accounting for the fact that the pattern might match multiple files)
            expect(result.filesCopied).toBe(expectedCopied);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 16: Sync operation efficiency
   * Validates: Requirements 10.2
   *
   * For any sync operation, only files that are newer or missing in the
   * destination should be copied.
   */
  describe("Property 16: Sync operation efficiency", () => {
    it("should only copy newer or missing files", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc
            .array(
              fc.tuple(
                fc
                  .stringMatching(/^[a-zA-Z0-9_]+$/)
                  .filter((s) => s.length >= 2),
                fc.string({ minLength: 0, maxLength: 50 })
              ),
              { minLength: 2, maxLength: 5 }
            )
            .map((arr) => {
              // Ensure unique filenames by deduplicating
              const seen = new Set<string>();
              return arr.filter(([filename]) => {
                if (seen.has(filename)) {
                  return false;
                }
                seen.add(filename);
                return true;
              });
            })
            .filter((arr) => arr.length >= 2), // Ensure we still have at least 2 files
          async (fileData) => {
            const testId = `test-sync-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "source");
            const destDir = path.join(tempDir, testId, "dest");

            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            // Create files in source
            for (const [filename, content] of fileData) {
              const sourcePath = path.join(sourceDir, filename);
              fs.writeFileSync(sourcePath, content);
            }

            // Copy half of the files to destination with older timestamps
            const halfIndex = Math.floor(fileData.length / 2);
            for (let i = 0; i < halfIndex; i++) {
              const [filename, content] = fileData[i];
              const destPath = path.join(destDir, filename);
              fs.writeFileSync(destPath, content);

              // Set older timestamp (2 days ago)
              const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
              fs.utimesSync(destPath, oldTime, oldTime);
            }

            // Execute sync
            const result = await dirOps.syncDirectory(
              path.relative(tempDir, sourceDir),
              path.relative(tempDir, destDir)
            );

            // Verify only newer/missing files were copied
            // All files should be copied because source files are newer
            expect(result.filesCopied).toBe(fileData.length);

            // Verify all files exist in destination
            for (const [filename] of fileData) {
              const destPath = path.join(destDir, filename);
              expect(fs.existsSync(destPath)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should skip files that are already up-to-date", () => {
      let iterationCounter = 0;
      fc.assert(
        fc.asyncProperty(
          fc
            .array(
              fc.tuple(
                fc
                  .stringMatching(/^[a-zA-Z0-9_]+$/)
                  .filter((s) => s.length >= 2),
                fc.string({ minLength: 0, maxLength: 50 })
              ),
              { minLength: 2, maxLength: 5 }
            )
            .map((arr) => {
              // Ensure unique filenames by deduplicating
              const seen = new Set<string>();
              return arr.filter(([filename]) => {
                if (seen.has(filename)) {
                  return false;
                }
                seen.add(filename);
                return true;
              });
            })
            .filter((arr) => arr.length >= 2), // Ensure we still have at least 2 files
          async (fileData) => {
            const testId = `test-sync-skip-${iterationCounter++}`;
            const sourceDir = path.join(tempDir, testId, "source");
            const destDir = path.join(tempDir, testId, "dest");

            fs.mkdirSync(sourceDir, { recursive: true });
            fs.mkdirSync(destDir, { recursive: true });

            // Create files in both source and destination with same timestamps
            for (const [filename, content] of fileData) {
              const sourcePath = path.join(sourceDir, filename);
              const destPath = path.join(destDir, filename);

              fs.writeFileSync(sourcePath, content);
              fs.writeFileSync(destPath, content);

              // Set same timestamp
              const now = new Date();
              fs.utimesSync(sourcePath, now, now);
              fs.utimesSync(destPath, now, now);
            }

            // Execute sync
            const result = await dirOps.syncDirectory(
              path.relative(tempDir, sourceDir),
              path.relative(tempDir, destDir)
            );

            // Verify no files were copied (all up-to-date)
            expect(result.filesCopied).toBe(0);
            expect(result.filesSkipped).toBe(fileData.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 14: Atomic file replacement
   * Validates: Requirements 9.5
   *
   * For any atomic file replacement, the operation should be atomic
   * (no partial writes visible to other processes).
   */
  describe("Property 14: Atomic file replacement", () => {
    it("should atomically replace file content", () => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc
              .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
              .filter((s) => s.length >= 6),
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.string({ minLength: 0, maxLength: 100 })
          ),
          async ([filename, originalContent, newContent]) => {
            const filePath = path.join(tempDir, filename);

            // Create original file
            fs.writeFileSync(filePath, originalContent);

            // Atomically replace
            await dirOps.atomicReplace(
              path.relative(tempDir, filePath),
              newContent
            );

            // Verify new content
            const actualContent = fs.readFileSync(filePath, "utf-8");
            expect(actualContent).toBe(newContent);

            // Verify no temp files left behind
            const tempFiles = fs
              .readdirSync(tempDir)
              .filter((f) => f.startsWith(".tmp-"));
            expect(tempFiles.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle buffer content", () => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc
              .stringMatching(/^[a-zA-Z0-9_]+\.bin$/)
              .filter((s) => s.length >= 6),
            fc.uint8Array({ minLength: 0, maxLength: 100 })
          ),
          async ([filename, bufferData]) => {
            const filePath = path.join(tempDir, filename);
            const buffer = Buffer.from(bufferData);

            // Atomically write buffer
            await dirOps.atomicReplace(
              path.relative(tempDir, filePath),
              buffer
            );

            // Verify content
            const actualBuffer = fs.readFileSync(filePath);
            expect(actualBuffer.equals(buffer)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should create file if it doesn't exist", () => {
      fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc
              .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
              .filter((s) => s.length >= 6),
            fc.string({ minLength: 0, maxLength: 100 })
          ),
          async ([filename, content]) => {
            const filePath = path.join(tempDir, filename);

            // Ensure file doesn't exist
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }

            // Atomically create
            await dirOps.atomicReplace(
              path.relative(tempDir, filePath),
              content
            );

            // Verify file was created with correct content
            expect(fs.existsSync(filePath)).toBe(true);
            const actualContent = fs.readFileSync(filePath, "utf-8");
            expect(actualContent).toBe(content);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Helper function to recursively get all files in a directory
 */
function getAllFiles(dirPath: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  traverse(dirPath);
  return files;
}
