/**
 * @claude-flow/copilot - /loop runner
 *
 * Mirrors the codex /loop shape exactly, swapping `codex exec`
 * for `CopilotClient.runGoverned()`.
 */

import { existsSync } from 'node:fs';
import fs from 'fs-extra';
import path from 'node:path';
import { CopilotClient } from '../client/chat.js';

export interface LoopRunOptions {
  name?: string;
  projectPath?: string;
  prompt?: string;
  model?: string;
  intervalSeconds?: number;
  maxIterations?: number;
  timeoutMs?: number;
  untilFile?: string;
  stateDir?: string;
  dryRun?: boolean;
  onEvent?: (event: LoopEvent) => void;
}

export interface LoopState {
  name: string;
  projectPath: string;
  mode: 'copilot' | 'command';
  prompt?: string;
  status: 'idle' | 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';
  iteration: number;
  maxIterations: number;
  intervalSeconds: number;
  startedAt: string;
  updatedAt: string;
  lastOutput?: string;
  lastError?: string;
  untilFile: string;
}

export interface LoopEvent {
  type: 'start' | 'iteration-start' | 'iteration-complete' | 'sleep' | 'stop' | 'complete' | 'error' | 'dry-run';
  state: LoopState;
  message?: string;
}

export interface LoopPaths {
  stateDir: string;
  statePath: string;
  stopPath: string;
  completePath: string;
}

export interface LoopCommandResult {
  ok: boolean;
  output: string;
  error?: string;
}

export function normalizeLoopName(name = 'default'): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

export function resolveLoopPaths(projectPath: string, name = 'default', stateDir?: string): LoopPaths {
  const safe = normalizeLoopName(name);
  const dir = path.resolve(projectPath, stateDir ?? path.join('.copilot', 'loop'));
  return {
    stateDir: dir,
    statePath: path.join(dir, `${safe}.json`),
    stopPath: path.join(dir, `${safe}.stop`),
    completePath: path.join(dir, `${safe}.complete`),
  };
}

export async function loadLoopState(projectPath: string, name = 'default', stateDir?: string): Promise<LoopState | null> {
  const paths = resolveLoopPaths(projectPath, name, stateDir);
  if (!(await fs.pathExists(paths.statePath))) return null;
  return (await fs.readJson(paths.statePath)) as LoopState;
}

export async function requestLoopStop(projectPath: string, name = 'default', stateDir?: string): Promise<LoopPaths> {
  const paths = resolveLoopPaths(projectPath, name, stateDir);
  await fs.ensureDir(paths.stateDir);
  await fs.writeFile(paths.stopPath, new Date().toISOString());
  const state = await loadLoopState(projectPath, name, stateDir);
  if (state && state.status === 'running') {
    state.status = 'stopping';
    state.updatedAt = new Date().toISOString();
    await saveState(paths.statePath, state);
  }
  return paths;
}

export function buildCopilotLoopPrompt(state: LoopState): string {
  const max = state.maxIterations > 0 ? state.maxIterations : 'unbounded';
  return [
    'You are running inside a Copilot /loop iteration.',
    `Loop: ${state.name}`,
    `Iteration: ${state.iteration}/${max}`,
    `Project: ${state.projectPath}`,
    '',
    'Task:',
    state.prompt ?? '',
    '',
    'Work autonomously for this iteration. Make concrete progress.',
    `If the task is fully complete, create this marker file: ${state.untilFile}`,
    'If more work remains, leave the marker absent so the next iteration can continue.',
  ].join('\n');
}

