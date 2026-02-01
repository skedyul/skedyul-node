/**
 * Default Dockerfile Template for Node.js/TypeScript Integrations
 * ================================================================
 *
 * This template is used when an integration doesn't provide its own Dockerfile.
 * The build system detects the SDK from the skedyul.config.* extension:
 *   - .ts/.js/.mjs/.cjs → skedyul-node → this Dockerfile
 *
 * Supports both dedicated (Docker/ECS) and serverless (Lambda) deployments.
 */

export const DEFAULT_DOCKERFILE = `# =============================================================================
# BUILDER STAGE - Common build for all targets
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (lockfile is optional)
COPY package.json tsconfig.json tsup.config.ts ./
COPY src ./src

# Install dependencies (including dev deps for build), compile, then prune
# Note: Using --no-frozen-lockfile since lockfile may not exist
RUN pnpm install --no-frozen-lockfile && \\
    pnpm run build && \\
    pnpm prune --prod && \\
    pnpm store prune && \\
    rm -rf /tmp/* /var/cache/apk/* ~/.npm

# =============================================================================
# DEDICATED STAGE - For local Docker and ECS deployments (HTTP server)
# =============================================================================
FROM node:22-alpine AS dedicated

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Allow overriding the baked-in MCP env at runtime
ARG MCP_ENV_JSON="{}"
ENV MCP_ENV_JSON=\${MCP_ENV_JSON}

# Expose the HTTP port
EXPOSE 3000

# Run as HTTP server (dedicated mode auto-detected by absence of AWS_LAMBDA_FUNCTION_NAME)
CMD ["node", "dist/server/mcp_server.js"]

# =============================================================================
# SERVERLESS STAGE - For AWS Lambda deployments
# =============================================================================
FROM public.ecr.aws/lambda/nodejs:22 AS serverless

WORKDIR \${LAMBDA_TASK_ROOT}

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Allow overriding the baked-in MCP env at runtime
ARG MCP_ENV_JSON="{}"
ENV MCP_ENV_JSON=\${MCP_ENV_JSON}

# Lambda handler format
CMD ["dist/server/mcp_server.handler"]

# =============================================================================
# DEFAULT - Use dedicated for local development, override with --target for production
# =============================================================================
FROM dedicated
`
