# Error Codes Reference

This document describes all error codes returned by the MCP Filesystem Server, their meanings, and how to resolve them.

## Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "additionalInfo": "value"
    }
  }
}
```

## Error Categories

### Security Errors (SEC-\*)

Security errors indicate violations of security policies. These are logged as security violations in audit logs.

#### SEC-001: Workspace Escape

**Message**: "Path traversal detected - path outside workspace"

**Cause**: Attempted to access a file or directory outside the configured workspace root.

**Example**:

```
Workspace: /home/user/workspace
Attempted: /home/user/workspace/../../etc/passwd
Resolved: /etc/passwd (outside workspace)
```

**Resolution**:

- Ensure all paths are relative to workspace root
- Remove `..` sequences from paths
- Verify workspace root configuration is correct

**Security Layer**: Layer 2 (Workspace Boundary Check)

---

#### SEC-002: Path Traversal

**Message**: "Path contains traversal sequences"

**Cause**: Path contains `..`, `./`, or `.\` sequences.

**Example**:

```
Attempted: "src/../../../etc/passwd"
```

**Resolution**:

- Use absolute paths relative to workspace
- Remove traversal sequences
- Use proper path joining methods

**Security Layer**: Layer 3 (Path Traversal Detection)

---

#### SEC-003: System Path Access

**Message**: "Cannot access system directories"

**Cause**: Attempted to access hardcoded system directories.

**Blocked Paths**:

- Linux/Unix: `/etc`, `/sys`, `/proc`, `/dev`, `/boot`, `/root`, `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`
- macOS: `/System`, `/Library`, `/Applications`
- Windows: `C:\Windows`, `C:\Program Files`, `C:\Program Files (x86)`

**Resolution**:

- These paths are always blocked for security
- Configure workspace to avoid system directories
- Cannot be overridden

**Security Layer**: Layer 4 (System Path Blocklist)

---

#### SEC-004: Sensitive File Access

**Message**: "Cannot access sensitive files"

**Cause**: Attempted to access files matching sensitive patterns.

**Blocked Patterns**:

- `.ssh/`, `.aws/`, `.kube/` directories
- SSH keys: `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`
- Certificates: `*.pem`, `*.key`, `*.p12`, `*.pfx`
- Files containing: `password`, `secret`, `token`
- Environment files: `.env`

**Resolution**:

- These patterns are always blocked for security
- Rename or move files if legitimate access needed
- Cannot be overridden

**Security Layer**: Layer 5 (Sensitive Pattern Blocklist)

---

#### SEC-005: Subdirectory Restriction

**Message**: "Path not in allowed subdirectories"

**Cause**: Path is outside configured `allowedSubdirectories`.

**Example**:

```json
{
  "allowedSubdirectories": ["src", "tests"]
}
```

```
✅ Allowed: /workspace/src/file.ts
❌ Blocked: /workspace/config/secrets.json
```

**Resolution**:

- Access only allowed subdirectories
- Update `allowedSubdirectories` configuration if needed
- Remove subdirectory restrictions if full workspace access required

**Security Layer**: Layer 6 (Subdirectory Restrictions)

---

#### SEC-006: Blocked Path

**Message**: "Path is blocked by security policy"

**Cause**: Path matches user-configured `blockedPaths`.

**Example**:

```json
{
  "blockedPaths": [".git", ".env", "node_modules"]
}
```

**Resolution**:

- Avoid accessing blocked paths
- Update `blockedPaths` configuration if needed
- Use different path if possible

**Security Layer**: Layer 7 (User Blocklist)

---

#### SEC-007: Blocked Pattern

**Message**: "Path matches blocked pattern"

**Cause**: Path matches user-configured `blockedPatterns`.

**Example**:

```json
{
  "blockedPatterns": ["*.key", "*.env", "*secret*"]
}
```

**Resolution**:

- Avoid files matching blocked patterns
- Update `blockedPatterns` configuration if needed
- Rename files if legitimate access needed

**Security Layer**: Layer 8 (User Pattern Blocklist)

---

#### SEC-008: Read-Only Mode

**Message**: "Filesystem is in read-only mode"

**Cause**: Attempted write/delete operation when `readOnly: true`.

**Resolution**:

- Use read operations only (search, checksum, watch)
- Disable read-only mode if write access needed
- Change configuration: `"readOnly": false`

**Security Layer**: Layer 9 (Read-Only Mode)

---

#### SEC-009: Symlink Escape

**Message**: "Symlink target outside workspace"

**Cause**: Attempted to create symlink pointing outside workspace.

**Example**:

```
Workspace: /home/user/workspace
Link: /home/user/workspace/link
Target: /etc/passwd (outside workspace)
```

**Resolution**:

- Ensure symlink targets are within workspace
- Use relative paths for symlink targets
- Validate target path before creating symlink

**Security Layer**: Layer 10 (Symlink Validation)

---

#### SEC-010: Rate Limit Exceeded

**Message**: "Rate limit exceeded"

**Cause**: Exceeded `maxOperationsPerMinute` limit.

**Example**:

```json
{
  "maxOperationsPerMinute": 100
}
```

```
Operations in last 60 seconds: 101
```

**Resolution**:

- Reduce operation frequency
- Increase `maxOperationsPerMinute` if legitimate use
- Batch operations using `fs_batch_operations`
- Add delays between operations

---

#### SEC-011: File Size Exceeded

**Message**: "File size {size} exceeds maximum {maxFileSize}"

**Cause**: File size exceeds `maxFileSize` limit.

**Example**:

```json
{
  "maxFileSize": 104857600 // 100 MB
}
```

**Resolution**:

- Increase `maxFileSize` configuration
- Split large files into smaller chunks
- Use streaming operations for large files

---

#### SEC-012: Batch Size Exceeded

**Message**: "Batch size {size} exceeds maximum {maxBatchSize}"

**Cause**: Total batch operation size exceeds `maxBatchSize` limit.

**Example**:

```json
{
  "maxBatchSize": 1073741824 // 1 GB
}
```

**Resolution**:

- Increase `maxBatchSize` configuration
- Split batch into smaller batches
- Process files individually

---

### Validation Errors (VAL-\*)

Validation errors indicate invalid input parameters.

#### VAL-001: Missing Required Parameter

**Message**: "Missing required parameter: {parameter}"

**Cause**: Required parameter not provided.

**Example**:

```typescript
// Missing 'path' parameter
fs_watch_directory({
  recursive: true,
  // path is required!
});
```

**Resolution**:

- Provide all required parameters
- Check tool documentation for required fields

---

#### VAL-002: Invalid Parameter Type

**Message**: "Invalid parameter type: expected {expected}, got {actual}"

**Cause**: Parameter has wrong type.

**Example**:

```typescript
// 'recursive' should be boolean
fs_watch_directory({
  path: "src",
  recursive: "true", // Should be: true
});
```

**Resolution**:

- Use correct parameter types
- Check tool schema for type requirements

---

#### VAL-003: Invalid Parameter Value

**Message**: "Invalid parameter value: {details}"

**Cause**: Parameter value is invalid.

**Example**:

```typescript
// Invalid algorithm
fs_compute_checksum({
  path: "file.txt",
  algorithm: "md6", // Should be: md5, sha1, sha256, or sha512
});
```

**Resolution**:

- Use valid parameter values
- Check tool documentation for allowed values

---

#### VAL-004: Empty Array

**Message**: "Array parameter cannot be empty: {parameter}"

**Cause**: Array parameter is empty when it shouldn't be.

**Example**:

```typescript
fs_batch_operations({
  operations: [], // Cannot be empty
});
```

**Resolution**:

- Provide at least one array element
- Check if operation is necessary

---

#### VAL-005: Invalid Path Format

**Message**: "Invalid path format: {details}"

**Cause**: Path format is invalid.

**Example**:

```typescript
// Null or undefined path
fs_search_files({
  path: null,
});
```

**Resolution**:

- Provide valid path string
- Use proper path format for your OS

---

### Filesystem Errors (FS-\*)

Filesystem errors indicate issues with filesystem operations.

#### FS-001: File Not Found

**Message**: "File not found: {path}"

**Cause**: Specified file does not exist.

**Resolution**:

- Verify file path is correct
- Check file exists before operation
- Use `fs_search_files` to locate file

---

#### FS-002: Directory Not Found

**Message**: "Directory not found: {path}"

**Cause**: Specified directory does not exist.

**Resolution**:

- Verify directory path is correct
- Create directory first if needed
- Check parent directory exists

---

#### FS-003: Permission Denied

**Message**: "Permission denied: {path}"

**Cause**: Insufficient permissions to access file/directory.

**Resolution**:

- Check file/directory permissions
- Run server with appropriate user permissions
- Verify workspace root permissions

---

#### FS-004: File Already Exists

**Message**: "File already exists: {path}"

**Cause**: Attempted to create file that already exists.

**Resolution**:

- Use different filename
- Delete existing file first (if appropriate)
- Use overwrite option if available

---

#### FS-005: Directory Not Empty

**Message**: "Directory not empty: {path}"

**Cause**: Attempted to delete non-empty directory.

**Resolution**:

- Delete directory contents first
- Use recursive delete option
- Verify directory should be deleted

---

#### FS-006: Disk Full

**Message**: "Disk full: insufficient space for operation"

**Cause**: Not enough disk space for operation.

**Resolution**:

- Free up disk space
- Use different destination with more space
- Reduce operation size

---

#### FS-007: Read Error

**Message**: "Error reading file: {details}"

**Cause**: Failed to read file contents.

**Resolution**:

- Check file is readable
- Verify file is not corrupted
- Check file is not locked by another process

---

#### FS-008: Write Error

**Message**: "Error writing file: {details}"

**Cause**: Failed to write file contents.

**Resolution**:

- Check write permissions
- Verify disk space available
- Check file is not locked

---

#### FS-009: Symlink Error

**Message**: "Error creating symlink: {details}"

**Cause**: Failed to create symbolic link.

**Resolution**:

- Check symlink creation permissions
- Verify target exists
- Check filesystem supports symlinks

---

#### FS-010: Checksum Mismatch

**Message**: "Checksum verification failed: expected {expected}, got {actual}"

**Cause**: Computed checksum doesn't match expected value.

**Resolution**:

- File may be corrupted
- File may have been modified
- Verify expected checksum is correct

---

#### FS-011: File Modified During Operation

**Message**: "File was modified during operation"

**Cause**: File changed while operation was in progress.

**Resolution**:

- Retry operation
- Ensure file is not being modified by other processes
- Use file locking if available

---

### Operation Errors (OP-\*)

Operation errors indicate issues with specific operations.

#### OP-001: Batch Operation Failed

**Message**: "Batch operation failed: {details}"

**Cause**: One or more operations in batch failed.

**Details**: Contains array of failed operations with individual errors.

**Resolution**:

- Check individual operation errors
- Fix failing operations
- Use `atomic: false` to allow partial success

---

#### OP-002: Rollback Failed

**Message**: "Rollback failed: {details}"

**Cause**: Failed to rollback atomic batch operation.

**Resolution**:

- Manual cleanup may be required
- Check audit logs for completed operations
- Verify filesystem state

---

#### OP-003: Watch Session Not Found

**Message**: "Watch session not found: {sessionId}"

**Cause**: Invalid or expired watch session ID.

**Resolution**:

- Verify session ID is correct
- Create new watch session
- Check session wasn't already stopped

---

#### OP-004: Index Not Built

**Message**: "File index not built for path: {path}"

**Cause**: Attempted indexed search without building index first.

**Resolution**:

- Build index using `fs_build_index`
- Use `useIndex: false` for filesystem search
- Verify index path is correct

---

#### OP-005: Search Timeout

**Message**: "Search operation timed out"

**Cause**: Search took too long to complete.

**Resolution**:

- Use more specific search criteria
- Build index for faster searches
- Reduce search scope

---

#### OP-006: Copy Failed

**Message**: "Copy operation failed: {details}"

**Cause**: Failed to copy file or directory.

**Resolution**:

- Check source exists
- Verify destination is writable
- Check disk space available

---

#### OP-007: Move Failed

**Message**: "Move operation failed: {details}"

**Cause**: Failed to move file or directory.

**Resolution**:

- Check source exists
- Verify destination is writable
- Check source is not in use

---

#### OP-008: Delete Failed

**Message**: "Delete operation failed: {details}"

**Cause**: Failed to delete file or directory.

**Resolution**:

- Check file exists
- Verify delete permissions
- Check file is not in use

---

## Error Handling Best Practices

### 1. Check Error Codes

Always check the error code to determine the type of error:

```typescript
try {
  const result = await mcpClient.callTool("fs_batch_operations", args);
} catch (error) {
  if (error.code.startsWith("SEC-")) {
    // Security error - check configuration
  } else if (error.code.startsWith("VAL-")) {
    // Validation error - fix input
  } else if (error.code.startsWith("FS-")) {
    // Filesystem error - check file system
  }
}
```

### 2. Log Error Details

Always log error details for debugging:

```typescript
console.error("Operation failed:", {
  code: error.code,
  message: error.message,
  details: error.details,
  timestamp: new Date().toISOString(),
});
```

### 3. Retry Transient Errors

Some errors are transient and can be retried:

```typescript
const RETRYABLE_CODES = ["FS-007", "FS-008", "FS-011"];

