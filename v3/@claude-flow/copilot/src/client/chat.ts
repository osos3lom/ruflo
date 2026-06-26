/**
 * @claude-flow/copilot - Chat / governed call entry point
 *
 * Wraps the GitHub Copilot SDK's client-session model. Two layers:
 *
 *  - `CopilotClient`: thin SDK shim. Calls into `@github/copilot-sdk`
 *    when available; falls back to driving the bundled `copilot` CLI
 *    in `-p/--prompt` non-interactive mode when the SDK is absent.
 *  - `runGoverned()`: the canonical governed entry. Wires the four
 *    hook calls (`pre-task` → `route` → call → `post-task`) per
 *    ADR-147 Part F, exactly mirroring the codex adapter pattern.
 */

import { spawn } from 'node:child_process';
import {
  CopilotAuthRequiredError,
  resolveCredential,
} from './auth.js';
import { TIER_DEFAULTS } from './models.js';
import type { CopilotMcpServerConfig, CopilotPermissionHandler } from '../types.js';

/**
 * Per-message structure (OpenAI-style role/content pair).
 */
export interface CopilotMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

/**
 * Delta event emitted during streaming.
 */
export interface StreamEvent {
  type: 'assistant.message_delta' | 'assistant.message_complete' | 'tool.call' | 'session.idle';
  text?: string;
  toolName?: string;
  toolInput?: unknown;
}

/**
 * Client construction config.
 */
export interface CopilotClientConfig {
  /** Override the `copilot` CLI binary location. Default: PATH lookup. */
  cliCommand?: string;
  /** Per-call default timeout in ms. */
  timeoutMs?: number;
  /** Disable real subprocess calls — used by tests. */
  dryRun?: boolean;
}

/**
 * Per-session config (mirrors the SDK's `createSession` shape).
 */
export interface CopilotSessionConfig {
  model?: string;
  streaming?: boolean;
  permissionHandler?: CopilotPermissionHandler;
  mcpServers?: Record<string, CopilotMcpServerConfig>;
  systemPrompt?: string;
}

/**
 * Handle returned by `createSession()`.
 */
export interface CopilotSession {
  config: CopilotSessionConfig;
  sendAndWait(input: { prompt: string }): Promise<{ content: string; model: string }>;
  disconnect(): Promise<void>;
}

/**
 * Thin Copilot SDK wrapper.
 *
 * The SDK is imported dynamically so the rest of the package
 * still type-checks and tests when `@github/copilot-sdk` is not
 * installed in the local node_modules.
 */
export class CopilotClient {
  private readonly cliCommand: string;
  private readonly timeoutMs: number;
  private readonly dryRun: boolean;

  constructor(config: CopilotClientConfig = {}) {
    this.cliCommand = config.cliCommand ?? 'copilot';
    this.timeoutMs = config.timeoutMs ?? 5 * 60_000;
    this.dryRun = config.dryRun ?? false;
  }

  /**
   * Create a session. Resolves auth first; throws CopilotAuthRequiredError
   * if no credential source is available.
   */
  async createSession(config: CopilotSessionConfig = {}): Promise<CopilotSession> {
    if (!this.dryRun) {
      const cred = await resolveCredential();
      if (cred === null) throw new CopilotAuthRequiredError();
    }
    const resolved: CopilotSessionConfig = {
      model: config.model ?? TIER_DEFAULTS.Tier3,
      streaming: config.streaming ?? false,
      permissionHandler: config.permissionHandler ?? 'approve-all',
      ...(config.mcpServers !== undefined ? { mcpServers: config.mcpServers } : {}),
      ...(config.systemPrompt !== undefined ? { systemPrompt: config.systemPrompt } : {}),
    };
    return this.makeSession(resolved);
  }

  /**
   * Stop any background SDK resources. Currently a no-op for the
   * CLI fallback; SDK-backed sessions release their JSON-RPC channel.
   */
  async stop(): Promise<void> {
    /* no-op — process cleanup happens per-session */
  }

