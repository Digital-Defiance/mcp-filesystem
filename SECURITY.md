# Security Configuration Guide

## Overview

The MCP Filesystem Server implements a defense-in-depth security architecture with multiple layers of protection. This guide explains the security model, configuration options, and best practices.

## Security Philosophy

### Core Principles

1. **Workspace Jail**: All operations are confined to a single workspace root directory
2. **Defense in Depth**: 10 layers of path validation ensure comprehensive protection
3. **Principle of Least Privilege**: Minimal access by default, explicit grants required
4. **Audit and Accountability**: All operations logged for forensic analysis
5. **Fail Secure**: Security violations result in operation denial, not degraded security

### Threat Model

The server protects against:

- **Path Traversal Attacks**: Attempts to escape workspace using `../` sequences
- **Symlink Attacks**: Symlinks pointing outside workspace boundaries
- **System File Access**: Unauthorized access to system directories and sensitive files
- **Resource Exhaustion**: Large file operations that could fill disk or consume memory
- **Rate Limit Abuse**: Excessive operations that could impact system performance

## 10-Layer Security Architecture

### Layer 1: Absolute Path Resolution

**Purpose**: Prevent relative path manipulation

**Implementation**: All paths are resolved to absolute paths before validation

**Example**:

```
Input:  "../../etc/passwd"
Resolved: "/workspace/../../etc/passwd" → "/etc/passwd"
Result: BLOCKED (outside workspace)
```

### Layer 2: Workspace Boundary Check

**Purpose**: Ensure all operations stay within workspace

**Implementation**: Resolved path must start with workspace root

**Configuration**: Set via `workspaceRoot` (REQUIRED)

**Example**:

```json
{
  "workspaceRoot": "/home/user/projects/my-app"
}
```

**What's Blocked**:

- Any path resolving outside `/home/user/projects/my-app`
- Symlinks pointing outside workspace
- Relative paths that escape workspace

### Layer 3: Path Traversal Detection

**Purpose**: Block obvious traversal attempts

