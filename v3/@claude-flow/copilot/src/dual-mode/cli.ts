/**
 * @claude-flow/copilot - tri-mode CLI
 *
 * Provides the `claude-flow-copilot dual` subcommand. Accepts the same
 * spec syntax as codex's `dual run` but admits a third `copilot:` worker
 * prefix.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  MultiModeOrchestrator,
  TriModeCollaborationTemplates,
  type MultiModeWorkerConfig,
} from './orchestrator.js';

export function createMultiModeCommand(): Command {
  const cmd = new Command('dual')
    .description('Run tri-mode collaborative swarms (Claude + Codex + Copilot)')
    .addCommand(createRunCommand())
    .addCommand(createTemplateCommand());
  return cmd;
}

function createRunCommand(): Command {
  return new Command('run')
    .description('Run a tri-mode collaborative swarm')
    .argument('[template]', 'Pre-built template (feature, security, refactor)')
    .option('-t, --template <name>', 'Pre-built template name')
    .option(
      '-w, --worker <spec>',
      'Worker spec "<platform>:<role>:<prompt>" (platform = claude|codex|copilot). Repeatable.',
      (val: string, acc: string[]) => { acc.push(val); return acc; },
      [] as string[],
    )
    .option('--parallel-workers', 'Run --worker specs in parallel', false)
    .option('--task <description>', 'Task description for the swarm')
    .option('--max-concurrent <n>', 'Maximum concurrent workers', '4')
    .option('--timeout <ms>', 'Worker timeout', '300000')
    .option('--namespace <name>', 'Shared memory namespace', 'collaboration')
    .action(async (templateArg: string | undefined, options) => {
      const orchestrator = new MultiModeOrchestrator({
        projectPath: process.cwd(),
        maxConcurrent: parseInt(options.maxConcurrent, 10),
        timeout: parseInt(options.timeout, 10),
        sharedNamespace: options.namespace,
      });

      orchestrator.on('worker:started', ({ id, role, platform }) => {
        const icon = platform === 'claude' ? '[claude]' : platform === 'codex' ? '[codex]' : '[copilot]';
        console.log(chalk.blue(`${icon} ${role} (${id}) started`));
      });
      orchestrator.on('worker:completed', ({ id }) => console.log(chalk.green(`OK ${id}`)));
      orchestrator.on('worker:failed', ({ id, error }) => console.log(chalk.red(`FAIL ${id}: ${error}`)));

      const specs: string[] = (options.worker as string[] | undefined) ?? [];
      const templateName: string | undefined = options.template ?? templateArg;
      const task = options.task ?? 'Complete the assigned task';

      let workers: MultiModeWorkerConfig[];
      if (specs.length > 0) {
        workers = parseWorkerSpecs(specs, options.parallelWorkers === true);
      } else if (templateName) {
        workers = getTemplateWorkers(templateName, task);
      } else {
        console.log(chalk.yellow('Provide --template <name>, [template], or --worker <spec>'));
        console.log('Templates: feature, security, refactor');
        console.log('Worker spec: "claude:architect:Design X" or "copilot:reviewer:Review Y"');
        return;
      }

      console.log(chalk.bold(`\nRunning ${workers.length} worker(s)...\n`));
      const result = await orchestrator.runCollaboration(workers, task);

      console.log();
      console.log(chalk.bold('Results:'));
      console.log(`  Status: ${result.success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`);
      console.log(`  Duration: ${(result.totalDuration / 1000).toFixed(2)}s`);
      console.log();
      for (const w of result.workers) {
        const status = w.status === 'completed' ? chalk.green('OK') : chalk.red('FAIL');
        const icon = w.platform === 'claude' ? '[claude]' : w.platform === 'codex' ? '[codex]' : '[copilot]';
        console.log(`  ${status} ${icon} ${w.id} (${w.role})`);
      }
      if (result.errors.length > 0) {
        console.log(chalk.red('\nErrors:'));
        for (const e of result.errors) console.log(chalk.red(`  - ${e}`));
        process.exitCode = 1;
      }
    });
}

function createTemplateCommand(): Command {
  return new Command('templates')
    .description('List available collaboration templates')
    .action(() => {
      console.log(chalk.bold('\nTri-Mode Collaboration Templates:\n'));
      console.log(chalk.cyan('feature') + ' — architect (claude) → coder (codex) → reviewer (copilot) → tester (claude)');
      console.log(chalk.cyan('security') + ' — scanner (copilot/gpt-5.5) → fixer (codex)');
      console.log(chalk.cyan('refactor') + ' — analyzer (claude) → refactorer (copilot) → validator (codex)');
    });
}

/**
 * Parse `--worker "<platform>:<role>:<prompt>"` specs.
 * Accepts three platforms: claude, codex, copilot.
 */
export function parseWorkerSpecs(specs: string[], parallel: boolean): MultiModeWorkerConfig[] {
  const usedIds = new Set<string>();
  const workers: MultiModeWorkerConfig[] = [];

  specs.forEach((spec, index) => {
    const first = spec.indexOf(':');
    const second = first >= 0 ? spec.indexOf(':', first + 1) : -1;
    if (first < 0 || second < 0) {
      throw new Error(`Invalid --worker spec "${spec}". Expected "<platform>:<role>:<prompt>".`);
    }
    const platformRaw = spec.slice(0, first).trim().toLowerCase();
    const role = spec.slice(first + 1, second).trim() || `worker-${index + 1}`;
    const prompt = spec.slice(second + 1).trim();
    if (!prompt) throw new Error(`Invalid --worker spec "${spec}". Missing prompt.`);
    if (platformRaw !== 'claude' && platformRaw !== 'codex' && platformRaw !== 'copilot') {
      throw new Error(`Invalid platform "${platformRaw}". Use claude, codex, or copilot.`);
    }
    const platform = platformRaw as 'claude' | 'codex' | 'copilot';

    let id = role.replace(/\s+/g, '-');
    let suffix = 2;
    while (usedIds.has(id)) { id = `${role.replace(/\s+/g, '-')}-${suffix++}`; }
    usedIds.add(id);

    const worker: MultiModeWorkerConfig = { id, platform, role, prompt };
    const prev = workers[workers.length - 1];
    if (!parallel && prev) worker.dependsOn = [prev.id];
    workers.push(worker);
  });

  return workers;
}

function getTemplateWorkers(template: string, task: string): MultiModeWorkerConfig[] {
  switch (template) {
    case 'feature':
      return TriModeCollaborationTemplates.featureDevelopment(task);
    case 'security':
      return TriModeCollaborationTemplates.securityAudit(task);
    case 'refactor':
      return TriModeCollaborationTemplates.refactoring(task);
    default:
      throw new Error(`Unknown template: ${template}`);
  }
}