  /**
   * Run a prompt through the full governance lifecycle:
   *
   *   pre-task → route → Copilot call → post-task
   *
   * Mirrors `CodexInitializer`'s lifecycle hook wiring. Hook failures
   * are non-fatal (logged via `onWarn` if supplied) — only the actual
   * Copilot call failure rejects the promise.
   */
  async runGoverned(opts: {
    prompt: string;
    taskId: string;
    sessionConfig?: CopilotSessionConfig;
    onWarn?: (message: string) => void;
  }): Promise<{ content: string; model: string; taskId: string }> {
    const { prompt, taskId, sessionConfig = {}, onWarn = () => undefined } = opts;

    await runHook(['pre-task', '--description', prompt], onWarn);
    const recommendedModel = await runHookCapture(
      ['route', '--task', prompt, '--context', 'copilot'],
      onWarn,
    );

    const session = await this.createSession({
      ...sessionConfig,
      model: extractModelFromRoute(recommendedModel) ?? sessionConfig.model ?? TIER_DEFAULTS.Tier3,
    });

    try {
      const result = await session.sendAndWait({ prompt });
      await runHook(
        ['post-task', '--task-id', taskId, '--success', 'true', '--store-results', 'true'],
        onWarn,
      );
      return { content: result.content, model: result.model, taskId };
    } catch (err) {
      await runHook(
        ['post-task', '--task-id', taskId, '--success', 'false'],
        onWarn,
      );
      throw err;
    } finally {
      await session.disconnect();
    }
  }

  /* ----------------------------------------------------------- */
  /* Internal session factory                                     */
  /* ----------------------------------------------------------- */

  private async makeSession(config: CopilotSessionConfig): Promise<CopilotSession> {
    // Try SDK first.
    const sdkSession = await this.trySdkSession(config);
    if (sdkSession !== null) return sdkSession;

    // Fallback: drive the copilot CLI in -p mode.
    return this.makeCliSession(config);
  }

  private async trySdkSession(
    config: CopilotSessionConfig,
  ): Promise<CopilotSession | null> {
    try {
      // Dynamic import via a string variable so TypeScript does not try to
      // resolve `@github/copilot-sdk` at compile time. The package is an
      // optional runtime dependency — when present, we use it; when absent,
      // the CLI fallback in makeCliSession() drives the bundled `copilot` CLI.
      const sdkModuleName = '@github/copilot-sdk';
      const sdk = (await import(sdkModuleName).catch(() => null)) as {
        CopilotClient?: new () => { createSession(c: CopilotSessionConfig): Promise<CopilotSession> };
      } | null;
      if (!sdk?.CopilotClient) return null;
      const inner = new sdk.CopilotClient();
      const session = await inner.createSession(config);
      return session;
    } catch {
      return null;
    }
  }

  private makeCliSession(config: CopilotSessionConfig): CopilotSession {
    const cliCommand = this.cliCommand;
    const timeoutMs = this.timeoutMs;
    const dryRun = this.dryRun;

    return {
      config,
      async sendAndWait({ prompt }): Promise<{ content: string; model: string }> {
        if (dryRun) {
          return {
            content: `[dry-run] copilot would receive: ${prompt.slice(0, 80)}`,
            model: config.model ?? TIER_DEFAULTS.Tier3,
          };
        }
        const args = ['-p', prompt, '--allow-all-tools'];
        if (config.model) args.push('--model', config.model);
        const stdout = await runCli(cliCommand, args, timeoutMs);
        return { content: stdout, model: config.model ?? TIER_DEFAULTS.Tier3 };
      },
      async disconnect(): Promise<void> {
        /* CLI mode is per-call; nothing to release */
      },
    };
  }
}

/**
 * Convenience constructor for callers that don't need a config.
 */
export function createCopilotClient(config?: CopilotClientConfig): CopilotClient {
  return new CopilotClient(config ?? {});
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Run a `@claude-flow/cli` hook subcommand. Failures are non-fatal — they
 * propagate to `onWarn` only. The hook ecosystem is best-effort.
 */
async function runHook(args: string[], onWarn: (m: string) => void): Promise<void> {
  await spawnAndCapture('npx', ['@claude-flow/cli@latest', 'hooks', ...args])
    .catch((err: Error) => onWarn(`hook ${args[0] ?? '?'} failed: ${err.message}`));
}

/**
 * Run a hook and return its stdout (for `route`). Returns empty string
 * on failure.
 */
async function runHookCapture(args: string[], onWarn: (m: string) => void): Promise<string> {
  return spawnAndCapture('npx', ['@claude-flow/cli@latest', 'hooks', ...args])
    .catch((err: Error) => {
      onWarn(`hook ${args[0] ?? '?'} failed: ${err.message}`);
      return '';
    });
}

/**
 * Parse `[TASK_MODEL_RECOMMENDATION] Use model="gpt-5.4-mini"` out of
 * a hook's stdout. Returns null if not present.
 */
export function extractModelFromRoute(stdout: string): string | null {
  const m = stdout.match(/Use model="([^"]+)"/);
  return m && m[1] ? m[1] : null;
}

function runCli(command: string, args: string[], timeoutMs: number): Promise<string> {
  return spawnAndCapture(command, args, timeoutMs);
}

function spawnAndCapture(command: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(command, args, {
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(err as Error);
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Exited ${code}: ${stderr || stdout}`));
    });
  });
}
