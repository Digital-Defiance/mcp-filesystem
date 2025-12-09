# Publishing Guide

This guide covers publishing the MCP Filesystem server to various registries and platforms.

## Table of Contents

1. [NPM Registry](#npm-registry)
2. [Docker Hub](#docker-hub)
3. [Official MCP Registry](#official-mcp-registry)
4. [GitHub Container Registry](#github-container-registry)

## NPM Registry

### Prerequisites

- NPM account with publishing rights
- `NPM_TOKEN` secret configured in GitHub repository

### Manual Publishing

```bash
# Build the project
yarn build

# Run tests
yarn test

# Publish to NPM
npm publish --access public
```

### Automated Publishing

Publishing to NPM is automated via GitHub Actions when a version tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `.github/workflows/release.yml` workflow will:

1. Build the project
2. Run tests
3. Publish to NPM with provenance
4. Create a GitHub release

## Docker Hub

### Prerequisites

- Docker Hub account
- `DOCKER_USERNAME` and `DOCKER_TOKEN` secrets configured in GitHub repository

### Manual Publishing

```bash
# Build the Docker image
docker build -t digitaldefiance/mcp-filesystem:latest .

# Tag with version
docker tag digitaldefiance/mcp-filesystem:latest digitaldefiance/mcp-filesystem:0.1.0

# Push to Docker Hub
docker push digitaldefiance/mcp-filesystem:latest
docker push digitaldefiance/mcp-filesystem:0.1.0
```

### Automated Publishing

Docker images are automatically built and published via GitHub Actions when a version tag is pushed. The `.github/workflows/docker-publish.yml` workflow handles:

1. Multi-platform builds (linux/amd64, linux/arm64)
2. Security scanning with Trivy
3. Publishing to Docker Hub
4. Updating Docker Hub description

## Official MCP Registry

The MCP Filesystem server can be published to the official MCP Registry at `https://registry.modelcontextprotocol.io`.

### Prerequisites

1. **Install mcp-publisher CLI**:

   **macOS/Linux (Homebrew):**

   ```bash
   brew install mcp-publisher
   ```

   **macOS/Linux/WSL (curl):**

   ```bash
   curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
   ```

   **Windows (PowerShell):**

   ```powershell
   $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
   Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
   tar xf mcp-publisher.tar.gz mcp-publisher.exe
   rm mcp-publisher.tar.gz
   ```

2. **Ensure packages are published**: The server must be published to NPM and/or Docker Hub first, as the MCP Registry is a metaregistry that references packages in other registries.

### Authentication

The server uses the `io.github.Digital-Defiance/*` namespace, which requires GitHub authentication.

#### Option 1: Interactive GitHub Login (Manual)

```bash
mcp-publisher login github
```

This will open your browser for GitHub OAuth authentication.

#### Option 2: GitHub Actions OIDC (Automated)

For CI/CD workflows, use GitHub Actions OIDC:

```bash
mcp-publisher login github-oidc
```

**Note**: Requires `id-token: write` permission in the GitHub Actions workflow.

### Publishing

#### Manual Publishing

1. Navigate to the package directory:

   ```bash
   cd packages/mcp-filesystem
   ```

2. Verify the server.json configuration:

   ```bash
   cat server.json
   ```

3. Validate before publishing (dry run):

   ```bash
   mcp-publisher publish --dry-run
   ```

4. Publish to the registry:

   ```bash
   mcp-publisher publish
   ```

5. Verify publication:
   ```bash
   curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Digital-Defiance/mcp-filesystem"
   ```

#### Automated Publishing via GitHub Actions

Create a workflow file `.github/workflows/mcp-registry-publish.yml`:

```yaml
name: Publish to MCP Registry

on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:

jobs:
  publish-mcp-registry:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # Required for GitHub OIDC

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_linux_amd64.tar.gz" | tar xz
          sudo mv mcp-publisher /usr/local/bin/

      - name: Authenticate with GitHub OIDC
        run: mcp-publisher login github-oidc

      - name: Publish to MCP Registry
        working-directory: packages/mcp-filesystem
        run: mcp-publisher publish

      - name: Verify publication
        run: |
          sleep 5  # Wait for registry to update
          curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Digital-Defiance/mcp-filesystem"
```

### Updating Versions

When publishing a new version:

1. Update version in `package.json`
2. Update version in `server.json`
3. Ensure versions match between package.json and server.json
4. Publish to NPM/Docker first
5. Then publish to MCP Registry

```bash
# Update versions
npm version patch  # or minor, major

# Update server.json version to match
# Then publish
npm publish --access public
mcp-publisher publish
```

### Server.json Configuration

The `server.json` file defines how the server appears in the MCP Registry:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
  "name": "io.github.Digital-Defiance/mcp-filesystem",
  "description": "Advanced filesystem operations for AI agents with strict security boundaries",
  "version": "0.1.0",
  "homepage": "https://github.com/Digital-Defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem",
  "license": "MIT",
  "packages": [
    {
      "registry_type": "npm",
      "identifier": "@ai-capabilities-suite/mcp-filesystem",
      "version": "0.1.0"
    },
    {
      "registry_type": "docker",
      "identifier": "digitaldefiance/mcp-filesystem",
      "version": "latest"
    }
  ],
  "capabilities": {
    "tools": [
      "fs_batch_operations",
      "fs_watch_directory",
      "fs_get_watch_events",
      "fs_stop_watch",
      "fs_search_files",
      "fs_build_index",
      "fs_create_symlink",
      "fs_compute_checksum",
      "fs_verify_checksum",
      "fs_analyze_disk_usage",
      "fs_copy_directory",
      "fs_sync_directory"
    ]
  },
  "categories": [
    "filesystem",
    "file-management",
    "security",
    "development-tools"
  ]
}
```

### Package Validation

The MCP Registry validates package ownership. For NPM packages, ensure:

1. The `mcpName` field in `package.json` matches the server name:

   ```json
   {
     "mcpName": "io.github.Digital-Defiance/mcp-filesystem"
   }
   ```

2. Or the README mentions the server name

3. For Docker images, include a label:
   ```dockerfile
   LABEL io.modelcontextprotocol.server-name="io.github.Digital-Defiance/mcp-filesystem"
   ```

## GitHub Container Registry

### Prerequisites

- GitHub account with package publishing rights
- `GITHUB_TOKEN` with `write:packages` scope

### Publishing

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build and tag
docker build -t ghcr.io/digital-defiance/mcp-filesystem:latest .
docker tag ghcr.io/digital-defiance/mcp-filesystem:latest ghcr.io/digital-defiance/mcp-filesystem:0.1.0

# Push
docker push ghcr.io/digital-defiance/mcp-filesystem:latest
docker push ghcr.io/digital-defiance/mcp-filesystem:0.1.0
```

## Troubleshooting

### NPM Publishing Issues

**"Authentication failed"**

- Verify `NPM_TOKEN` is set correctly
- Check token has publishing rights
- Ensure token hasn't expired

**"Version already exists"**

- Bump version in package.json
- Use `npm version patch/minor/major`

### Docker Publishing Issues

**"Authentication failed"**

- Verify Docker Hub credentials
- Check `DOCKER_USERNAME` and `DOCKER_TOKEN` secrets

**"Manifest not found"**

- Ensure image was built successfully
- Check image tag matches push command

### MCP Registry Publishing Issues

**"Package validation failed"**

- Ensure package is published to NPM/Docker first
- Verify `mcpName` field in package.json
- Check Docker image labels

**"Namespace not authorized"**

- Verify GitHub authentication
- Ensure you have access to the Digital-Defiance organization

**"Version already exists"**

- Each version must be unique
- Update version in both package.json and server.json
- Use prerelease labels if needed (e.g., "0.1.0-1")

## Best Practices

1. **Version Consistency**: Keep versions synchronized across package.json, server.json, and Docker tags

2. **Semantic Versioning**: Follow semver (MAJOR.MINOR.PATCH) for version numbers

3. **Test Before Publishing**: Always run tests before publishing to any registry

4. **Dry Run**: Use `--dry-run` flags when available to validate before actual publishing

5. **Automated Publishing**: Use GitHub Actions for consistent, automated publishing

6. **Security**: Never commit tokens or credentials to version control

7. **Documentation**: Update CHANGELOG.md and release notes for each version

## Resources

- [NPM Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [MCP Registry Documentation](https://modelcontextprotocol.info/tools/registry/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)

## Support

For publishing issues:

- **NPM**: https://www.npmjs.com/support
- **Docker Hub**: https://hub.docker.com/support
- **MCP Registry**: https://github.com/modelcontextprotocol/registry/issues
- **Project Issues**: https://github.com/Digital-Defiance/ai-capabilities-suite/issues
