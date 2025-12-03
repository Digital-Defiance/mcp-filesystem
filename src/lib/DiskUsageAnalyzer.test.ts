/**
 * Unit tests for DiskUsageAnalyzer
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DiskUsageAnalyzer } from "./DiskUsageAnalyzer";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig } from "../interfaces/ISecurityManager";

describe("DiskUsageAnalyzer", () => {
  let analyzer: DiskUsageAnalyzer;
  let securityManager: SecurityManager;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "disk-usage-test-"));

    const config: SecurityConfig = {
      workspaceRoot: testDir,
      blockedPaths: [],
      blockedPatterns: [],
      maxFileSize: 100 * 1024 * 1024,
      maxBatchSize: 1024 * 1024 * 1024,
      maxOperationsPerMinute: 100,
      enableAuditLog: false,
      requireConfirmation: false,
      readOnly: false,
    };

    securityManager = new SecurityManager(config);
    analyzer = new DiskUsageAnalyzer(securityManager);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("calculateDirectorySize", () => {
    it("should calculate size of empty directory", async () => {
      const size = await analyzer.calculateDirectorySize(testDir);
      expect(size).toBe(0);
    });

    it("should calculate size of directory with files", async () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, "file1.txt"), "Hello");
      fs.writeFileSync(path.join(testDir, "file2.txt"), "World");

      const size = await analyzer.calculateDirectorySize(testDir);
      expect(size).toBe(10); // "Hello" (5) + "World" (5)
    });

    it("should calculate size recursively", async () => {
      // Create nested structure
      const subDir = path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(testDir, "file1.txt"), "Hello");
      fs.writeFileSync(path.join(subDir, "file2.txt"), "World");

      const size = await analyzer.calculateDirectorySize(testDir);
      expect(size).toBe(10);
    });

    it("should respect depth limit", async () => {
      // Create nested structure
      const subDir = path.join(testDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(testDir, "file1.txt"), "Hello");
      fs.writeFileSync(path.join(subDir, "file2.txt"), "World");

      const size = await analyzer.calculateDirectorySize(testDir, 1);
      expect(size).toBe(5); // Only file1.txt at depth 0
    });
  });

  describe("analyzeDiskUsage", () => {
    it("should analyze empty directory", async () => {
      const report = await analyzer.analyzeDiskUsage(testDir);

      expect(report.path).toBe(testDir);
      expect(report.totalSize).toBe(0);
      expect(report.fileCount).toBe(0);
      expect(report.largestFiles).toEqual([]);
      expect(report.largestDirectories).toEqual([]);
    });

    it("should analyze directory with files", async () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, "file1.txt"), "Hello");
      fs.writeFileSync(path.join(testDir, "file2.txt"), "World!");

      const report = await analyzer.analyzeDiskUsage(testDir);

      expect(report.path).toBe(testDir);
      expect(report.totalSize).toBe(11);
      expect(report.fileCount).toBe(2);
      expect(report.largestFiles.length).toBe(2);
      expect(report.largestFiles[0].size).toBe(6); // "World!" is larger
    });

    it("should group by file type when requested", async () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, "file1.txt"), "Hello");
      fs.writeFileSync(path.join(testDir, "file2.txt"), "World");
      fs.writeFileSync(path.join(testDir, "file3.md"), "Test");

      const report = await analyzer.analyzeDiskUsage(testDir, Infinity, true);

      expect(report.fileTypeBreakdown).toBeDefined();
      expect(report.fileTypeBreakdown?.get(".txt")).toBe(10);
      expect(report.fileTypeBreakdown?.get(".md")).toBe(4);
    });

    it("should identify largest files", async () => {
      // Create files of different sizes
      fs.writeFileSync(path.join(testDir, "small.txt"), "Hi");
      fs.writeFileSync(path.join(testDir, "medium.txt"), "Hello World");
      fs.writeFileSync(
        path.join(testDir, "large.txt"),
        "This is a larger file"
      );

      const report = await analyzer.analyzeDiskUsage(testDir);

      expect(report.largestFiles.length).toBe(3);
      expect(report.largestFiles[0].path).toContain("large.txt");
      expect(report.largestFiles[0].size).toBe(21); // "This is a larger file" is 21 chars
    });
  });

  describe("getDiskSpace", () => {
    it("should get disk space for workspace root", async () => {
      const spaceInfo = await analyzer.getDiskSpace();

      expect(spaceInfo.total).toBeGreaterThan(0);
      expect(spaceInfo.available).toBeGreaterThan(0);
      expect(spaceInfo.used).toBeGreaterThanOrEqual(0);
      expect(spaceInfo.percentUsed).toBeGreaterThanOrEqual(0);
      expect(spaceInfo.percentUsed).toBeLessThanOrEqual(100);
    });

    it("should get disk space for specific path", async () => {
      const spaceInfo = await analyzer.getDiskSpace(testDir);

      expect(spaceInfo.total).toBeGreaterThan(0);
      expect(spaceInfo.available).toBeGreaterThan(0);
    });
  });
});