**Implementation**: Reject paths containing `..`, `./`, or `.\`

**Example**:

```
BLOCKED: "src/../../../etc/passwd"
BLOCKED: "./../../sensitive/file"
ALLOWED: "src/components/Button.tsx"
```

### Layer 4: System Path Blocklist (Hardcoded)

**Purpose**: Prevent access to critical system directories

**Implementation**: Hardcoded list that CANNOT be overridden

**Blocked Paths**:

**Linux/Unix**:

- `/etc` - System configuration
- `/sys` - System information
- `/proc` - Process information
- `/dev` - Device files
- `/boot` - Boot files
- `/root` - Root user home
- `/bin`, `/sbin` - System binaries
- `/usr/bin`, `/usr/sbin` - User binaries

**macOS**:

- `/System` - System files
- `/Library` - System libraries
- `/Applications` - System applications

**Windows**:

- `C:\Windows` - Windows system directory
- `C:\Program Files` - Program files
- `C:\Program Files (x86)` - 32-bit programs

**Why Hardcoded**: These paths contain critical system files. Allowing access could compromise system security or stability.

### Layer 5: Sensitive Pattern Blocklist (Hardcoded)

**Purpose**: Prevent access to sensitive files and credentials

**Implementation**: Hardcoded patterns that CANNOT be overridden

**Blocked Patterns**:

**SSH Keys and Certificates**:

- `.ssh/` directory
- `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`
- `*.pem` - PEM certificates
- `*.key` - Private keys
- `*.p12`, `*.pfx` - PKCS#12 certificates

**Cloud Credentials**:

- `.aws/` - AWS credentials
- `.kube/` - Kubernetes config
- `.gcloud/` - Google Cloud credentials

**Secrets and Passwords**:

- Files containing `password` (case-insensitive)
- Files containing `secret` (case-insensitive)
- Files containing `token` (case-insensitive)
- `.env` files - Environment variables

**Why Hardcoded**: These files contain credentials and secrets. Exposing them to AI agents could lead to credential theft or unauthorized access.

### Layer 6: Subdirectory Restrictions (Optional)

**Purpose**: Further restrict access within workspace

**Configuration**: Set via `allowedSubdirectories`

**Example**:

```json
{
  "workspaceRoot": "/home/user/projects/my-app",
  "allowedSubdirectories": ["src", "tests", "docs"]
}
```

**Effect**:

- ✅ ALLOWED: `/home/user/projects/my-app/src/index.ts`
- ✅ ALLOWED: `/home/user/projects/my-app/tests/unit.test.ts`
- ❌ BLOCKED: `/home/user/projects/my-app/config/secrets.json`
- ❌ BLOCKED: `/home/user/projects/my-app/.git/config`

**Use Case**: Restrict AI agents to specific directories (e.g., only source code, not configuration)

### Layer 7: User Blocklist

**Purpose**: Block specific paths within workspace

**Configuration**: Set via `blockedPaths`

**Example**:

```json
{
  "blockedPaths": [
    ".git",
    ".env",
    "node_modules",
    ".ssh",
    "config/production.json"
  ]
}
```

**Effect**: These paths are blocked even if within workspace and allowed subdirectories

### Layer 8: User Pattern Blocklist

**Purpose**: Block files matching patterns

**Configuration**: Set via `blockedPatterns`

**Example**:

```json
{
  "blockedPatterns": [
    "*.key",
    "*.pem",
    "*.env",
    "*secret*",
    "*password*",
    "*.config.prod.*"
  ]
}
```

**Pattern Syntax**: Standard regex patterns

### Layer 9: Read-Only Mode

**Purpose**: Prevent all write operations

**Configuration**: Set via `readOnly`

**Example**:

```json
{
  "readOnly": true
}
```

**Effect**:

- ✅ ALLOWED: Read operations (search, checksum, watch)
- ❌ BLOCKED: Write operations (copy, move, delete, create)

**Use Case**: Allow AI agents to analyze code but not modify it

### Layer 10: Symlink Validation

**Purpose**: Prevent symlink escape attacks

**Implementation**:

- Symlink targets must be within workspace
- Symlink chains are recursively validated
- Broken symlinks are handled gracefully

**Example**:

```
Workspace: /home/user/workspace

✅ ALLOWED:
  Link: /home/user/workspace/link → /home/user/workspace/target

❌ BLOCKED:
  Link: /home/user/workspace/link → /etc/passwd
  Link: /home/user/workspace/link → /home/user/.ssh/id_rsa
