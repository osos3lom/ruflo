#!/usr/bin/env node
/**
 * @claude-flow/copilot - CLI entry point
 *
 * Subcommands: init, auth, chat, mcp, dual, loop, doctor.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import { CopilotInitializer } from './initializer.js';
import {
  clearCachedToken,
  CopilotAuthRequiredError,
  CopilotClient,
  getCachedToken,
  resolveCredential,
} from './client/index.js';
import { registerRufloMcpWithCopilot } from './mcp/index.js';
import { createMultiModeCommand } from './dual-mode/index.js';
import { createLoopCommand } from './loop/cli.js';
import { VERSION, PACKAGE_INFO } from './index.js';

const program = new Command();

function banner(): void {
  console.log(chalk.cyan.bold('\n  Claude Flow Copilot'));
  console.log(chalk.gray('  GitHub Copilot SDK adapter — RuFlo\n'));
}

function handleError(err: unknown, prefix?: string): never {
  const msg = err instanceof Error ? err.message : String(err);
  const label = prefix ? `${prefix}: ${msg}` : msg;
  console.error(chalk.red.bold('\nError:'), chalk.red(label));
  process.exit(1);
}

program
  .name('claude-flow-copilot')
  .description('GitHub Copilot SDK integration for Claude Flow / RuFlo')
  .version(VERSION, '-v, --version', 'Display version number');

program
  .command('init')
  .description('Initialize a new Copilot project (AGENTS.md + .copilot/config.json + skills)')
  .option('-t, --template <template>', 'Template (minimal|default|full|enterprise)', 'default')
  .option('-s, --skills <skills>', 'Comma-separated skills list')
  .option('-f, --force', 'Overwrite existing files', false)
  .option('--dual', 'Generate both Copilot and Claude Code configs', false)
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    try {
      banner();
      const init = new CopilotInitializer();
      const skills = options.skills?.split(',').map((s: string) => s.trim()).filter(Boolean);
      const result = await init.initialize({
        projectPath: path.resolve(options.path),
        template: options.template,
        skills,
        force: options.force,
        dual: options.dual,
      });
      if (result.success) {
        console.log(chalk.green.bold('  Project initialized!'));
        for (const f of result.filesCreated) console.log(chalk.gray(`    + ${f}`));
        if (result.warnings) for (const w of result.warnings) console.log(chalk.yellow(`    ! ${w}`));
      } else {
        console.log(chalk.red.bold('  Initialization failed'));
        if (result.errors) for (const e of result.errors) console.log(chalk.red(`    - ${e}`));
        process.exit(1);
      }
    } catch (err) {
      handleError(err, 'init failed');
    }
  });

const authCmd = program.command('auth').description('Verify Copilot credential source');
authCmd
  .command('status')
  .description('Check whether a credential source is available (never prints the token)')
  .action(async () => {
    const source = await resolveCredential();
    if (source === null) {
      console.log(chalk.yellow('No Copilot credential found.'));
      console.log(chalk.gray('Run `gh auth login` or export GITHUB_TOKEN.'));
      process.exit(1);
    }
    console.log(chalk.green(`Credential source: ${source}`));
    const cached = await getCachedToken();
    if (cached) console.log(chalk.gray(`Cached at: ~/.config/ruflo/copilot/token.json (verified ${cached.verifiedAt})`));
  });
authCmd
  .command('clear')
  .description('Clear the cached credential handle (does NOT log out the underlying credential)')
  .action(async () => {
    await clearCachedToken();
    console.log(chalk.green('Cleared cached credential handle.'));
  });

const mcpCmd = program.command('mcp').description('MCP wiring for Copilot sessions');
mcpCmd
  .command('register')
  .description('Print the mcpServers JSON for a session')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--tools <list>', 'Comma-separated tool allowlist (or "*" for all)', '*')
  .action(async (options) => {
    const filter = options.tools === '*' ? '*' : options.tools.split(',').map((s: string) => s.trim());
    const out = await registerRufloMcpWithCopilot(path.resolve(options.path), filter);
    console.log(JSON.stringify(out, null, 2));
  });

program
  .command('chat')
  .description('Send a single prompt through the governed runGoverned() pipeline')
  .requiredOption('--prompt <text>', 'Prompt to send')
  .option('--model <model>', 'Override the default model')
  .option('--task-id <id>', 'Task ID', () => `chat-${Date.now()}`)
  .action(async (options) => {
    try {
      const client = new CopilotClient();
      const result = await client.runGoverned({
        prompt: options.prompt,
        taskId: options.taskId,
        ...(options.model ? { sessionConfig: { model: options.model } } : {}),
        onWarn: (m) => console.log(chalk.yellow(`hook: ${m}`)),
      });
      console.log(result.content);
    } catch (err) {
      if (err instanceof CopilotAuthRequiredError) {
        console.error(chalk.red(err.message));
        process.exit(2);
      }
      handleError(err, 'chat failed');
    }
  });

program
  .command('doctor')
  .description('System health check')
  .action(async () => {
    banner();
    const checks: Array<{ name: string; ok: boolean; msg: string }> = [];

    const nodeMajor = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
    checks.push({ name: 'Node.js', ok: nodeMajor >= 20, msg: `${process.version} (>=20 required)` });

    const source = await resolveCredential();
    checks.push({ name: 'Credential', ok: source !== null, msg: source ?? 'missing — run `gh auth login`' });

    const agentsMd = await fs.pathExists(path.join(process.cwd(), 'AGENTS.md'));
    checks.push({ name: 'AGENTS.md', ok: agentsMd, msg: agentsMd ? 'present' : 'missing (run init)' });

    let failed = 0;
    for (const c of checks) {
      const icon = c.ok ? chalk.green('PASS') : chalk.red('FAIL');
      console.log(`  ${icon}  ${chalk.white(c.name)}`);
      console.log(chalk.gray(`        ${c.msg}`));
      if (!c.ok) failed++;
    }
    if (failed > 0) process.exit(1);
  });

program
  .command('info')
  .description('Show package info')
  .action(() => {
    console.log(chalk.cyan.bold('\n  @claude-flow/copilot'));
    console.log(chalk.white(`  Version:     ${PACKAGE_INFO.version}`));
    console.log(chalk.white(`  Description: ${PACKAGE_INFO.description}`));
    console.log(chalk.white(`  Platform:    ${PACKAGE_INFO.platform}`));
    console.log(chalk.white(`  Repository:  ${PACKAGE_INFO.repository}\n`));
  });

program.addCommand(createMultiModeCommand());
program.addCommand(createLoopCommand());

program.on('command:*', () => {
  console.error(chalk.red(`Unknown command: ${program.args.join(' ')}`));
  process.exit(1);
});

program.parse();
if (!process.argv.slice(2).length) {
  banner();
  program.outputHelp();
}
