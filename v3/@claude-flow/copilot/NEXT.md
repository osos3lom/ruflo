# Next-iteration pickup list — @claude-flow/copilot

**Last touched**: 2026-06-03 by Claude Code (Opus 4.7) via /loop.
**State at handoff**: ADR-147 written, package skeleton complete, tsc clean, vitest 56/56 green.

## Completed in this iteration

- `v3/docs/adr/ADR-147-copilot-sdk-adapter.md` (Implemented status)
- `v3/@claude-flow/copilot/` — full module tree: 24 source files in `src/`, 6 test files in `tests/`
- `npm install --no-package-lock --no-workspaces` succeeds
- `npm run build` clean
- `npm test` — 56 tests, all pass

## Next iteration should pick up these items in priority order

### 1. Wire `--copilot` flag into `@claude-flow/cli init` (ADR-147 P5)

In `v3/@claude-flow/cli/src/commands/init.ts` (or wherever init lives — grep
for `--codex`), add a `--copilot` flag that delegates to:

```ts
import { CopilotInitializer } from '@claude-flow/copilot';
const initializer = new CopilotInitializer();
await initializer.initialize({ projectPath, template, force });
```

The codex equivalent is the reference. The CLI's `init` already accepts
`--codex` per `v3/@claude-flow/codex/src/initializer.ts` integration; mirror
that wiring.

### 2. Install workspaces issue

The package installs cleanly only with `--no-package-lock --no-workspaces`.
The root npm workspaces config tries to resolve `@claude-flow/codex` and
`@claude-flow/guidance` peer deps via `workspace:*` protocol, which trips
the install. Two options:
- (a) Make codex/guidance proper workspace packages in root `package.json`
  workspaces array — needs cross-package check.
- (b) Move both peers from peerDependencies to optionalDependencies so npm
  doesn't try to resolve them during install of the standalone package.

Option (b) is the safer, less-disruptive path. Implement it before publish.

### 3. SDK version pinning

`@github/copilot-sdk` is listed in research §3.2 as `1.0.0-beta.12` despite
the GA announcement. Once an authenticated developer can run
`npm view @github/copilot-sdk` from a clean shell, pin the exact major in
`package.json`. Currently `@github/copilot-sdk` is NOT a direct dependency
(intentional — the optional dynamic-import pattern in `src/client/chat.ts`
makes it a soft peer). Decide whether to:
- promote it to a direct dependency once 1.0.0 is published; or
- keep the soft-import pattern and document it as a runtime opt-in.

### 4. SDK-backed E2E test

`tests/__mocks__/@github/copilot-sdk.ts` does not yet exist. The CLI fallback
is covered by `tests/dual-mode/orchestrator.test.ts` (via dry-run); a real
SDK round-trip test gated behind `COPILOT_E2E=1` would close the contract.
Pattern: stub a `CopilotClient` that exposes a `createSession()` returning
a fake `sendAndWait()`; assert `runGoverned()` calls it once and returns
the content unchanged.

### 5. Telemetry sink for ADR-146 P5 alignment

`CopilotMcpBridge` collects events but currently nothing consumes them. Wire
the bridge into the shared `GuardrailEvent` sink described in ADR-146 P5
so MCP tool calls from Copilot sessions show up on the security dashboard
alongside ADR-131 / 144 / 145 events.

### 6. Publishing checklist (do NOT do without user confirmation)

When the user asks to publish:
- `cd v3/@claude-flow/copilot && npm version 3.8.0 --no-git-tag-version`
- `npm publish`
- `npm dist-tag add @claude-flow/copilot@3.8.0 alpha`
- `npm dist-tag add @claude-flow/copilot@3.8.0 v3alpha`
- Then bump `claude-flow` (umbrella) and `ruflo` (wrapper) to 3.8.0 per the
  three-package protocol in root `CLAUDE.md`.

## Open questions carried over

See ADR-147 "Open questions" section. None block ADR acceptance.

## Quick re-verify

```bash
cd v3/@claude-flow/copilot
npm install --no-package-lock --no-workspaces
npm run build      # must be clean
npm test           # must be 56/56 green
```

If those three pass, the package is in the same state I left it.
