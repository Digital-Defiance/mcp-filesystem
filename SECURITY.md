# Security Policy

## Overview

The MCP Filesystem Server implements defense-in-depth security with multiple layers of protection to ensure AI agents can perform filesystem operations safely within strict boundaries. This document describes the security architecture, configuration, and best practices.

## Security Architecture

### Multi-Layer Security Model

The server implements 10 layers of path validation that work together to prevent unauthorized access:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Absolute Path Resolution                          │
│ Prevents relative path tricks                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Workspace Boundary Check                          │
│ Ensures path is within workspace root                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Path Traversal Detection                          │
│ Blocks .. and ./ sequences                                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: System Path Blocklist (HARDCODED)                 │
│ Blocks /etc, /sys, C:\Windows, etc.                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Sensitive Pattern Blocklist (HARDCODED)           │
│ Blocks .ssh/, *.key, *.pem, etc.                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 6: Subdirectory Restrictions (OPTIONAL)              │
│ Restricts to specific subdirectories within workspace      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 7: User Blocklist (CONFIGURABLE)                     │
│ Custom blocked paths                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 8: User Pattern Blocklist (CONFIGURABLE)             │
│ Custom blocked patterns                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 9: Read-Only Mode (OPTIONAL)                         │
│ Prevents write/delete operations                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 10: Symlink Validation                               │
│ Validates symlink targets are within workspace             │
└─────────────────────────────────────────────────────────────┘
```

## Hardcoded Security (Cannot Be Disabled)

### System Paths (Always Blocked)

The following system paths are **always blocked** and cannot be accessed regardless of configuration:

**Linux/Unix:**

- `/etc` - System configuration
- `/sys` - System information
- `/proc` - Process information
- `/dev` - Device files
- `/boot` - Boot files
- `/root` - Root user home
- `/bin` - System binaries
- `/sbin` - System binaries
- `/usr/bin` - User binaries
- `/usr/sbin` - System binaries

**Windows:**

- `C:\Windows` - Windows system directory
- `C:\Program Files` - Program files
- `C:\Program Files (x86)` - 32-bit program files

**macOS:**

- `/System` - System files
- `/Library` - System library
- `/Applications` - Applications directory

### Sensitive File Patterns (Always Blocked)

The following file patterns are **always blocked** and cannot be accessed:

- `.ssh/` - SSH keys and configuration
- `.aws/` - AWS credentials
- `.kube/` - Kubernetes configuration
- `id_rsa` - SSH private keys
- `*.pem` - PEM certificates
- `*.key` - Private keys
- `*.p12` - PKCS#12 certificates
- `*.pfx` - Personal Information Exchange files
- Files containing: `password`, `secret`, `token`
- `.env` - Environment files with secrets

## Configuration

### Required Configuration

```json
{
  "workspaceRoot": "/absolute/path/to/workspace"
}
```

**CRITICAL**: The `workspaceRoot` is the only required configuration. All operations are confined to this directory and its subdirectories.

### Security Configuration Options

```json
{
  "workspaceRoot": "/path/to/workspace",

  "allowedSubdirectories": ["src", "tests", "docs"],

  "blockedPaths": [".git", ".env", "node_modules", ".ssh"],

  "blockedPatterns": ["*.key", "*.pem", "*.env", "*secret*", "*password*"],

  "maxFileSize": 104857600,
  "maxBatchSize": 1073741824,
  "maxOperationsPerMinute": 100,

  "enableAuditLog": true,
  "requireConfirmation": true,
  "readOnly": false
}
```

### Configuration Options Explained

#### Workspace Boundary

- **workspaceRoot** (REQUIRED): Absolute path to workspace directory
  - All operations are confined to this directory
  - Cannot be changed after server starts
  - Must exist and be a directory

#### Additional Restrictions

- **allowedSubdirectories** (OPTIONAL): Array of subdirectories within workspace
  - If specified, operations are further restricted to these paths
  - Paths are relative to workspace root
  - Example: `["src", "tests"]` only allows access to these directories

#### Custom Blocklists

- **blockedPaths** (OPTIONAL): Array of paths to block

  - Paths are relative to workspace root
  - Example: `[".git", ".env", "node_modules"]`
  - Adds to hardcoded blocklists (does not replace)

- **blockedPatterns** (OPTIONAL): Array of regex patterns to block
  - Example: `["*.key", "*.pem", "*secret*"]`
  - Adds to hardcoded patterns (does not replace)

#### Resource Limits

- **maxFileSize** (OPTIONAL): Maximum file size in bytes

  - Default: 104857600 (100MB)
  - Prevents operations on files exceeding this size

- **maxBatchSize** (OPTIONAL): Maximum total size for batch operations

  - Default: 1073741824 (1GB)
  - Prevents batch operations exceeding this total size

- **maxOperationsPerMinute** (OPTIONAL): Rate limit per agent
  - Default: 100
  - Prevents abuse through excessive operations

#### Operational Settings

- **enableAuditLog** (OPTIONAL): Enable operation logging

  - Default: true
  - Logs all operations with timestamps, paths, and results
  - Security violations logged separately

- **requireConfirmation** (OPTIONAL): Require confirmation for destructive operations

  - Default: true
  - Requires explicit confirmation for delete operations

- **readOnly** (OPTIONAL): Enable read-only mode
  - Default: false
  - Prevents all write and delete operations
  - Useful for untrusted agents

## Security Best Practices

### 1. Principle of Least Privilege

**DO:**

- Set `workspaceRoot` to the minimum directory needed
- Use `allowedSubdirectories` to further restrict access
- Enable `readOnly` mode for read-only use cases
- Set conservative resource limits

**DON'T:**

- Set `workspaceRoot` to `/` or `C:\`
- Allow access to entire home directory
- Disable audit logging
- Set unlimited resource limits

### 2. Defense in Depth

**DO:**

- Use multiple security layers together
- Configure custom blocklists in addition to hardcoded ones
- Enable audit logging for monitoring
- Set rate limits to prevent abuse

**DON'T:**

- Rely on a single security layer
- Assume hardcoded blocklists are sufficient
- Disable security features for convenience

### 3. Monitoring and Auditing

**DO:**

- Enable audit logging (`enableAuditLog: true`)
- Monitor logs for security violations
- Review operation patterns regularly
- Set up alerts for suspicious activity

**DON'T:**

- Disable audit logging in production
- Ignore security violation logs
- Run without monitoring

### 4. Configuration Management

**DO:**

- Store configuration in version control
- Review configuration changes
- Use environment-specific configurations
- Document security decisions

**DON'T:**

- Hard-code sensitive paths in configuration
- Share configurations between environments
- Modify configuration without review

## Example Secure Configurations

### Development Environment

```json
{
  "workspaceRoot": "/home/user/projects/my-project",
  "allowedSubdirectories": ["src", "tests", "docs"],
  "blockedPaths": [".git", ".env", "node_modules"],
  "blockedPatterns": ["*.key", "*.pem"],
  "maxFileSize": 104857600,
  "maxBatchSize": 1073741824,
  "maxOperationsPerMinute": 100,
  "enableAuditLog": true,
  "requireConfirmation": true,
  "readOnly": false
}
```

### Production Environment (Read-Only)

```json
{
  "workspaceRoot": "/var/www/app",
  "allowedSubdirectories": ["public", "assets"],
  "blockedPaths": [".git", ".env", "config"],
  "blockedPatterns": ["*.key", "*.pem", "*.env", "*secret*"],
  "maxFileSize": 52428800,
  "maxBatchSize": 524288000,
  "maxOperationsPerMinute": 50,
  "enableAuditLog": true,
  "requireConfirmation": true,
  "readOnly": true
}
```

### CI/CD Environment

```json
{
  "workspaceRoot": "/workspace",
  "allowedSubdirectories": ["src", "dist", "build"],
  "blockedPaths": [".git", ".env"],
  "blockedPatterns": ["*.key", "*.pem"],
  "maxFileSize": 209715200,
  "maxBatchSize": 2147483648,
  "maxOperationsPerMinute": 200,
  "enableAuditLog": true,
  "requireConfirmation": false,
  "readOnly": false
}
```

## What AI Agents CANNOT Do

Regardless of configuration, AI agents **CANNOT**:

1. Access files outside the workspace root
2. Access system directories (`/etc`, `/sys`, `C:\Windows`, etc.)
3. Access SSH keys, AWS credentials, or other sensitive files
4. Create symlinks pointing outside the workspace
5. Bypass rate limits
6. Disable audit logging
7. Modify the workspace root
8. Access files matching sensitive patterns (`*.key`, `*.pem`, etc.)
9. Escape the workspace through path traversal (`../`)
10. Access files through symlinks pointing outside workspace

## What AI Agents CAN Do (Within Workspace)

Within the configured workspace, AI agents **CAN**:

1. Read, write, and delete files
2. Create and navigate directories
3. Search for files by name or content
4. Watch directories for changes
5. Compute checksums
6. Create symlinks (within workspace)
7. Perform batch operations
8. Sync directories
9. Analyze disk usage
10. Copy and move files

## Audit Logging

### Log Format

All operations are logged in JSON format:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "AUDIT",
  "operation": "fs_batch_operations",
  "paths": ["file1.txt", "file2.txt"],
  "result": "success"
}
```

