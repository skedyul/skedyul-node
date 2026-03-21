/**
 * Default Dockerfile Template for Node.js/TypeScript Integrations
 * ================================================================
 *
 * This template is used when an integration doesn't provide its own Dockerfile.
 * The build system detects the SDK from the skedyul.config.* extension:
 *   - .ts/.js/.mjs/.cjs → skedyul-node → this Dockerfile
 *
 * Supports both dedicated (Docker/ECS) and serverless (Lambda) deployments.
 *
 * Build args:
 *   - COMPUTE_LAYER: 'serverless' or 'dedicated' - determines the tsup config format
 *   - BUILD_EXTERNAL: comma-separated list of external dependencies (e.g., 'twilio,stripe')
 *   - MCP_ENV_JSON: JSON string of environment variables to bake into the image
 */

export const DEFAULT_DOCKERFILE = `# =============================================================================
# BUILDER STAGE - Common build for all targets
# =============================================================================
FROM public.ecr.aws/docker/library/node:22-alpine AS builder

ARG COMPUTE_LAYER=serverless
ARG BUILD_EXTERNAL=""
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (lockfile is optional)
COPY package.json tsconfig.json skedyul.config.ts ./
COPY src ./src

# Copy tsup.config.ts if it exists, otherwise generate based on COMPUTE_LAYER
# BUILD_EXTERNAL is a comma-separated list of additional externals (e.g., "twilio,stripe")
COPY tsup.config.t[s] ./
RUN if [ ! -f tsup.config.ts ]; then \\
      BASE_EXT="skedyul,zod"; \\
      if [ "$COMPUTE_LAYER" = "serverless" ]; then \\
        BASE_EXT="skedyul,skedyul/serverless,zod"; \\
        FORMAT="esm"; \\
      else \\
        BASE_EXT="skedyul,skedyul/dedicated,zod"; \\
        FORMAT="cjs"; \\
      fi; \\
      if [ -n "$BUILD_EXTERNAL" ]; then \\
        ALL_EXT="$BASE_EXT,$BUILD_EXTERNAL"; \\
      else \\
        ALL_EXT="$BASE_EXT"; \\
      fi; \\
      EXT_ARRAY=$(echo "$ALL_EXT" | sed 's/,/","/g'); \\
      printf 'import{defineConfig}from"tsup";export default defineConfig({entry:["src/server/mcp_server.ts"],format:["%s"],target:"node22",outDir:"dist/server",clean:true,splitting:false,dts:false,external:["%s"]})' "$FORMAT" "$EXT_ARRAY" > tsup.config.ts; \\
    fi

# Install dependencies (including dev deps for build), compile, smoke test, then prune
# Note: Using --no-frozen-lockfile since lockfile may not exist
# skedyul build reads computeLayer from skedyul.config.ts
# Smoke test runs before pruning since skedyul CLI is a dev dependency
RUN pnpm install --no-frozen-lockfile && \\
    pnpm run build && \\
    skedyul smoke-test && \\
    pnpm prune --prod && \\
    pnpm store prune && \\
    rm -rf /tmp/* /var/cache/apk/* ~/.npm

# =============================================================================
# DEDICATED STAGE - For local Docker and ECS deployments (HTTP server)
# =============================================================================
FROM public.ecr.aws/docker/library/node:22-alpine AS dedicated

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

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
COPY --from=builder /app/package.json ./package.json

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
