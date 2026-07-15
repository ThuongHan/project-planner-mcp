# Project Planner MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io/) server for lightweight project and todo management, built on [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [Workers KV](https://developers.cloudflare.com/kv/). It exposes tools that let any MCP client (Claude Desktop, the Cloudflare AI Playground, etc.) create projects, attach todos to them, and track progress — no authentication required.

## Tools

| Tool | Description |
| --- | --- |
| `create_project` | Create a new project (`name`, optional `description`) |
| `list_projects` | List all projects |
| `get_project` | Get a project by ID, including its todos |
| `delete_project` | Delete a project and all of its todos |
| `create_todo` | Create a todo under a project (`title`, optional `description`, `priority`) |
| `get_todo` | Get a single todo by ID |
| `update_todo` | Update a todo's title, description, status, or priority |
| `delete_todo` | Delete a todo by ID |
| `list_todos` | List a project's todos, optionally filtered by `status` |

## Data model

Data is stored in a single KV namespace (`PROJECT_PLANNER_STORE`):

- `project:list` — array of all project IDs
- `project:<projectId>` — the project object
- `project:<projectId>:todos` — array of todo IDs belonging to that project
- `todo:<todoId>` — the todo object

## Project structure

```
remote-mcp-server-authless/
├── src/
│   └── index.ts          # MCP server definition (McpAgent + tools)
├── wrangler.jsonc         # Worker + KV namespace configuration
├── worker-configuration.d.ts  # Generated Env types (wrangler types)
└── tsconfig.json
```

## Setup

Install dependencies:

```bash
npm install
```

Create a KV namespace (if you don't already have one) and set its `id` under `kv_namespaces` in `wrangler.jsonc`:

```bash
npx wrangler kv namespace create PROJECT_PLANNER_STORE
```

## Development

Run the server locally:

```bash
npm run dev
```

This starts the Worker at `http://localhost:8787`, with the MCP endpoint at `http://localhost:8787/mcp`.

Other useful scripts:

```bash
npm run type-check   # tsc --noEmit
npm run lint:fix      # oxlint --fix
npm run format        # oxfmt --write .
npm run cf-typegen    # regenerate worker-configuration.d.ts from wrangler.jsonc
```

## Deploy

```bash
npm run deploy
```

This deploys the Worker to `https://remote-mcp-server-authless.<your-account>.workers.dev/mcp`.

## Connecting a client

### Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter your server URL (`http://localhost:8787/mcp` locally, or your deployed `*.workers.dev/mcp` URL)
3. The project planner tools become available in the playground

### Claude Desktop

Claude Desktop speaks MCP over stdio, so remote servers are bridged via the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) proxy. In Claude Desktop, go to Settings → Developer → Edit Config, and add:

```json
{
  "mcpServers": {
    "project-planner": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/mcp"
      ]
    }
  }
}
```

Swap in your deployed URL to connect to production instead of localhost. Restart Claude Desktop afterwards to pick up the new server.
