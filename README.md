# MCP Filesystem Server

[![npm version](https://badge.fury.io/js/@ai-capabilities-suite%2Fmcp-filesystem.svg)](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-filesystem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Advanced filesystem operations for AI agents with strict security boundaries. Part of the [AI Capabilities Suite](https://github.com/Digital-Defiance/ai-capabilities-suite).

## 🔗 Repository

This package is maintained in the [AI Capabilities Suite](https://github.com/Digital-Defiance/ai-capabilities-suite) monorepo.

## Overview

The MCP Filesystem Server provides AI agents with advanced file operations beyond basic read/write, including:

- **Batch Operations**: Execute multiple file operations atomically with rollback support
- **Directory Watching**: Monitor filesystem changes in real-time with event filtering
- **File Search & Indexing**: Fast full-text search with metadata filtering
- **Checksum Operations**: Compute and verify file integrity (MD5, SHA-1, SHA-256, SHA-512)
- **Symlink Management**: Create and manage symbolic links within workspace boundaries
- **Disk Usage Analysis**: Analyze directory sizes and identify large files
- **Directory Operations**: Recursive copy, sync, and atomic file replacement

All operations are confined within strict security boundaries to prevent unauthorized access.

## 🚨 Security First

**CRITICAL**: This server implements defense-in-depth security with 10 layers of path validation. All operations are confined to a configured workspace root. See [SECURITY.md](./SECURITY.md) for complete security documentation.

## Installation

### NPM

```bash
npm install -g @ai-capabilities-suite/mcp-filesystem
```

### Yarn

```bash
yarn global add @ai-capabilities-suite/mcp-filesystem
```

### Docker

```bash
docker pull ghcr.io/digital-defiance/mcp-filesystem:latest
```

See [DOCKER.md](./DOCKER.md) for Docker deployment guide.

## Quick Start

### 1. Create Configuration File

Create a `mcp-filesystem-config.json` file:

```json
{
  "workspaceRoot": "/path/to/your/workspace",
  "blockedPaths": [".git", ".env", "node_modules"],
  "blockedPatterns": ["*.key", "*.pem", "*.env"],
  "maxFileSize": 104857600,
  "maxBatchSize": 1073741824,
  "maxOperationsPerMinute": 100,
  "enableAuditLog": true,
  "readOnly": false
}
```

### 2. Start the Server

```bash
mcp-filesystem --config ./mcp-filesystem-config.json
```

### 3. Configure in Your MCP Client

Add to your MCP client configuration (e.g., Claude Desktop, Kiro):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem",
      "args": ["--config", "/path/to/mcp-filesystem-config.json"]
    }
  }
}
```

## Available Tools

The server exposes 12 MCP tools for filesystem operations:

### 1. fs_batch_operations

Execute multiple filesystem operations atomically with rollback support.

**Parameters:**

- `operations`: Array of operations (copy, move, delete)
- `atomic`: Boolean (default: true) - rollback all on failure

**Example:**

```typescript
{
  "operations": [
    { "type": "copy", "source": "file1.txt", "destination": "backup/file1.txt" },
    { "type": "move", "source": "temp.txt", "destination": "archive/temp.txt" },
    { "type": "delete", "source": "old.txt" }
  ],
  "atomic": true
}
```

### 2. fs_watch_directory

Monitor a directory for filesystem changes.

**Parameters:**

- `path`: Directory to watch
- `recursive`: Boolean - watch subdirectories
- `filters`: Array of glob patterns to filter events

**Returns:** Session ID for retrieving events

**Example:**

```typescript
{
  "path": "src",
  "recursive": true,
  "filters": ["*.ts", "*.js"]
}
```

### 3. fs_get_watch_events

Retrieve accumulated events from a watch session.

**Parameters:**

- `sessionId`: Watch session ID from fs_watch_directory

**Returns:** Array of filesystem events (create, modify, delete, rename)

### 4. fs_stop_watch

Stop a directory watch session and clean up resources.

**Parameters:**

- `sessionId`: Watch session ID to stop

### 5. fs_search_files

Search for files by name, content, or metadata.

**Parameters:**

- `query`: Search query string
- `searchType`: "name", "content", or "both"
- `fileTypes`: Array of file extensions to filter
- `minSize`, `maxSize`: Size constraints in bytes
- `modifiedAfter`: ISO date string
- `useIndex`: Boolean - use file index for faster search

**Example:**

```typescript
{
  "query": "TODO",
  "searchType": "content",
  "fileTypes": [".ts", ".js"],
  "useIndex": true
}
```

### 6. fs_build_index

Build a searchable index of files for fast searching.

**Parameters:**

- `path`: Directory to index
- `includeContent`: Boolean - index file contents (text files only)

**Returns:** Index statistics (file count, total size, index size)

### 7. fs_create_symlink

Create a symbolic link within the workspace.

**Parameters:**

- `linkPath`: Path where symlink will be created
- `targetPath`: Path the symlink points to (must be within workspace)

### 8. fs_compute_checksum

Compute file checksum for integrity verification.

**Parameters:**

- `path`: File path
- `algorithm`: "md5", "sha1", "sha256", or "sha512"

**Returns:** Checksum hex string

### 9. fs_verify_checksum

Verify a file's checksum matches expected value.

**Parameters:**

- `path`: File path
- `checksum`: Expected checksum hex string
- `algorithm`: Hash algorithm used

**Returns:** Boolean verification result

### 10. fs_analyze_disk_usage

Analyze disk usage and identify large files/directories.

**Parameters:**

- `path`: Directory to analyze
- `depth`: Maximum depth to traverse
- `groupByType`: Boolean - group results by file extension

**Returns:** Usage report with sizes, largest files, and type breakdown

### 11. fs_copy_directory

Recursively copy a directory with options.

**Parameters:**

- `source`: Source directory
- `destination`: Destination directory
- `preserveMetadata`: Boolean - preserve timestamps and permissions
- `exclusions`: Array of glob patterns to exclude

**Returns:** Copy statistics (files copied, bytes transferred, duration)

### 12. fs_sync_directory

Sync directories by copying only newer or missing files.

**Parameters:**

- `source`: Source directory
- `destination`: Destination directory
- `exclusions`: Array of glob patterns to exclude

**Returns:** Sync statistics (files copied, files skipped, bytes transferred)

## Configuration Reference

### Required Configuration

- **workspaceRoot**: Absolute path to workspace directory (REQUIRED)
  - All operations are confined to this directory
  - Cannot be changed after server starts

### Security Configuration

- **allowedSubdirectories**: Array of subdirectories within workspace (optional)

  - If specified, operations are further restricted to these paths
  - Example: `["src", "tests", "docs"]`

- **blockedPaths**: Array of paths to block (relative to workspace)

  - Example: `[".git", ".env", "node_modules", ".ssh"]`

- **blockedPatterns**: Array of regex patterns to block
  - Example: `["*.key", "*.pem", "*.env", "*secret*", "*password*"]`

### Resource Limits

- **maxFileSize**: Maximum file size in bytes (default: 100MB)
- **maxBatchSize**: Maximum total size for batch operations (default: 1GB)
- **maxOperationsPerMinute**: Rate limit per agent (default: 100)

### Operational Settings

- **enableAuditLog**: Enable operation logging (default: true)
- **requireConfirmation**: Require confirmation for destructive operations (default: true)
- **readOnly**: Enable read-only mode (default: false)

## Security Features

### Multi-Layer Security Architecture

The server implements 10 layers of path validation:

1. **Absolute Path Resolution**: Prevents relative path tricks
2. **Workspace Boundary Check**: Ensures path is within workspace
3. **Path Traversal Detection**: Blocks `..` and `./` sequences
4. **System Path Blocklist**: Hardcoded system directories (cannot be overridden)
5. **Sensitive Pattern Blocklist**: Hardcoded sensitive files (cannot be overridden)
6. **Subdirectory Restrictions**: Optional allowlist within workspace
7. **User Blocklist**: Custom blocked paths
8. **User Pattern Blocklist**: Custom blocked patterns
9. **Read-Only Mode**: Prevents write/delete operations
10. **Symlink Validation**: Validates symlink targets are within workspace

### Hardcoded Security (Cannot Be Disabled)

**System Paths (Always Blocked):**

- `/etc`, `/sys`, `/proc`, `/dev`, `/boot`, `/root`
- `C:\Windows`, `C:\Program Files`
- `/System`, `/Library`, `/Applications` (macOS)
- `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`

**Sensitive Patterns (Always Blocked):**

- `.ssh/`, `.aws/`, `.kube/`
- `id_rsa`, `*.pem`, `*.key`, `*.p12`, `*.pfx`
- Files containing: `password`, `secret`, `token`
- `.env` files

### Audit Logging

All operations are logged with:

- Timestamp
- Operation type
- Paths involved
- Result (success/failure)
- Security violations logged separately

## Usage Examples

### Example 1: Batch File Operations

```typescript
// Copy multiple files atomically
const result = await mcpClient.callTool("fs_batch_operations", {
  operations: [
    { type: "copy", source: "src/file1.ts", destination: "backup/file1.ts" },
    { type: "copy", source: "src/file2.ts", destination: "backup/file2.ts" },
    { type: "copy", source: "src/file3.ts", destination: "backup/file3.ts" },
  ],
  atomic: true, // All succeed or all rollback
});
```

### Example 2: Watch Directory for Changes

```typescript
// Start watching
const watchResult = await mcpClient.callTool("fs_watch_directory", {
  path: "src",
  recursive: true,
  filters: ["*.ts", "*.tsx"],
});