```

## Configuration Examples

### Example 1: Development Environment (Permissive)

```json
{
  "workspaceRoot": "/home/user/projects/my-app",
  "blockedPaths": [".git", "node_modules"],
  "blockedPatterns": ["*.env"],
  "maxFileSize": 104857600,
  "maxBatchSize": 1073741824,
  "maxOperationsPerMinute": 200,
  "enableAuditLog": true,
  "readOnly": false
}
```

**Use Case**: Local development with AI assistant
**Access**: Full workspace except `.git` and `node_modules`
**Risk Level**: Low (trusted local environment)

### Example 2: Production Environment (Restrictive)

```json
{
  "workspaceRoot": "/var/app/production",
  "allowedSubdirectories": ["logs", "public"],
  "blockedPaths": ["config", ".env", "secrets", "database"],
  "blockedPatterns": [
    "*.key",
    "*.pem",
    "*.env",
    "*secret*",
    "*password*",
    "*.config.*"
  ],
  "maxFileSize": 10485760,
  "maxBatchSize": 104857600,
  "maxOperationsPerMinute": 50,
  "enableAuditLog": true,
  "requireConfirmation": true,
  "readOnly": false
}
```

**Use Case**: Production server with AI monitoring
**Access**: Only logs and public files
**Risk Level**: Medium (production environment)

### Example 3: Read-Only Analysis (Most Restrictive)

```json
{
  "workspaceRoot": "/home/user/codebase",
  "allowedSubdirectories": ["src", "tests"],
  "blockedPaths": [".git", "node_modules", ".env"],
  "blockedPatterns": ["*.key", "*.pem", "*.env"],
  "maxFileSize": 52428800,
  "maxBatchSize": 524288000,
  "maxOperationsPerMinute": 100,
  "enableAuditLog": true,
  "readOnly": true
}
```

**Use Case**: Code analysis and review
**Access**: Read-only access to source and tests
**Risk Level**: Very Low (no write access)

### Example 4: Shared Team Environment

```json
{
  "workspaceRoot": "/shared/team/project",
  "allowedSubdirectories": ["src", "tests", "docs", "scripts"],
  "blockedPaths": [
    ".git",
    ".env",
    "node_modules",
    "config/production",
    "secrets"
  ],
  "blockedPatterns": [
    "*.key",
    "*.pem",
    "*.env",
    "*secret*",
    "*password*",
    "*.prod.*"
  ],
  "maxFileSize": 52428800,
  "maxBatchSize": 524288000,
  "maxOperationsPerMinute": 75,
  "enableAuditLog": true,
  "requireConfirmation": true,
  "readOnly": false
}
```

**Use Case**: Shared development environment
**Access**: Source, tests, docs, scripts only
**Risk Level**: Medium (multiple users)

## Resource Limits

### File Size Limits

**Purpose**: Prevent disk exhaustion and memory issues

**Configuration**:

```json
{
  "maxFileSize": 104857600, // 100 MB per file
  "maxBatchSize": 1073741824 // 1 GB total per batch
}
```

**Recommendations**:

- **Development**: 100 MB file, 1 GB batch
- **Production**: 10 MB file, 100 MB batch
- **Analysis**: 50 MB file, 500 MB batch

### Rate Limiting

**Purpose**: Prevent resource exhaustion from excessive operations

**Configuration**:

```json
{
  "maxOperationsPerMinute": 100
}
```

**How It Works**:

- Tracks operations per agent per minute
- Sliding window (last 60 seconds)
- Separate limit per agent ID

**Recommendations**:

- **Development**: 200 ops/min
- **Production**: 50 ops/min
- **Shared**: 75 ops/min

## Audit Logging

### What Gets Logged

**Successful Operations**:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "AUDIT",
  "operation": "fs_batch_operations",
  "paths": ["src/file1.ts", "src/file2.ts"],
  "result": "success"
}
```

