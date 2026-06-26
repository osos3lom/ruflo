import { describe, it, expect } from 'vitest';
import {
  COPILOT_MODEL_CATALOG,
  RETIRING_MODELS,
  TIER_DEFAULTS,
  getModelEntry,
  getOptimalModel,
  isCatalogModel,
  isRetiringModel,
} from '../../src/client/models.js';

describe('COPILOT_MODEL_CATALOG', () => {
  it('contains the three GA OpenAI models from ADR-147 Part B', () => {
    expect(COPILOT_MODEL_CATALOG['gpt-5.3-codex'].tier).toBe(3);
    expect(COPILOT_MODEL_CATALOG['gpt-5.3-codex'].multiplier).toBe(1.0);
    expect(COPILOT_MODEL_CATALOG['gpt-5.3-codex'].ltsUntil).toBe('2027-02-04');

    expect(COPILOT_MODEL_CATALOG['gpt-5.4-mini'].tier).toBe(2);
    expect(COPILOT_MODEL_CATALOG['gpt-5.4-mini'].multiplier).toBe(0.33);

    expect(COPILOT_MODEL_CATALOG['gpt-5.5'].tier).toBe(3);
    expect(COPILOT_MODEL_CATALOG['gpt-5.5'].multiplier).toBe(7.5);
  });

  it('RETIRING_MODELS excludes catalog entries', () => {
    for (const id of RETIRING_MODELS) {
      expect(id in COPILOT_MODEL_CATALOG).toBe(false);
    }
  });

  it('TIER_DEFAULTS pin to the LTS / fast / frontier IDs', () => {
    expect(TIER_DEFAULTS.Tier2).toBe('gpt-5.4-mini');
    expect(TIER_DEFAULTS.Tier3).toBe('gpt-5.3-codex');
    expect(TIER_DEFAULTS.Tier3Reasoning).toBe('gpt-5.5');
  });
});

describe('getOptimalModel', () => {
  it('returns Tier 2 for low complexity (<30)', () => {
    expect(getOptimalModel(0)).toBe('gpt-5.4-mini');
    expect(getOptimalModel(15)).toBe('gpt-5.4-mini');
    expect(getOptimalModel(29)).toBe('gpt-5.4-mini');
  });

  it('returns Tier 3 LTS for mid complexity (30-79)', () => {
    expect(getOptimalModel(30)).toBe('gpt-5.3-codex');
    expect(getOptimalModel(50)).toBe('gpt-5.3-codex');
    expect(getOptimalModel(79)).toBe('gpt-5.3-codex');
  });

  it('returns Tier 3 LTS for high complexity without allowFrontier', () => {
    expect(getOptimalModel(80)).toBe('gpt-5.3-codex');
    expect(getOptimalModel(100)).toBe('gpt-5.3-codex');
  });

  it('returns Tier 3 frontier (gpt-5.5) for complexity ≥80 when allowFrontier=true', () => {
    expect(getOptimalModel(80, true)).toBe('gpt-5.5');
    expect(getOptimalModel(95, true)).toBe('gpt-5.5');
  });

  it('accepts named tiers', () => {
    expect(getOptimalModel('Tier2')).toBe('gpt-5.4-mini');
    expect(getOptimalModel('Tier3')).toBe('gpt-5.3-codex');
    expect(getOptimalModel('Tier3Reasoning', true)).toBe('gpt-5.5');
    expect(getOptimalModel('Tier3Reasoning', false)).toBe('gpt-5.3-codex');
  });

  it('clamps non-finite complexity', () => {
    expect(getOptimalModel(NaN)).toBe('gpt-5.3-codex');
    expect(getOptimalModel(Infinity)).toBe('gpt-5.3-codex');
    expect(getOptimalModel(-50)).toBe('gpt-5.4-mini');
    expect(getOptimalModel(9999)).toBe('gpt-5.3-codex');
  });
});

describe('isCatalogModel / isRetiringModel / getModelEntry', () => {
  it('identifies catalog members', () => {
    expect(isCatalogModel('gpt-5.3-codex')).toBe(true);
    expect(isCatalogModel('gpt-5.4-mini')).toBe(true);
    expect(isCatalogModel('gpt-5.5')).toBe(true);
    expect(isCatalogModel('gpt-4.1')).toBe(false);
    expect(isCatalogModel('claude-sonnet')).toBe(false);
  });

  it('identifies retiring models', () => {
    expect(isRetiringModel('gpt-4.1')).toBe(true);
    expect(isRetiringModel('gpt-5.2-codex')).toBe(true);
    expect(isRetiringModel('gpt-5.3-codex')).toBe(false);
  });

  it('getModelEntry returns the typed entry or null', () => {
    const entry = getModelEntry('gpt-5.3-codex');
    expect(entry).not.toBeNull();
    expect(entry?.tier).toBe(3);
    expect(getModelEntry('nope')).toBeNull();
  });
});
