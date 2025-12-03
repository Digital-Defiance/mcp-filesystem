/**
 * Configuration loader for MCP Filesystem server
 */

import * as fs from "fs";
import * as path from "path";
import { SecurityConfig } from "../interfaces/ISecurityManager";

export interface FilesystemConfig {
  security: SecurityConfig;
}

export class ConfigLoader {
  /**
   * Load configuration from file or environment
   */
  static async loadConfig(): Promise<FilesystemConfig> {
    // Try to load from config file
    const configPath =
      process.env["MCP_FILESYSTEM_CONFIG"] ||
      path.join(process.cwd(), "mcp-filesystem-config.json");

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(configData);
    }

    // Default configuration
    return {
      security: {
        workspaceRoot:
          process.env["MCP_FILESYSTEM_WORKSPACE_ROOT"] || process.cwd(),
        allowedSubdirectories: [],
        blockedPaths: [".git", ".env", "node_modules", ".ssh"],
        blockedPatterns: ["*.key", "*.pem", "*.env", "*secret*", "*password*"],
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxBatchSize: 1024 * 1024 * 1024, // 1GB
        maxOperationsPerMinute: 100,
        enableAuditLog: true,
        requireConfirmation: true,
        readOnly: false,
        operationPermissions: {
          read: "allow",
          write: "allow",
          delete: "confirm",
          move: "confirm",
          batch: "confirm",
          symlink: "allow",
          directory: "confirm",
          index: "allow",
        },
        allowSymlinks: true,
        followSymlinks: true,
        allowWatching: true,
      },
    };
  }
}
