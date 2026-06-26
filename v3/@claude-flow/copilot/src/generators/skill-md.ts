/**
 * @claude-flow/copilot - SKILL.md generator
 *
 * Same format as the codex package's skill-md generator. Copilot
 * does not invoke skills via `$name` or `/name` syntax; the skill
 * is loaded as documentation and may be invoked through an MCP tool.
 */

import type { SkillMdOptions } from '../types.js';

export async function generateSkillMd(options: SkillMdOptions): Promise<string> {
  const {
    name,
    description,
    version = '1.0.0',
    author = 'rUv',
    tags = deriveTags(name),
    triggers = ['Define when to trigger this skill'],
    skipWhen = ['Define when to skip this skill'],
  } = options;

  const frontmatter = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `version: ${version}`,
    `author: ${author}`,
    `tags: [${tags.map((t) => `"${t}"`).join(', ')}]`,
    '---',
    '',
  ].join('\n');

  const body = [
    `# ${name}`,
    '',
    '## Purpose',
    '',
    description,
    '',
    '## When to Trigger',
    '',
    ...triggers.map((t) => `- ${t}`),
    '',
    '## When to Skip',
    '',
    ...skipWhen.map((s) => `- ${s}`),
    '',
    '## Usage',
    '',
    `Invoke through the Copilot MCP bridge — \`${name}\` is registered as a tool ` +
      'when the ruflo MCP server is connected to the session.',
    '',
  ].join('\n');

  return frontmatter + body;
}

/**
 * Generate one of the built-in skill stubs.
 */
export async function generateBuiltInSkill(
  name: string,
): Promise<{ skillMd: string; scripts: Record<string, string>; references: Record<string, string> }> {
  const skillMd = await generateSkillMd({
    name,
    description: `Built-in RuFlo skill: ${name}`,
  });
  return { skillMd, scripts: {}, references: {} };
}

function deriveTags(name: string): string[] {
  return name.split('-').filter(Boolean);
}
