/**
 * Integration tests for MCP Filesystem
 * Tests complete workflows across multiple components
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BatchOperationManager } from "./BatchOperationManager";
import { DirectoryWatcher } from "./DirectoryWatcher";
import { FileIndexer } from "./FileIndexer";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";
import { BatchOperation } from "../interfaces/IBatchOperationManager";
import { SecurityError } from "../types";

describe("MCP Filesystem Integration Tests", () => {
  let tempDir: string;
  let config: SecurityConfig;
  let securityManager: SecurityManager;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-integration-"));

    config = {
      workspaceRoot: tempDir,
      allowedSubdirectories: [],
      blockedPaths: [],
      blockedPatterns: [],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxBatchSize: 1024 * 1024 * 1024, // 1GB
      maxOperationsPerMinute: 100,
      enableAuditLog: false,
      requireConfirmation: false,
      readOnly: false,
    };

    securityManager = new SecurityManager(config);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * 13.1 Test batch operations workflow
   * Requirements: 1.1-1.5
   */
  describe("13.1 Batch Operations Workflow", () => {
    let batchManager: BatchOperationManager;

    beforeEach(() => {
      batchManager = new BatchOperationManager(securityManager);
    });

    it("should execute batch copy workflow", async () => {
      // Setup: Create source files
      const sourceDir = path.join(tempDir, "source");
      const destDir = path.join(tempDir, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });

      const files = ["file1.txt", "file2.txt", "file3.txt"];
      files.forEach((file, idx) => {
        fs.writeFileSync(path.join(sourceDir, file), `Content ${idx}`);
      });

      // Execute: Batch copy
      const operations: BatchOperation[] = files.map((file) => ({
        type: "copy",
        source: path.relative(tempDir, path.join(sourceDir, file)),
        destination: path.relative(tempDir, path.join(destDir, file)),
      }));

      const results = await batchManager.executeBatch(operations, false);

      // Verify: All operations succeeded
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Verify: All files copied
      files.forEach((file, idx) => {
        const destPath = path.join(destDir, file);
        expect(fs.existsSync(destPath)).toBe(true);
        expect(fs.readFileSync(destPath, "utf-8")).toBe(`Content ${idx}`);
      });

      // Verify: Source files still exist
      files.forEach((file) => {
        expect(fs.existsSync(path.join(sourceDir, file))).toBe(true);
      });
    });

    it("should execute batch move workflow", async () => {
      // Setup: Create source files
      const sourceDir = path.join(tempDir, "source");
      const destDir = path.join(tempDir, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });

      const files = ["file1.txt", "file2.txt"];
      files.forEach((file, idx) => {
        fs.writeFileSync(path.join(sourceDir, file), `Content ${idx}`);
      });

      // Execute: Batch move
      const operations: BatchOperation[] = files.map((file) => ({
        type: "move",
        source: path.relative(tempDir, path.join(sourceDir, file)),
        destination: path.relative(tempDir, path.join(destDir, file)),
      }));

      const results = await batchManager.executeBatch(operations, false);

      // Verify: All operations succeeded
      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Verify: Files moved to destination
      files.forEach((file, idx) => {
        const destPath = path.join(destDir, file);
        expect(fs.existsSync(destPath)).toBe(true);
        expect(fs.readFileSync(destPath, "utf-8")).toBe(`Content ${idx}`);
      });

      // Verify: Source files no longer exist
      files.forEach((file) => {
        expect(fs.existsSync(path.join(sourceDir, file))).toBe(false);
      });
    });

    it("should execute batch delete workflow", async () => {
      // Setup: Create files to delete
      const testDir = path.join(tempDir, "test");
      fs.mkdirSync(testDir, { recursive: true });

      const files = ["file1.txt", "file2.txt", "file3.txt"];
      files.forEach((file) => {
        fs.writeFileSync(path.join(testDir, file), "content");
      });

      // Execute: Batch delete
      const operations: BatchOperation[] = files.map((file) => ({
        type: "delete",
        source: path.relative(tempDir, path.join(testDir, file)),
      }));

      const results = await batchManager.executeBatch(operations, false);

      // Verify: All operations succeeded
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Verify: All files deleted
      files.forEach((file) => {
        expect(fs.existsSync(path.join(testDir, file))).toBe(false);
      });
    });

    it("should handle atomic rollback on failure", async () => {
      // Setup: Create some source files, but not all
      const sourceDir = path.join(tempDir, "source");
      const destDir = path.join(tempDir, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });

      // Create only 2 out of 3 files
      fs.writeFileSync(path.join(sourceDir, "file1.txt"), "Content 1");
      fs.writeFileSync(path.join(sourceDir, "file2.txt"), "Content 2");
      // file3.txt intentionally missing

      // Execute: Batch move in atomic mode (should fail and rollback)
      const operations: BatchOperation[] = [
        {
          type: "move",
          source: path.relative(tempDir, path.join(sourceDir, "file1.txt")),
          destination: path.relative(tempDir, path.join(destDir, "file1.txt")),
        },
        {
          type: "move",
          source: path.relative(tempDir, path.join(sourceDir, "file2.txt")),
          destination: path.relative(tempDir, path.join(destDir, "file2.txt")),
        },
        {
          type: "move",
          source: path.relative(tempDir, path.join(sourceDir, "file3.txt")),
          destination: path.relative(tempDir, path.join(destDir, "file3.txt")),
        },
      ];

      // Verify: Operation throws error
      await expect(
        batchManager.executeBatch(operations, true)
      ).rejects.toThrow();

      // Verify: Rollback occurred - source files still exist
      expect(fs.existsSync(path.join(sourceDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(sourceDir, "file2.txt"))).toBe(true);

      // Verify: No destination files exist
      expect(fs.existsSync(path.join(destDir, "file1.txt"))).toBe(false);
      expect(fs.existsSync(path.join(destDir, "file2.txt"))).toBe(false);
      expect(fs.existsSync(path.join(destDir, "file3.txt"))).toBe(false);
    });
  });

  /**
   * 13.2 Test directory watching workflow
   * Requirements: 2.1-2.5
   */
  describe("13.2 Directory Watching Workflow", () => {
    let watcher: DirectoryWatcher;

    beforeEach(() => {
      watcher = new DirectoryWatcher();
    });

    afterEach(async () => {
      // Clean up all watch sessions
      try {
        await watcher.stopAll();
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it("should detect file creation events", async () => {
      // Setup: Create watch directory
      const watchDir = path.join(tempDir, "watch");
      fs.mkdirSync(watchDir, { recursive: true });

      // Execute: Start watching
      const sessionId = "test-session-1";
      await watcher.watch(sessionId, watchDir, {
        recursive: false,
        filters: [],
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create a file
      fs.writeFileSync(path.join(watchDir, "newfile.txt"), "content");

      // Wait for event to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify: Event detected
      const events = watcher.getEvents(sessionId);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "create")).toBe(true);
    });

    it("should detect file modification events", async () => {
      // Setup: Create watch directory and file
      const watchDir = path.join(tempDir, "watch");
      fs.mkdirSync(watchDir, { recursive: true });
      const testFile = path.join(watchDir, "testfile.txt");
      fs.writeFileSync(testFile, "initial content");

      // Execute: Start watching
      const sessionId = "test-session-2";
      await watcher.watch(sessionId, watchDir, {
        recursive: false,
        filters: [],
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Modify the file
      fs.writeFileSync(testFile, "modified content");

      // Wait for event to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify: Event detected
      const events = watcher.getEvents(sessionId);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "modify")).toBe(true);
    });

    it("should detect file deletion events", async () => {
      // Setup: Create watch directory and file
      const watchDir = path.join(tempDir, "watch");
      fs.mkdirSync(watchDir, { recursive: true });
      const testFile = path.join(watchDir, "testfile.txt");
      fs.writeFileSync(testFile, "content");

      // Execute: Start watching
      const sessionId = "test-session-3";
      await watcher.watch(sessionId, watchDir, {
        recursive: false,
        filters: [],
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Delete the file
      fs.unlinkSync(testFile);

      // Wait for event to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify: Event detected
      const events = watcher.getEvents(sessionId);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === "delete")).toBe(true);
    });

    it("should filter events by pattern", async () => {
      // Setup: Create watch directory
      const watchDir = path.join(tempDir, "watch");
      fs.mkdirSync(watchDir, { recursive: true });

      // Execute: Start watching with filter (use full path pattern)
      const sessionId = "test-session-4";
      await watcher.watch(sessionId, watchDir, {
        recursive: false,
        filters: ["**/*.txt"],
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create files with different extensions
      fs.writeFileSync(path.join(watchDir, "file.txt"), "content");
      fs.writeFileSync(path.join(watchDir, "file.js"), "content");

      // Wait for events to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify: Only .txt file event detected
      const events = watcher.getEvents(sessionId);
      const txtEvents = events.filter((e) => e.path.endsWith(".txt"));
      const jsEvents = events.filter((e) => e.path.endsWith(".js"));

      // At least one .txt event should be detected
      expect(txtEvents.length).toBeGreaterThan(0);
      // No .js events should be detected
      expect(jsEvents.length).toBe(0);
    });

    it("should watch directories recursively", async () => {
      // Setup: Create nested directory structure
      const watchDir = path.join(tempDir, "watch");
      const subDir = path.join(watchDir, "subdir");
      fs.mkdirSync(subDir, { recursive: true });

      // Execute: Start watching recursively
      const sessionId = "test-session-5";
      await watcher.watch(sessionId, watchDir, {
        recursive: true,
        filters: [],
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create file in subdirectory
      fs.writeFileSync(path.join(subDir, "nested.txt"), "content");

      // Wait for event to be detected
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify: Event detected in subdirectory
      const events = watcher.getEvents(sessionId);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.path.includes("subdir"))).toBe(true);
    });
  });

  /**
   * 13.3 Test search and indexing workflow
   * Requirements: 3.1-3.5, 4.1-4.4
   */
  describe("13.3 Search and Indexing Workflow", () => {
    let indexer: FileIndexer;

    beforeEach(() => {
      indexer = new FileIndexer();
    });

    it("should build index and search by filename", async () => {
      // Setup: Create test files
      const testDir = path.join(tempDir, "search");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "test1.txt"), "content 1");
      fs.writeFileSync(path.join(testDir, "test2.txt"), "content 2");
      fs.writeFileSync(path.join(testDir, "other.js"), "content 3");

      // Execute: Build index
      await indexer.buildIndex(testDir, false);

      // Execute: Search by filename
      const results = await indexer.search({
        query: "test",
        searchType: "name",
        fileTypes: [],
      });

      // Verify: Found matching files
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.path.includes("test1.txt"))).toBe(true);
      expect(results.some((r) => r.path.includes("test2.txt"))).toBe(true);
    });

    it("should search file content when indexed", async () => {
      // Setup: Create test files with specific content
      const testDir = path.join(tempDir, "search");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "file1.txt"), "hello world");
      fs.writeFileSync(path.join(testDir, "file2.txt"), "goodbye world");
      fs.writeFileSync(path.join(testDir, "file3.txt"), "something else");

      // Execute: Build index with content
      await indexer.buildIndex(testDir, true);

      // Execute: Search by content
      const results = await indexer.search({
        query: "world",
        searchType: "content",
        fileTypes: [],
      });

      // Verify: Found files containing "world"
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.path.includes("file1.txt"))).toBe(true);
      expect(results.some((r) => r.path.includes("file2.txt"))).toBe(true);
      expect(results.some((r) => r.path.includes("file3.txt"))).toBe(false);
    });

    it("should filter search results by file type", async () => {
      // Setup: Create files with different extensions
      const testDir = path.join(tempDir, "search");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "file.txt"), "content");
      fs.writeFileSync(path.join(testDir, "file.js"), "content");
      fs.writeFileSync(path.join(testDir, "file.md"), "content");

      // Execute: Build index
      await indexer.buildIndex(testDir, false);

      // Execute: Search with file type filter
      const results = await indexer.search({
        query: "file",
        searchType: "name",
        fileTypes: [".txt", ".md"],
      });

      // Verify: Only .txt and .md files returned
      expect(results.every((r) => r.type === ".txt" || r.type === ".md")).toBe(
        true
      );
      expect(results.some((r) => r.type === ".js")).toBe(false);
    });

    it("should update index when files change", async () => {
      // Setup: Create initial files
      const testDir = path.join(tempDir, "search");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "file1.txt"), "initial");

      // Execute: Build initial index
      await indexer.buildIndex(testDir, true);

      // Verify: Initial search
      let results = await indexer.search({
        query: "initial",
        searchType: "content",
        fileTypes: [],
      });
      expect(results.length).toBeGreaterThan(0);

      // Execute: Add new file and update index
      fs.writeFileSync(path.join(testDir, "file2.txt"), "updated content");
      await indexer.updateFile(path.join(testDir, "file2.txt"));

      // Verify: New file searchable
      results = await indexer.search({
        query: "updated",
        searchType: "content",
        fileTypes: [],
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path.includes("file2.txt"))).toBe(true);
    });

    it("should provide index statistics", async () => {
      // Setup: Create test files
      const testDir = path.join(tempDir, "search");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "file1.txt"), "a".repeat(100));
      fs.writeFileSync(path.join(testDir, "file2.txt"), "b".repeat(200));

      // Execute: Build index
      await indexer.buildIndex(testDir, false);

      // Execute: Get statistics
      const stats = indexer.getStatistics();

      // Verify: Statistics are accurate
      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(300);
      expect(stats.lastUpdate).toBeDefined();
    });
  });

  /**
   * 13.4 Test security policy enforcement
   * Requirements: 11.1-11.5, 13.1-13.5
   */
  describe("13.4 Security Policy Enforcement", () => {
    it("should enforce workspace boundary across all operations", async () => {
      // Setup: Create batch manager and source file
      const batchManager = new BatchOperationManager(securityManager);
      const sourceFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(sourceFile, "content");

      // Execute: Try to copy file outside workspace
      const operations: BatchOperation[] = [
        {
          type: "copy",
          source: "test.txt",
          destination: "../../outside/test.txt",
        },
      ];

      // Verify: Operation rejected
      const results = await batchManager.executeBatch(operations, false);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it("should prevent path traversal attacks", () => {
      // Test various path traversal attempts
      const traversalPaths = [
        "../../../etc/passwd",
        "..\\..\\..\\Windows\\System32",
        "./../../outside",
        "subdir/../../outside",
      ];

      traversalPaths.forEach((testPath) => {
        expect(() => {
          securityManager.validatePath(testPath, "read");
        }).toThrow();
      });
    });

    it("should validate symlink targets", () => {
      // Setup: Create a file inside workspace
      const targetFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(targetFile, "content");

      // Execute: Validate symlink to file inside workspace
      expect(() => {
        securityManager.validateSymlink("link.txt", "target.txt");
      }).not.toThrow();

      // Execute: Try to create symlink to file outside workspace
      expect(() => {
        securityManager.validateSymlink("link.txt", "/etc/passwd");
      }).toThrow();
    });

    it("should enforce rate limiting", () => {
      // Setup: Configure low rate limit
      const limitedConfig: SecurityConfig = {
        ...config,
        maxOperationsPerMinute: 5,
      };
      const limitedManager = new SecurityManager(limitedConfig);

      // Execute: Perform operations up to limit
      for (let i = 0; i < 5; i++) {
        expect(() => {
          limitedManager.checkRateLimit("test-agent");
        }).not.toThrow();
      }

      // Execute: Exceed rate limit
      expect(() => {
        limitedManager.checkRateLimit("test-agent");
      }).toThrow();
    });

    it("should block access to system directories", () => {
      // System paths are blocked by workspace boundary check (Layer 2)
      // since they're absolute paths outside the workspace
      // Use platform-appropriate paths
      const systemPaths =
        process.platform === "win32"
          ? ["C:\\Windows\\System32", "C:\\Program Files"]
          : ["/etc/passwd", "/sys/kernel", "/proc/cpuinfo"];

      systemPaths.forEach((systemPath) => {
        expect(() => {
          securityManager.validatePath(systemPath, "read");
        }).toThrow();
      });
    });

    it("should block access to sensitive files", () => {
      // Setup: Create files with sensitive patterns
      const sensitiveDir = path.join(tempDir, ".ssh");
      fs.mkdirSync(sensitiveDir, { recursive: true });

      // Execute: Try to access sensitive files
      expect(() => {
        securityManager.validatePath(".ssh/id_rsa", "read");
      }).toThrow();

      expect(() => {
        securityManager.validatePath("config.env", "read");
      }).toThrow();

      expect(() => {
        securityManager.validatePath("secret.key", "read");
      }).toThrow();
    });

    it("should enforce read-only mode", () => {
      // Setup: Configure read-only mode
      const readOnlyConfig: SecurityConfig = {
        ...config,
        readOnly: true,
      };
      const readOnlyManager = new SecurityManager(readOnlyConfig);

      // Execute: Read operations should succeed
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      expect(() => {
        readOnlyManager.validatePath("test.txt", "read");
      }).not.toThrow();

      // Execute: Write operations should fail
      expect(() => {
        readOnlyManager.validatePath("test.txt", "write");
      }).toThrow();

      expect(() => {
        readOnlyManager.validatePath("test.txt", "delete");
      }).toThrow();
    });

    it("should respect allowed subdirectories", () => {
      // Setup: Configure allowed subdirectories
      const restrictedConfig: SecurityConfig = {
        ...config,
        allowedSubdirectories: ["allowed"],
      };
      const restrictedManager = new SecurityManager(restrictedConfig);

      // Setup: Create directories
      fs.mkdirSync(path.join(tempDir, "allowed"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "blocked"), { recursive: true });

      // Execute: Access to allowed subdirectory should succeed
      expect(() => {
        restrictedManager.validatePath("allowed/file.txt", "read");
      }).not.toThrow();

      // Execute: Access to non-allowed subdirectory should fail
      expect(() => {
        restrictedManager.validatePath("blocked/file.txt", "read");
      }).toThrow();
    });
  });
});
