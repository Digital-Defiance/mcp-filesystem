/**
 * Property-based tests for DirectoryWatcher
 * Uses fast-check for property-based testing
 */

import * as fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DirectoryWatcher } from "./DirectoryWatcher";
import { v4 as uuidv4 } from "uuid";

describe("DirectoryWatcher Property-Based Tests", () => {
  let tempDir: string;
  let watcher: DirectoryWatcher;

  beforeEach(() => {
    // Create a temporary workspace directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-fs-watch-test-"));
    watcher = new DirectoryWatcher();
  });

  afterEach(async () => {
    // Stop all watchers
    await watcher.stopAll();
  });

  /**
   * Feature: mcp-filesystem, Property 3: Directory watching event detection
   * Validates: Requirements 2.1
   *
   * For any watched directory, when files are created, modified, deleted, or renamed,
   * those events should be detected and reported.
   */
  describe("Property 3: Directory watching event detection", () => {
    it("should detect file creation events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 5 }
            )
            .map((arr) => [...new Set(arr)]), // Ensure unique filenames
          async (filenames) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-create-${sessionId}`);
            fs.mkdirSync(watchDir, { recursive: true });

            // Start watching
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: [],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Create files
            for (const filename of filenames) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "test content");
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got create events for all files
            expect(events.length).toBeGreaterThanOrEqual(filenames.length);

            const createEvents = events.filter((e) => e.type === "create");
            expect(createEvents.length).toBe(filenames.length);

            // Verify each file has a create event
            for (const filename of filenames) {
              const expectedPath = path.join(watchDir, filename);
              const hasEvent = createEvents.some(
                (e) => e.path === expectedPath
              );
              expect(hasEvent).toBe(true);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should detect file modification events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            ),
            fc.string({ minLength: 1, maxLength: 100 })
          ),
          async ([filenames, newContent]) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-modify-${sessionId}`);
            fs.mkdirSync(watchDir, { recursive: true });

            // Create files before watching
            for (const filename of filenames) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "initial content");
            }

            // Start watching
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: [],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Modify files
            for (const filename of filenames) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, newContent);
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got modify events
            const modifyEvents = events.filter((e) => e.type === "modify");
            expect(modifyEvents.length).toBeGreaterThanOrEqual(
              filenames.length
            );

            // Verify each file has a modify event
            for (const filename of filenames) {
              const expectedPath = path.join(watchDir, filename);
              const hasEvent = modifyEvents.some(
                (e) => e.path === expectedPath
              );
              expect(hasEvent).toBe(true);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should detect file deletion events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc
              .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
              .filter((s) => s.length >= 6),
            { minLength: 1, maxLength: 5 }
          ),
          async (filenames) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-delete-${sessionId}`);
            fs.mkdirSync(watchDir, { recursive: true });

            // Create files before watching
            for (const filename of filenames) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "test content");
            }

            // Start watching
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: [],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Delete files
            for (const filename of filenames) {
              const filePath = path.join(watchDir, filename);
              fs.unlinkSync(filePath);
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got delete events
            const deleteEvents = events.filter((e) => e.type === "delete");
            expect(deleteEvents.length).toBe(filenames.length);

            // Verify each file has a delete event
            for (const filename of filenames) {
              const expectedPath = path.join(watchDir, filename);
              const hasEvent = deleteEvents.some(
                (e) => e.path === expectedPath
              );
              expect(hasEvent).toBe(true);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should detect events recursively when recursive option is enabled", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9_]+$/).filter((s) => s.length >= 2),
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            )
          ),
          async ([subdirName, filenames]) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-recursive-${sessionId}`);
            const subDir = path.join(watchDir, subdirName);
            fs.mkdirSync(subDir, { recursive: true });

            // Start watching with recursive option
            await watcher.watch(sessionId, watchDir, {
              recursive: true,
              filters: [],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Create files in subdirectory
            for (const filename of filenames) {
              const filePath = path.join(subDir, filename);
              fs.writeFileSync(filePath, "test content");
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got create events for files in subdirectory
            const createEvents = events.filter((e) => e.type === "create");
            expect(createEvents.length).toBeGreaterThanOrEqual(
              filenames.length
            );

            // Verify each file has a create event
            for (const filename of filenames) {
              const expectedPath = path.join(subDir, filename);
              const hasEvent = createEvents.some(
                (e) => e.path === expectedPath
              );
              expect(hasEvent).toBe(true);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Feature: mcp-filesystem, Property 4: Event filtering accuracy
   * Validates: Requirements 2.4
   *
   * For any watch session with event filters, only events matching the filter
   * patterns should be reported.
   */
  describe("Property 4: Event filtering accuracy", () => {
    it("should only report events matching filter patterns", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 2, maxLength: 5 }
            ),
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.log$/)
                .filter((s) => s.length >= 6),
              { minLength: 2, maxLength: 5 }
            )
          ),
          async ([txtFiles, logFiles]) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-filter-${sessionId}`);
            fs.mkdirSync(watchDir, { recursive: true });

            // Start watching with filter for .txt files only
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: ["**/*.txt"],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Create both .txt and .log files
            for (const filename of txtFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "txt content");
            }

            for (const filename of logFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "log content");
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we only got events for .txt files
            expect(events.length).toBe(txtFiles.length);

            // Verify all events are for .txt files
            for (const event of events) {
              expect(event.path.endsWith(".txt")).toBe(true);
            }

            // Verify no events for .log files
            for (const filename of logFiles) {
              const logPath = path.join(watchDir, filename);
              const hasEvent = events.some((e) => e.path === logPath);
              expect(hasEvent).toBe(false);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    }, 120000); // 120 second timeout for property-based testing

    it("should report all events when no filters are specified", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            ),
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.log$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            )
          ),
          async ([txtFiles, logFiles]) => {
            const sessionId = uuidv4();
            const watchDir = path.join(tempDir, `watch-nofilter-${sessionId}`);
            fs.mkdirSync(watchDir, { recursive: true });

            // Start watching with no filters
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: [],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Create both .txt and .log files
            for (const filename of txtFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "txt content");
            }

            for (const filename of logFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "log content");
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got events for all files
            const totalFiles = txtFiles.length + logFiles.length;
            expect(events.length).toBe(totalFiles);

            // Verify events for .txt files
            for (const filename of txtFiles) {
              const expectedPath = path.join(watchDir, filename);
              const hasEvent = events.some((e) => e.path === expectedPath);
              expect(hasEvent).toBe(true);
            }

            // Verify events for .log files
            for (const filename of logFiles) {
              const expectedPath = path.join(watchDir, filename);
              const hasEvent = events.some((e) => e.path === expectedPath);
              expect(hasEvent).toBe(true);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should support multiple filter patterns", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.txt$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            ),
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.md$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            ),
            fc.array(
              fc
                .stringMatching(/^[a-zA-Z0-9_]+\.log$/)
                .filter((s) => s.length >= 6),
              { minLength: 1, maxLength: 3 }
            )
          ),
          async ([txtFiles, mdFiles, logFiles]) => {
            const sessionId = uuidv4();
            const watchDir = path.join(
              tempDir,
              `watch-multifilter-${sessionId}`
            );
            fs.mkdirSync(watchDir, { recursive: true });

            // Start watching with filters for .txt and .md files only
            await watcher.watch(sessionId, watchDir, {
              recursive: false,
              filters: ["**/*.txt", "**/*.md"],
            });

            // Wait for watcher to be ready
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Create .txt, .md, and .log files
            for (const filename of txtFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "txt content");
            }

            for (const filename of mdFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "md content");
            }

            for (const filename of logFiles) {
              const filePath = path.join(watchDir, filename);
              fs.writeFileSync(filePath, "log content");
            }

            // Wait for events to be recorded
            await new Promise((resolve) => setTimeout(resolve, 300));

            // Get events
            const events = watcher.getEvents(sessionId);

            // Verify we got events for .txt and .md files only
            const expectedCount = txtFiles.length + mdFiles.length;
            expect(events.length).toBe(expectedCount);

            // Verify all events are for .txt or .md files
            for (const event of events) {
              const isTxtOrMd =
                event.path.endsWith(".txt") || event.path.endsWith(".md");
              expect(isTxtOrMd).toBe(true);
            }

            // Verify no events for .log files
            for (const filename of logFiles) {
              const logPath = path.join(watchDir, filename);
              const hasEvent = events.some((e) => e.path === logPath);
              expect(hasEvent).toBe(false);
            }

            // Cleanup
            await watcher.stopWatch(sessionId);
          }
        ),
        { numRuns: 10 }
      );
    }, 120000); // 2 minutes timeout for property-based test with file operations
  });
});
