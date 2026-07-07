# CLI reference

The `skedyul` CLI ships with the npm package. It handles authentication, local development, deployment, CRM schema sync, and agent/skill/workflow management.

```bash
skedyul --help
skedyul dev --help
skedyul agents --help
```

## Configuration paths

| File | Purpose |
|------|---------|
| `~/.skedyul/profiles.json` | Auth profiles (token, server, user info) |
| `~/.skedyul/config.json` | Global settings (`defaultServer`, `ngrokAuthtoken`, `activeProfile`) |
| `.skedyul.local.json` | Project override — e.g. `{ "serverUrl": "http://localhost:3000" }` |
| `.skedyul/links/<workplace>.json` | Link metadata for a workplace |
| `.skedyul/env/<workplace>.env` | Per-workplace env vars synced from the platform |
| `.skedyul/serve.json` | Active serve session state |

Legacy `~/.skedyul/credentials.json` is migrated automatically to profiles on first use.

---

## Authentication (`skedyul auth`)

| Command | Description |
|---------|-------------|
| `login` | Browser OAuth login; creates or updates a profile |
| `logout` | Remove profile(s) |
| `status` | Show active profile and token expiry |
| `use <profile>` | Switch active profile |
| `list` | List all saved profiles |

### Flags

```bash
skedyul auth login --server <url> --profile <name>
skedyul auth logout --profile <name>
skedyul auth logout --all
```

Default server: `https://admin.skedyul.it`

---

## Global config (`skedyul config`)

| Command | Description |
|---------|-------------|
| `set <key> <value>` | Set a global config value |
| `get <key>` | Get a config value |
| `list` | List all config |

| Key | Description | Default |
|-----|-------------|---------|
| `defaultServer` | Skedyul server URL | `https://admin.skedyul.it` |
| `ngrokAuthtoken` | ngrok authtoken for local tunneling | — |

### Export resolved config

```bash
skedyul config:export -o .skedyul/config.json
```

Exports the resolved `skedyul.config.ts` for runtime inspection (same shape as `GET /config` on a running server).

---

## Build (`skedyul build`)

Builds your integration using settings from `skedyul.config.ts` (`computeLayer`, `build.external`).

```bash
skedyul build
skedyul build --watch
```

Output goes to `dist/` including `dist/server/mcp_server.{js|mjs}`.

### Smoke test

```bash
skedyul smoke-test
```

Starts the built server, checks `GET /health` and MCP `tools/list`.

---

## Local development

### Linked mode workflow

```bash
# 1. Authenticate
skedyul auth login

# 2. Link project to a workplace (creates local AppVersion)
skedyul dev link --workplace demo-clinic

# 3. Sync install env vars from the platform
skedyul dev install --workplace demo-clinic

# 4. Build and serve with ngrok tunnel
skedyul build
skedyul dev serve --workplace demo-clinic
```

In linked mode, Skedyul routes tool calls from the platform to your local machine via the ngrok tunnel.

### Standalone mode

Test without platform connectivity:

```bash
skedyul dev serve --registry ./dist/registry.js --port 3001
skedyul dev invoke my_tool --registry ./dist/registry.js --args '{"key":"value"}'
skedyul dev tools --registry ./dist/registry.js
```

---

## Dev commands (`skedyul dev <cmd>`)

| Command | Description |
|---------|-------------|
| `link` | Link project to a workplace |
| `unlink` | Remove workplace link |
| `install` | Configure/sync installation environment variables |
| `serve` | Start local MCP server |
| `invoke <tool>` | Invoke a tool in-process from local registry |
| `tools` | List tools in registry; `tools sync` syncs model tool schemas |
| `validate` | Validate `skedyul.config.ts` |
| `diff` | Preview deploy changes |
| `deploy` | Deploy app to Skedyul |
| `build` | Same as top-level `build` |
| `smoke-test` | Same as top-level `smoke-test` |

### `dev serve` flags

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain (enables sidecar/linked mode) |
| `--port, -p` | Listen port (default: 60000, auto-increments if busy) |
| `--registry, -r` | Path to tool registry file |
| `--no-tunnel` | Skip ngrok tunnel |
| `--tunnel-url` | Use an existing tunnel URL |
| `--env, -e` | Set env var (`KEY=value`) |
| `--env-file` | Load env vars from file |
| `--name` | Override app name in standalone mode |
| `--version` | Override app version in standalone mode |

