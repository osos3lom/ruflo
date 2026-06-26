/**
 * @claude-flow/copilot - Built-in templates and skills
 */

import type { AgentsMdTemplate, BuiltInSkill } from '../types.js';

export const BUILT_IN_SKILLS: Record<BuiltInSkill, { name: string; description: string; category: string }> = {
  'swarm-orchestration': {
    name: 'Swarm Orchestration',
    description: 'Multi-agent task coordination',
    category: 'coordination',
  },
  'memory-management': {
    name: 'Memory Management',
    description: 'Pattern storage and retrieval',
    category: 'memory',
  },
  'sparc-methodology': {
    name: 'SPARC Methodology',
    description: 'Structured development workflow',
    category: 'workflow',
  },
  'security-audit': {
    name: 'Security Audit',
    description: 'Security scanning and CVE detection',
    category: 'security',
  },
  'performance-analysis': {
    name: 'Performance Analysis',
    description: 'Profiling and optimization',
    category: 'performance',
  },
  'github-automation': {
    name: 'GitHub Automation',
    description: 'CI/CD and PR management',
    category: 'automation',
  },
};

export const TEMPLATES: Record<AgentsMdTemplate, { name: string; description: string; skillCount: number }> = {
  minimal: { name: 'Minimal', description: 'Basic setup with essential skills only', skillCount: 2 },
  default: { name: 'Default', description: 'Standard setup with common skills', skillCount: 4 },
  full: { name: 'Full', description: 'Complete setup with all available skills', skillCount: 6 },
  enterprise: { name: 'Enterprise', description: 'Full setup with governance', skillCount: 6 },
};

export function getTemplate(name: AgentsMdTemplate): typeof TEMPLATES[AgentsMdTemplate] {
  return TEMPLATES[name];
}

export function listTemplates(): Array<{ name: AgentsMdTemplate; description: string; skillCount: number }> {
  return Object.entries(TEMPLATES).map(([name, info]) => ({
    name: name as AgentsMdTemplate,
    description: info.description,
    skillCount: info.skillCount,
  }));
}

export const ALL_AVAILABLE_SKILLS: string[] = [
  'swarm-orchestration',
  'memory-management',
  'sparc-methodology',
  'security-audit',
  'performance-analysis',
  'github-automation',
];

export const DEFAULT_SKILLS_BY_TEMPLATE: Record<AgentsMdTemplate, string[]> = {
  minimal: ['swarm-orchestration', 'memory-management'],
  default: ['swarm-orchestration', 'memory-management', 'sparc-methodology', 'security-audit'],
  full: ALL_AVAILABLE_SKILLS,
  enterprise: ALL_AVAILABLE_SKILLS,
};

export const DIRECTORY_STRUCTURE = {
  root: { 'AGENTS.md': 'Main project instructions for Copilot' },
  '.copilot': {
    'config.json': 'Copilot SDK session defaults',
    'AGENTS.override.md': 'Local instruction overrides (gitignored)',
    'loop/': '/loop runner state',
  },
  '.agents': {
    'skills/': 'Shared skill library (compatible with Codex)',
  },
};

export const PLATFORM_MAPPING = {
  claudeCode: { configFile: 'CLAUDE.md', skillInvocation: '/skill-name' },
  codex: { configFile: 'AGENTS.md', skillInvocation: '$skill-name' },
  copilot: { configFile: 'AGENTS.md', skillInvocation: 'MCP tool call' },
};

export const GITIGNORE_ENTRIES = [
  '# Copilot local configuration',
  '.copilot/',
  '',
  '# Claude Flow runtime data',
  '.claude-flow/data/',
  '.claude-flow/logs/',
  '',
  '# Environment variables',
  '.env',
  '.env.local',
  '.env.*.local',
];

export const AGENTS_OVERRIDE_TEMPLATE = `# Local Copilot Development Overrides

## Session defaults
- Model: gpt-5.3-codex
- Permission handler: approve-all (local dev only)
- Streaming: false

## Personal preferences
[Add your specific preferences here]

## Notes
This file is gitignored and contains local-only settings.
Tokens MUST come from environment or \`gh auth login\` — never write a raw token here.
`;
