import { describe, it, expect } from 'vitest';
import { buildMcpServers, registerRufloMcpWithCopilot } from '../../src/mcp/register.js';
import { CopilotMcpBridge } from '../../src/mcp/bridge.js';

describe('registerRufloMcpWithCopilot', () => {
  it('produces the local-stdio server shape Copilot expects', async () => {
    const out = await registerRufloMcpWithCopilot('/tmp/project');
    expect(out.ruflo).toBeDefined();
    expect(out.ruflo.type).toBe('local');
    expect(out.ruflo.command).toBe('npx');
    expect(out.ruflo.args).toEqual(['-y', 'ruflo@latest', 'mcp', 'start']);
    expect(out.ruflo.tools).toEqual(['*']);
    expect(out.ruflo.env?.['CLAUDE_FLOW_CONFIG']).toBe('/tmp/project/claude-flow.config.json');
    expect(out.ruflo.cwd).toBe('/tmp/project');
  });

  it('honors an explicit tool allowlist', async () => {
    const out = await registerRufloMcpWithCopilot('/x', ['memory_store', 'memory_search']);
    expect(out.ruflo.tools).toEqual(['memory_store', 'memory_search']);
  });

  it('returns ["*"] when the filter is the literal "*"', async () => {
    const out = await registerRufloMcpWithCopilot('/x', '*');
    expect(out.ruflo.tools).toEqual(['*']);
  });
});

describe('buildMcpServers', () => {
  it('merges extra servers AFTER ruflo so caller wins on collisions', async () => {
    const out = await buildMcpServers('/x', {
      custom: { type: 'remote', url: 'https://example.com/mcp' },
    });
    expect(Object.keys(out)).toContain('ruflo');
    expect(Object.keys(out)).toContain('custom');
    expect((out['custom'] as { url?: string }).url).toBe('https://example.com/mcp');
  });

  it('caller-supplied "ruflo" overrides default', async () => {
    const out = await buildMcpServers('/x', {
      ruflo: { type: 'remote', url: 'https://ruflo.cloud/mcp' },
    });
    expect((out['ruflo'] as { url?: string; type: string }).url).toBe('https://ruflo.cloud/mcp');
    expect((out['ruflo'] as { type: string }).type).toBe('remote');
  });
});

describe('CopilotMcpBridge', () => {
  it('records, snapshots, and clears events', () => {
    const bridge = new CopilotMcpBridge('sess-1');
    expect(bridge.count()).toBe(0);

    bridge.record({ serverId: 'ruflo', toolName: 'memory_store', outcome: 'allowed' });
    bridge.record({ serverId: 'ruflo', toolName: 'memory_search', outcome: 'errored', error: 'connection refused' });

    expect(bridge.count()).toBe(2);
    const events = bridge.events();
    expect(events[0]?.sessionId).toBe('sess-1');
    expect(events[0]?.outcome).toBe('allowed');
    expect(events[1]?.outcome).toBe('errored');
    expect(events[1]?.error).toBe('connection refused');

    bridge.clear();
    expect(bridge.count()).toBe(0);
  });
});
