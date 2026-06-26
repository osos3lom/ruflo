/**
 * @claude-flow/copilot - Model catalog and tier selection
 *
 * Source of truth for the Copilot SDK model IDs used by RuFlo's
 * 3-tier router (ADR-026, refined in ADR-147 Part B).
 *
 * Only GA OpenAI GPT-family models from the Copilot catalog appear
 * here. Retiring models live in RETIRING_MODELS for migration warnings.
 *
 * Runtime authoritative source: `client.listModels()` once the SDK
 * is installed (research §4).
 */

import type { CopilotModelEntry, CopilotTierName } from '../types.js';

/**
 * Confirmed GA OpenAI models in the Copilot SDK as of 2026-06-03.
 *
 * Source: github.blog changelogs cited in ADR-147 references.
 * Model IDs follow the lowercase-hyphen convention confirmed by
 * `copilot --model gpt-5.3-codex` invocations.
 */
export const COPILOT_MODEL_CATALOG = {
  'gpt-5.3-codex': {
    tier: 3 as const,
    multiplier: 1.0,
    category: 'coding-lts' as const,
    ltsUntil: '2027-02-04',
  },
  'gpt-5.4-mini': {
    tier: 2 as const,
    multiplier: 0.33,
    category: 'fast' as const,
    ltsUntil: null,
  },
  'gpt-5.5': {
    tier: 3 as const,
    multiplier: 7.5,
    category: 'frontier' as const,
    ltsUntil: null,
  },
} as const satisfies Record<string, CopilotModelEntry>;

/**
 * Default model per routing tier.
 *
 * Tier 1 is deterministic codemod ($0, no LLM — handled outside this map).
 * Tier 2 default: gpt-5.4-mini (cheapest GA).
 * Tier 3 default: gpt-5.3-codex (LTS).
 * Tier 3 reasoning: gpt-5.5 (frontier, opt-in due to 7.5x multiplier).
 */
export const TIER_DEFAULTS = {
  Tier2: 'gpt-5.4-mini',
  Tier3: 'gpt-5.3-codex',
  Tier3Reasoning: 'gpt-5.5',
} as const;

/**
 * Models the Copilot catalog has marked retiring on or before 2026-06-01.
 *
 * The router MUST NOT select from this list. Migration logic surfaces them
 * to the user as warnings when an old AGENTS.md/config still references them.
 */
export const RETIRING_MODELS = [
  'gpt-4.1',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.4-nano', // GA but no agent/ask/edit mode — exclude from routing
] as const;

/**
 * Catalog model ID type alias
 */
export type CopilotModelId = keyof typeof COPILOT_MODEL_CATALOG;

/**
 * Resolve the optimal model for a routing request.
 *
 * - `complexity: number (0-100)` — chooses tier by complexity threshold:
 *   <30 → Tier 2; 30-79 → Tier 3 LTS; ≥80 → Tier 3 LTS unless
 *   `allowFrontier=true`, then Tier 3 Reasoning (gpt-5.5).
 * - Named tier — returns the tier default directly.
 *
 * @param complexityOrTier Either a 0-100 score or one of the tier names.
 * @param allowFrontier When true and complexity ≥ 80, returns gpt-5.5.
 */
export function getOptimalModel(
  complexityOrTier: number | CopilotTierName,
  allowFrontier = false,
): string {
  if (typeof complexityOrTier === 'string') {
    if (complexityOrTier === 'Tier2') return TIER_DEFAULTS.Tier2;
    if (complexityOrTier === 'Tier3Reasoning') {
      return allowFrontier ? TIER_DEFAULTS.Tier3Reasoning : TIER_DEFAULTS.Tier3;
    }
    return TIER_DEFAULTS.Tier3;
  }

  const c = clampComplexity(complexityOrTier);
  if (c < 30) return TIER_DEFAULTS.Tier2;
  if (c >= 80 && allowFrontier) return TIER_DEFAULTS.Tier3Reasoning;
  return TIER_DEFAULTS.Tier3;
}

/**
 * Returns `true` if the model id appears in the GA catalog.
 */
export function isCatalogModel(modelId: string): modelId is CopilotModelId {
  return Object.prototype.hasOwnProperty.call(COPILOT_MODEL_CATALOG, modelId);
}

/**
 * Returns `true` if the model id is in the retiring list.
 */
export function isRetiringModel(modelId: string): boolean {
  return (RETIRING_MODELS as readonly string[]).includes(modelId);
}

/**
 * Lookup helper returning a typed entry or `null`.
 */
export function getModelEntry(modelId: string): CopilotModelEntry | null {
  if (!isCatalogModel(modelId)) return null;
  return COPILOT_MODEL_CATALOG[modelId];
}

function clampComplexity(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}
