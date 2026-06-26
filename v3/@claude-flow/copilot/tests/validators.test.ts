import { describe, it, expect } from 'vitest';
import { validateAgentsMd, validateConfig, validateSkillMd } from '../src/validators/index.js';

describe('validateAgentsMd', () => {
  it('accepts a well-formed AGENTS.md', async () => {
    const md = '# My Project\n\n## Setup\nnpm install\n\n## Security\nNo secrets!\n';
    const result = await validateAgentsMd(md);
    expect(result.valid).toBe(true);
  });

  it('rejects missing title', async () => {
    const result = await validateAgentsMd('No heading here, just text.');
    expect(result.valid).toBe(false);
  });

  it('flags potential GitHub tokens', async () => {
    const md = '# X\n\n## Setup\nGIT TOKEN: ghp_abcdef0123456789012345678901234567890\n## Security\nok\n';
    const result = await validateAgentsMd(md);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('GitHub'))).toBe(true);
  });
});

describe('validateSkillMd', () => {
  it('accepts a valid frontmatter block', async () => {
    const md = '---\nname: my-skill\ndescription: Test skill\nversion: 1.0.0\n---\n\n# My skill\n';
    const result = await validateSkillMd(md);
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', async () => {
    const md = '---\nversion: 1.0.0\n---\n\nbody\n';
    const result = await validateSkillMd(md);
    expect(result.valid).toBe(false);
  });

  it('rejects missing frontmatter', async () => {
    const result = await validateSkillMd('# No frontmatter');
    expect(result.valid).toBe(false);
  });
});

describe('validateConfig (TOML)', () => {
  it('accepts gpt-5.3-codex', async () => {
    const toml = 'model = "gpt-5.3-codex"\n';
    const result = await validateConfig(toml, 'toml');
    expect(result.valid).toBe(true);
  });

  it('warns on retiring models', async () => {
    const toml = 'model = "gpt-4.1"\n';
    const result = await validateConfig(toml, 'toml');
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('retiring'))).toBe(true);
  });

  it('warns on unknown models', async () => {
    const toml = 'model = "mystery-model"\n';
    const result = await validateConfig(toml, 'toml');
    expect(result.warnings.some((w) => w.message.includes('not in'))).toBe(true);
  });
});

describe('validateConfig (JSON)', () => {
  it('accepts a JSON config with the LTS model', async () => {
    const json = JSON.stringify({ model: 'gpt-5.3-codex', mcpServers: {} });
    const result = await validateConfig(json, 'json');
    expect(result.valid).toBe(true);
  });

  it('rejects unparseable JSON', async () => {
    const result = await validateConfig('not json', 'json');
    expect(result.valid).toBe(false);
  });
});
