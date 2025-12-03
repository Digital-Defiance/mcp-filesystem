/**
 * Common types for MCP Filesystem server
 *
 * This module defines error types and response structures used throughout the server.
 * See ERROR_CODES.md for complete error code reference.
 */

/**
 * Security error - thrown when security policies are violated
 *
 * Security errors indicate violations of the 10-layer security architecture.
 * These errors are logged as security violations in audit logs.
 *
 * Common causes:
 * - Path outside workspace (SEC-001)
 * - Path traversal attempt (SEC-002)
 * - System directory access (SEC-003)
 * - Sensitive file access (SEC-004)
 * - Subdirectory restriction violation (SEC-005)
 * - Blocked path access (SEC-006)
 * - Blocked pattern match (SEC-007)
 * - Read-only mode violation (SEC-008)
 * - Symlink escape attempt (SEC-009)
 * - Rate limit exceeded (SEC-010)
 * - File size exceeded (SEC-011)
 * - Batch size exceeded (SEC-012)
 *
 * @see ERROR_CODES.md for detailed error code reference
 * @see SECURITY.md for security architecture documentation
 *
 * @example
 * ```typescript
 * throw new SecurityError("Path traversal detected - path outside workspace");
 * ```
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Validation error - thrown when input validation fails
 *
 * Validation errors indicate invalid input parameters or malformed requests.
 * These errors should be fixed by correcting the input.
 *
 * Common causes:
 * - Missing required parameter (VAL-001)
 * - Invalid parameter type (VAL-002)
 * - Invalid parameter value (VAL-003)
 * - Empty array parameter (VAL-004)
 * - Invalid path format (VAL-005)
 *
 * @see ERROR_CODES.md for detailed error code reference
 *
 * @example
 * ```typescript
 * throw new ValidationError("Operations array cannot be empty");
 * ```
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Filesystem error - thrown when filesystem operations fail
 *
 * Filesystem errors indicate issues with the underlying filesystem operations.
 * These may be transient and can sometimes be retried.
 *
 * Common causes:
 * - File not found (FS-001)
 * - Directory not found (FS-002)
 * - Permission denied (FS-003)
 * - File already exists (FS-004)
 * - Directory not empty (FS-005)
 * - Disk full (FS-006)
 * - Read error (FS-007)
 * - Write error (FS-008)
 * - Symlink error (FS-009)
 * - Checksum mismatch (FS-010)
 * - File modified during operation (FS-011)
 *
 * @see ERROR_CODES.md for detailed error code reference
 *
 * @example
 * ```typescript
 * throw new FileSystemError("File not found: /path/to/file");
 * ```
 */
export class FileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileSystemError";
  }
}

/**
 * MCP error response structure
 *
 * Standard error response format returned by all MCP tools.
 * Includes error code, human-readable message, and optional details.
 *
 * @example
 * ```json
 * {
 *   "error": {
 *     "code": "SEC-001",
 *     "message": "Path traversal detected - path outside workspace",
 *     "details": {
 *       "input": "../../etc/passwd",
 *       "resolved": "/etc/passwd",
 *       "workspaceRoot": "/home/user/workspace"
 *     }
 *   }
 * }
 * ```
 */
export interface MCPErrorResponse {
  error: {
    /** Error code (e.g., "SEC-001", "VAL-002", "FS-003") */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Optional additional error details */
    details?: Record<string, any>;
  };
}

/**
 * MCP success response structure
 *
 * Standard success response format returned by all MCP tools.
 * Includes status and operation-specific data.
 *
 * @template T - Type of the response data
 *
 * @example
 * ```json
 * {
 *   "status": "success",
 *   "data": {
 *     "filesCopied": 5,
 *     "bytesTransferred": 1024000,
 *     "duration": 1234
 *   }
 * }
 * ```
 */
export interface MCPSuccessResponse<T = unknown> {
  /** Always "success" for successful operations */
  status: "success";
  /** Operation-specific response data */
  data: T;
}

/**
 * MCP response type (success or error)
 *
 * Union type representing either a success or error response.
 * All MCP tools return this type.
 *
 * @template T - Type of the success response data
 *
 * @example
 * ```typescript
 * async function callTool(): Promise<MCPResponse<{ count: number }>> {
 *   try {
 *     return {
 *       status: "success",
 *       data: { count: 42 }
 *     };
 *   } catch (error) {
 *     return {
 *       error: {
 *         code: "FS-001",
 *         message: error.message
 *       }
 *     };
 *   }
 * }
 * ```
 */
export type MCPResponse<T = unknown> = MCPSuccessResponse<T> | MCPErrorResponse;
