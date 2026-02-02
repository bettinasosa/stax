import { describe, it, expect } from 'vitest';
import {
  parseCSVImport,
  parseCSVRaw,
  listedWithPortfolioId,
  nonListedWithPortfolioId,
  CSV_IMPORT_HEADER,
} from './csvImport';

const PORTFOLIO_ID = '00000000-0000-4000-8000-000000000001';

describe('parseCSVRaw', () => {
  it('skips empty content', () => {
    expect(parseCSVRaw('')).toEqual([]);
    expect(parseCSVRaw('   \n  \n')).toEqual([]);
  });

  it('skips header when first line starts with type or name', () => {
    const csv = `${CSV_IMPORT_HEADER}\nstock,Apple,AAPL,10,100,USD,,`;
    const rows = parseCSVRaw(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['stock', 'Apple', 'AAPL', '10', '100', 'USD', '', '']);
  });

  it('parses multiple rows', () => {
    const csv = `stock,Apple,AAPL,10,,USD,,\ncash,Savings,,,USD,5000,`;
    const rows = parseCSVRaw(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('stock');
    expect(rows[1][0]).toBe('cash');
  });
});

describe('parseCSVImport', () => {
  it('returns empty when no valid content', () => {
    const r = parseCSVImport('');
    expect(r.listed).toHaveLength(0);
    expect(r.nonListed).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
  });

  it('parses listed row (stock)', () => {
    const csv = 'stock,Apple Inc,AAPL,10,1500,USD,,';
    const r = parseCSVImport(csv);
    expect(r.listed).toHaveLength(1);
    expect(r.nonListed).toHaveLength(0);
    expect(r.errors).toHaveLength(0);
    expect(r.listed[0].input).toMatchObject({
      type: 'stock',
      name: 'Apple Inc',
      symbol: 'AAPL',
      quantity: 10,
      costBasis: 1500,
      currency: 'USD',
    });
  });

  it('parses non-listed row (cash)', () => {
    const csv = 'cash,Emergency fund,,,,USD,5000,';
    const r = parseCSVImport(csv);
    expect(r.listed).toHaveLength(0);
    expect(r.nonListed).toHaveLength(1);
    expect(r.nonListed[0].input).toMatchObject({
      type: 'cash',
      name: 'Emergency fund',
      manualValue: 5000,
      currency: 'USD',
    });
  });

  it('defaults currency to USD', () => {
    const r = parseCSVImport('stock,Test,TST,1,,,');
    expect(r.listed[0].input.currency).toBe('USD');
  });

  it('reports error for listed row without symbol', () => {
    const r = parseCSVImport('stock,No Symbol,,10,,USD,,');
    expect(r.listed).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Symbol');
  });

  it('reports error for listed row with invalid quantity', () => {
    const r = parseCSVImport('stock,Test,AAPL,notanumber,,USD,,');
    expect(r.listed).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Quantity');
  });

  it('reports error for non-listed row without manual_value', () => {
    const r = parseCSVImport('cash,No Value,,,USD,,');
    expect(r.nonListed).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Manual value');
  });

  it('reports error for unknown type', () => {
    const r = parseCSVImport('unknown,Name,,,USD,,');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Unknown type');
  });

  it('parses header and data', () => {
    const csv = `${CSV_IMPORT_HEADER}\nstock,Apple,AAPL,5,,USD,,`;
    const r = parseCSVImport(csv);
    expect(r.listed).toHaveLength(1);
    expect(r.listed[0].input.name).toBe('Apple');
    expect(r.listed[0].input.quantity).toBe(5);
  });
});

describe('listedWithPortfolioId / nonListedWithPortfolioId', () => {
  it('adds portfolioId to listed inputs', () => {
    const csv = 'stock,Apple,AAPL,1,,USD,,';
    const r = parseCSVImport(csv);
    const withId = listedWithPortfolioId(r.listed, PORTFOLIO_ID);
    expect(withId).toHaveLength(1);
    expect(withId[0].portfolioId).toBe(PORTFOLIO_ID);
    expect(withId[0].symbol).toBe('AAPL');
  });

  it('adds portfolioId to non-listed inputs', () => {
    const csv = 'cash,Savings,,,,USD,1000,';
    const r = parseCSVImport(csv);
    const withId = nonListedWithPortfolioId(r.nonListed, PORTFOLIO_ID);
    expect(withId).toHaveLength(1);
    expect(withId[0].portfolioId).toBe(PORTFOLIO_ID);
    expect(withId[0].manualValue).toBe(1000);
  });
});
