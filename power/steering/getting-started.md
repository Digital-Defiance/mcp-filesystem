# Getting Started with ACS Filesystem Manager

## Overview

The ACS Filesystem Manager provides advanced filesystem operations with security boundaries, perfect for AI agents that need to manage files safely and efficiently.

## Basic Operations

### Batch Operations

Execute multiple filesystem operations atomically:

```typescript
// Copy, move, or delete multiple files in one transaction
await batchOperations({
  operations: [
    { type: "copy", source: "/src/file1.txt", destination: "/dest/file1.txt" },
    { type: "move", source: "/src/file2.txt", destination: "/dest/file2.txt" },
    { type: "delete", source: "/src/old.txt" },
  ],
  atomic: true,
});
```

### Directory Watching

Monitor directories for changes in real-time:

```typescript
// Start watching a directory
const session = await watchDirectory({
  path: "/project/src",
  recursive: true,
  filters: ["*.ts", "*.tsx"],
});

// Get accumulated events
const events = await getWatchEvents({ sessionId: session.id });
```

### File Search

Fast file search with indexing:

```typescript
// Search by name
await searchFiles({
  query: "component",
  searchType: "name",
});

// Search by content
await searchFiles({
  query: "TODO",
  searchType: "content",
  fileTypes: [".ts", ".tsx"],
});
```

## Security Boundaries

All operations respect configured security boundaries:

- Allowlisted paths only
- Size limits enforced
- Permission checks
- Audit logging

## Best Practices

1. **Use batch operations** for multiple file changes to ensure atomicity
2. **Set filters** when watching directories to reduce noise
3. **Build indexes** for frequently searched directories
4. **Verify checksums** for critical file operations
5. **Check disk usage** before large operations
