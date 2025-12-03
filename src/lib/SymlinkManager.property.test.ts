/**
 * Property-based tests for SymlinkManager
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SymlinkManager } from "./SymlinkManager";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";
import { SecurityError } from "../types";

describe("SymlinkManager Property-Based Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;
  let symlinkManager: SymlinkManager;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-symlink-test-"));

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
    symlinkManager = new SymlinkManager(securityManager);
  });

  afterEach(() => {
    // Cleanup disabled to prevent race conditions
    // Temp directories will be cleaned up by OS
  });

  /**
   * Feature: mcp-filesystem, Property 8: Symlink creation correctness
   * Validates: Requirements 6.1
   *
   * For any valid symlink request with target within workspace, a symlink
   * should be created pointing to the specified target.
   */
  describe("Property 8: Symlink creation correctness", () => {
    it("should create symlinks for valid targets within workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.string({ minLength: 0, maxLength: 100 })
          ),
          async ([targetName, linkName, content]) => {
            // Create target file
            const targetPath = path.join(tempDir, targetName);
            fs.writeFileSync(targetPath, content);

            // Create symlink
            const linkPath = path.join(tempDir, linkName);
            const result = await symlinkManager.createSymlink(
              linkPath,
              targetPath
            );

            // Verify symlink was created
            expect(result.success).toBe(true);
            expect(fs.existsSync(linkPath)).toBe(true);

            // Verify it's a symlink
            const stats = fs.lstatSync(linkPath);
            expect(stats.isSymbolicLink()).toBe(true);

            // Verify target is correct
            const actualTarget = fs.readlinkSync(linkPath);
            const resolvedActual = path.resolve(
              path.dirname(linkPath),
              actualTarget
            );
            expect(resolvedActual).toBe(path.resolve(targetPath));

            // Cleanup
            fs.unlinkSync(linkPath);
            fs.unlinkSync(targetPath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should create symlinks with relative paths correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_-]+$/)
                .filter((s) => s.length >= 2),
              { minLength: 1, maxLength: 3 }
            ),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([dirPath, targetName, linkName]) => {
            // Create nested directory structure
            const nestedDir = path.join(tempDir, ...dirPath);
            fs.mkdirSync(nestedDir, { recursive: true });

            // Create target file in nested directory
            const targetPath = path.join(nestedDir, targetName);
            fs.writeFileSync(targetPath, "test content");

            // Create symlink in same directory
            const linkPath = path.join(nestedDir, linkName);
            const result = await symlinkManager.createSymlink(
              linkPath,
              targetPath
            );

            // Verify symlink was created
            expect(result.success).toBe(true);
            expect(fs.existsSync(linkPath)).toBe(true);

            // Verify symlink points to correct target
            const stats = fs.lstatSync(linkPath);
            expect(stats.isSymbolicLink()).toBe(true);

            // Verify we can read through the symlink
            const contentThroughLink = fs.readFileSync(linkPath, "utf-8");
            expect(contentThroughLink).toBe("test content");

            // Cleanup
            fs.unlinkSync(linkPath);
            fs.unlinkSync(targetPath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject symlinks to existing paths", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
          async (filename) => {
            // Create a file
            const filePath = path.join(tempDir, filename);
            fs.writeFileSync(filePath, "content");

            // Try to create symlink at same location
            await expect(
              symlinkManager.createSymlink(
                filePath,
                path.join(tempDir, "target")
              )
            ).rejects.toThrow("already exists");

            // Cleanup
            fs.unlinkSync(filePath);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 9: Symlink target validation
   * Validates: Requirements 6.4
   *
   * For any symlink creation request with target outside workspace,
   * the operation should be rejected with a security error.
   */
  describe("Property 9: Symlink target validation", () => {
    it("should reject symlinks with targets outside workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.constantFrom(
              "/etc/passwd",
              "/tmp/outside",
              "../../../etc/passwd"
            )
          ),
          async ([linkName, outsideTarget]) => {
            const linkPath = path.join(tempDir, linkName);

            // Should throw SecurityError for targets outside workspace
            await expect(
              symlinkManager.createSymlink(linkPath, outsideTarget)
            ).rejects.toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept symlinks with targets inside workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([targetName, linkName]) => {
            // Create target file inside workspace
            const targetPath = path.join(tempDir, targetName);
            fs.writeFileSync(targetPath, "content");

            const linkPath = path.join(tempDir, linkName);

            // Should not throw for targets inside workspace
            const result = await symlinkManager.createSymlink(
              linkPath,
              targetPath
            );

            expect(result.success).toBe(true);

            // Cleanup
            fs.unlinkSync(linkPath);
            fs.unlinkSync(targetPath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should validate symlink chains within workspace", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            { minLength: 2, maxLength: 5 }
          ),
          async (linkNames) => {
            // Create final target
            const finalTarget = path.join(tempDir, "final-target");
            fs.writeFileSync(finalTarget, "content");

            // Create chain of symlinks
            let previousTarget = finalTarget;
            const createdLinks: string[] = [];

            for (const linkName of linkNames) {
              const linkPath = path.join(tempDir, linkName);
              await symlinkManager.createSymlink(linkPath, previousTarget);
              createdLinks.push(linkPath);
              previousTarget = linkPath;
            }

            // Verify we can read through the entire chain
            const content = fs.readFileSync(previousTarget, "utf-8");
            expect(content).toBe("content");

            // Cleanup
            for (const link of createdLinks.reverse()) {
              fs.unlinkSync(link);
            }
            fs.unlinkSync(finalTarget);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property tests for symlink resolution
   */
  describe("Symlink resolution properties", () => {
    it("should correctly resolve symlinks to their targets", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([targetName, linkName]) => {
            // Create target file
            const targetPath = path.join(tempDir, targetName);
            fs.writeFileSync(targetPath, "content");

            // Create symlink
            const linkPath = path.join(tempDir, linkName);
            await symlinkManager.createSymlink(linkPath, targetPath);

            // Resolve symlink
            const resolution = await symlinkManager.resolveSymlink(linkPath);

            // Verify resolution
            expect(resolution.exists).toBe(true);
            expect(resolution.isBroken).toBe(false);
            expect(path.resolve(resolution.absoluteTargetPath)).toBe(
              path.resolve(targetPath)
            );

            // Cleanup
            fs.unlinkSync(linkPath);
            fs.unlinkSync(targetPath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should detect broken symlinks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([targetName, linkName]) => {
            // Create target file
            const targetPath = path.join(tempDir, targetName);
            fs.writeFileSync(targetPath, "content");

            // Create symlink
            const linkPath = path.join(tempDir, linkName);
            await symlinkManager.createSymlink(linkPath, targetPath);

            // Delete target to break the symlink
            fs.unlinkSync(targetPath);

            // Resolve symlink
            const resolution = await symlinkManager.resolveSymlink(linkPath);

            // Verify it's detected as broken
            expect(resolution.exists).toBe(false);
            expect(resolution.isBroken).toBe(true);

            // Cleanup
            fs.unlinkSync(linkPath);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property tests for hard links
   */
  describe("Hard link properties", () => {
    it("should create hard links to existing files", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.string({ minLength: 0, maxLength: 100 })
          ),
          async ([sourceName, linkName, content]) => {
            // Create source file
            const sourcePath = path.join(tempDir, sourceName);
            fs.writeFileSync(sourcePath, content);

            // Create hard link
            const linkPath = path.join(tempDir, linkName);
            const result = await symlinkManager.createHardLink(
              linkPath,
              sourcePath
            );

            // Verify hard link was created
            expect(result.success).toBe(true);
            expect(fs.existsSync(linkPath)).toBe(true);

            // Verify content is the same
            const linkContent = fs.readFileSync(linkPath, "utf-8");
            expect(linkContent).toBe(content);

            // Verify they have the same inode (hard link property)
            const sourceStats = fs.statSync(sourcePath);
            const linkStats = fs.statSync(linkPath);
            expect(sourceStats.ino).toBe(linkStats.ino);

            // Cleanup
            fs.unlinkSync(linkPath);
            fs.unlinkSync(sourcePath);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject hard links to non-existent files", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([sourceName, linkName]) => {
            const sourcePath = path.join(tempDir, sourceName);
            const linkPath = path.join(tempDir, linkName);

            // Should throw error for non-existent source
            await expect(
              symlinkManager.createHardLink(linkPath, sourcePath)
            ).rejects.toThrow("does not exist");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject hard links to directories", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2),
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 2)
          ),
          async ([dirName, linkName]) => {
            // Create directory
            const dirPath = path.join(tempDir, dirName);
            fs.mkdirSync(dirPath);

            const linkPath = path.join(tempDir, linkName);

            // Should throw error for directory source
            await expect(
              symlinkManager.createHardLink(linkPath, dirPath)
            ).rejects.toThrow("not a file");

            // Cleanup
            fs.rmdirSync(dirPath);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
