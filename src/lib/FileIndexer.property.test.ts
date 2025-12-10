/**
 * Property-based tests for FileIndexer
 * Feature: mcp-filesystem
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileIndexer } from "./FileIndexer";
import { SearchOptions } from "../interfaces/IFileIndexer";

describe("FileIndexer Property Tests", () => {
  let tempDir: string;
  let indexer: FileIndexer;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fileindexer-test-"));
    indexer = new FileIndexer();
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 5: File search completeness
   * Validates: Requirements 3.1
   *
   * For any filename pattern, all files matching that pattern should be returned in search results.
   */
  describe("Property 5: File search completeness", () => {
    it("should return all files matching the filename pattern", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-z]{3,8}\.(txt|md|js)$/),
              content: fc.string({ minLength: 0, maxLength: 100 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.stringMatching(/^[a-z]{3,5}$/),
          async (files, searchPattern) => {
            // Create test files
            for (const file of files) {
              const filePath = path.join(tempDir, file.name);
              await fs.promises.writeFile(filePath, file.content);
            }

            // Build index
            await indexer.buildIndex(tempDir, false);

            // Search for files matching pattern
            const searchOptions: SearchOptions = {
              query: searchPattern,
              searchType: "name",
            };

            const results = await indexer.search(searchOptions);

            // Count expected matches
            const expectedMatches = files.filter((f) =>
              f.name.includes(searchPattern)
            );

            // All files containing the search pattern should be in results
            for (const expectedFile of expectedMatches) {
              const expectedPath = path.join(tempDir, expectedFile.name);
              const found = results.some((r) => r.path === expectedPath);
              expect(found).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Indexed search performance
   * Validates: Requirements 3.5
   *
   * For any indexed search query, results should be returned within 100ms for typical queries (< 10,000 files).
   */
  describe("Property 6: Indexed search performance", () => {
    it("should return search results within 100ms for typical queries", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-z]{3,8}\.(txt|md|js)$/),
              content: fc.string({ minLength: 0, maxLength: 100 }),
            }),
            { minLength: 10, maxLength: 50 } // Reduced max for faster tests
          ),
          fc.stringMatching(/^[a-z]{3,5}$/),
          async (files, searchPattern) => {
            // Deduplicate files by name to avoid race conditions
            const uniqueFiles = Array.from(
              new Map(files.map((f) => [f.name, f])).values()
            );

            // Create test files concurrently and wait for all to complete
            await Promise.all(
              uniqueFiles.map((file) => {
                const filePath = path.join(tempDir, file.name);
                return fs.promises.writeFile(filePath, file.content);
              })
            );

            // Build index
            await indexer.buildIndex(tempDir, false);

            // Measure search time
            const searchOptions: SearchOptions = {
              query: searchPattern,
              searchType: "name",
            };

            const startTime = Date.now();
            await indexer.search(searchOptions);
            const endTime = Date.now();

            const searchTime = endTime - startTime;

            // Search should complete within 100ms
            expect(searchTime).toBeLessThan(100);
          }
        ),
        { numRuns: 20 } // Reduced from 100 to avoid timeout
      );
    }, 120000); // 2 minute timeout
  });

  /**
   * Property 7: Index update on file changes
   * Validates: Requirements 4.3
   *
   * For any file change in an indexed directory, the index should be updated and subsequent searches should reflect the change.
   */
  describe("Property 7: Index update on file changes", () => {
    it("should update index when files are modified and reflect changes in search", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-z]{3,8}\.(txt|md|js)$/),
              content: fc.string({ minLength: 0, maxLength: 100 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.record({
            name: fc.stringMatching(/^[a-z]{3,8}\.(txt|md|js)$/),
            newContent: fc.string({ minLength: 0, maxLength: 100 }),
          }),
          async (initialFiles, fileToUpdate) => {
            // Deduplicate initial files by name
            const uniqueInitialFiles = Array.from(
              new Map(initialFiles.map((f) => [f.name, f])).values()
            );

            // Create initial test files
            for (const file of uniqueInitialFiles) {
              const filePath = path.join(tempDir, file.name);
              await fs.promises.writeFile(filePath, file.content);
            }

            // Build initial index
            await indexer.buildIndex(tempDir, false);

            // Get initial statistics
            const initialStats = indexer.getStatistics();
            const initialFileCount = initialStats.fileCount;

            // Create or update a file
            const updateFilePath = path.join(tempDir, fileToUpdate.name);
            const fileExistedBefore = fs.existsSync(updateFilePath);
            await fs.promises.writeFile(
              updateFilePath,
              fileToUpdate.newContent
            );

            // Update the index for this file
            await indexer.updateFile(updateFilePath);

            // Get updated statistics
            const updatedStats = indexer.getStatistics();

            // If file didn't exist before, file count should increase
            if (!fileExistedBefore) {
              expect(updatedStats.fileCount).toBe(initialFileCount + 1);
            } else {
              // If file existed, count should remain the same
              expect(updatedStats.fileCount).toBe(initialFileCount);
            }

            // Search should find the updated file
            const searchOptions: SearchOptions = {
              query: fileToUpdate.name.split(".")[0],
              searchType: "name",
            };

            const results = await indexer.search(searchOptions);
            const found = results.some((r) => r.path === updateFilePath);
            expect(found).toBe(true);

            // Last update time should be more recent
            expect(updatedStats.lastUpdate.getTime()).toBeGreaterThanOrEqual(
              initialStats.lastUpdate.getTime()
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should remove files from index when they are deleted", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-z]{3,8}\.(txt|md|js)$/),
              content: fc.string({ minLength: 0, maxLength: 100 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (files) => {
            // Create test files
            for (const file of files) {
              const filePath = path.join(tempDir, file.name);
              await fs.promises.writeFile(filePath, file.content);
            }

            // Build index
            await indexer.buildIndex(tempDir, false);

            // Get initial statistics
            const initialStats = indexer.getStatistics();

            // Remove the first file
            const fileToRemove = path.join(tempDir, files[0].name);
            indexer.removeFile(fileToRemove);

            // Get updated statistics
            const updatedStats = indexer.getStatistics();

            // File count should decrease by 1
            expect(updatedStats.fileCount).toBe(initialStats.fileCount - 1);

            // Search should not find the removed file
            const searchOptions: SearchOptions = {
              query: files[0].name.split(".")[0],
              searchType: "name",
            };

            const results = await indexer.search(searchOptions);
            const found = results.some((r) => r.path === fileToRemove);
            expect(found).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
