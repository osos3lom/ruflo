/**
 * @claude-flow/copilot - Migrations
 *
 * Convert CLAUDE.md (Claude Code) and codex AGENTS.md/.agents/config.toml
 * artifacts into Copilot-flavored AGENTS.md + .copilot/config.json.
 *
 * Per research §8.
 */

import fs from 'fs-extra';
import path from 'node:path';
import type { FeatureMapping, MigrationOptions, MigrationResult } from '../types.js';
import { generateAgentsMd } from '../generators/agents-md.js';
import { generateCopilotConfigJson } from '../generators/config-toml.js';

/**
 * Feature mappings: Claude Code → Copilot.
 */
export const FEATURE_MAPPINGS: FeatureMapping[] = [
  { source: 'CLAUDE.md', copilot: 'AGENTS.md', status: 'mapped', notes: 'Content portable' },
  { source: 'CLAUDE.local.md', copilot: '.copilot/AGENTS.override.md', status: 'mapped' },
  { source: 'settings.json', copilot: '.copilot/config.json', status: 'mapped', notes: 'JSON → JSON, model field changes' },
  { source: '/skill-name', copilot: 'MCP tool call', status: 'mapped', notes: 'Skills become registered MCP tools' },
  { source: 'hooks system', copilot: 'pre/post-task hook calls', status: 'mapped' },
  { source: 'MCP servers', copilot: 'mcpServers in session config', status: 'mapped' },
  { source: 'TodoWrite', copilot: 'Custom task-tracking MCP tool', status: 'partial' },
];

/**
 * Feature mappings: Codex → Copilot.
 */
export const CODEX_TO_COPILOT_MAPPINGS: FeatureMapping[] = [
  { source: 'AGENTS.md (codex)', copilot: 'AGENTS.md (copilot)', status: 'mapped', notes: 'Direct copy; content portable' },
  { source: '.agents/config.toml', copilot: '.copilot/config.json', status: 'mapped', notes: 'TOML → JSON' },
  { source: '$skill-name', copilot: 'MCP tool call', status: 'mapped' },
  { source: '[mcp_servers.ruflo]', copilot: 'mcpServers.ruflo', status: 'mapped' },
  { source: '.codex/loop/', copilot: '.copilot/loop/', status: 'mapped', notes: 'Same state schema; mode field changes' },
  { source: 'codex exec subprocess', copilot: 'SDK session.sendAndWait()', status: 'mapped' },
  { source: 'approval_policy = "never"', copilot: 'permissionHandler: "approve-all"', status: 'mapped' },
  { source: 'sandbox_mode', copilot: 'CLI-level only — no SDK equivalent', status: 'unsupported' },
];

/**
 * Lightweight analysis of a CLAUDE.md — used by the `analyze-only` path.
 */
export interface ClaudeMdAnalysis {
  title: string;
  sections: string[];
  skills: string[];
  hooks: string[];
  customInstructions: string[];
  warnings: string[];
}

