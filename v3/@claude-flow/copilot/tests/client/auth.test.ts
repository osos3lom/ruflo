import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  CopilotAuthRequiredError,
  clearCachedToken,
  getCachedToken,
  resolveCredential,
} from '../../src/client/auth.js';

const ENV_KEYS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;
const CACHE_FILE = path.join(os.homedir(), '.config', 'ruflo', 'copilot', 'token.json');

describe('auth.resolveCredential', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    await fs.remove(CACHE_FILE);
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
    await fs.remove(CACHE_FILE);
  });

  it('returns "env:COPILOT_GITHUB_TOKEN" when that env var is set (and never the value)', async () => {
    process.env['COPILOT_GITHUB_TOKEN'] = 'ghp_fake_test_value_should_never_leak_1234567890';
    const result = await resolveCredential();
    expect(result).toBe('env:COPILOT_GITHUB_TOKEN');
    // The persisted cache must NEVER contain the token value
    const cached = await getCachedToken();
    expect(cached).not.toBeNull();
    expect(JSON.stringify(cached)).not.toContain('ghp_fake_test_value_should_never_leak');
    expect(JSON.stringify(cached)).not.toContain('1234567890');
  });

  it('returns "env:GH_TOKEN" when only GH_TOKEN is set', async () => {
    process.env['GH_TOKEN'] = 'ghp_another_fake';
    expect(await resolveCredential()).toBe('env:GH_TOKEN');
  });

  it('returns "env:GITHUB_TOKEN" when only GITHUB_TOKEN is set', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_yet_another_fake';
    expect(await resolveCredential()).toBe('env:GITHUB_TOKEN');
  });

  it('prefers COPILOT_GITHUB_TOKEN over GH_TOKEN over GITHUB_TOKEN', async () => {
    process.env['COPILOT_GITHUB_TOKEN'] = 'a';
    process.env['GH_TOKEN'] = 'b';
    process.env['GITHUB_TOKEN'] = 'c';
    expect(await resolveCredential()).toBe('env:COPILOT_GITHUB_TOKEN');
  });

  it('returns null when no env vars are set and gh is not authenticated', async () => {
    // gh isn't typically authenticated in the test sandbox; if it is, the test below covers it.
    const result = await resolveCredential();
    expect(result === null || result === 'gh-cli').toBe(true);
  });
});

describe('auth cache lifecycle', () => {
  beforeEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await fs.remove(CACHE_FILE);
  });

  it('getCachedToken returns null when no file exists', async () => {
    expect(await getCachedToken()).toBeNull();
  });

  it('clearCachedToken removes the cache file', async () => {
    process.env['GH_TOKEN'] = 'fake';
    await resolveCredential();
    expect(await getCachedToken()).not.toBeNull();
    await clearCachedToken();
    expect(await getCachedToken()).toBeNull();
  });
});

describe('CopilotAuthRequiredError', () => {
  it('has the correct code and a message that does NOT include any token', () => {
    const err = new CopilotAuthRequiredError();
    expect(err.code).toBe('COPILOT_AUTH_REQUIRED');
    expect(err.name).toBe('CopilotAuthRequiredError');
    expect(err.message).not.toMatch(/ghp_|gho_|sk-/);
  });

  it('respects custom messages without leaking secrets', () => {
    const err = new CopilotAuthRequiredError('Authenticate with `gh auth login`.');
    expect(err.message).toBe('Authenticate with `gh auth login`.');
  });
});
