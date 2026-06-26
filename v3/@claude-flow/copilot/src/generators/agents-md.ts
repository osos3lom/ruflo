/**
 * @claude-flow/copilot - AGENTS.md generator
 *
 * Copilot-flavored AGENTS.md. Content is portable with the codex
 * adapter (same standard); the surface emphasizes Copilot SDK
 * specifics (model defaults, MCP wiring, permission handler).
 */

import type { AgentsMdOptions, AgentsMdTemplate } from '../types.js';
import { BUILT_IN_SKILLS } from '../templates/index.js';

export async function generateAgentsMd(options: AgentsMdOptions): Promise<string> {
  const template = options.template ?? 'default';
  switch (template) {
    case 'minimal':
      return generateMinimal(options);
    case 'full':
      return generateFull(options);
    case 'enterprise':
      return generateEnterprise(options);
    case 'default':
    default:
      return generateDefault(options);
  }
}

function generateMinimal(options: AgentsMdOptions): string {
  const {
    projectName,
    description = 'A Claude Flow powered project (Copilot adapter)',
    buildCommand = 'npm run build',
    testCommand = 'npm test',
  } = options;

  return `# ${projectName}

> ${description}

## Quick Start

### Setup
\`\`\`bash
npm install && ${buildCommand}
\`\`\`

### Test
\`\`\`bash
${testCommand}
\`\`\`

## Copilot Session Defaults

| Setting | Value |
|---------|-------|
| Model | gpt-5.3-codex (LTS through 2027-02-04) |
| Permission handler | approve-all (local), custom (CI) |
| Streaming | false |
| MCP servers | ruflo |

## Agent Behavior

- Keep files under 500 lines
- No hardcoded secrets or credentials — credentials come from env or \`gh auth login\`
- Validate input at system boundaries
- Use typed interfaces for public APIs

## Security Rules

- NEVER commit .env files or secrets
- NEVER write a raw GitHub token into AGENTS.md or any committed file
- Always validate user inputs

## Links

- RuFlo: https://github.com/ruvnet/ruflo
- Copilot SDK: https://docs.github.com/en/copilot/how-tos/copilot-sdk
`;
}

function generateDefault(options: AgentsMdOptions): string {
  const {
    projectName,
    description = 'A Claude Flow powered project with GitHub Copilot integration',
    techStack = 'TypeScript, Node.js 20+',
    buildCommand = 'npm run build',
    testCommand = 'npm test',
    devCommand = 'npm run dev',
    skills = ['swarm-orchestration', 'memory-management', 'sparc-methodology', 'security-audit'],
  } = options;

  const skillsTable = skills
    .map((skill) => {
      const info = BUILT_IN_SKILLS[skill as keyof typeof BUILT_IN_SKILLS];
      return info
        ? `| \`${skill}\` (MCP tool) | ${info.description} |`
        : `| \`${skill}\` (MCP tool) | Custom skill |`;
    })
    .join('\n');

  return `# ${projectName}

> Multi-agent orchestration framework — Copilot SDK adapter

## Project Overview

${description}

**Tech Stack**: ${techStack}
**Architecture**: Domain-Driven Design with bounded contexts

## Quick Start

\`\`\`bash
npm install
${buildCommand}
${testCommand}
${devCommand}
\`\`\`

## Copilot SDK Integration

| Setting | Default | Source |
|---------|---------|--------|
| Model | \`gpt-5.3-codex\` | ADR-147 Part B (LTS) |
| Tier 2 fast | \`gpt-5.4-mini\` (0.33x) | ADR-026 |
| Tier 3 frontier | \`gpt-5.5\` (7.5x, opt-in) | ADR-147 |
| Permission handler | \`approve-all\` | Local dev only |
| Streaming | \`false\` | v1 — streaming tool calls unverified |

## MCP Wiring

Every Copilot session is created with the RuFlo MCP server registered:

\`\`\`ts
import { registerRufloMcpWithCopilot } from '@claude-flow/copilot/mcp';

const mcpServers = await registerRufloMcpWithCopilot(process.cwd());
const session = await client.createSession({ model: 'gpt-5.3-codex', mcpServers });
\`\`\`

This exposes \`memory_store\`, \`memory_search\`, \`swarm_init\`, \`hooks_route\`,
and all other ruflo MCP tools to the Copilot agent.

## Available Skills

| Skill | Use Case |
|-------|----------|
${skillsTable}

## Agent Types

| Type | Role | Use Case |
|------|------|----------|
| \`researcher\` | Requirements analysis | Understanding scope |
| \`architect\` | System design | Planning structure |
| \`coder\` | Implementation | Writing code |
| \`tester\` | Test creation | Quality assurance |
| \`reviewer\` | Code review | Security and quality |

## Execution Model

- **claude-flow** = LEDGER (coordinates: memory, routing, swarm state)
- **Copilot SDK** = EXECUTOR (writes code, runs tests, creates files)

Coordination commands return instantly — continue immediately with the next
implementation step.

## Code Standards

- Files under 500 lines
- No hardcoded secrets
- Input validation at boundaries
- Typed interfaces for public APIs
- TDD London School (mock-first) preferred

## Security

- NEVER commit secrets, credentials, or .env files
- NEVER hardcode API keys
- Credentials resolve via env var or \`gh auth login\` — see ADR-147 Part G
- The cache file at \`~/.config/ruflo/copilot/token.json\` holds only the
  credential source identifier, never the token itself

## Memory System

\`\`\`bash
npx @claude-flow/cli memory store --key "pattern-name" --value "description" --namespace patterns
npx @claude-flow/cli memory search --query "search terms" --namespace patterns
\`\`\`

## Quick Commands

\`\`\`bash
npx @claude-flow/cli memory search --query "relevant patterns"
npx @claude-flow/cli hooks route --task "current task description"
npx @claude-flow/cli swarm init --topology hierarchical
\`\`\`

## Links

- RuFlo: https://github.com/ruvnet/ruflo
- Copilot SDK docs: https://docs.github.com/en/copilot/how-tos/copilot-sdk
- ADR-147: \`v3/docs/adr/ADR-147-copilot-sdk-adapter.md\`
`;
}

function generateFull(options: AgentsMdOptions): string {
  const base = generateDefault(options);
  return base + `\n## Tri-Mode Collaboration

This project supports running Claude Code, Codex, and Copilot workers in
parallel via the \`MultiModeOrchestrator\` (extends \`DualModeOrchestrator\`):

\`\`\`bash
npx claude-flow-copilot dual run feature --task "Add OAuth login"
\`\`\`

Pipeline: claude (architect) → codex (coder) → copilot (reviewer) → claude (tester).

## Performance Targets

| Metric | Target |
|--------|--------|
| CLI startup | <500ms |
| MCP response | <100ms |
| Route hook overhead | <50ms |
`;
}

function generateEnterprise(options: AgentsMdOptions): string {
  const full = generateFull(options);
  return full + `\n## Governance

Every Copilot call passes through the four governance verbs:
**compile** → **enforce** → **prove** → **evolve**. See
\`v3/@claude-flow/guidance/src/index.ts\` for the API surface.

### Compliance

- Audit log: every governed call is recorded with task ID, model, tokens, outcome.
- Cost tracking: per-session token estimates feed the \`cost-tracking\` namespace.
- Telemetry shape: GuardrailEvent (ADR-146 P5) — shared with ADR-144 and ADR-145.
`;
}

// Used by AdjacentAgentsMdTemplate routing.
export type _AgentsMdTemplateRef = AgentsMdTemplate;
