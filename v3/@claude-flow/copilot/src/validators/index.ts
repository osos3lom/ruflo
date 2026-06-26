/**
 * @claude-flow/copilot - Validators
 *
 * Stripped-down validators tuned for the Copilot surface. Reuses the
 * same shape as the codex validators (ValidationResult / errors /
 * warnings) so downstream tooling can treat them interchangeably.
 */

import type { ValidationError, ValidationResult, ValidationWarning } from '../types.js';
import { isCatalogModel, isRetiringModel } from '../client/models.js';

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
  { pattern: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth token' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/, name: 'GitHub fine-grained token' },
  { pattern: /sk-[a-zA-Z0-9]{32,}/, name: 'OpenAI-style API key' },
  { pattern: /sk-ant-[a-zA-Z0-9-]{32,}/, name: 'Anthropic API key' },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, name: 'Private key' },
];

const REQUIRED_AGENTS_SECTIONS = ['Setup', 'Security'];

/**
 * Validate an AGENTS.md file authored for the Copilot adapter.
 */
export async function validateAgentsMd(content: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const lines = content.split('\n');

  if (!content.startsWith('# ')) {
    errors.push({
      path: 'AGENTS.md',
      message: 'AGENTS.md should start with a level-1 heading (# Title)',
      line: 1,
    });
  }

  if (content.trim().length < 50) {
    errors.push({
      path: 'AGENTS.md',
      message: 'AGENTS.md content is too short — add meaningful instructions',
      line: 1,
    });
  }

  const lowerContent = content.toLowerCase();
  for (const section of REQUIRED_AGENTS_SECTIONS) {
    if (!lowerContent.includes(section.toLowerCase())) {
      warnings.push({
        path: 'AGENTS.md',
        message: `Missing recommended section: ## ${section}`,
        suggestion: `Add a "## ${section}" section`,
      });
    }
  }

  scanForSecrets(lines, 'AGENTS.md', errors);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a SKILL.md file. Same constraints the codex validator uses.
 */
export async function validateSkillMd(content: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const lines = content.split('\n');

  if (!content.startsWith('---')) {
    errors.push({ path: 'SKILL.md', message: 'SKILL.md must start with YAML frontmatter', line: 1 });
    return { valid: false, errors, warnings };
  }

  const closeIndex = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closeIndex === -1) {
    errors.push({ path: 'SKILL.md', message: 'YAML frontmatter not properly closed', line: 1 });
    return { valid: false, errors, warnings };
  }

  // Cheap key checks against the frontmatter.
  const frontmatter = lines.slice(1, closeIndex).join('\n');
  if (!/^name:\s+\S+/m.test(frontmatter)) {
    errors.push({ path: 'SKILL.md', message: 'Missing required field: name', line: 2 });
  }
  if (!/^description:\s+\S+/m.test(frontmatter)) {
    errors.push({ path: 'SKILL.md', message: 'Missing required field: description', line: 2 });
  }

  scanForSecrets(lines, 'SKILL.md', errors);
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate either a `config.toml` or `config.json` Copilot config.
 *
 * Adds a check: `model` MUST be in the GA catalog, with a warning
 * for retiring models.
 */
export async function validateConfig(content: string, format: 'toml' | 'json' = 'toml'): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const lines = content.split('\n');

  let model: string | null = null;
  if (format === 'json') {
    try {
      const obj = JSON.parse(content) as Record<string, unknown>;
      const m = obj['model'];
      if (typeof m === 'string') model = m;
    } catch (err) {
      errors.push({
        path: 'config.json',
        message: `Invalid JSON: ${(err as Error).message}`,
        line: 1,
      });
      return { valid: false, errors, warnings };
    }
  } else {
    const match = content.match(/^model\s*=\s*"([^"]+)"/m);
    if (match) model = match[1] ?? null;
  }

  if (!model) {
    errors.push({
      path: format === 'json' ? 'config.json' : 'config.toml',
      message: 'Missing required field: model',
      line: 1,
    });
  } else if (isRetiringModel(model)) {
    warnings.push({
      path: format === 'json' ? 'config.json' : 'config.toml',
      message: `Model "${model}" is retiring or excluded from routing`,
      suggestion: 'Switch to gpt-5.3-codex (LTS) or gpt-5.4-mini (fast)',
    });
  } else if (!isCatalogModel(model)) {
    warnings.push({
      path: format === 'json' ? 'config.json' : 'config.toml',
      message: `Model "${model}" is not in the @claude-flow/copilot GA catalog`,
      suggestion: 'Confirm the SDK exposes this model via client.listModels()',
    });
  }

  scanForSecrets(lines, format === 'json' ? 'config.json' : 'config.toml', errors);

  return { valid: errors.length === 0, errors, warnings };
}

function scanForSecrets(lines: string[], filename: string, errors: ValidationError[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, name } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        errors.push({
          path: filename,
          message: `Potential ${name} detected — never commit secrets`,
          line: i + 1,
        });
      }
    }
  }
}