**Security Violations**:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "SECURITY_VIOLATION",
  "type": "workspace_escape",
  "input": "../../etc/passwd",
  "resolved": "/etc/passwd",
  "workspaceRoot": "/home/user/workspace"
}
```

### Violation Types

- `workspace_escape`: Path outside workspace
- `path_traversal`: Path contains `..` sequences
- `system_path_access`: Attempt to access system directory
- `sensitive_file_access`: Attempt to access sensitive file
- `subdirectory_restriction`: Path not in allowed subdirectories
- `blocked_path`: Path in user blocklist
- `blocked_pattern`: Path matches blocked pattern
- `symlink_escape`: Symlink target outside workspace
- `rate_limit`: Too many operations

### Log Analysis

**Find Security Violations**:

```bash
grep "SECURITY_VIOLATION" mcp-filesystem.log
```

**Count Violations by Type**:

```bash
grep "SECURITY_VIOLATION" mcp-filesystem.log | jq -r '.type' | sort | uniq -c
```

**Find Specific Agent Activity**:

```bash
grep "agent-id-123" mcp-filesystem.log
```

## What AI Agents CANNOT Do

### Filesystem Access Restrictions

❌ **Access files outside workspace root**

- All operations confined to configured workspace
- Cannot access parent directories
- Cannot follow symlinks outside workspace

❌ **Access system directories** (Hardcoded - Cannot be disabled)

- `/etc`, `/sys`, `/proc`, `/dev`, `/boot`, `/root`
- `C:\Windows`, `C:\Program Files`
- `/System`, `/Library`, `/Applications`
- `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`

❌ **Access sensitive files** (Hardcoded - Cannot be disabled)

- SSH keys (`.ssh/`, `id_rsa`, etc.)
- Certificates (`*.pem`, `*.key`, `*.p12`, `*.pfx`)
- Cloud credentials (`.aws/`, `.kube/`, `.gcloud/`)
- Secrets and passwords (files containing these terms)
- Environment files (`.env`)

❌ **Bypass security layers**

- Cannot disable path validation
- Cannot override hardcoded blocklists
- Cannot modify workspace root after startup
- Cannot disable audit logging

❌ **Exceed resource limits**

- Cannot process files larger than `maxFileSize`
- Cannot batch operations exceeding `maxBatchSize`
- Cannot exceed `maxOperationsPerMinute` rate limit

### Operation Restrictions

❌ **Write operations in read-only mode**

- When `readOnly: true`, all write operations blocked
- Includes: copy, move, delete, create, modify

❌ **Create symlinks outside workspace**

- All symlink targets must be within workspace
- Symlink chains validated recursively

❌ **Access blocked paths**

- Paths in `blockedPaths` always denied
- Patterns in `blockedPatterns` always denied

❌ **Access restricted subdirectories**

- When `allowedSubdirectories` configured, only those paths accessible
- All other workspace paths blocked

## What AI Agents CAN Do (Within Workspace)

### Read Operations

✅ **Read files**

- Read file contents
- Get file metadata (size, timestamps, permissions)
- List directory contents

✅ **Search files**

- Search by filename pattern
- Search by content (full-text)
- Search by metadata (size, date, type)
- Use indexed search for performance

✅ **Watch directories**

- Monitor filesystem changes
- Filter events by pattern
- Receive real-time notifications

✅ **Compute checksums**

- MD5, SHA-1, SHA-256, SHA-512
- Verify file integrity
- Batch checksum operations

✅ **Analyze disk usage**

- Calculate directory sizes
- Identify largest files
- Group by file type

### Write Operations (When Not Read-Only)

✅ **Create and modify files**

- Write new files
- Modify existing files
- Atomic file replacement

✅ **Copy and move files**

- Single file operations
- Batch operations with rollback
- Recursive directory copy

✅ **Delete files**

- Single file deletion
- Batch deletion with rollback
- Recursive directory deletion

✅ **Create symlinks** (within workspace)

- Create symbolic links
- Link targets must be within workspace
- Symlink chains validated

✅ **Sync directories**

- Copy only newer/missing files
- Exclude patterns supported
- Preserve metadata option

### Advanced Operations

✅ **Batch operations**

- Execute multiple operations atomically
- Automatic rollback on failure
- Mixed operation types (copy, move, delete)

✅ **Build file indexes**

- Index file metadata
- Index text content
- Fast search queries

✅ **Directory operations**

- Recursive copy with exclusions
- Sync with timestamp comparison
- Preserve metadata and permissions

## Best Practices

### 1. Principle of Least Privilege

**Start Restrictive**: Begin with minimal access and expand as needed

```json
{
  "workspaceRoot": "/project",
  "allowedSubdirectories": ["src"], // Start with just source
  "readOnly": true // Start read-only
}
```

**Expand Gradually**: Add access only when required

```json
{
  "allowedSubdirectories": ["src", "tests"], // Add tests
  "readOnly": false // Enable writes
}
```

### 2. Use Subdirectory Restrictions

**Don't**: Allow full workspace access

```json
{
  "workspaceRoot": "/project"
  // No subdirectory restrictions - full access
}
```

**Do**: Restrict to necessary directories

```json
{
  "workspaceRoot": "/project",
  "allowedSubdirectories": ["src", "tests", "docs"]
}
```

### 3. Block Sensitive Paths

**Always block**:

- Version control: `.git`, `.svn`, `.hg`
- Dependencies: `node_modules`, `vendor`, `venv`
- Environment files: `.env`, `.env.local`, `.env.production`
- Configuration: `config/production`, `secrets/`

```json
{
  "blockedPaths": [
    ".git",
    ".env",
    "node_modules",
    "config/production",
    "secrets"
  ]
}
```

### 4. Use Pattern Blocklists

**Block by extension**:

```json
{
  "blockedPatterns": ["*.key", "*.pem", "*.env", "*.p12", "*.pfx"]
}
```

**Block by content**:

```json
{
  "blockedPatterns": ["*secret*", "*password*", "*token*", "*credential*"]
}
```

### 5. Enable Audit Logging

**Always enable in production**:

```json
{
  "enableAuditLog": true
}
```

**Monitor logs regularly**:

```bash
# Check for violations
grep "SECURITY_VIOLATION" logs/mcp-filesystem.log

