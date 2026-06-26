/**
 * @claude-flow/copilot
 *
 * GitHub Copilot SDK platform adapter for Claude Flow / RuFlo.
 * Third platform in the tri-mode collaboration system
 * (Claude Code + OpenAI Codex + GitHub Copilot).
 *
 * See ADR-147 for the design.
 *
 * @packageDocumentation
 */

// Types
export * from './types.js';

// Generators
export {
  generateAgentsMd,
  generateSkillMd,
  generateConfigToml,
  generateCopilotConfigJson,
  generateMinimalConfig,
  generateCIConfig,
  generateBuiltInSkill,
} from './generators/index.js';
export type { CopilotConfigOptions } from './generators/index.js';

// Migrations
export {
  migrateFromClaudeCode,
  migrateFromCodex,
  analyzeClaudeMd,
  generateMigrationReport,
  convertSkillSyntax,
  convertSettingsToConfig,
  FEATURE_MAPPINGS,
  CODEX_TO_COPILOT_MAPPINGS,
} from './migrations/index.js';

// Validators
export {
  validateAgentsMd,
  validateSkillMd,
  validateConfig,
} from './validators/index.js';

// Initializer
export { CopilotInitializer, initializeCopilotProject } from './initializer.js';

// Client (SDK wrapper)
export {
  CopilotClient,
  createCopilotClient,
  extractModelFromRoute,
  resolveCredential,
  getCachedToken,
  clearCachedToken,
  CopilotAuthRequiredError,
  defineCopilotTool,
  CopilotToolRegistry,
  COPILOT_MODEL_CATALOG,
  TIER_DEFAULTS,
  RETIRING_MODELS,
  getOptimalModel,
  isCatalogModel,
  isRetiringModel,
  getModelEntry,
} from './client/index.js';
export type {
  CopilotClientConfig,
  CopilotMessage,
  CopilotSession,
  CopilotSessionConfig,
  StreamEvent,
  CopilotTool,
  CopilotToolHandler,
  CopilotToolParameters,
  CopilotModelId,
} from './client/index.js';

// MCP bridge
export {
  registerRufloMcpWithCopilot,
  buildMcpServers,
  CopilotMcpBridge,
} from './mcp/index.js';
export type {
  RufloMcpServerConfig,
  RufloMcpToolFilter,
  CopilotMcpCallEvent,
} from './mcp/index.js';

// Tri-mode collaboration
export {
  MultiModeOrchestrator,
  TriModeCollaborationTemplates,
  createMultiModeCommand,
  parseWorkerSpecs,
} from './dual-mode/index.js';
export type {
  MultiModeConfig,
  MultiModeWorkerConfig,
  MultiModeWorkerResult,
  CollaborationResult,
} from './dual-mode/index.js';

// /loop runner
export {
  buildCopilotLoopPrompt,
  loadLoopState,
  normalizeLoopName,
  requestLoopStop,
  resolveLoopPaths,
  runCopilotLoop,
} from './loop/index.js';
export { createLoopCommand } from './loop/cli.js';
export type {
  LoopCommandResult,
  LoopEvent,
  LoopPaths,
  LoopRunOptions,
  LoopState,
} from './loop/index.js';

// Templates
export {
  getTemplate,
  listTemplates,
  BUILT_IN_SKILLS,
  TEMPLATES,
  DEFAULT_SKILLS_BY_TEMPLATE,
  ALL_AVAILABLE_SKILLS,
  DIRECTORY_STRUCTURE,
  PLATFORM_MAPPING,
  GITIGNORE_ENTRIES,
  AGENTS_OVERRIDE_TEMPLATE,
} from './templates/index.js';

/**
 * Package version
 */
export const VERSION = '3.8.0';

/**
 * Package metadata
 */
export const PACKAGE_INFO = {
  name: '@claude-flow/copilot',
  version: VERSION,
  description: 'GitHub Copilot SDK integration for Claude Flow / RuFlo',
  platform: 'copilot',
  repository: 'https://github.com/ruvnet/ruflo',
} as const;

export default { VERSION, PACKAGE_INFO };
