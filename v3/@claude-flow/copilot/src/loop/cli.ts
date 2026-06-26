/**
 * @claude-flow/copilot - loop CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { loadLoopState, requestLoopStop, resolveLoopPaths, runCopilotLoop, type LoopState } from './index.js';

export function createLoopCommand(): Command {
  const loop = new Command('loop').description('Run Copilot in a bounded /loop iteration cycle');

  loop
    .command('run')
    .description('Start a Copilot loop')
    .argument('[prompt...]', 'Prompt for Copilot')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('-i, --interval <seconds>', 'Seconds between iterations', '270')
    .option('-m, --max-iterations <count>', 'Maximum iterations; 0 = unbounded', '10')
    .option('--timeout <ms>', 'Per-iteration timeout', '1800000')
    .option('--until-file <path>', 'Stop when this file exists')
    .option('--model <model>', 'Copilot model id')
    .option('--dry-run', 'Plan only — do not call Copilot')
    .action(async (promptParts: string[], options) => {
      try {
        const prompt = promptParts.join(' ').trim();
        if (!prompt) throw new Error('Prompt required (positional argument)');
        const state = await runCopilotLoop({
          name: options.name,
          projectPath: options.path,
          prompt,
          model: options.model,
          intervalSeconds: parseInt(options.interval, 10),
          maxIterations: parseInt(options.maxIterations, 10),
          timeoutMs: parseInt(options.timeout, 10),
          untilFile: options.untilFile,
          dryRun: options.dryRun,
          onEvent: (event) => {
            if (event.type === 'iteration-start') {
              console.log(chalk.cyan(`iteration ${event.state.iteration} starting`));
            } else if (event.type === 'iteration-complete') {
              console.log(chalk.gray(event.message ?? ''));
            } else if (event.type === 'sleep') {
              console.log(chalk.gray(event.message));
            } else if (event.type === 'error') {
              console.log(chalk.red(event.message));
            }
          },
        });
        printState(state);
        if (state.status === 'failed') process.exitCode = 1;
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  loop
    .command('status')
    .description('Show loop state')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--json', 'Print raw JSON')
    .action(async (options) => {
      const state = await loadLoopState(path.resolve(options.path), options.name);
      if (!state) {
        const paths = resolveLoopPaths(path.resolve(options.path), options.name);
        console.log(chalk.yellow(`No loop state found at ${paths.statePath}`));
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        printState(state);
      }
    });

  loop
    .command('stop')
    .description('Request a running loop to stop')
    .option('-n, --name <name>', 'Loop name', 'default')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (options) => {
      const paths = await requestLoopStop(path.resolve(options.path), options.name);
      console.log(chalk.green(`Stop requested: ${paths.stopPath}`));
    });

  return loop;
}

function printState(state: LoopState): void {
  const color = state.status === 'failed' ? chalk.red : state.status === 'running' ? chalk.cyan : chalk.green;
  console.log(color(`Loop ${state.name}: ${state.status}`));
  console.log(chalk.gray(`  iteration: ${state.iteration}/${state.maxIterations === 0 ? 'unbounded' : state.maxIterations}`));
  console.log(chalk.gray(`  interval:  ${state.intervalSeconds}s`));
  console.log(chalk.gray(`  until:     ${state.untilFile}`));
  if (state.lastError) console.log(chalk.red(`  last error: ${state.lastError.split('\n')[0]}`));
}