# Monitor operations
tail -f logs/mcp-filesystem.log | grep "AUDIT"
```

### 6. Set Appropriate Resource Limits

**Match limits to environment**:

**Development** (generous):

```json
{
  "maxFileSize": 104857600, // 100 MB
  "maxBatchSize": 1073741824, // 1 GB
  "maxOperationsPerMinute": 200
}
```

**Production** (conservative):

```json
{
  "maxFileSize": 10485760, // 10 MB
  "maxBatchSize": 104857600, // 100 MB
  "maxOperationsPerMinute": 50
}
```

### 7. Use Read-Only Mode for Analysis

**Code review and analysis**:

```json
{
  "readOnly": true,
  "allowedSubdirectories": ["src", "tests"]
}
```

**Benefits**:

- No risk of accidental modifications
- Safe for untrusted agents
- Audit trail of read operations

### 8. Regular Security Audits

**Review configuration monthly**:

- Are subdirectory restrictions still appropriate?
- Are blocked paths comprehensive?
- Are resource limits adequate?

**Review audit logs weekly**:

- Any security violations?
- Unusual operation patterns?
- Rate limit violations?

**Update blocklists regularly**:

- New sensitive file patterns?
- New configuration files to protect?
- New dependencies to exclude?

## Security Checklist

Before deploying to production:

- [ ] Workspace root is correctly configured
- [ ] Subdirectory restrictions are in place
- [ ] Blocked paths include all sensitive directories
- [ ] Blocked patterns cover all sensitive file types
- [ ] Resource limits are appropriate for environment
- [ ] Audit logging is enabled
- [ ] Read-only mode considered for analysis workloads
- [ ] Logs are monitored regularly
- [ ] Security configuration is version controlled
- [ ] Team is trained on security model

## Incident Response

### If Security Violation Detected

1. **Identify the violation**:

   ```bash
   grep "SECURITY_VIOLATION" logs/mcp-filesystem.log | tail -20
   ```

2. **Determine severity**:

   - **Critical**: System path or sensitive file access attempt
   - **High**: Workspace escape attempt
   - **Medium**: Blocked path access
   - **Low**: Rate limit violation

3. **Take action**:

   - **Critical/High**: Stop server immediately, investigate
   - **Medium**: Review configuration, tighten restrictions
   - **Low**: Adjust rate limits if legitimate use

4. **Update configuration**:

   - Add new blocked paths/patterns
   - Tighten subdirectory restrictions
   - Reduce resource limits if needed

5. **Document incident**:
   - What was attempted?
   - How was it blocked?
   - What configuration changes were made?

## Support

For security concerns or questions:

- **Email**: security@digitaldefiance.org
- **Issues**: [GitHub Security Advisories](https://github.com/Digital-Defiance/ai-capabilities-suite/security/advisories)

## Security Updates

Subscribe to security updates:

- Watch the [GitHub repository](https://github.com/Digital-Defiance/ai-capabilities-suite)
- Follow [@DigitalDefiance](https://twitter.com/DigitalDefiance) on Twitter
- Join our [Discord community](https://discord.gg/digitaldefiance)