const sessionId = watchResult.sessionId;

// Later, get events
const events = await mcpClient.callTool("fs_get_watch_events", {
  sessionId,
});

// Stop watching
await mcpClient.callTool("fs_stop_watch", { sessionId });
```

### Example 3: Search Files with Indexing

```typescript
// Build index first
await mcpClient.callTool("fs_build_index", {
  path: "src",
  includeContent: true,
});

// Fast search using index
const results = await mcpClient.callTool("fs_search_files", {
  query: "TODO",
  searchType: "content",
  fileTypes: [".ts", ".js"],
  useIndex: true,
});
```

### Example 4: Verify File Integrity

```typescript
// Compute checksum
const checksumResult = await mcpClient.callTool("fs_compute_checksum", {
  path: "important-file.zip",
  algorithm: "sha256",
});

// Later, verify integrity
const verifyResult = await mcpClient.callTool("fs_verify_checksum", {
  path: "important-file.zip",
  checksum: checksumResult.checksum,
  algorithm: "sha256",
});
```

### Example 5: Sync Directories

```typescript
// Sync only newer/missing files
const syncResult = await mcpClient.callTool("fs_sync_directory", {
  source: "src",
  destination: "backup",
  exclusions: ["*.test.ts", "node_modules/**"],
});

console.log(
  `Copied: ${syncResult.filesCopied}, Skipped: ${syncResult.filesSkipped}`
);
```

## Troubleshooting

### Error: "Path traversal detected - path outside workspace"

**Cause**: Attempting to access files outside the configured workspace root.

**Solution**:

- Verify your `workspaceRoot` configuration is correct
- Ensure all paths are relative to the workspace root
- Check for `..` sequences in paths

### Error: "Cannot access system directories"

**Cause**: Attempting to access hardcoded system paths.

**Solution**: These paths are always blocked for security. Configure your workspace to avoid system directories.

### Error: "Cannot access sensitive files"

**Cause**: Attempting to access files matching sensitive patterns (`.ssh/`, `*.key`, etc.).

**Solution**: These patterns are always blocked. If you need to access these files, they must be renamed or moved outside sensitive patterns.

### Error: "Rate limit exceeded"

**Cause**: Too many operations in a short time period.

**Solution**:

- Increase `maxOperationsPerMinute` in configuration
- Batch operations together using `fs_batch_operations`
- Add delays between operations

### Error: "File size exceeds maximum"

**Cause**: File size exceeds `maxFileSize` configuration.

**Solution**: Increase `maxFileSize` in configuration or split large files.

### Watch Events Not Appearing

**Cause**: Events may be filtered or watch session not active.

**Solution**:

- Verify watch session is active with correct `sessionId`
- Check `filters` parameter - ensure patterns match your files
- Ensure files are within watched directory (check `recursive` setting)

### Search Returns No Results

**Cause**: Index may be outdated or search parameters too restrictive.

**Solution**:

- Rebuild index with `fs_build_index`
- Check `fileTypes` filter isn't excluding your files
- Verify `query` matches file content/names
- Try with `useIndex: false` for filesystem search

### Symlink Creation Fails

**Cause**: Symlink target is outside workspace.

**Solution**: All symlink targets must be within the workspace root. This is a security requirement and cannot be disabled.

## Performance Tips

1. **Use Indexing for Large Codebases**: Build an index with `fs_build_index` for faster searches
2. **Batch Operations**: Use `fs_batch_operations` instead of individual operations
3. **Filter Watch Events**: Use specific glob patterns to reduce event volume
4. **Limit Search Scope**: Use `fileTypes` and size filters to narrow search results
5. **Incremental Sync**: Use `fs_sync_directory` instead of full copy when possible

## Development

### Building from Source

```bash
git clone https://github.com/Digital-Defiance/ai-capabilities-suite.git
cd ai-capabilities-suite/packages/mcp-filesystem
yarn install
yarn build
```

### Running Tests

```bash
yarn test              # Run all tests
yarn test:coverage     # Run with coverage
yarn test:watch        # Watch mode
```

### Running Locally

```bash
yarn build
node dist/cli.js --config ./config.json
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) in the root repository.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Digital-Defiance/ai-capabilities-suite/issues)
- **Email**: info@digitaldefiance.org
- **Documentation**: [Full Documentation](https://github.com/Digital-Defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem)

## Related Projects

- [MCP Debugger](../mcp-debugger-server) - Debug Node.js applications via MCP
- [MCP Process](../mcp-process) - Process management via MCP
- [MCP Screenshot](../mcp-screenshot) - Screenshot capture via MCP

## Acknowledgments

Built with:

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- [Chokidar](https://github.com/paulmillr/chokidar) - File watching
- [Lunr](https://lunrjs.com/) - Full-text search
- [fast-glob](https://github.com/mrmlnc/fast-glob) - Fast file pattern matching
