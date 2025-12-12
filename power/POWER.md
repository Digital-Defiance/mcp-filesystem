---
name: "acs-filesystem"
displayName: "ACS Filesystem Manager"
description: "Advanced filesystem operations with strict security boundaries, batch operations, directory watching, and file search"
keywords:
  [
    "filesystem",
    "file-operations",
    "batch-operations",
    "directory-watching",
    "file-search",
    "file-indexing",
    "security",
    "checksums",
    "symlinks",
  ]
author: "Digital Defiance"
---

# ACS Filesystem Manager Power

## Overview

Advanced filesystem operations for AI agents with strict security boundaries. Execute batch operations, watch directories, search files, and manage permissions - all within secure, configurable boundaries.

**Key capabilities:**

- Batch filesystem operations (atomic transactions)
- Real-time directory watching with filters
- Fast file search and indexing with Lunr
- Checksum computation and verification
- Symlink management and disk usage analysis
- Security boundaries and permission management

**VS Code Extension**: `DigitalDefiance.mcp-acs-filesystem`

## Available MCP Servers

### acs-filesystem

**Package:** `@ai-capabilities-suite/mcp-filesystem`
**Connection:** Local MCP server via npx

## Configuration

```json
{
  "mcpServers": {
    "acs-filesystem": {
      "command": "npx",
      "args": ["-y", "@ai-capabilities-suite/mcp-filesystem@latest"]
    }
  }
}
```

## Resources

- [Package on npm](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-filesystem)
- [GitHub Repository](https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DigitalDefiance.mcp-acs-filesystem)
- [Security Documentation](https://github.com/digital-defiance/ai-capabilities-suite/blob/main/packages/mcp-filesystem/SECURITY.md)

---

**Package:** `@ai-capabilities-suite/mcp-filesystem`  
**License:** MIT
