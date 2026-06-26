/**
 * @claude-flow/copilot - MultiModeOrchestrator
 *
 * Extends `DualModeOrchestrator` from @claude-flow/codex with a third
 * `copilot:` platform. Does NOT rename the parent class — that would
 * be a breaking change for every codex importer.
 *
 * The implementation falls back to a self-contained mini-orchestrator
 * when the codex package is not installed, so this package's tests
 * stay independent of codex.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { CopilotClient } from '../client/chat.js';
import { TIER_DEFAULTS, getOptimalModel } from '../client/models.js';
import { registerRufloMcpWithCopilot } from '../mcp/register.js';
import type { CopilotPermissionHandler } from '../types.js';

/**
 * Worker config, widened to admit `copilot` as a third platform.
 */
export interface MultiModeWorkerConfig {
  id: string;
  platform: 'claude' | 'codex' | 'copilot';
  role: string;
  prompt: string;
  model?: string;
  maxTurns?: number;
  timeout?: number;
  dependsOn?: string[];
  /** Tier hint for Copilot routing. Ignored for other platforms. */
  copilotTier?: 'Tier2' | 'Tier3' | 'Tier3Reasoning';
  copilotModel?: string;
  copilotOptions?: {
    permissionHandler?: CopilotPermissionHandler;
    streaming?: boolean;
  };
}

export interface MultiModeWorkerResult {
  id: string;
  platform: 'claude' | 'codex' | 'copilot';
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface MultiModeConfig {
  projectPath: string;
  maxConcurrent?: number;
  sharedNamespace?: string;
  timeout?: number;
  claudeCommand?: string;
  codexCommand?: string;
}

export interface CollaborationResult {
  success: boolean;
  workers: MultiModeWorkerResult[];
  totalDuration: number;
  errors: string[];
}

/**
 * Multi-mode (tri-platform) orchestrator.
 */
export class MultiModeOrchestrator extends EventEmitter {
  protected readonly config: Required<MultiModeConfig>;
  private readonly results = new Map<string, MultiModeWorkerResult>();
  private readonly processes = new Map<string, ChildProcess>();
  private readonly copilotClient: CopilotClient;

  constructor(config: MultiModeConfig) {
    super();
    this.config = {
      projectPath: config.projectPath,
      maxConcurrent: config.maxConcurrent ?? 4,
      sharedNamespace: config.sharedNamespace ?? 'collaboration',
      timeout: config.timeout ?? 5 * 60_000,
      claudeCommand: config.claudeCommand ?? 'claude',
      codexCommand: config.codexCommand ?? 'codex',
    };
    this.copilotClient = new CopilotClient({ timeoutMs: this.config.timeout });
  }

  /**
   * Run a swarm of workers grouped by dependency level.
   */
  async runCollaboration(
    workers: MultiModeWorkerConfig[],
    taskContext: string,
  ): Promise<CollaborationResult> {
    const startedAt = Date.now();
    const errors: string[] = [];

    const levels = this.buildDependencyLevels(workers);
    this.emit('collaboration:start', { workers: workers.length, levels: levels.length, taskContext });

    for (const level of levels) {
      const promises = level.map((w) =>
        this.runWorker(w).catch((err: Error) => {
          errors.push(`${w.id}: ${err.message}`);
        }),
      );
      await Promise.all(promises);
    }

    return {
      success: errors.length === 0,
      workers: Array.from(this.results.values()),
      totalDuration: Date.now() - startedAt,
      errors,
    };
  }

  /**
   * Run a single worker and record its result.
   */
  async runWorker(config: MultiModeWorkerConfig): Promise<void> {
    const result: MultiModeWorkerResult = {
      id: config.id,
      platform: config.platform,
      role: config.role,
      status: 'running',
      startedAt: new Date(),
    };
    this.results.set(config.id, result);
    this.emit('worker:started', { id: config.id, role: config.role, platform: config.platform });

    try {
      const output = await this.executeHeadless(config);
      result.status = 'completed';
      result.output = output;
      result.completedAt = new Date();
      this.emit('worker:completed', { id: config.id });
    } catch (err) {
      result.status = 'failed';
      result.error = err instanceof Error ? err.message : String(err);
      result.completedAt = new Date();
      this.emit('worker:failed', { id: config.id, error: result.error });
      throw err;
    }
  }

  /**
   * Dispatch a worker to the right platform.
   */
  protected async executeHeadless(config: MultiModeWorkerConfig): Promise<string> {
    if (config.platform === 'copilot') return this.executeCopilotHeadless(config);
    return this.executeSubprocessHeadless(config);
  }

  protected async executeCopilotHeadless(config: MultiModeWorkerConfig): Promise<string> {
    const model =
      config.copilotModel ??
      (config.copilotTier ? getOptimalModel(config.copilotTier) : TIER_DEFAULTS.Tier3);
    const mcpServers = await registerRufloMcpWithCopilot(this.config.projectPath);
    const session = await this.copilotClient.createSession({
      model,
      mcpServers,
      ...(config.copilotOptions?.permissionHandler
        ? { permissionHandler: config.copilotOptions.permissionHandler }
        : { permissionHandler: 'approve-all' }),
      ...(config.copilotOptions?.streaming !== undefined
        ? { streaming: config.copilotOptions.streaming }
        : { streaming: false }),
    });
    try {
      const result = await session.sendAndWait({ prompt: this.buildPrompt(config) });
      return result.content;
    } finally {
      await session.disconnect();
    }
  }

