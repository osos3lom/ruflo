/**
 * @claude-flow/copilot - mcp module barrel
 */

export {
  registerRufloMcpWithCopilot,
  buildMcpServers,
} from './register.js';
export type {
  RufloMcpServerConfig,
  RufloMcpToolFilter,
} from './register.js';

export { CopilotMcpBridge } from './bridge.js';
export type { CopilotMcpCallEvent } from './bridge.js';
