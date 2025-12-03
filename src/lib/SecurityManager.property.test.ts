/**
 * Property-based tests for SecurityManager
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";
import { SecurityError } from "../types";

describe("SecurityManager Property-Based Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-test-"));

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
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Feature: mcp-filesystem, Property 13: Path traversal prevention
   * Validates: Requirements 9.2
   *
   * For any path containing traversal sequences (..), the operation should
   * be rejected with a path validation error.
   */
  describe("Property 13: Path traversal prevention", () => {
    it("should reject all paths with .. sequences", () => {
      fc.assert(
        fc.property(
          // Generate paths with various .. patterns
          fc.oneof(
            // Simple parent directory references
            fc.string({ minLength: 1 }).map((s) => `../${s}`),
            fc.string({ minLength: 1 }).map((s) => `../../${s}`),
            fc.string({ minLength: 1 }).map((s) => `../../../${s}`),
            // .. in the middle of paths
            fc
              .tuple(
                fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
                fc.stringMatching(/^[a-zA-Z0-9_-]+$/)
              )
              .map(([a, b]) => `${a}/../${b}`),
            // Multiple .. sequences
            fc
              .array(fc.constant(".."), { minLength: 1, maxLength: 10 })
              .map((arr) => arr.join("/")),
            // .. with ./ combinations
            fc.string({ minLength: 1 }).map((s) => `./../${s}`),
            fc.string({ minLength: 1 }).map((s) => `./../../${s}`)
          ),
          (traversalPath) => {
            // Should throw SecurityError for any path with .. sequences
            expect(() => {
              securityManager.validatePath(traversalPath, "read");
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject paths with ./ sequences", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1 }).map((s) => `./${s}`),
            fc
              .tuple(
                fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
                fc.stringMatching(/^[a-zA-Z0-9_-]+$/)
              )
              .map(([a, b]) => `${a}/./${b}`)
          ),
          (traversalPath) => {
            // Should throw SecurityError for paths with ./ sequences
            expect(() => {
              securityManager.validatePath(traversalPath, "read");
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject paths with backslash traversal (Windows-style)", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1 }).map((s) => `..\\${s}`),
            fc.string({ minLength: 1 }).map((s) => `.\\${s}`)
          ),
          (traversalPath) => {
            // Should throw SecurityError for Windows-style traversal
            expect(() => {
              securityManager.validatePath(traversalPath, "read");
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 12: Workspace boundary enforcement
   * Validates: Requirements 9.1
   *
   * For any file path, operations should only succeed if the resolved path
   * is within the workspace root.
   */
  describe("Property 12: Workspace boundary enforcement", () => {
    it("should accept all paths within workspace", () => {
      fc.assert(
        fc.property(
          // Generate arbitrary paths within the workspace
          fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), {
            minLength: 1,
            maxLength: 5,
          }),
          (pathSegments) => {
            const testPath = path.join(...pathSegments);

            // Should not throw for paths within workspace
            const resolved = securityManager.validatePath(testPath, "read");

            // Resolved path must start with workspace root
            expect(resolved.startsWith(tempDir)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject all paths outside workspace", () => {
      fc.assert(
        fc.property(
          // Generate paths that escape the workspace
          fc.oneof(
            // Absolute paths outside workspace (platform-specific)
            fc.constantFrom(
              process.platform === "win32"
                ? "C:\\Windows\\System32"
                : "/etc/passwd",
              process.platform === "win32" ? "D:\\outside" : "/tmp/outside"
            ),
            // Paths with parent directory traversal
            fc.string({ minLength: 1 }).map((s) => `../${s}`),
            fc.string({ minLength: 1 }).map((s) => `../../${s}`),
            // Paths that try to escape via multiple segments
            fc
              .array(fc.constant(".."), { minLength: 10, maxLength: 20 })
              .map((arr) => arr.join("/"))
          ),
          (escapePath) => {
            // Should throw SecurityError for paths outside workspace
            expect(() => {
              securityManager.validatePath(escapePath, "read");
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle complex path manipulations", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
              fc.constant(".."),
              fc.constant(".")
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (pathSegments) => {
            const testPath = path.join(...pathSegments);
            const resolved = path.resolve(tempDir, testPath);

            // If resolved path is within workspace, validation should succeed
            // Otherwise, it should throw
            if (
              resolved.startsWith(tempDir + path.sep) ||
              resolved === tempDir
            ) {
              const validatedPath = securityManager.validatePath(
                testPath,
                "read"
              );
              expect(validatedPath.startsWith(tempDir)).toBe(true);
            } else {
              expect(() => {
                securityManager.validatePath(testPath, "read");
              }).toThrow(SecurityError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 18: Symlink security enforcement
   * Validates: Requirements 11.2
   *
   * For any symbolic link pointing outside the workspace, operations on
   * that link should be rejected.
   */
  describe("Property 18: Symlink security enforcement", () => {
    it("should reject symlinks with targets outside workspace", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
            fc.oneof(
              // Absolute paths outside workspace
              fc.constantFrom(
                process.platform === "win32"
                  ? "C:\\Windows\\System32"
                  : "/etc/passwd",
                process.platform === "win32" ? "D:\\outside" : "/tmp/outside"
              ),
              // Relative paths that escape
              fc.string({ minLength: 1 }).map((s) => `../../${s}`),
              fc
                .array(fc.constant(".."), { minLength: 5, maxLength: 10 })
                .map((arr) => arr.join("/"))
            )
          ),
          ([linkName, targetPath]) => {
            const linkPath = path.join("links", linkName);

            // Should throw SecurityError for symlinks pointing outside workspace
            expect(() => {
              securityManager.validateSymlink(linkPath, targetPath);
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept symlinks with targets inside workspace", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 999 }),
            fc.array(fc.stringMatching(/^[a-zA-Z0-9]+$/), {
              minLength: 1,
              maxLength: 3,
            })
          ),
          ([linkId, targetSegments]) => {
            // Use unique names to avoid conflicts between test runs
            const linkPath = path.join("links", `link-${linkId}`);
            const targetPath = path.join(
              "targets",
              `run-${linkId}`,
              ...targetSegments
            );

            // Create the target file
            const fullTargetPath = path.join(tempDir, targetPath);
            fs.mkdirSync(path.dirname(fullTargetPath), { recursive: true });
            fs.writeFileSync(fullTargetPath, "test content");

            // Should not throw for symlinks pointing inside workspace
            expect(() => {
              securityManager.validateSymlink(linkPath, targetPath);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle symlink chains within workspace", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), {
            minLength: 2,
            maxLength: 4,
          }),
          (pathSegments) => {
            // Create a chain of symlinks within workspace
            const basePath = path.join(tempDir, "symlinks");
            fs.mkdirSync(basePath, { recursive: true });

            // Create the final target
            const finalTarget = path.join(
              basePath,
              pathSegments[pathSegments.length - 1]
            );
            fs.writeFileSync(finalTarget, "content");

            // Create symlink chain
            for (let i = 0; i < pathSegments.length - 1; i++) {
              const linkPath = path.join(basePath, pathSegments[i]);
              const targetPath = pathSegments[i + 1];

              // Validate each symlink in the chain
              expect(() => {
                securityManager.validateSymlink(
                  path.relative(tempDir, linkPath),
                  targetPath
                );
              }).not.toThrow();
            }
          }
        ),
        { numRuns: 50 } // Fewer runs due to filesystem operations
      );
    });
  });
});
