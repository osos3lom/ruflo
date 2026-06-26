# @claude-flow/copilot

> GitHub Copilot SDK platform adapter for RuFlo

This package is part of the v3 monorepo. Inherits all rules from
`v3/CLAUDE.md` and the repo root `CLAUDE.md`.

## Behavior

- Files under 500 lines
- No hardcoded secrets — token resolution lives in `src/client/auth.ts` and
  must keep the absolute "never read the raw token" rule from MEMORY.md
- Typed APIs at every export boundary
- TDD London School (mock-first); E2E tests gated behind `COPILOT_E2E=1`

## Package layout

```
src/
  index.ts        # root re-exports
  types.ts        # shared types
  initializer.ts  # CopilotInitializer
  cli.ts          # claude-flow-copilot bin
  client/         # @github/copilot-sdk wrapper + auth + tools + models
  mcp/            # bidirectional MCP bridge
  dual-mode/      # MultiModeOrchestrator (extends DualModeOrchestrator)
  loop/           # runCopilotLoop()
  generators/     # AGENTS.md, config, skill emitters
  migrations/     # CLAUDE.md → AGENTS.md; codex → copilot
  validators/     # AGENTS.md, SKILL.md, config validators
  templates/      # built-in skills list
tests/            # vitest; mock-first
```

## Build

```bash
npm install
npm run build      # tsc; <500ms cold
npm test           # vitest run
```

## When changing the package

1. Run `npm run build` — TypeScript must pass clean.
2. Run `wc -l src/**/*.ts` — every file must be < 500 lines.
3. Run `grep -rE 'ghp_|gho_|github_pat_|sk-' src/` — must be empty.
4. Add/update vitest tests for any new exported symbol.

## Related docs

- ADR-147: `v3/docs/adr/ADR-147-copilot-sdk-adapter.md`
- Research dossier: `docs/research/copilot-sdk-ruflo-integration.md`
- Codex adapter (mirror reference): `v3/@claude-flow/codex/`
