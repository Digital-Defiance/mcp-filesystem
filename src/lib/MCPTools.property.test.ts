/**
 * Property-based tests for MCPTools
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCPTools } from "./MCPTools";
import { SecurityManager } from "./SecurityManager";
import { BatchOperationManager } from "./BatchOperationManager";
import { DirectoryWatcher } from "./DirectoryWatcher";
import { FileIndexer } from "./FileIndexer";
import { ChecksumManager } from "./ChecksumManager";
import { DiskUsageAnalyzer } from "./DiskUsageAnalyzer";
import { SymlinkManager } from "./SymlinkManager";
import { DirectoryOperations } from "./DirectoryOperations";
import { SecurityConfig } from "../interfaces/ISecurityManager";
import { SecurityError } from "../types";

describe("MCPTools Property-Based Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;
  let mcpTools: MCPTools;

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
    const batchOperationManager = new BatchOperationManager(securityManager);
    const directoryWatcher = new DirectoryWatcher();
    const fileIndexer = new FileIndexer();
    const checksumManager = new ChecksumManager();
    const diskUsageAnalyzer = new DiskUsageAnalyzer(securityManager);
    const symlinkManager = new SymlinkManager(securityManager);
    const directoryOperations = new DirectoryOperations(securityManager);

    mcpTools = new MCPTools(
      securityManager,
      batchOperationManager,
      directoryWatcher,
      fileIndexer,
      checksumManager,
      diskUsageAnalyzer,
      symlinkManager,
      directoryOperations
    );
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Feature: mcp-filesystem, Property 17: Workspace root enforcement at startup
   * Validates: Requirements 11.1
   *
   * For any MCP Server instance, operations outside the configured workspace
   * root should be rejected.
   */
  describe("Property 17: Workspace root enforcement at startup", () => {
    it("should reject all paths outside workspace root", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate paths that are definitely outside the workspace
          fc.oneof(
            // Absolute paths to system directories
            fc.constantFrom("/etc", "/sys", "/proc", "/dev", "/root"),
            // Paths to parent directories
            fc.constant(path.dirname(tempDir)),
            fc.constant(path.dirname(path.dirname(tempDir))),
            // Paths to sibling directories
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(path.dirname(tempDir), s)),
            // Absolute paths to other temp directories
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(os.tmpdir(), s))
              .filter((p) => !p.startsWith(tempDir))
          ),
          async (outsidePath) => {
            // Test various tools that accept paths

            // Test fs_batch_operations
            await expect(
              mcpTools.fsBatchOperations({
                operations: [
                  {
                    type: "copy",
                    source: outsidePath,
                    destination: path.join(tempDir, "dest"),
                  },
                ],
                atomic: true,
              })
            ).rejects.toThrow();

            // Test fs_watch_directory
            await expect(
              mcpTools.fsWatchDirectory({
                path: outsidePath,
                recursive: false,
              })
            ).rejects.toThrow();

            // Test fs_build_index
            await expect(
              mcpTools.fsBuildIndex({
                path: outsidePath,
                includeContent: false,
              })
            ).rejects.toThrow();

            // Test fs_analyze_disk_usage
            await expect(
              mcpTools.fsAnalyzeDiskUsage({
                path: outsidePath,
                depth: 1,
              })
            ).rejects.toThrow();

            // Test fs_copy_directory
            await expect(
              mcpTools.fsCopyDirectory({
                source: outsidePath,
                destination: path.join(tempDir, "dest"),
              })
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept all paths inside workspace root", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid paths inside the workspace
          fc
            .array(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), {
              minLength: 0,
              maxLength: 3,
            })
            .map((parts) => {
              const relativePath = parts.join("/");
              return relativePath ? path.join(tempDir, relativePath) : tempDir;
            }),
          async (insidePath) => {
            // Create the directory if it doesn't exist
            if (!fs.existsSync(insidePath)) {
              fs.mkdirSync(insidePath, { recursive: true });
            }

            // Test fs_watch_directory - should not throw
            const watchResult = await mcpTools.fsWatchDirectory({
              path: insidePath,
              recursive: false,
            });
            expect(watchResult.status).toBe("success");
            expect(watchResult.sessionId).toBeDefined();

            // Clean up watch session
            await mcpTools.fsStopWatch({
              sessionId: watchResult.sessionId,
            });

            // Test fs_build_index - should not throw
            const indexResult = await mcpTools.fsBuildIndex({
              path: insidePath,
              includeContent: false,
            });
            expect(indexResult.status).toBe("success");

            // Test fs_analyze_disk_usage - should not throw
            const usageResult = await mcpTools.fsAnalyzeDiskUsage({
              path: insidePath,
              depth: 1,
            });
            expect(usageResult.status).toBe("success");
          }
        ),
        { numRuns: 50 } // Fewer runs since we're creating directories
      );
    });

    it("should enforce workspace boundary for all batch operations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate operations with paths outside workspace
          fc.array(
            fc.record({
              type: fc.constantFrom("copy", "move", "delete"),
              source: fc
                .string({ minLength: 1, maxLength: 20 })
                .map((s) => path.join(path.dirname(tempDir), s)),
              destination: fc
                .string({ minLength: 1, maxLength: 20 })
                .map((s) => path.join(path.dirname(tempDir), s)),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (operations) => {
            // All operations with paths outside workspace should be rejected
            await expect(
              mcpTools.fsBatchOperations({
                operations: operations.map((op) => ({
                  type: op.type as "copy" | "move" | "delete",
                  source: op.source,
                  destination: op.destination,
                })),
                atomic: true,
              })
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should validate both source and destination in copy operations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            // Generate source path (outside workspace)
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(path.dirname(tempDir), s)),
            // Generate destination path (inside workspace)
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(tempDir, s))
          ),
          async ([outsideSource, insideDest]) => {
            // Should reject because source is outside workspace
            await expect(
              mcpTools.fsCopyDirectory({
                source: outsideSource,
                destination: insideDest,
              })
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should validate destination in copy operations", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            // Generate source path (inside workspace)
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(tempDir, s)),
            // Generate destination path (outside workspace)
            fc
              .string({ minLength: 1, maxLength: 20 })
              .map((s) => path.join(path.dirname(tempDir), s))
          ),
          async ([insideSource, outsideDest]) => {
            // Create source directory
            if (!fs.existsSync(insideSource)) {
              fs.mkdirSync(insideSource, { recursive: true });
            }

            // Should reject because destination is outside workspace
            await expect(
              mcpTools.fsCopyDirectory({
                source: insideSource,
                destination: outsideDest,
              })
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
