import { describe, it, expect } from 'vitest';
import {
  computeConcentration,
  computeStaxScore,
  generateInsights,
  exposureBreakdown,
} from './analysisUtils';
import type { HoldingWithValue } from '../portfolio/portfolioUtils';

function makeHoldingWithValue(
  overrides: Partial<HoldingWithValue['holding']> & {
    valueBase?: number;
    weightPercent?: number;
  }
): HoldingWithValue {
  const { valueBase = 100, weightPercent = 10, ...holdingOverrides } = overrides;
  return {
    holding: {
      id: 'id',
      portfolioId: 'pid',
      type: 'stock',
      name: 'Test',
      symbol: 'TST',
      quantity: 10,
      currency: 'USD',
      metadata: undefined,
      ...holdingOverrides,
    },
    valueBase,
    weightPercent,
  };
}

describe('computeConcentration', () => {
  it('computes top holding and top 3 percent', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({ valueBase: 50, weightPercent: 50 }),
      makeHoldingWithValue({ valueBase: 30, weightPercent: 30 }),
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
    ];
    const c = computeConcentration(withValues);
    expect(c.topHoldingPercent).toBe(50);
    expect(c.top3CombinedPercent).toBe(100);
    expect(c.hhi).toBeGreaterThan(0);
  });

  it('returns zeros for empty list', () => {
    const c = computeConcentration([]);
    expect(c.topHoldingPercent).toBe(0);
    expect(c.top3CombinedPercent).toBe(0);
    expect(c.largestCountryPercent).toBe(0);
    expect(c.largestSectorPercent).toBe(0);
    expect(c.hhi).toBe(0);
  });
});

describe('computeStaxScore', () => {
  it('starts at 100 when no thresholds exceeded', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
      makeHoldingWithValue({ valueBase: 20, weightPercent: 20 }),
    ];
    const c = computeConcentration(withValues);
    const score = computeStaxScore(c, withValues);
    expect(score).toBe(100);
  });

  it('subtracts when top holding exceeds threshold', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({ valueBase: 30, weightPercent: 30 }),
      makeHoldingWithValue({ valueBase: 70, weightPercent: 70 }),
    ];
    const c = computeConcentration(withValues);
    const score = computeStaxScore(c, withValues);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('floors at 0 when score would go negative', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({
        valueBase: 100,
        weightPercent: 100,
        type: 'crypto',
        metadata: { country: 'US', sector: 'Tech' },
      }),
    ];
    const c = computeConcentration(withValues);
    const score = computeStaxScore(c, withValues, 0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('generateInsights', () => {
  it('returns array of strings', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({ valueBase: 10, weightPercent: 10 }),
    ];
    const c = computeConcentration(withValues);
    const insights = generateInsights(c, 80, withValues);
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(5);
    insights.forEach((s) => expect(typeof s).toBe('string'));
  });
});

describe('exposureBreakdown', () => {
  it('returns slices for asset class and currency', () => {
    const withValues: HoldingWithValue[] = [
      makeHoldingWithValue({ type: 'stock', currency: 'USD', valueBase: 50, weightPercent: 50 }),
      makeHoldingWithValue({ type: 'crypto', currency: 'USD', valueBase: 50, weightPercent: 50 }),
    ];
    const slices = exposureBreakdown(withValues);
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.some((s) => s.type === 'asset_class')).toBe(true);
    expect(slices.some((s) => s.type === 'currency')).toBe(true);
  });
});