export async function runCopilotLoop(options: LoopRunOptions = {}): Promise<LoopState> {
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const name = normalizeLoopName(options.name);
  const paths = resolveLoopPaths(projectPath, name, options.stateDir);
  const intervalSeconds = clampInt(options.intervalSeconds ?? 270, 0, 86_400);
  const maxIterations = clampInt(options.maxIterations ?? 10, 0, 100_000);
  const timeoutMs = clampInt(options.timeoutMs ?? 30 * 60_000, 1_000, 24 * 60 * 60_000);
  const untilFile = path.resolve(projectPath, options.untilFile ?? paths.completePath);

  if (!options.prompt?.trim()) throw new Error('loop run requires a prompt');

  await fs.ensureDir(paths.stateDir);
  await fs.remove(paths.stopPath);

  const startedAt = new Date().toISOString();
  const state: LoopState = {
    name,
    projectPath,
    mode: 'copilot',
    status: 'running',
    iteration: 0,
    maxIterations,
    intervalSeconds,
    startedAt,
    updatedAt: startedAt,
    untilFile,
  };
  if (options.prompt !== undefined) state.prompt = options.prompt;

  await saveState(paths.statePath, state);
  emit(options, 'start', state, `Loop ${name} started`);

  if (options.dryRun) {
    state.status = 'idle';
    state.updatedAt = new Date().toISOString();
    await saveState(paths.statePath, state);
    emit(options, 'dry-run', state, 'Dry run complete');
    return state;
  }

  const client = new CopilotClient({ timeoutMs });

  try {
    while (shouldContinue(state, paths)) {
      state.iteration += 1;
      state.updatedAt = new Date().toISOString();
      await saveState(paths.statePath, state);
      emit(options, 'iteration-start', state, `Iteration ${state.iteration} starting`);

      const result = await runOnce(client, state, options.model);

      state.lastOutput = truncate(result.output, 8_000);
      if (result.ok) {
        delete state.lastError;
      } else {
        state.lastError = truncate(result.error ?? 'unknown error', 8_000);
      }
      state.updatedAt = new Date().toISOString();
      await saveState(paths.statePath, state);
      emit(options, 'iteration-complete', state, `Iteration ${state.iteration} ${result.ok ? 'ok' : 'failed'}`);

      if (existsSync(untilFile)) {
        state.status = 'completed';
        await finalize(paths, state);
        emit(options, 'complete', state, `Completion marker found`);
        return state;
      }

      if (!result.ok) {
        state.status = 'failed';
        await finalize(paths, state);
        emit(options, 'error', state, state.lastError);
        return state;
      }

      if (!shouldContinue(state, paths)) break;
      emit(options, 'sleep', state, `Sleeping ${intervalSeconds}s`);
      await sleep(intervalSeconds * 1000);
    }

    state.status = existsSync(paths.stopPath) ? 'stopped' : 'completed';
    await finalize(paths, state);
    emit(options, state.status === 'stopped' ? 'stop' : 'complete', state);
    return state;
  } catch (err) {
    state.status = 'failed';
    state.lastError = err instanceof Error ? err.message : String(err);
    await finalize(paths, state);
    emit(options, 'error', state, state.lastError);
    return state;
  } finally {
    await client.stop();
  }
}

async function runOnce(client: CopilotClient, state: LoopState, model?: string): Promise<LoopCommandResult> {
  try {
    const result = await client.runGoverned({
      prompt: buildCopilotLoopPrompt(state),
      taskId: `${state.name}-${state.iteration}`,
      ...(model ? { sessionConfig: { model } } : {}),
    });
    return { ok: true, output: result.content };
  } catch (err) {
    return { ok: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function finalize(paths: LoopPaths, state: LoopState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await saveState(paths.statePath, state);
}

async function saveState(p: string, state: LoopState): Promise<void> {
  await fs.ensureDir(path.dirname(p));
  await fs.writeJson(p, state, { spaces: 2 });
}

function shouldContinue(state: LoopState, paths: LoopPaths): boolean {
  if (state.status !== 'running') return false;
  if (existsSync(paths.stopPath)) return false;
  if (existsSync(state.untilFile)) return false;
  return state.maxIterations === 0 || state.iteration < state.maxIterations;
}

function emit(options: LoopRunOptions, type: LoopEvent['type'], state: LoopState, message?: string): void {
  const event: LoopEvent = { type, state: { ...state } };
  if (message !== undefined) event.message = message;
  options.onEvent?.(event);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n...[truncated]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
