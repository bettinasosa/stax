import { describe, it, expect } from 'vitest';
import { formatMoney, formatWeight, getRateToBase } from './money';

describe('formatMoney', () => {
  it('formats number as USD currency', () => {
    expect(formatMoney(1234.56, 'USD')).toMatch(/\$1,234\.56/);
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'USD')).toMatch(/\$0\.00/);
  });
});

describe('formatWeight', () => {
  it('formats percentage with one decimal', () => {
    expect(formatWeight(25.5)).toBe('25.5%');
  });
});

describe('getRateToBase', () => {
  it('returns 1 for same currency', () => {
    expect(getRateToBase('USD', 'USD')).toBe(1);
  });

  it('returns a number for different currencies', () => {
    const rate = getRateToBase('EUR', 'USD');
    expect(typeof rate).toBe('number');
    expect(rate).toBeGreaterThan(0);
  });
});
