/**
 * @claude-flow/copilot - Authentication resolver
 *
 * Verifies that a Copilot CLI credential exists, WITHOUT ever
 * reading, logging, persisting, or returning the raw token value.
 *
 * Compliance with ADR-147 Part G and the MEMORY rule
 * "Never expose the user's API keys":
 *
 *   - We only check env-var PRESENCE (not value) and `gh auth status` exit code.
 *   - The cache file at ~/.config/ruflo/copilot/token.json holds the SOURCE
 *     identifier only (e.g. `"env:GH_TOKEN"`), never the credential string.
 *   - The Copilot SDK / CLI reads the actual credential itself.
 */

import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { CredentialHandle, CredentialSource } from '../types.js';

const CACHE_DIR = path.join(os.homedir(), '.config', 'ruflo', 'copilot');
const CACHE_FILE = path.join(CACHE_DIR, 'token.json');
const CACHE_MODE = 0o600;

/**
 * Ordered list of env vars the Copilot CLI itself checks (research §3.1).
 * We only check `process.env[name] !== undefined && length > 0`.
 */
const ENV_CANDIDATES: ReadonlyArray<{ name: string; source: CredentialSource }> = [
  { name: 'COPILOT_GITHUB_TOKEN', source: 'env:COPILOT_GITHUB_TOKEN' },
  { name: 'GH_TOKEN', source: 'env:GH_TOKEN' },
  { name: 'GITHUB_TOKEN', source: 'env:GITHUB_TOKEN' },
];

/**
 * Resolve a credential SOURCE (never the token itself).
 *
 * Returns one of:
 *   - "env:COPILOT_GITHUB_TOKEN" / "env:GH_TOKEN" / "env:GITHUB_TOKEN"
 *   - "gh-cli" (when `gh auth status` exits 0)
 *   - null (no credential available — caller surfaces COPILOT_AUTH_REQUIRED)
 */
export async function resolveCredential(): Promise<CredentialSource> {
  // 1. Env var presence (cheap, no subprocess).
  for (const candidate of ENV_CANDIDATES) {
    const raw = process.env[candidate.name];
    if (raw !== undefined && raw.length > 0) {
      await writeCachedHandle({ source: candidate.source, verifiedAt: nowIso() });
      return candidate.source;
    }
  }

  // 2. gh CLI authenticated? Check exit code only — never read stdout.
  const ghOk = await checkGhAuthStatus();
  if (ghOk) {
    await writeCachedHandle({ source: 'gh-cli', verifiedAt: nowIso() });
    return 'gh-cli';
  }

  return null;
}

/**
 * Read the cached credential handle from disk.
 *
 * Returns null if the file is missing, unreadable, or malformed.
 * Does NOT validate that the underlying credential is still valid;
 * callers should call `resolveCredential()` for that.
 */
export async function getCachedToken(): Promise<CredentialHandle | null> {
  try {
    if (!(await fs.pathExists(CACHE_FILE))) return null;
    const raw = await fs.readJson(CACHE_FILE) as unknown;
    if (!isCredentialHandle(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Remove the cached credential handle. The actual GitHub credential
 * (env var or `gh auth login` token store) is not touched — that's
 * the user's GitHub CLI domain.
 */
export async function clearCachedToken(): Promise<void> {
  try {
    await fs.remove(CACHE_FILE);
  } catch {
    /* file may already be gone — non-fatal */
  }
}

/**
 * Typed error surfaced to upstream callers when no credential resolves.
 * The message NEVER contains a token; only the next action the user
 * should take.
 */
export class CopilotAuthRequiredError extends Error {
  override readonly name = 'CopilotAuthRequiredError';
  readonly code = 'COPILOT_AUTH_REQUIRED' as const;
  constructor(
    message = 'No GitHub Copilot credential found. Run `gh auth login` or set GITHUB_TOKEN.',
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

async function writeCachedHandle(handle: CredentialHandle): Promise<void> {
  try {
    await fs.ensureDir(CACHE_DIR);
    await fs.writeJson(CACHE_FILE, handle, { spaces: 2 });
    await fs.chmod(CACHE_FILE, CACHE_MODE);
  } catch {
    /* cache is best-effort — failure to persist is non-fatal */
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function isCredentialHandle(value: unknown): value is CredentialHandle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const sourceOk =
    v['source'] === null ||
    v['source'] === 'env:COPILOT_GITHUB_TOKEN' ||
    v['source'] === 'env:GH_TOKEN' ||
    v['source'] === 'env:GITHUB_TOKEN' ||
    v['source'] === 'gh-cli';
  return sourceOk && typeof v['verifiedAt'] === 'string';
}

/**
 * Run `gh auth status` and resolve to `true` iff exit code is 0.
 * Stdout/stderr are deliberately discarded so we never see token fragments.
 */
function checkGhAuthStatus(): Promise<boolean> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('gh', ['auth', 'status'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      resolve(false);
      return;
    }
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}