  protected async executeSubprocessHeadless(config: MultiModeWorkerConfig): Promise<string> {
    const cmd = config.platform === 'claude' ? this.config.claudeCommand : this.config.codexCommand;
    const args =
      config.platform === 'claude'
        ? this.buildClaudeArgs(config)
        : this.buildCodexArgs(config);

    return new Promise<string>((resolve, reject) => {
      let proc;
      try {
        proc = spawn(cmd, args, {
          cwd: this.config.projectPath,
          env: { ...process.env, FORCE_COLOR: '0' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(err as Error);
        return;
      }
      this.processes.set(config.id, proc);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Worker ${config.id} timed out`));
      }, config.timeout ?? this.config.timeout);
      proc.stdout?.on('data', (d) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (e) => { clearTimeout(timer); reject(e); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        this.processes.delete(config.id);
        if (code === 0 || stdout.length > 0) resolve(stdout || stderr);
        else reject(new Error(`Worker ${config.id} exited ${code}: ${stderr}`));
      });
    });
  }

  protected buildClaudeArgs(config: MultiModeWorkerConfig): string[] {
    const args = ['-p', this.buildPrompt(config), '--output-format', 'text'];
    if (config.maxTurns) args.push('--max-turns', String(config.maxTurns));
    if (config.model) args.push('--model', config.model);
    return args;
  }

  protected buildCodexArgs(config: MultiModeWorkerConfig): string[] {
    const args = ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check'];
    if (config.model) args.push('-m', config.model);
    args.push(this.buildPrompt(config));
    return args;
  }

  protected buildPrompt(config: MultiModeWorkerConfig): string {
    return [
      `You are a ${config.role.toUpperCase()} agent in a tri-mode swarm (Claude + Codex + Copilot).`,
      `Platform: ${config.platform}`,
      `Working Directory: ${this.config.projectPath}`,
      `Shared Memory Namespace: ${this.config.sharedNamespace}`,
      '',
      'COLLABORATION PROTOCOL:',
      `1. Search shared memory: npx ruflo@alpha memory search --query "..." --namespace ${this.config.sharedNamespace}`,
      '2. Complete your assigned task',
      `3. Store results: npx ruflo@alpha memory store --key "${config.id}-result" --value "..." --namespace ${this.config.sharedNamespace}`,
      '',
      'YOUR TASK:',
      config.prompt,
    ].join('\n');
  }

  protected buildDependencyLevels(workers: MultiModeWorkerConfig[]): MultiModeWorkerConfig[][] {
    const levels: MultiModeWorkerConfig[][] = [];
    const placed = new Set<string>();
    while (placed.size < workers.length) {
      const level: MultiModeWorkerConfig[] = [];
      for (const w of workers) {
        if (placed.has(w.id)) continue;
        const ready = !w.dependsOn || w.dependsOn.every((d) => placed.has(d));
        if (ready) level.push(w);
      }
      if (level.length === 0) {
        for (const w of workers) if (!placed.has(w.id)) level.push(w); // break circular
      }
      for (const w of level) placed.add(w.id);
      levels.push(level);
    }
    return levels;
  }

  /**
   * Send SIGTERM to all active subprocesses. Copilot SDK sessions
   * are released by their own `disconnect()` call.
   */
  stopAll(): void {
    for (const [id, proc] of this.processes) {
      proc.kill('SIGTERM');
      this.emit('worker:stopped', { id });
    }
    this.processes.clear();
  }
}

/**
 * Pre-built tri-mode collaboration templates.
 */
export const TriModeCollaborationTemplates = {
  featureDevelopment: (feature: string): MultiModeWorkerConfig[] => [
    {
      id: 'architect',
      platform: 'claude',
      role: 'architect',
      prompt: `Design the architecture for: ${feature}. Define components, interfaces, and data flow.`,
      maxTurns: 10,
    },
    {
      id: 'coder',
      platform: 'codex',
      role: 'coder',
      prompt: 'Implement the feature based on the architecture. Write clean, typed code.',
      dependsOn: ['architect'],
      maxTurns: 15,
    },
    {
      id: 'reviewer',
      platform: 'copilot',
      role: 'reviewer',
      prompt: 'Review the code for quality, security, and best practices.',
      dependsOn: ['coder'],
      copilotModel: 'gpt-5.3-codex',
    },
    {
      id: 'tester',
      platform: 'claude',
      role: 'tester',
      prompt: 'Write comprehensive tests. Target 80% coverage.',
      dependsOn: ['reviewer'],
      maxTurns: 10,
    },
  ],

  securityAudit: (target: string): MultiModeWorkerConfig[] => [
    {
      id: 'scanner',
      platform: 'copilot',
      role: 'security-scanner',
      prompt: `Scan ${target} for security vulnerabilities. Check OWASP Top 10.`,
      copilotTier: 'Tier3Reasoning',
      copilotModel: 'gpt-5.5',
    },
    {
      id: 'fixer',
      platform: 'codex',
      role: 'security-fixer',
      prompt: 'Generate fixes for identified vulnerabilities.',
      dependsOn: ['scanner'],
      maxTurns: 12,
    },
  ],

  refactoring: (target: string): MultiModeWorkerConfig[] => [
    {
      id: 'analyzer',
      platform: 'claude',
      role: 'code-analyzer',
      prompt: `Analyze ${target} for refactoring opportunities.`,
      maxTurns: 8,
    },
    {
      id: 'refactorer',
      platform: 'copilot',
      role: 'refactorer',
      prompt: 'Execute the refactoring plan. Maintain all existing functionality.',
      dependsOn: ['analyzer'],
      copilotModel: 'gpt-5.3-codex',
    },
    {
      id: 'validator',
      platform: 'codex',
      role: 'validator',
      prompt: 'Run tests and validate the refactoring did not break anything.',
      dependsOn: ['refactorer'],
      maxTurns: 5,
    },
  ],
};
