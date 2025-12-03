/**
 * Error handler for MCP Filesystem server
 * Provides structured error responses with specific error codes
 */

import {
  SecurityError,
  ValidationError,
  FileSystemError,
  MCPErrorResponse,
} from "../types";

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Security errors
  SECURITY_ERROR = "SECURITY_ERROR",
  WORKSPACE_BOUNDARY_VIOLATION = "WORKSPACE_BOUNDARY_VIOLATION",
  PATH_TRAVERSAL = "PATH_TRAVERSAL",
  SYSTEM_PATH_ACCESS = "SYSTEM_PATH_ACCESS",
  SENSITIVE_FILE_ACCESS = "SENSITIVE_FILE_ACCESS",
  BLOCKED_PATH = "BLOCKED_PATH",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  READ_ONLY_MODE = "READ_ONLY_MODE",
  SYMLINK_ESCAPE = "SYMLINK_ESCAPE",

  // Validation errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_PATH = "INVALID_PATH",
  INVALID_OPERATION = "INVALID_OPERATION",
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  FILE_SIZE_EXCEEDED = "FILE_SIZE_EXCEEDED",
  BATCH_SIZE_EXCEEDED = "BATCH_SIZE_EXCEEDED",

  // Filesystem errors
  FILESYSTEM_ERROR = "FILESYSTEM_ERROR",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  DIRECTORY_NOT_FOUND = "DIRECTORY_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  FILE_EXISTS = "FILE_EXISTS",
  DIRECTORY_NOT_EMPTY = "DIRECTORY_NOT_EMPTY",
  DISK_FULL = "DISK_FULL",
  IO_ERROR = "IO_ERROR",

  // Operation errors
  OPERATION_FAILED = "OPERATION_FAILED",
  BATCH_OPERATION_FAILED = "BATCH_OPERATION_FAILED",
  WATCH_SESSION_NOT_FOUND = "WATCH_SESSION_NOT_FOUND",
  INDEX_NOT_BUILT = "INDEX_NOT_BUILT",

  // Generic errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Error handler class
 * Provides methods to convert errors to structured MCP error responses
 */
