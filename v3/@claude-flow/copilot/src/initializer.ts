/**
 * @claude-flow/copilot - CopilotInitializer
 *
 * Mirrors the CodexInitializer flow: writes AGENTS.md, .copilot/config.json,
 * skill stubs, and an AGENTS.override.md to a target project.
 *
 * MCP wiring is done via the SDK's `mcpServers` map on every session,
 * not via a one-shot `mcp add` command (see register.ts) — so this
 * initializer does NOT exec a Copilot subcommand to register a server.
 */

import fs from 'fs-extra';
import path from 'node:path';
import type { AgentsMdTemplate, BuiltInSkill, CopilotInitOptions, CopilotInitResult } from './types.js';
import { generateAgentsMd } from './generators/agents-md.js';
import { generateCopilotConfigJson } from './generators/config-toml.js';
import { generateBuiltInSkill, generateSkillMd } from './generators/skill-md.js';
import { AGENTS_OVERRIDE_TEMPLATE, DEFAULT_SKILLS_BY_TEMPLATE, GITIGNORE_ENTRIES } from './templates/index.js';

const BUILT_IN_SKILLS: BuiltInSkill[] = [
  'swarm-orchestration',
  'memory-management',
  'sparc-methodology',
  'security-audit',
  'performance-analysis',
  'github-automation',
];

/**
 * Initialize a Copilot-flavored project. Same shape as CodexInitializer.
 */
export class CopilotInitializer {
  private projectPath = '';
  private template: AgentsMdTemplate = 'default';
  private skills: string[] = [];
  private force = false;
  private dual = false;