### `dev invoke` flags

| Flag | Description |
|------|-------------|
| `--registry, -r` | Registry file path |
| `--args, -a` | JSON tool arguments |
| `--workplace, -w` | Use linked workplace credentials |
| `--env, -e` | Env var override |
| `--env-file` | Env file path |
| `--estimate` | Run in estimate mode (billing only) |

### `dev deploy` flags

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Target workplace |
| `--config, -c` | Config file path |
| `--yes, -y` | Skip confirmation |
| `--dry-run` | Show plan without applying |
| `--json` | JSON output |

### `dev install` flags

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain |
| `--force` | Re-prompt for all env vars |
| `--skip-validation` | Skip install handler validation |

### `dev tools sync`

Syncs tool JSON schemas to a CRM model (for agent tool binding):

```bash
skedyul dev tools sync --workplace <subdomain> --model <modelHandle>
```

---

## Remote invoke (`skedyul invoke`)

Invoke a tool on a **hosted** app installation (not local):

```bash
skedyul invoke <tool-name> \
  --appInstallationId <id> \
  --args '{"key":"value"}' \
  --timeout 30000
```

| Flag | Description |
|------|-------------|
| `--appInstallationId, -i` | Installation ID (required) |
| `--args, -a` | JSON arguments |
| `--timeout, -t` | Timeout in ms |
| `--server` | Override server URL |

---

## CRM schema (`skedyul crm`)

Manage workplace-level CRM schemas (separate from app provision models):

```bash
# Push schema changes (with migration approval)
skedyul crm push --schema ./schema.ts --workplace <subdomain>

# Pull current schema
skedyul crm pull --workplace <subdomain> --output ./current.schema.json
skedyul crm pull --workplace <subdomain> --format ts --output ./schema.ts

# Preview changes
skedyul crm diff --schema ./schema.ts --workplace <subdomain>

# List models
skedyul crm models --workplace <subdomain>
```

| Flag | Commands | Description |
|------|----------|-------------|
| `--schema, -s` | push, diff | Schema file path |
| `--workplace, -w` | all | Workplace subdomain |
| `--output, -o` | pull | Output file |
| `--format, -f` | pull | `json` or `ts` |
| `--yes, -y` | push | Auto-approve migrations |
| `--dry-run` | push, diff | Preview only |
| `--json` | all | JSON output |

See [CRM schema](./crm-schema.md) for the schema format.

---

## CRM instances (`skedyul instances`)

CRUD on CRM instances from the command line:

```bash
skedyul instances list <model> --workplace <subdomain>
skedyul instances get <model> <id> --workplace <subdomain>
skedyul instances create <model> --data '{"field":"value"}' --workplace <subdomain>
skedyul instances update <model> <id> --data '{"field":"new"}' --workplace <subdomain>
skedyul instances delete <model> <id> --workplace <subdomain>

# Batch operations
skedyul instances create-many <model> --file ./records.json --workplace <subdomain>
skedyul instances upsert-many <model> --file ./records.json --match-field email --workplace <subdomain>
```

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain (required) |
| `--data, -d` | JSON data object |
| `--file, -f` | JSON file for batch ops |
| `--filter` | List filter (JSON) |
| `--page`, `--limit` | Pagination |
| `--match-field` | Upsert match field |
| `--json` | JSON output |

---

## Agents (`skedyul agents`)

Deploy and manage Agent YAML v3 definitions:

```bash
skedyul agents list --workplace <subdomain>
skedyul agents get <handle> --workplace <subdomain>
skedyul agents deploy --file ./agents/booking.yaml --workplace <subdomain>
skedyul agents deploy --file ./agents/booking.yaml --workplace <subdomain> --draft
skedyul agents publish --version <versionId> --workplace <subdomain>
skedyul agents versions <handle> --workplace <subdomain>
skedyul agents ab --v1 90 --v2 10 --workplace <subdomain>
skedyul agents rollback --to <versionId> --workplace <subdomain>
```

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain |
| `--file, -f` | Agent YAML file |
| `--draft` | Create as draft version |
| `--version, -v` | Version ID for publish/run |
| `--weight` | Traffic weight for publish |
| `--v1`, `--v2` | A/B test weights (must sum to 100) |
| `--to` | Rollback target version |
| `--json` | JSON output |