export class ErrorHandler {
  /**
   * Convert an error to an MCP error response with structured error codes
   */
  static toMCPError(error: Error): MCPErrorResponse {
    // Handle security errors
    if (error instanceof SecurityError) {
      return this.handleSecurityError(error);
    }

    // Handle validation errors
    if (error instanceof ValidationError) {
      return this.handleValidationError(error);
    }

    // Handle filesystem errors
    if (error instanceof FileSystemError) {
      return this.handleFileSystemError(error);
    }

    // Handle Node.js system errors
    if (this.isNodeError(error)) {
      return this.handleNodeError(error);
    }

    // Generic error
    return {
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message || "An unexpected error occurred",
        details: {
          name: error.name,
          stack:
            process.env["NODE_ENV"] === "development" ? error.stack : undefined,
        },
      },
    };
  }

  /**
   * Handle security errors with specific error codes
   */
  private static handleSecurityError(error: SecurityError): MCPErrorResponse {
    const message = error.message.toLowerCase();

    // Determine specific security error code based on message
    let code = ErrorCode.SECURITY_ERROR;

    if (message.includes("workspace") || message.includes("outside")) {
      code = ErrorCode.WORKSPACE_BOUNDARY_VIOLATION;
    } else if (message.includes("traversal")) {
      code = ErrorCode.PATH_TRAVERSAL;
    } else if (message.includes("system")) {
      code = ErrorCode.SYSTEM_PATH_ACCESS;
    } else if (message.includes("sensitive")) {
      code = ErrorCode.SENSITIVE_FILE_ACCESS;
    } else if (message.includes("blocked")) {
      code = ErrorCode.BLOCKED_PATH;
    } else if (message.includes("rate limit")) {
      code = ErrorCode.RATE_LIMIT_EXCEEDED;
    } else if (message.includes("read-only")) {
      code = ErrorCode.READ_ONLY_MODE;
    } else if (message.includes("symlink")) {
      code = ErrorCode.SYMLINK_ESCAPE;
    }

    return {
      error: {
        code,
        message: error.message,
        details: {
          type: "security_violation",
          remediation: this.getSecurityRemediation(code),
        },
      },
    };
  }

  /**
   * Handle validation errors with specific error codes
   */
  private static handleValidationError(
    error: ValidationError
  ): MCPErrorResponse {
    const message = error.message.toLowerCase();

    let code = ErrorCode.VALIDATION_ERROR;

    if (message.includes("path")) {
      code = ErrorCode.INVALID_PATH;
    } else if (message.includes("operation")) {
      code = ErrorCode.INVALID_OPERATION;
    } else if (message.includes("argument")) {
      code = ErrorCode.INVALID_ARGUMENT;
    } else if (message.includes("file size")) {
      code = ErrorCode.FILE_SIZE_EXCEEDED;
    } else if (message.includes("batch size")) {
      code = ErrorCode.BATCH_SIZE_EXCEEDED;
    }

    return {
      error: {
        code,
        message: error.message,
        details: {
          type: "validation_error",
          remediation: "Check the input parameters and try again",
        },
      },
    };
  }

  /**
   * Handle filesystem errors with specific error codes
   */
  private static handleFileSystemError(
    error: FileSystemError
  ): MCPErrorResponse {
    const message = error.message.toLowerCase();

    let code = ErrorCode.FILESYSTEM_ERROR;

    if (message.includes("not found") || message.includes("enoent")) {
      code = message.includes("directory")
        ? ErrorCode.DIRECTORY_NOT_FOUND
        : ErrorCode.FILE_NOT_FOUND;
    } else if (message.includes("permission") || message.includes("eacces")) {
      code = ErrorCode.PERMISSION_DENIED;
    } else if (message.includes("exists") || message.includes("eexist")) {
      code = ErrorCode.FILE_EXISTS;
    } else if (message.includes("not empty") || message.includes("enotempty")) {
      code = ErrorCode.DIRECTORY_NOT_EMPTY;
    } else if (message.includes("disk") || message.includes("enospc")) {
      code = ErrorCode.DISK_FULL;
    }

    return {
      error: {
        code,
        message: error.message,
        details: {
          type: "filesystem_error",
          remediation: this.getFileSystemRemediation(code),
        },
      },
    };
  }

  /**
   * Handle Node.js system errors (ENOENT, EACCES, etc.)
   */
  private static handleNodeError(
    error: NodeJS.ErrnoException
  ): MCPErrorResponse {
    let code = ErrorCode.FILESYSTEM_ERROR;
    let remediation = "Check the file path and permissions";

    switch (error.code) {
      case "ENOENT":
        code = ErrorCode.FILE_NOT_FOUND;
        remediation = "The specified file or directory does not exist";
        break;
      case "EACCES":
      case "EPERM":
        code = ErrorCode.PERMISSION_DENIED;
        remediation =
          "Insufficient permissions to access the file or directory";
        break;
      case "EEXIST":
        code = ErrorCode.FILE_EXISTS;
        remediation = "The file or directory already exists";
        break;
      case "ENOTEMPTY":
        code = ErrorCode.DIRECTORY_NOT_EMPTY;
        remediation = "The directory is not empty";
        break;
      case "ENOSPC":
        code = ErrorCode.DISK_FULL;
        remediation = "No space left on device";
        break;
      case "EISDIR":
        code = ErrorCode.INVALID_OPERATION;
        remediation = "Cannot perform this operation on a directory";
        break;
      case "ENOTDIR":
        code = ErrorCode.INVALID_OPERATION;
        remediation = "Not a directory";
        break;
    }

    return {
      error: {
        code,
        message: error.message,
        details: {
          type: "filesystem_error",
          errno: error.errno,
          syscall: error.syscall,
          path: error.path,
          remediation,
        },
      },
    };
  }

  /**
   * Check if error is a Node.js system error
   */
  private static isNodeError(error: any): error is NodeJS.ErrnoException {
    return (
      error && typeof error.code === "string" && error.code.startsWith("E")
    );
  }

  /**
   * Get remediation advice for security errors
   */
  private static getSecurityRemediation(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.WORKSPACE_BOUNDARY_VIOLATION:
        return "Ensure all paths are within the configured workspace root";
      case ErrorCode.PATH_TRAVERSAL:
        return "Remove path traversal sequences (..) from the path";
      case ErrorCode.SYSTEM_PATH_ACCESS:
        return "System directories cannot be accessed for security reasons";
      case ErrorCode.SENSITIVE_FILE_ACCESS:
        return "Sensitive files (keys, credentials) cannot be accessed";
      case ErrorCode.BLOCKED_PATH:
        return "This path is blocked by the security policy";
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return "Too many operations in a short time. Please wait and try again";
      case ErrorCode.READ_ONLY_MODE:
        return "The filesystem is in read-only mode. Write operations are not allowed";
      case ErrorCode.SYMLINK_ESCAPE:
        return "Symlink target must be within the workspace";
      default:
        return "Review the security policy and ensure compliance";
    }
  }

  /**
   * Get remediation advice for filesystem errors
   */
  private static getFileSystemRemediation(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.FILE_NOT_FOUND:
        return "Verify the file path exists";
      case ErrorCode.DIRECTORY_NOT_FOUND:
        return "Verify the directory path exists";
      case ErrorCode.PERMISSION_DENIED:
        return "Check file permissions and ensure the server has access";
      case ErrorCode.FILE_EXISTS:
        return "The file already exists. Use a different name or delete the existing file";
      case ErrorCode.DIRECTORY_NOT_EMPTY:
        return "The directory must be empty before deletion";
      case ErrorCode.DISK_FULL:
        return "Free up disk space and try again";
      default:
        return "Check the filesystem and try again";
    }
  }

  /**
   * Create a structured error response
   */
  static createErrorResponse(
    code: ErrorCode,
    message: string,
    details?: Record<string, any>
  ): MCPErrorResponse {
    return {
      error: {
        code,
        message,
        details,
      },
    };
  }

  /**
   * Log error for debugging
   */
  static logError(error: Error, context?: Record<string, any>): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: error.message,
        name: error.name,
        stack: error.stack,
        context,
      })
    );
  }
}
