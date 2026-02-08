import { describe, it, expect } from 'vitest';
import {
  attributionFromChange,
  portfolioTotalBase,
  portfolioTotalRef,
  holdingsWithValues,
} from './portfolioUtils';
import type { Holding } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';

const BASE = 'USD';

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    portfolioId: 'p1',
    type: 'stock',
    name: 'Test',
    symbol: 'TST',
    quantity: 10,
    costBasis: null,
    costBasisCurrency: null,
    manualValue: null,
    currency: 'USD',
    metadata: undefined,
    ...overrides,
  };
}

function makePrice(price: number, previousClose?: number, changePercent?: number): PriceResult {
  return {
    price,
    currency: 'USD',
    symbol: 'TST',
    ...(previousClose != null && { previousClose }),
    ...(changePercent != null && { changePercent }),
  };
}

describe('attributionFromChange', () => {
  it('returns empty rows and zero totalPnl for empty holdings', () => {
    const prices = new Map<string, PriceResult>();
    const { rows, totalPnl } = attributionFromChange([], prices, BASE);
    expect(rows).toHaveLength(0);
    expect(totalPnl).toBe(0);
  });

  it('attributes single holding change to that holding', () => {
    const h = makeHolding({ id: 'h1', symbol: 'TST', quantity: 10 });
    const prices = new Map<string, PriceResult>([
      ['TST', makePrice(110, 100)], // +10% ref->now
    ]);
    const { rows, totalPnl } = attributionFromChange([h], prices, BASE);
    expect(rows).toHaveLength(1);
    expect(rows[0].holdingId).toBe('h1');
    expect(rows[0].holdingName).toBe('Test');
    expect(rows[0].contributionAbs).toBe(100); // 10 * (110 - 100)
    expect(rows[0].returnPct).toBe(10);
    expect(totalPnl).toBe(100);
  });

  it('sorts rows by absolute contribution desc', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', symbol: 'A', quantity: 1 }),
      makeHolding({ id: 'b', symbol: 'B', quantity: 10 }),
      makeHolding({ id: 'c', symbol: 'C', quantity: 5 }),
    ];
    const prices = new Map<string, PriceResult>([
      ['A', makePrice(100, 90)],   // +10
      ['B', makePrice(10, 9)],    // +10
      ['C', makePrice(50, 40)],   // +50
    ]);
    const { rows } = attributionFromChange(holdings, prices, BASE);
    expect(rows[0].contributionAbs).toBe(50);  // C
    expect(rows[1].contributionAbs).toBe(10);  // B or A
    expect(rows[2].contributionAbs).toBe(10);
  });

  it('contributionPct sums to 100 when totalPnl > 0', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'a', symbol: 'A', quantity: 10 }),
      makeHolding({ id: 'b', symbol: 'B', quantity: 10 }),
    ];
    const prices = new Map<string, PriceResult>([
      ['A', makePrice(11, 10)],  // +10
      ['B', makePrice(12, 10)],  // +20
    ]);
    const { rows, totalPnl } = attributionFromChange(holdings, prices, BASE);
    expect(totalPnl).toBe(30);
    const sumPct = rows.reduce((s, r) => s + r.contributionPct, 0);
    expect(sumPct).toBeCloseTo(100, 5);
  });

  it('manual-value holding has zero contribution when value unchanged', () => {
    const h = makeHolding({
      id: 'm1',
      type: 'cash',
      symbol: null,
      quantity: null,
      manualValue: 1000,
      currency: 'USD',
    });
    const prices = new Map<string, PriceResult>();
    const { rows } = attributionFromChange([h], prices, BASE);
    expect(rows).toHaveLength(1);
    expect(rows[0].contributionAbs).toBe(0);
    expect(rows[0].returnPct).toBe(0); // 0% return when value unchanged
  });
});

describe('portfolioTotalBase', () => {
  it('returns 0 for empty holdings', () => {
    expect(portfolioTotalBase([], new Map(), BASE)).toBe(0);
  });

  it('sums listed holding value and manual value', () => {
    const holdings: Holding[] = [
      makeHolding({ symbol: 'TST', quantity: 10, manualValue: null }),
      makeHolding({ type: 'cash', symbol: null, quantity: null, manualValue: 500 }),
    ];
    const prices = new Map<string, PriceResult>([['TST', makePrice(100)]]);
    expect(portfolioTotalBase(holdings, prices, BASE)).toBe(1500);
  });
});

describe('holdingsWithValues', () => {
  it('sorts by valueBase desc', () => {
    const holdings: Holding[] = [
      makeHolding({ id: 'lo', symbol: 'LO', quantity: 10 }),
      makeHolding({ id: 'hi', symbol: 'HI', quantity: 100 }),
    ];
    const prices = new Map<string, PriceResult>([
      ['LO', makePrice(10)],   // 10 * 10 = 100
      ['HI', makePrice(2)],    // 100 * 2 = 200
    ]);
    const withValues = holdingsWithValues(holdings, prices, BASE);
    expect(withValues[0].holding.id).toBe('hi');
    expect(withValues[0].valueBase).toBe(200);
    expect(withValues[1].holding.id).toBe('lo');
    expect(withValues[1].valueBase).toBe(100);
    expect(withValues[0].weightPercent).toBeCloseTo(66.67, 1);
    expect(withValues[1].weightPercent).toBeCloseTo(33.33, 1);
  });
});
