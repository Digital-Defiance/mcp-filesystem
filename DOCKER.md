# Docker Deployment Guide

This guide covers deploying the MCP Filesystem server using Docker.

## Quick Start

### 1. Pull the Image

```bash
docker pull digitaldefiance/mcp-filesystem:latest
```

### 2. Create Configuration

Create a `config` directory with `mcp-filesystem-config.json`:

```bash
mkdir -p config workspace
```

Create `config/mcp-filesystem-config.json`:

```json
{
  "workspaceRoot": "/app/workspace",
  "blockedPaths": [".git", ".env", "node_modules"],
  "blockedPatterns": ["*.key", "*.pem", "*.env"],
  "maxFileSize": 104857600,
  "maxBatchSize": 1073741824,
  "maxOperationsPerMinute": 100,
  "enableAuditLog": true,
  "readOnly": false
}
```

### 3. Run with Docker Compose

```bash
docker-compose up -d
```

Or run directly:

```bash
docker run -d \
  --name mcp-filesystem \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/workspace:/app/workspace:rw \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --user 1001:1001 \
  digitaldefiance/mcp-filesystem:latest
```

## Docker Compose Configuration

The included `docker-compose.yml` provides a secure default configuration:

```yaml
version: "3.8"

services:
  mcp-filesystem:
    image: digitaldefiance/mcp-filesystem:latest
    container_name: mcp-filesystem-server

    # Security settings
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - DAC_OVERRIDE
      - FOWNER

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G

    # Volumes
    volumes:
      - ./config:/app/config:ro
      - ./workspace:/app/workspace:rw

    # User (non-root)
    user: "1001:1001"
```

## Environment Variables

- `NODE_ENV`: Set to `production` (default)
- `MCP_FILESYSTEM_CONFIG_PATH`: Path to config file (default: `/app/config/mcp-filesystem-config.json`)
- `MCP_FILESYSTEM_WORKSPACE`: Workspace root directory (default: `/app/workspace`)

## Volume Mounts

### Configuration Volume (Read-Only)

Mount your configuration directory to `/app/config`:

```bash
-v $(pwd)/config:/app/config:ro
```

**Important**: This volume should be read-only (`:ro`) for security.

### Workspace Volume (Read-Write)

Mount your workspace directory to `/app/workspace`:

```bash
-v $(pwd)/workspace:/app/workspace:rw
```

This is where the MCP server will perform filesystem operations.

## Security Considerations

### Container Security

The Docker image implements multiple security layers:

1. **Non-Root User**: Runs as user `1001:1001`
2. **Minimal Capabilities**: Only essential Linux capabilities enabled
3. **No New Privileges**: Prevents privilege escalation
4. **Read-Only Root**: Container root filesystem is read-only where possible
5. **Resource Limits**: CPU and memory limits prevent resource exhaustion

### Filesystem Security

All filesystem operations are confined to `/app/workspace` within the container. The security manager enforces:

- Workspace boundary enforcement
- Path traversal prevention
- System path blocking
- Sensitive file pattern blocking
- Rate limiting
- Audit logging

### Network Isolation

The default configuration uses `network_mode: none` since MCP uses stdio transport and doesn't require network access.

## Building from Source

### Build the Image

```bash
docker build -t mcp-filesystem:local .
```

### Multi-Platform Build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t mcp-filesystem:local \
  .
```

## Health Checks

The container includes a health check that runs every 30 seconds:

```bash
docker ps --filter name=mcp-filesystem
```

Check health status:

```bash
docker inspect --format='{{.State.Health.Status}}' mcp-filesystem
```

## Logging

### View Logs

```bash
docker logs mcp-filesystem
```

### Follow Logs

```bash
docker logs -f mcp-filesystem
```

### Log Configuration

The default logging configuration:

- Driver: `json-file`
- Max size: `10m`
- Max files: `3`

Customize in `docker-compose.yml`:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Resource Management

### CPU Limits

```yaml
deploy:
  resources:
    limits:
      cpus: "2.0"
    reservations:
      cpus: "0.5"
```

### Memory Limits

```yaml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 512M
```

## Troubleshooting

### Container Won't Start

**Check logs:**

```bash
docker logs mcp-filesystem
```

**Common issues:**

1. **Configuration file not found**: Ensure `config/mcp-filesystem-config.json` exists
2. **Permission denied**: Check volume mount permissions
3. **Invalid configuration**: Validate JSON syntax

### Permission Errors

**Issue**: Cannot write to workspace

**Solution**: Ensure workspace directory has correct permissions:

```bash
chown -R 1001:1001 workspace
chmod -R 755 workspace
```

### High Memory Usage

**Issue**: Container using too much memory

**Solution**: Adjust memory limits in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 1G
```

### Rate Limit Errors

**Issue**: "Rate limit exceeded" errors

**Solution**: Increase `maxOperationsPerMinute` in configuration or add delays between operations.

## Production Deployment

### Docker Swarm

Deploy as a service:

```bash
docker stack deploy -c docker-compose.yml mcp-filesystem
```

### Kubernetes

Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-filesystem
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-filesystem
  template:
    metadata:
      labels:
        app: mcp-filesystem
    spec:
      securityContext:
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: mcp-filesystem
          image: digitaldefiance/mcp-filesystem:latest
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              add:
                - CHOWN
                - DAC_OVERRIDE
                - FOWNER
            readOnlyRootFilesystem: false
          resources:
            limits:
              cpu: "2"
              memory: "2Gi"
            requests:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config
              mountPath: /app/config
              readOnly: true
            - name: workspace
              mountPath: /app/workspace
      volumes:
        - name: config
          configMap:
            name: mcp-filesystem-config
        - name: workspace
          persistentVolumeClaim:
            claimName: mcp-filesystem-workspace
```

### Monitoring

Monitor container metrics:

```bash
docker stats mcp-filesystem
```

Export metrics to Prometheus:

```yaml
services:
  mcp-filesystem:
    # ... other config ...
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=9090"
```

## Security Scanning

Scan the image for vulnerabilities:

```bash
docker scan digitaldefiance/mcp-filesystem:latest
```

Or use Trivy:

```bash
trivy image digitaldefiance/mcp-filesystem:latest
```

## Updates

### Pull Latest Version

```bash
docker pull digitaldefiance/mcp-filesystem:latest
docker-compose down
docker-compose up -d
```

### Automatic Updates

Use Watchtower for automatic updates:

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  mcp-filesystem
```

## Support

- **Issues**: [GitHub Issues](https://github.com/Digital-Defiance/ai-capabilities-suite/issues)
- **Documentation**: [Full Documentation](https://github.com/Digital-Defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem)
- **Email**: info@digitaldefiance.org
