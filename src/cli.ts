#!/usr/bin/env node

/**
 * CLI entry point for MCP Filesystem server
 */

import { startMcpFilesystemServer } from "./index";

async function main() {
  try {
    // Start the MCP server
    await startMcpFilesystemServer();
  } catch (error) {
    console.error("Failed to start MCP Filesystem server:", error);
    process.exit(1);
  }
}

main();