See [Agents, skills & workflows](./agents.md).

---

## Skills (`skedyul skills`)

```bash
skedyul skills list --workplace <subdomain>
skedyul skills get <handle> --workplace <subdomain>
skedyul skills deploy --file ./skills/scheduling.yaml --workplace <subdomain>
skedyul skills publish --version <versionId> --workplace <subdomain>
skedyul skills versions <handle> --workplace <subdomain>
skedyul skills delete <handle> --workplace <subdomain>
```

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain |
| `--file, -f` | Skill YAML file |
| `--draft` | Create as draft |
| `--label` | Version label |
| `--version, -v` | Version ID (required for publish) |
| `--json` | JSON output |

---

## Workflows (`skedyul workflows`)

```bash
skedyul workflows list --workplace <subdomain>
skedyul workflows get <handle> --workplace <subdomain>
skedyul workflows deploy --file ./workflows/reminder.yaml --workplace <subdomain>
skedyul workflows validate --file ./workflows/reminder.yaml
skedyul workflows pull <handle> --workplace <subdomain> --output ./reminder.yaml
skedyul workflows publish --version <versionId> --workplace <subdomain>
skedyul workflows run <handle> --input customerId=abc --workplace <subdomain> --wait
```

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain |
| `--file, -f` | Workflow YAML file |
| `--output, -o` | Output path for pull |
| `--input, -i` | Run input (`key=value`, repeatable) |
| `--wait` | Wait for workflow completion |
| `--draft`, `--label`, `--version`, `--json` | Same as skills |

---

## Chat (`skedyul chat`)

Interactive agent testing with SSE streaming:

```bash
skedyul chat --agent booking --workplace <subdomain>
skedyul chat --agent booking --workplace <subdomain> --sandbox
skedyul chat --agent booking --workplace <subdomain> --mock-context ./context.json
skedyul chat --agent booking --workplace <subdomain> --input "Book me for Tuesday"
```

| Flag | Description |
|------|-------------|
| `--agent, -a` | Agent handle |
| `--workplace, -w` | Workplace subdomain |
| `--version, -v` | Specific agent version |
| `--latest` | Use latest published version |
| `--input, -i` | Initial user message |
| `--sandbox` | Run in sandbox mode |
| `--mock-context` | Mock thread context JSON file |
| `--mock-sender` | Mock sender JSON |
| `--debug` | Verbose output |

---

## Events (`skedyul event`)

Emit test app events to the event bus (no app installation required):

```bash
skedyul event create customer.sync '{"customers":[]}' --workplace <subdomain>
skedyul event create ping --workplace <subdomain> --app shopify
skedyul event create order.created --data ./event.json --workplace <subdomain> --context ./ctx.json
```

| Flag | Description |
|------|-------------|
| `--workplace, -w` | Workplace subdomain |
| `--data, -d` | JSON payload or file path |
| `--app, -a` | App handle filter |
| `--context, -c` | Event context JSON |
| `--json` | JSON output |

Events must be declared in `skedyul.config.ts` under `events` to appear in the catalog.

---

## Ngrok setup

Linked mode requires a tunnel so Skedyul can reach your local server:

1. Get a free authtoken at [ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)
2. `skedyul config set ngrokAuthtoken <token>`

Or pass `--tunnel-url` if you manage ngrok separately.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not linked to {workplace}" | `skedyul dev link --workplace {workplace}` |
| "Authentication required" | `skedyul auth login` |
| Port already in use | `--port 8080` or let CLI auto-increment |
| ngrok auth failed | `skedyul config set ngrokAuthtoken <token>` |
| Tool not found locally | Run `skedyul build` and check registry path |
| Deploy hangs | Ensure worker is running in your Skedyul environment |

---

## Local server override

Point the CLI at a local Skedyul instance:

```json
// .skedyul.local.json
{
  "serverUrl": "http://localhost:3000"
}
```

This affects auth, deploy, CRM, agents, and all API-backed commands.