### Security Violations

Security violations are logged separately:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "SECURITY_VIOLATION",
  "type": "workspace_escape",
  "input": "../../etc/passwd",
  "resolved": "/etc/passwd",
  "workspaceRoot": "/home/user/workspace"
}
```

### Violation Types

- `workspace_escape` - Path outside workspace
- `path_traversal` - Path contains traversal sequences
- `system_path_access` - Attempt to access system directory
- `sensitive_file_access` - Attempt to access sensitive file
- `subdirectory_restriction` - Path not in allowed subdirectories
- `blocked_path` - Path matches user blocklist
- `blocked_pattern` - Path matches blocked pattern
- `rate_limit` - Rate limit exceeded
- `symlink_escape` - Symlink target outside workspace

## Threat Model

### Threats Mitigated

1. **Path Traversal Attacks**: Multiple layers prevent `../` escapes
2. **Symlink Attacks**: Symlink targets validated within workspace
3. **System File Access**: Hardcoded blocklists prevent system access
4. **Credential Theft**: Sensitive patterns block credential files
5. **Resource Exhaustion**: File size and rate limits prevent abuse
6. **Unauthorized Access**: Workspace jail confines all operations

### Threats NOT Mitigated

1. **Malicious File Content**: Server does not scan file contents
2. **Application Logic Bugs**: Server cannot prevent application-level issues
3. **Social Engineering**: Server cannot prevent user manipulation
4. **Physical Access**: Server cannot prevent physical access to files
5. **Network Attacks**: Server does not provide network security

## Reporting Security Issues

If you discover a security vulnerability, please report it to:

- **Email**: security@digitaldefiance.org
- **Subject**: [SECURITY] MCP Filesystem Vulnerability

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**DO NOT** disclose security vulnerabilities publicly until they have been addressed.

## Security Updates

Security updates are released as soon as possible after vulnerabilities are confirmed. Subscribe to:

- **GitHub Security Advisories**: https://github.com/Digital-Defiance/ai-capabilities-suite/security/advisories
- **NPM Security Advisories**: https://www.npmjs.com/package/@ai-capabilities-suite/mcp-filesystem

## Compliance

The MCP Filesystem Server is designed to support compliance with:

- **OWASP Top 10**: Addresses path traversal, injection, and access control
- **CWE-22**: Path Traversal prevention
- **CWE-59**: Improper Link Resolution prevention
- **CWE-73**: External Control of File Name prevention

## License

This security policy is part of the MCP Filesystem Server and is licensed under the MIT License.

## Acknowledgments

Security is a community effort. Thank you to all contributors who help keep this project secure.
