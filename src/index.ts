/**
 * MCP Filesystem Server
 *
 * Advanced filesystem operations for AI agents with strict security boundaries.
 * Provides batch operations, directory watching, file search/indexing, and more.
 */

export * from "./interfaces";
export * from "./lib";
export * from "./types";

// Main entry point for running the server
import { MCPServer } from "./lib/MCPServer";
import { ConfigLoader } from "./lib/ConfigLoader";

/**
 * Create and start the MCP filesystem server
 */
export async function startMcpFilesystemServer(): Promise<MCPServer> {
  const config = await ConfigLoader.loadConfig();
  const server = new MCPServer(config);
  await server.start();
  return server;
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[MCP Filesystem Server] Unhandled promise rejection:", reason);
  // Don't exit - let the operation continue
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[MCP Filesystem Server] Uncaught exception:", error);
  // Don't exit - let the operation continue
});

// Start the server if this is the main module
if (require.main === module) {
  startMcpFilesystemServer().catch((error) => {
    console.error("Failed to start MCP filesystem server:", error);
    process.exit(1);
  });
}