  async initialize(options: CopilotInitOptions): Promise<CopilotInitResult> {
    this.projectPath = path.resolve(options.projectPath);
    this.template = options.template ?? 'default';
    this.skills = options.skills ?? DEFAULT_SKILLS_BY_TEMPLATE[this.template];
    this.force = options.force ?? false;
    this.dual = options.dual ?? false;

    const filesCreated: string[] = [];
    const skillsGenerated: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      await this.validateProjectPath();
      if (await this.isAlreadyInitialized()) {
        if (!this.force) {
          return {
            success: false,
            filesCreated,
            skillsGenerated,
            warnings: ['Project already initialized. Use --force to overwrite.'],
            errors: ['Project already initialized'],
          };
        }
        warnings.push('Overwriting existing configuration files');
      }

      await this.createDirectoryStructure();

      // AGENTS.md
      const agentsMd = await generateAgentsMd({
        projectName: path.basename(this.projectPath),
        template: this.template,
        skills: this.skills,
      });
      const agentsMdPath = path.join(this.projectPath, 'AGENTS.md');
      if (await this.shouldWrite(agentsMdPath)) {
        await fs.writeFile(agentsMdPath, agentsMd, 'utf-8');
        filesCreated.push('AGENTS.md');
      } else {
        warnings.push('AGENTS.md already exists — skipped');
      }

      // .copilot/config.json
      const configJson = await generateCopilotConfigJson();
      const configPath = path.join(this.projectPath, '.copilot', 'config.json');
      if (await this.shouldWrite(configPath)) {
        await fs.writeFile(configPath, configJson, 'utf-8');
        filesCreated.push('.copilot/config.json');
      } else {
        warnings.push('.copilot/config.json already exists — skipped');
      }

      // Skills
      for (const skill of this.skills) {
        try {
          const result = await this.generateSkill(skill);
          if (result.created) {
            skillsGenerated.push(skill);
            filesCreated.push(result.path);
          } else if (result.skipped) {
            warnings.push(`Skill ${skill} already exists — skipped`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to generate skill ${skill}: ${msg}`);
        }
      }

      // AGENTS.override.md
      const overridePath = path.join(this.projectPath, '.copilot', 'AGENTS.override.md');
      if (await this.shouldWrite(overridePath)) {
        await fs.writeFile(overridePath, AGENTS_OVERRIDE_TEMPLATE, 'utf-8');
        filesCreated.push('.copilot/AGENTS.override.md');
      }

      // .gitignore
      const gitignoreUpdated = await this.updateGitignore();
      if (gitignoreUpdated) filesCreated.push('.gitignore (updated)');

      // Dual mode (also emit CLAUDE.md stub)
      if (this.dual) {
        const claudeMdPath = path.join(this.projectPath, 'CLAUDE.md');
        if (await this.shouldWrite(claudeMdPath)) {
          await fs.writeFile(claudeMdPath, this.generateDualClaudeMd(), 'utf-8');
          filesCreated.push('CLAUDE.md');
        }
      }

      const result: CopilotInitResult = {
        success: true,
        filesCreated,
        skillsGenerated,
      };
      if (warnings.length > 0) result.warnings = warnings;
      return result;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Unknown error');
      const result: CopilotInitResult = { success: false, filesCreated, skillsGenerated, errors };
      if (warnings.length > 0) result.warnings = warnings;
      return result;
    }
  }

  async dryRun(options: CopilotInitOptions): Promise<string[]> {
    const skills = options.skills ?? DEFAULT_SKILLS_BY_TEMPLATE[options.template ?? 'default'];
    const files = [
      'AGENTS.md',
      '.copilot/config.json',
      '.copilot/AGENTS.override.md',
      '.gitignore (updated)',
    ];
    for (const s of skills) files.push(`.agents/skills/${s}/SKILL.md`);
    if (options.dual) files.push('CLAUDE.md');
    return files;
  }

  /* ----------------------------------------------------------- */
  /* helpers                                                       */
  /* ----------------------------------------------------------- */

  private async validateProjectPath(): Promise<void> {
    try {
      await fs.ensureDir(this.projectPath);
      const probe = path.join(this.projectPath, '.copilot-init-test');
      await fs.writeFile(probe, 'test', 'utf-8');
      await fs.remove(probe);
    } catch {
      throw new Error(`Cannot write to project path: ${this.projectPath}`);
    }
  }

  private async isAlreadyInitialized(): Promise<boolean> {
    const a = await fs.pathExists(path.join(this.projectPath, 'AGENTS.md'));
    const b = await fs.pathExists(path.join(this.projectPath, '.copilot', 'config.json'));
    return a || b;
  }

  private async shouldWrite(filePath: string): Promise<boolean> {
    if (this.force) return true;
    return !(await fs.pathExists(filePath));
  }

  private async createDirectoryStructure(): Promise<void> {
    const dirs = ['.copilot', '.copilot/loop', '.agents', '.agents/skills', '.claude-flow', '.claude-flow/data'];
    for (const d of dirs) await fs.ensureDir(path.join(this.projectPath, d));
  }

  private async generateSkill(name: string): Promise<{ created: boolean; skipped: boolean; path: string }> {
    const skillDir = path.join(this.projectPath, '.agents', 'skills', name);
    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!this.force && (await fs.pathExists(skillPath))) {
      return { created: false, skipped: true, path: `.agents/skills/${name}/SKILL.md` };
    }
    await fs.ensureDir(skillDir);
    let body: string;
    if (BUILT_IN_SKILLS.includes(name as BuiltInSkill)) {
      const res = await generateBuiltInSkill(name);
      body = res.skillMd;
    } else {
      body = await generateSkillMd({ name, description: `Custom skill: ${name}` });
    }
    await fs.writeFile(skillPath, body, 'utf-8');
    return { created: true, skipped: false, path: `.agents/skills/${name}/SKILL.md` };
  }

  private async updateGitignore(): Promise<boolean> {
    const gi = path.join(this.projectPath, '.gitignore');
    let content = '';
    if (await fs.pathExists(gi)) content = await fs.readFile(gi, 'utf-8');
    if (content.includes('.copilot/')) return false;
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n\n' : '\n';
    await fs.writeFile(gi, content + sep + GITIGNORE_ENTRIES.join('\n') + '\n');
    return true;
  }

  private generateDualClaudeMd(): string {
    const name = path.basename(this.projectPath);
    return `# ${name}

> This project supports both Claude Code and GitHub Copilot.

## Platform Compatibility

| Platform | Config | Skill syntax |
|---|---|---|
| Claude Code | CLAUDE.md | /skill-name |
| Copilot (this adapter) | AGENTS.md | MCP tool call |

Primary instructions are in \`AGENTS.md\`.

## Security

- NEVER commit secrets or .env files
- Credentials for Copilot come from \`gh auth login\` or env vars (see ADR-147 Part G)

Generated by @claude-flow/copilot (dual mode).
`;
  }
}

/**
 * Programmatic helper.
 */
export async function initializeCopilotProject(
  projectPath: string,
  options?: Partial<CopilotInitOptions>,
): Promise<CopilotInitResult> {
  const init = new CopilotInitializer();
  const opts: CopilotInitOptions = {
    projectPath,
    template: options?.template ?? 'default',
    force: options?.force ?? false,
    dual: options?.dual ?? false,
  };
  if (options?.skills) opts.skills = options.skills;
  return init.initialize(opts);
}
