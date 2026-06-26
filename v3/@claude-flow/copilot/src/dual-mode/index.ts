/**
 * @claude-flow/copilot - dual-mode barrel
 */

export {
  MultiModeOrchestrator,
  TriModeCollaborationTemplates,
} from './orchestrator.js';
export type {
  MultiModeConfig,
  MultiModeWorkerConfig,
  MultiModeWorkerResult,
  CollaborationResult,
} from './orchestrator.js';

export { createMultiModeCommand, parseWorkerSpecs } from './cli.js';
