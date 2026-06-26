import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { CopilotInitializer, initializeCopilotProject } from '../src/initializer.js';

describe('CopilotInitializer', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-init-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('scaffolds AGENTS.md + .copilot/config.json + skill files', async () => {
    const init = new CopilotInitializer();
    const result = await init.initialize({
      projectPath: tmp,
      template: 'default',
    });
    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('AGENTS.md');
    expect(result.filesCreated).toContain('.copilot/config.json');
    expect(await fs.pathExists(path.join(tmp, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tmp, '.copilot', 'config.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmp, '.copilot', 'AGENTS.override.md'))).toBe(true);
  });

  it('refuses to overwrite without --force', async () => {
    const init = new CopilotInitializer();
    await init.initialize({ projectPath: tmp });
    const second = await init.initialize({ projectPath: tmp });
    expect(second.success).toBe(false);
  });

  it('overwrites with --force', async () => {
    const init = new CopilotInitializer();
    await init.initialize({ projectPath: tmp });
    const second = await init.initialize({ projectPath: tmp, force: true });
    expect(second.success).toBe(true);
  });

  it('generates valid JSON config', async () => {
    await initializeCopilotProject(tmp);
    const config = await fs.readJson(path.join(tmp, '.copilot', 'config.json')) as Record<string, unknown>;
    expect(config['model']).toBe('gpt-5.3-codex');
    expect(config['mcpServers']).toBeDefined();
  });

  it('dryRun lists files without writing', async () => {
    const init = new CopilotInitializer();
    const files = await init.dryRun({ projectPath: tmp, template: 'minimal' });
    expect(files).toContain('AGENTS.md');
    expect(files).toContain('.copilot/config.json');
    expect(await fs.pathExists(path.join(tmp, 'AGENTS.md'))).toBe(false);
  });

  it('emits a CLAUDE.md in dual mode', async () => {
    const init = new CopilotInitializer();
    const result = await init.initialize({ projectPath: tmp, dual: true });
    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('CLAUDE.md');
    expect(await fs.pathExists(path.join(tmp, 'CLAUDE.md'))).toBe(true);
  });

  it('updates .gitignore with .copilot/ entries', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), '# preexisting\nnode_modules\n');
    await initializeCopilotProject(tmp);
    const gi = await fs.readFile(path.join(tmp, '.gitignore'), 'utf-8');
    expect(gi).toContain('.copilot/');
    expect(gi).toContain('node_modules'); // preserved
  });
});