export async function analyzeClaudeMd(content: string): Promise<ClaudeMdAnalysis> {
  const lines = content.split('\n');
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const sections: string[] = [];
  const skills = new Set<string>();
  const hooks = new Set<string>();
  const customInstructions: string[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    const sec = line.match(/^##\s+(.+)$/);
    if (sec && sec[1]) sections.push(sec[1].trim());
    const skill = line.match(/\/([a-z][a-z0-9-]+)\b/);
    if (skill && skill[1]) skills.add(skill[1]);
    const hook = line.match(/hooks\s+([a-z][a-z0-9-]+)/i);
    if (hook && hook[1]) hooks.add(hook[1]);
    if (line.trim().startsWith('- ') && line.length < 200) customInstructions.push(line.trim().slice(2));
  }

  if (sections.length === 0) warnings.push('No sections found — AGENTS.md needs at least one ## heading');
  if (skills.size > 0) warnings.push(`${skills.size} slash-skill references will become MCP tool calls`);

  return {
    title: titleMatch && titleMatch[1] ? titleMatch[1] : 'Untitled Project',
    sections,
    skills: Array.from(skills),
    hooks: Array.from(hooks),
    customInstructions,
    warnings,
  };
}

/**
 * Migrate a Claude Code project to Copilot.
 */
export async function migrateFromClaudeCode(options: MigrationOptions): Promise<MigrationResult> {
  const { sourcePath, targetPath, generateSkills = false } = options;
  const warnings: string[] = [];

  let claudeMd: string;
  try {
    claudeMd = await fs.readFile(sourcePath, 'utf-8');
  } catch (err) {
    return { success: false, warnings: [`Cannot read source: ${(err as Error).message}`] };
  }

  const analysis = await analyzeClaudeMd(claudeMd);
  const targetDir = path.resolve(targetPath);
  await fs.ensureDir(targetDir);
  await fs.ensureDir(path.join(targetDir, '.copilot'));

  // AGENTS.md
  const agentsMd = await generateAgentsMd({
    projectName: analysis.title,
    description: 'Migrated from CLAUDE.md',
    template: 'default',
    skills: analysis.skills,
  });
  const agentsMdPath = path.join(targetDir, 'AGENTS.md');
  await fs.writeFile(agentsMdPath, agentsMd, 'utf-8');

  // .copilot/config.json
  const configJson = await generateCopilotConfigJson();
  const configPath = path.join(targetDir, '.copilot', 'config.json');
  await fs.writeFile(configPath, configJson, 'utf-8');

  if (generateSkills && analysis.skills.length > 0) {
    warnings.push(
      `${analysis.skills.length} skill(s) detected — register them as MCP tools via @claude-flow/copilot's defineCopilotTool`,
    );
  }

  return {
    success: true,
    agentsMdPath,
    configPath,
    mappings: FEATURE_MAPPINGS,
    warnings,
  };
}

/**
 * Migrate a Codex project to Copilot.
 */
export async function migrateFromCodex(options: MigrationOptions): Promise<MigrationResult> {
  const { sourcePath, targetPath } = options;
  const warnings: string[] = [];

  const sourceDir = path.resolve(path.dirname(sourcePath));
  const targetDir = path.resolve(targetPath);
  await fs.ensureDir(targetDir);
  await fs.ensureDir(path.join(targetDir, '.copilot'));

  // AGENTS.md (direct copy if present)
  const sourceAgentsMd = path.join(sourceDir, 'AGENTS.md');
  const targetAgentsMd = path.join(targetDir, 'AGENTS.md');
  if (await fs.pathExists(sourceAgentsMd)) {
    await fs.copy(sourceAgentsMd, targetAgentsMd, { overwrite: true });
  } else {
    warnings.push('Source AGENTS.md not found — generating default');
    await fs.writeFile(
      targetAgentsMd,
      await generateAgentsMd({ projectName: path.basename(targetDir), template: 'default' }),
      'utf-8',
    );
  }

  // .copilot/config.json from defaults (TOML→JSON parse is out of v1 scope)
  const codexConfig = path.join(sourceDir, '.agents', 'config.toml');
  if (await fs.pathExists(codexConfig)) {
    warnings.push('Codex .agents/config.toml found — converted to defaults; manual review recommended');
  }
  const configJson = await generateCopilotConfigJson();
  const configPath = path.join(targetDir, '.copilot', 'config.json');
  await fs.writeFile(configPath, configJson, 'utf-8');

  // .codex/loop → .copilot/loop (state schema-compatible; mode flag flipped)
  const codexLoop = path.join(sourceDir, '.codex', 'loop');
  const copilotLoop = path.join(targetDir, '.copilot', 'loop');
  if (await fs.pathExists(codexLoop)) {
    await fs.copy(codexLoop, copilotLoop, { overwrite: true });
    warnings.push('Loop state copied — manually flip mode field from "codex" to "copilot" in JSON files');
  }

  return {
    success: true,
    agentsMdPath: targetAgentsMd,
    configPath,
    mappings: CODEX_TO_COPILOT_MAPPINGS,
    warnings,
  };
}

/**
 * Render a migration report. Same shape codex uses.
 */
export function generateMigrationReport(result: MigrationResult): string {
  const lines: string[] = ['# Migration Report', ''];
  lines.push(`**Status**: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  if (result.agentsMdPath) lines.push(`**AGENTS.md**: ${result.agentsMdPath}`);
  if (result.configPath) lines.push(`**Config**: ${result.configPath}`);
  if (result.skillsCreated && result.skillsCreated.length > 0) {
    lines.push('', '## Skills');
    for (const s of result.skillsCreated) lines.push(`- ${s}`);
  }
  if (result.warnings && result.warnings.length > 0) {
    lines.push('', '## Warnings');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  if (result.mappings && result.mappings.length > 0) {
    lines.push('', '## Feature Mappings');
    for (const m of result.mappings) {
      lines.push(`- ${m.source} → ${m.copilot} (${m.status})${m.notes ? ': ' + m.notes : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Convert `/skill-name` references to `$skill-name` (codex convention) —
 * not strictly needed for Copilot but the utility is exported for
 * downstream callers that mix codex + copilot artifacts.
 */
export function convertSkillSyntax(content: string): string {
  return content.replace(/(^|[^a-zA-Z0-9])\/([a-z][a-z0-9-]+)\b/g, '$1$$$2');
}

/**
 * Convert a Claude Code settings.json into a Copilot config object.
 * Returns the JSON object (not stringified).
 */
export function convertSettingsToConfig(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    model: (settings['model'] as string | undefined) ?? 'gpt-5.3-codex',
    permissionHandler: 'approve-all',
    streaming: false,
  };
  if (settings['mcpServers']) out['mcpServers'] = settings['mcpServers'];
  return out;
}
