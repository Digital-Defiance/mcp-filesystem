/**
 * MCP Server implementation for filesystem operations
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FilesystemConfig } from "./ConfigLoader";
import { SecurityManager } from "./SecurityManager";
import { BatchOperationManager } from "./BatchOperationManager";
import { DirectoryWatcher } from "./DirectoryWatcher";
import { FileIndexer } from "./FileIndexer";
import { ChecksumManager } from "./ChecksumManager";
import { DiskUsageAnalyzer } from "./DiskUsageAnalyzer";
import { SymlinkManager } from "./SymlinkManager";
import { DirectoryOperations } from "./DirectoryOperations";
import { MCPTools } from "./MCPTools";
import { ErrorHandler } from "./ErrorHandler";

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private config: FilesystemConfig;
  private securityManager: SecurityManager;
  private batchOperationManager: BatchOperationManager;
  private directoryWatcher: DirectoryWatcher;
  private fileIndexer: FileIndexer;
  private checksumManager: ChecksumManager;
  private diskUsageAnalyzer: DiskUsageAnalyzer;
  private symlinkManager: SymlinkManager;
  private directoryOperations: DirectoryOperations;
  private mcpTools: MCPTools;
  private isRunning: boolean = false;

  constructor(config: FilesystemConfig) {
    this.config = config;

    // Initialize server
    this.server = new Server(
      {
        name: "mcp-filesystem",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize managers
    this.securityManager = new SecurityManager(config.security);
    this.batchOperationManager = new BatchOperationManager(
      this.securityManager
    );
    this.directoryWatcher = new DirectoryWatcher();
    this.fileIndexer = new FileIndexer();
    this.checksumManager = new ChecksumManager();
    this.diskUsageAnalyzer = new DiskUsageAnalyzer(this.securityManager);
    this.symlinkManager = new SymlinkManager(this.securityManager);
    this.directoryOperations = new DirectoryOperations(this.securityManager);

    // Initialize MCP tools
    this.mcpTools = new MCPTools(
      this.securityManager,
      this.batchOperationManager,
      this.directoryWatcher,
      this.fileIndexer,
      this.checksumManager,
      this.diskUsageAnalyzer,
      this.symlinkManager,
      this.directoryOperations
    );

    // Create stdio transport
    this.transport = new StdioServerTransport();

    // Set up error handlers
    this.server.onerror = (error) => {
      console.error("[MCP Filesystem Server Error]", error);
    };

    // Set up process signal handlers for graceful shutdown
    process.on("SIGINT", () => {
      console.error(
        "[MCP Filesystem Server] Received SIGINT, shutting down..."
      );
      this.stop();
    });
    process.on("SIGTERM", () => {
      console.error(
        "[MCP Filesystem Server] Received SIGTERM, shutting down..."
      );
      this.stop();
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    console.error(
      "[MCP Filesystem Server] Starting MCP Filesystem Server v0.1.0"
    );
    console.error(
      "[MCP Filesystem Server] Initializing with security configuration..."
    );

    try {
      // Register handlers
      this.registerHandlers();
      console.error("[MCP Filesystem Server] Registered 12 MCP tools");

      // Connect to stdio transport
      await this.server.connect(this.transport);
      console.error("[MCP Filesystem Server] Connected stdio transport");

      this.isRunning = true;
      console.error(
        "[MCP Filesystem Server] Server started successfully and ready to accept requests"
      );
    } catch (error) {
      console.error("[MCP Filesystem Server] Failed to start server:", error);
      throw error;
    }
  }

  /**
   * Register MCP protocol handlers
   */
  private registerHandlers(): void {
    // Register list_tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const schemas = MCPTools.getAllSchemas();
      return {
        tools: schemas.map((schema) => {
          // Convert Zod schema to JSON Schema
          const shape = (schema.inputSchema as any).shape || {};
          const properties: Record<string, any> = {};
          const required: string[] = [];

          for (const [key, value] of Object.entries(shape)) {
            properties[key] = { type: "string" }; // Simplified - Zod will validate
            if (!(value as any).isOptional()) {
              required.push(key);
            }
          }

          return {
            name: schema.name,
            description: schema.description,
            inputSchema: {
              type: "object" as const,
              properties,
              required,
            },
          };
        }),
      };
    });

    // Register call_tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case "fs_batch_operations":
            result = await this.mcpTools.fsBatchOperations(args as any);
            break;

          case "fs_watch_directory":
            result = await this.mcpTools.fsWatchDirectory(args as any);
            break;

          case "fs_get_watch_events":
            result = await this.mcpTools.fsGetWatchEvents(args as any);
            break;

          case "fs_stop_watch":
            result = await this.mcpTools.fsStopWatch(args as any);
            break;

          case "fs_search_files":
            result = await this.mcpTools.fsSearchFiles(args as any);
            break;

          case "fs_build_index":
            result = await this.mcpTools.fsBuildIndex(args as any);
            break;

          case "fs_create_symlink":
            result = await this.mcpTools.fsCreateSymlink(args as any);
            break;

          case "fs_compute_checksum":
            result = await this.mcpTools.fsComputeChecksum(args as any);
            break;

          case "fs_verify_checksum":
            result = await this.mcpTools.fsVerifyChecksum(args as any);
            break;

          case "fs_analyze_disk_usage":
            result = await this.mcpTools.fsAnalyzeDiskUsage(args as any);
            break;

          case "fs_copy_directory":
            result = await this.mcpTools.fsCopyDirectory(args as any);
            break;

          case "fs_sync_directory":
            result = await this.mcpTools.fsSyncDirectory(args as any);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Use ErrorHandler to format the error response
        const errorResponse = ErrorHandler.toMCPError(error as Error);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.error(
        "[MCP Filesystem Server] Server is not running, skipping shutdown"
      );
      return;
    }

    console.error("[MCP Filesystem Server] Shutting down gracefully...");
    this.isRunning = false;

    try {
      // Clean up watch sessions
      console.error("[MCP Filesystem Server] Stopping all watch sessions...");
      await this.directoryWatcher.stopAll();
      console.error("[MCP Filesystem Server] All watch sessions stopped");

      // Close transport
      console.error("[MCP Filesystem Server] Closing transport...");
      await this.transport.close();
      console.error("[MCP Filesystem Server] Transport closed");

      // Close server
      await this.server.close();

      console.error("[MCP Filesystem Server] Shutdown complete");
    } catch (error) {
      console.error("[MCP Filesystem Server] Error during shutdown:", error);
    } finally {
      process.exit(0);
    }
  }

  /**
   * Get the server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}
