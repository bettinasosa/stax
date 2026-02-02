/**
 * CSV import: parse pasted CSV and validate rows into listed or non-listed holding inputs.
 * Format: type, name, symbol, quantity, cost_basis, currency, manual_value, note
 * Listed (stock|etf|crypto|metal|commodity): name, symbol, quantity required; cost_basis, currency optional.
 * Non-listed (cash|fixed_income|real_estate|other): name, manual_value required; currency, note optional.
 */

import type { CreateListedHoldingInput, CreateNonListedHoldingInput } from '../data/schemas';
import { ASSET_TYPE_LISTED, ASSET_TYPE_NON_LISTED } from '../utils/constants';
import type { AssetTypeListed, AssetTypeNonListed } from '../utils/constants';

const LISTED_TYPES = ASSET_TYPE_LISTED as unknown as readonly string[];
const NON_LISTED_TYPES = ASSET_TYPE_NON_LISTED as unknown as readonly string[];

/** Expected CSV columns (header optional). Order: type, name, symbol, quantity, cost_basis, currency, manual_value, note */
export const CSV_IMPORT_HEADER =
  'type,name,symbol,quantity,cost_basis,currency,manual_value,note';

/** Example row for listed asset. */
export const CSV_IMPORT_EXAMPLE_LISTED = 'stock,Apple Inc,AAPL,10,1500,USD,,';
/** Example row for non-listed asset. */
export const CSV_IMPORT_EXAMPLE_NON_LISTED = 'cash,Emergency fund,,,,USD,5000,';

const num = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const str = (s: string): string => s.trim();

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let field = '';
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\') {
          i += 1;
          if (i < line.length) field += line[i];
          i += 1;
          continue;
        }
        field += line[i];
        i += 1;
      }
      if (i < line.length) i += 1; // skip closing "
      out.push(field);
      if (line[i] === ',') i += 1;
      continue;
    }
    let field = '';
    while (i < line.length && line[i] !== ',') {
      field += line[i];
      i += 1;
    }
    out.push(field.trim());
    if (line[i] === ',') i += 1;
  }
  return out;
}

/**
 * Parse CSV text into rows. First line may be header (skipped if it looks like column names).
 * Returns array of 8-tuples [type, name, symbol, quantity, cost_basis, currency, manual_value, note].
 */
export function parseCSVRaw(content: string): string[][] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const rows: string[][] = [];
  const headerLower = lines[0].toLowerCase();
  const start = headerLower.startsWith('type') || headerLower.startsWith('name') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 2) continue;
    const type = str(cells[0] ?? '');
    const name = str(cells[1] ?? '');
    const symbol = str(cells[2] ?? '');
    const quantity = str(cells[3] ?? '');
    const cost_basis = str(cells[4] ?? '');
    const currency = str(cells[5] ?? '') || 'USD';
    const manual_value = str(cells[6] ?? '');
    const note = str(cells[7] ?? '');
    rows.push([type, name, symbol, quantity, cost_basis, currency, manual_value, note]);
  }
  return rows;
}

export interface ParsedListedRow {
  kind: 'listed';
  input: Omit<CreateListedHoldingInput, 'portfolioId'>;
}

export interface ParsedNonListedRow {
  kind: 'non_listed';
  input: Omit<CreateNonListedHoldingInput, 'portfolioId'>;
}

export interface CSVImportError {
  rowIndex: number;
  message: string;
  raw: string[];
}

export interface CSVImportResult {
  listed: ParsedListedRow[];
  nonListed: ParsedNonListedRow[];
  errors: CSVImportError[];
}

/**
 * Parse and validate CSV rows into listed and non-listed holding inputs (without portfolioId).
 * Invalid rows are collected in errors.
 */
export function parseCSVImport(content: string): CSVImportResult {
  const rawRows = parseCSVRaw(content);
  const result: CSVImportResult = { listed: [], nonListed: [], errors: [] };
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length < 2) continue;
    const [typeStr, nameStr, symbolStr, quantityStr, costBasisStr, currencyStr, manualValueStr, noteStr] = row;
    const type = str(typeStr ?? '').toLowerCase();
    const name = str(nameStr ?? '');
    const currency = (str(currencyStr ?? '') || 'USD').toUpperCase().slice(0, 3);
    if (!name) {
      result.errors.push({ rowIndex: i + 1, message: 'Name is required', raw: row });
      continue;
    }
    if (LISTED_TYPES.includes(type)) {
      const symbol = str(symbolStr ?? '');
      const qty = num(quantityStr ?? '');
      if (!symbol) {
        result.errors.push({ rowIndex: i + 1, message: 'Symbol is required for listed assets', raw: row });
        continue;
      }
      if (qty === undefined || qty <= 0) {
        result.errors.push({ rowIndex: i + 1, message: 'Quantity must be a positive number', raw: row });
        continue;
      }
      const costBasis = num(costBasisStr ?? '');
      result.listed.push({
        kind: 'listed',
        input: {
          type: type as AssetTypeListed,
          name,
          symbol,
          quantity: qty,
          costBasis: costBasis !== undefined && costBasis >= 0 ? costBasis : undefined,
          costBasisCurrency: currency !== 'USD' ? currency : undefined,
          currency: currency || 'USD',
        },
      });
      continue;
    }
    if (NON_LISTED_TYPES.includes(type)) {
      const manualValue = num(manualValueStr ?? '');
      if (manualValue === undefined || manualValue < 0) {
        result.errors.push({ rowIndex: i + 1, message: 'Manual value must be a non-negative number', raw: row });
        continue;
      }
      result.nonListed.push({
        kind: 'non_listed',
        input: {
          type: type as AssetTypeNonListed,
          name,
          manualValue: manualValue,
          currency: currency || 'USD',
          note: str(noteStr ?? '') || undefined,
        },
      });
      continue;
    }
    result.errors.push({
      rowIndex: i + 1,
      message: `Unknown type "${type}". Use: ${LISTED_TYPES.join(', ')} or ${NON_LISTED_TYPES.join(', ')}`,
      raw: row,
    });
  }
  return result;
}

/**
 * Add portfolioId to parsed listed inputs for persistence.
 */
export function listedWithPortfolioId(
  items: ParsedListedRow[],
  portfolioId: string
): CreateListedHoldingInput[] {
  return items.map((r) => ({ ...r.input, portfolioId }));
}

/**
 * Add portfolioId to parsed non-listed inputs for persistence.
 */
export function nonListedWithPortfolioId(
  items: ParsedNonListedRow[],
  portfolioId: string
): CreateNonListedHoldingInput[] {
  return items.map((r) => ({ ...r.input, portfolioId }));
}
