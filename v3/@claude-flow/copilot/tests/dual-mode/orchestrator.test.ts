import { describe, it, expect } from 'vitest';
import {
  MultiModeOrchestrator,
  TriModeCollaborationTemplates,
  type MultiModeWorkerConfig,
} from '../../src/dual-mode/orchestrator.js';
import { parseWorkerSpecs } from '../../src/dual-mode/cli.js';

describe('parseWorkerSpecs', () => {
  it('parses a single claude worker', () => {
    const workers = parseWorkerSpecs(['claude:architect:Design the API'], false);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.platform).toBe('claude');
    expect(workers[0]?.role).toBe('architect');
    expect(workers[0]?.prompt).toBe('Design the API');
  });

  it('accepts the new copilot platform prefix', () => {
    const workers = parseWorkerSpecs(['copilot:reviewer:Review for OWASP'], false);
    expect(workers[0]?.platform).toBe('copilot');
  });

  it('chains workers sequentially by default', () => {
    const workers = parseWorkerSpecs(
      ['claude:architect:A', 'codex:coder:B', 'copilot:reviewer:C'],
      false,
    );
    expect(workers[1]?.dependsOn).toEqual(['architect']);
    expect(workers[2]?.dependsOn).toEqual(['coder']);
  });

  it('runs in parallel when requested', () => {
    const workers = parseWorkerSpecs(
      ['claude:architect:A', 'codex:coder:B'],
      true,
    );
    expect(workers[0]?.dependsOn).toBeUndefined();
    expect(workers[1]?.dependsOn).toBeUndefined();
  });

  it('rejects unknown platforms', () => {
    expect(() => parseWorkerSpecs(['gemini:foo:bar'], false)).toThrow(/Invalid platform/);
  });

  it('rejects malformed specs', () => {
    expect(() => parseWorkerSpecs(['justone'], false)).toThrow(/Invalid --worker spec/);
    expect(() => parseWorkerSpecs(['claude:role:'], false)).toThrow(/Missing prompt/);
  });

  it('deduplicates worker ids', () => {
    const workers = parseWorkerSpecs(
      ['claude:reviewer:A', 'copilot:reviewer:B'],
      true,
    );
    expect(workers[0]?.id).toBe('reviewer');
    expect(workers[1]?.id).toBe('reviewer-2');
  });
});

describe('TriModeCollaborationTemplates', () => {
  it('featureDevelopment includes all three platforms', () => {
    const workers = TriModeCollaborationTemplates.featureDevelopment('Add OAuth');
    const platforms = new Set(workers.map((w) => w.platform));
    expect(platforms.has('claude')).toBe(true);
    expect(platforms.has('codex')).toBe(true);
    expect(platforms.has('copilot')).toBe(true);
  });

  it('securityAudit puts gpt-5.5 frontier on the scanner', () => {
    const workers = TriModeCollaborationTemplates.securityAudit('src/auth');
    const scanner = workers.find((w) => w.id === 'scanner');
    expect(scanner?.platform).toBe('copilot');
    expect(scanner?.copilotModel).toBe('gpt-5.5');
  });
});

describe('MultiModeOrchestrator', () => {
  it('builds dependency levels respecting dependsOn', () => {
    const orchestrator = new MultiModeOrchestrator({ projectPath: '/tmp' }) as unknown as {
      buildDependencyLevels(w: MultiModeWorkerConfig[]): MultiModeWorkerConfig[][];
    };
    const workers: MultiModeWorkerConfig[] = [
      { id: 'a', platform: 'claude', role: 'r1', prompt: 'p' },
      { id: 'b', platform: 'codex', role: 'r2', prompt: 'p', dependsOn: ['a'] },
      { id: 'c', platform: 'copilot', role: 'r3', prompt: 'p', dependsOn: ['b'] },
    ];
    const levels = orchestrator.buildDependencyLevels(workers);
    expect(levels).toHaveLength(3);
    expect(levels[0]?.[0]?.id).toBe('a');
    expect(levels[1]?.[0]?.id).toBe('b');
    expect(levels[2]?.[0]?.id).toBe('c');
  });

  it('records a failed worker via runWorker and re-throws', async () => {
    class FakeOrchestrator extends MultiModeOrchestrator {
      protected override async executeHeadless(): Promise<string> {
        throw new Error('synthetic failure');
      }
    }
    const orchestrator = new FakeOrchestrator({ projectPath: '/tmp' });
    await expect(
      orchestrator.runWorker({ id: 'w', platform: 'claude', role: 'r', prompt: 'p' }),
    ).rejects.toThrow(/synthetic failure/);
  });
});
