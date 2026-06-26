/**
 * @claude-flow/copilot - MCP registration helpers
 *
 * Builds the `mcpServers` map shape required by the Copilot SDK's
 * `createSession({ mcpServers })` (research §6.8).
 *
 * The Copilot backend never executes MCP tools — MCP servers run
 * **client-side** as subprocesses on the user's machine. This means
 * the RuFlo MCP server (`npx ruflo@latest mcp start`) keeps direct
 * access to local AgentDB, hooks, and the filesystem.
 */

import type { CopilotMcpServerConfig } from '../types.js';

/**
 * Default tool filter — `['*']` means "expose every tool the ruflo
 * MCP server registers". Passing an explicit array tightens the surface.
 */
export type RufloMcpToolFilter = string[] | '*';

/**
 * `mcpServers` value Copilot understands for the ruflo entry.
 */
export interface RufloMcpServerConfig extends CopilotMcpServerConfig {
  type: 'local';
  command: 'npx';
  args: string[];
}

/**
 * Build the `mcpServers` object you pass to `createSession()`.
 *
 * @param projectPath The project root — surfaced via `CLAUDE_FLOW_CONFIG` env.
 * @param toolFilter `'*'` or an array of allowed tool names.
 */
export async function registerRufloMcpWithCopilot(
  projectPath: string,
  toolFilter: RufloMcpToolFilter = '*',
): Promise<Record<string, RufloMcpServerConfig>> {
  const tools = toolFilter === '*' ? ['*'] : [...toolFilter];
  return {
    ruflo: {
      type: 'local',
      command: 'npx',
      args: ['-y', 'ruflo@latest', 'mcp', 'start'],
      tools,
      env: {
        CLAUDE_FLOW_CONFIG: `${projectPath}/claude-flow.config.json`,
      },
      cwd: projectPath,
      timeout: 120_000,
    },
  };
}

/**
 * Convenience: merge ruflo's MCP entry with caller-supplied additional servers.
 *
 * Caller's entries take precedence on name collision (so projects can
 * override ruflo's defaults without surprising fallthrough).
 */
export async function buildMcpServers(
  projectPath: string,
  extra: Record<string, CopilotMcpServerConfig> = {},
  toolFilter: RufloMcpToolFilter = '*',
): Promise<Record<string, CopilotMcpServerConfig>> {
  const ruflo = await registerRufloMcpWithCopilot(projectPath, toolFilter);
  return { ...ruflo, ...extra };
}
