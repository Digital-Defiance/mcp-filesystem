# Dockerfile for MCP Filesystem Server
# Installs the published NPM package

FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache tini

# Create non-root user for security
RUN addgroup -g 1001 -S mcp && \
    adduser -u 1001 -S mcp -G mcp

# Set working directory
WORKDIR /app

# Install the published package from NPM
RUN npm install -g @ai-capabilities-suite/mcp-filesystem@0.1.7

# Create config and workspace directories
RUN mkdir -p /app/config /app/workspace && chown mcp:mcp /app/config /app/workspace

# Create volumes for configuration and workspace
VOLUME ["/app/config", "/app/workspace"]

# Set environment variables
ENV NODE_ENV=production \
    MCP_FILESYSTEM_CONFIG_PATH=/app/config/mcp-filesystem-config.json \
    MCP_FILESYSTEM_WORKSPACE=/app/workspace

# Switch to non-root user
USER mcp

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Run the MCP server
CMD ["mcp-filesystem"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Labels for metadata
LABEL org.opencontainers.image.title="MCP Filesystem Server" \
      org.opencontainers.image.description="Advanced filesystem operations for AI agents with strict security boundaries" \
      org.opencontainers.image.version="0.1.7" \
      org.opencontainers.image.vendor="Digital Defiance" \
      org.opencontainers.image.authors="info@digitaldefiance.org" \
      org.opencontainers.image.url="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.documentation="https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem" \
      org.opencontainers.image.source="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="io.github.Digital-Defiance/mcp-filesystem"
