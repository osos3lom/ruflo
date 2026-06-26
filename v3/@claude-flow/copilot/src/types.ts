/**
 * @claude-flow/copilot - Type Definitions
 *
 * GitHub Copilot SDK platform adapter types for RuFlo / Claude Flow.
 * Mirrors @claude-flow/codex types where shapes are platform-agnostic.
 */

/**
 * AGENTS.md template types
 */
export type AgentsMdTemplate = 'default' | 'minimal' | 'full' | 'enterprise';

/**
 * Copilot session permission handler behavior
 */
export type CopilotPermissionHandler = 'approve-all' | 'deny-all' | 'custom';

/**
 * Routing tier classification for Copilot models
 */
export type CopilotModelTier = 2 | 3;

/**
 * Tier names exposed to callers
 */
export type CopilotTierName = 'Tier2' | 'Tier3' | 'Tier3Reasoning';

/**
 * Single entry in the Copilot model catalog
 */
export interface CopilotModelEntry {
  /** Tier in ADR-026's 3-tier routing table */
  tier: CopilotModelTier;
  /** AI credits multiplier per call (1.0 = base, 0.33 = mini, 7.5 = frontier) */
  multiplier: number;
  /** Coarse category for human-readable selection */
  category: 'fast' | 'coding-lts' | 'frontier' | 'retiring';
  /** ISO date string LTS guarantee expires; null if not LTS */
  ltsUntil: string | null;
}

/**
 * AGENTS.md generator options (mirror of codex equivalent)
 */
export interface AgentsMdOptions {
  projectName: string;
  description?: string;
  techStack?: string;
  buildCommand?: string;
  testCommand?: string;
  devCommand?: string;
  template?: AgentsMdTemplate;
  skills?: string[];
  customSections?: Record<string, string>;
}

/**
 * SKILL.md generator options (identical shape to codex)
 */
export interface SkillMdOptions {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  triggers?: string[];
  skipWhen?: string[];
}

/**
 * Skill path config used by initializer and config generator
 */
export interface SkillConfig {
  path: string;
  enabled?: boolean;
}

/**
 * MCP server descriptor used by Copilot session config
 *
 * Copilot's `mcpServers` map (see research §6.8) supports both
 * `type: 'local'` (stdio child process) and `type: 'remote'` (HTTP).
 */
export interface CopilotMcpServerConfig {
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  tools?: string[] | '*';
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

/**
 * Initializer options
 */
export interface CopilotInitOptions {
  projectPath: string;
  template?: AgentsMdTemplate;
  skills?: string[];
  force?: boolean;
  /** Generate both Copilot and Claude Code surfaces */
  dual?: boolean;
}

/**
 * Initializer result
 */
export interface CopilotInitResult {
  success: boolean;
  filesCreated: string[];
  skillsGenerated: string[];
  warnings?: string[];
  errors?: string[];
}

/**
 * Migration options (mirror of codex)
 */
export interface MigrationOptions {
  sourcePath: string;
  targetPath: string;
  preserveComments?: boolean;
  generateSkills?: boolean;
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  agentsMdPath?: string;
  skillsCreated?: string[];
  configPath?: string;
  mappings?: FeatureMapping[];
  warnings?: string[];
}

/**
 * Feature mapping for cross-platform migration tracking
 */
export interface FeatureMapping {
  source: string;
  copilot: string;
  status: 'mapped' | 'partial' | 'unsupported';
  notes?: string;
}

/**
 * Validation result envelope
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

/**
 * Built-in skill names (mirror of codex set)
 */
export type BuiltInSkill =
  | 'swarm-orchestration'
  | 'memory-management'
  | 'sparc-methodology'
  | 'security-audit'
  | 'performance-analysis'
  | 'github-automation';

/**
 * Credential source identifier — NEVER the raw token.
 * Cached at ~/.config/ruflo/copilot/token.json (chmod 600).
 * See ADR-147 Part G.
 */
export type CredentialSource =
  | 'env:COPILOT_GITHUB_TOKEN'
  | 'env:GH_TOKEN'
  | 'env:GITHUB_TOKEN'
  | 'gh-cli'
  | null;

/**
 * Cached credential handle (no token value, only source identifier)
 */
export interface CredentialHandle {
  source: CredentialSource;
  verifiedAt: string;
}
