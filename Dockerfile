# MCP Filesystem Server - Optimized Docker Image
# Multi-stage build for minimal image size and security

# Stage 1: Build
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Enable Corepack for Yarn
RUN corepack enable

# Set working directory
WORKDIR /build

# Copy package files and yarn configuration
COPY package.json ./
COPY tsconfig*.json ./
COPY .yarnrc.yml ./
COPY yarn.lock ./

# Install dependencies (including dev dependencies for build)
RUN yarn install

# Copy source code
COPY src ./src

# Build the project
RUN yarn build

# Stage 2: Runtime
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S mcp && \
    adduser -u 1001 -S mcp -G mcp

# Set working directory
WORKDIR /app

# Copy built application and dependencies from builder
COPY --from=builder --chown=mcp:mcp /build/dist ./dist
COPY --from=builder --chown=mcp:mcp /build/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /build/package.json ./

# Copy documentation
COPY --chown=mcp:mcp README.md LICENSE SECURITY.md ./

# Create config and workspace directories
RUN mkdir -p /app/config /app/workspace && chown mcp:mcp /app/config /app/workspace

# Create volumes for configuration and workspace
VOLUME ["/app/config", "/app/workspace"]

# Switch to non-root user
USER mcp

# Set environment variables
ENV NODE_ENV=production \
    MCP_FILESYSTEM_CONFIG_PATH=/app/config/mcp-filesystem-config.json \
    MCP_FILESYSTEM_WORKSPACE=/app/workspace

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "process.exit(0)"

# Use tini as init system to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the MCP server
CMD ["node", "dist/cli.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="MCP Filesystem Server" \
      org.opencontainers.image.description="Advanced filesystem operations for AI agents with strict security boundaries" \
      org.opencontainers.image.vendor="Digital Defiance" \
      org.opencontainers.image.authors="info@digitaldefiance.org" \
      org.opencontainers.image.url="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.documentation="https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem" \
      org.opencontainers.image.source="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="io.github.Digital-Defiance/mcp-filesystem"