async function retryOperation(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (!RETRYABLE_CODES.includes(error.code) || i === maxRetries - 1) {
        throw error;
      }
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}
```

### 4. Handle Security Errors Gracefully

Security errors indicate configuration issues:

```typescript
if (error.code.startsWith("SEC-")) {
  console.error("Security policy violation:", error.message);
  console.error("Check your configuration and workspace boundaries");
  // Don't retry - fix configuration instead
}
```

### 5. Validate Input Before Operations

Prevent validation errors by validating input:

```typescript
function validateBatchOperations(operations) {
  if (!Array.isArray(operations)) {
    throw new Error("Operations must be an array");
  }
  if (operations.length === 0) {
    throw new Error("Operations cannot be empty");
  }
  for (const op of operations) {
    if (!["copy", "move", "delete"].includes(op.type)) {
      throw new Error(`Invalid operation type: ${op.type}`);
    }
    if (!op.source) {
      throw new Error("Operation missing source");
    }
  }
}
```

## Support

For questions about error codes:

- **Documentation**: [README.md](./README.md)
- **Security**: [SECURITY.md](./SECURITY.md)
- **Issues**: [GitHub Issues](https://github.com/Digital-Defiance/ai-capabilities-suite/issues)
- **Email**: info@digitaldefiance.org
