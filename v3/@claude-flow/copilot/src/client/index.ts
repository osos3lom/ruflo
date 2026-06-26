/**
 * @claude-flow/copilot - client module barrel
 */

export {
  CopilotClient,
  createCopilotClient,
  extractModelFromRoute,
} from './chat.js';
export type {
  CopilotClientConfig,
  CopilotMessage,
  CopilotSession,
  CopilotSessionConfig,
  StreamEvent,
} from './chat.js';

export {
  resolveCredential,
  getCachedToken,
  clearCachedToken,
  CopilotAuthRequiredError,
} from './auth.js';

export {
  defineCopilotTool,
  CopilotToolRegistry,
} from './tools.js';
export type {
  CopilotTool,
  CopilotToolHandler,
  CopilotToolParameters,
} from './tools.js';

export {
  COPILOT_MODEL_CATALOG,
  TIER_DEFAULTS,
  RETIRING_MODELS,
  getOptimalModel,
  isCatalogModel,
  isRetiringModel,
  getModelEntry,
} from './models.js';
export type { CopilotModelId } from './models.js';
