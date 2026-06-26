# @claude-flow/copilot

GitHub Copilot SDK platform adapter for [RuFlo](https://github.com/ruvnet/ruflo) — the third platform in the tri-mode collaboration system (Claude Code + Codex + Copilot).

Mirrors the [`@claude-flow/codex`](../codex) package structure module-for-module, with two net-new subfolders:

- `src/client/` — wraps `@github/copilot-sdk` (or drives the bundled `copilot` CLI in `-p/--prompt` non-interactive mode when the SDK is absent)
- `src/mcp/` — bidirectional MCP bridge that wires the RuFlo MCP server into every Copilot session

See [ADR-147](../../docs/adr/ADR-147-copilot-sdk-adapter.md) for the design.

## Quick start

```bash
# 1. Install once globally (or per-project)
npm install -g @claude-flow/copilot

# 2. Initialize a project
npx claude-flow-copilot init --template default

# 3. Run the doctor
npx claude-flow-copilot doctor

# 4. Try tri-mode collaboration
npx claude-flow-copilot dual run feature --task "Add OAuth login"
```

## Subcommands

| Command | Purpose |
|---------|---------|
| `init` | Scaffold AGENTS.md + .copilot/config.json + skills |
| `auth status` | Verify a credential source exists (never echoes the token) |
| `auth clear` | Clear the local handle file |
| `mcp register` | Print the `mcpServers` JSON used to wire RuFlo into Copilot |
| `chat` | One-shot governed prompt (`pre-task` → `route` → call → `post-task`) |
| `dual run` | Tri-mode collaborative swarm |
| `loop run` | Bounded autonomous /loop iteration |
| `doctor` | Health check (Node version, credential, AGENTS.md) |

## Model routing

| Tier | Model | Multiplier | Use case |
|------|-------|------------|----------|
| 2 (fast) | `gpt-5.4-mini` | 0.33× | Simple tasks (complexity < 30) |
| 3 (default) | `gpt-5.3-codex` (LTS) | 1.0× | Architecture, code generation |
| 3 (frontier, opt-in) | `gpt-5.5` | 7.5× | Complex reasoning |

`getOptimalModel(complexity, allowFrontier)` returns the right ID.

## Security

The package NEVER prints, persists, or logs the raw GitHub token. The cache
file at `~/.config/ruflo/copilot/token.json` holds only a credential SOURCE
identifier (e.g. `"env:GH_TOKEN"`). See ADR-147 Part G.

## License

MIT
