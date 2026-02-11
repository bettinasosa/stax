/**
 * CSV export: build CSV from holdings data and share via native share sheet.
 */
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import type { Holding } from '../data/schemas';
import type { PriceResult } from './pricing';
import { holdingsWithValues } from '../features/portfolio/portfolioUtils';

const CSV_HEADER = 'Name,Type,Symbol,Quantity,Cost Basis,Currency,Current Value,Weight %,Daily Change %';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build CSV content string from holdings data.
 */
export function buildCsvContent(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): string {
  const withValues = holdingsWithValues(holdings, pricesBySymbol, baseCurrency, fxRates);
  const rows = withValues.map((item) => {
    const h = item.holding;
    const pr = h.symbol ? pricesBySymbol.get(h.symbol) : undefined;
    const changePct = pr?.changePercent;
    return [
      escapeCsv(h.name),
      h.type,
      h.symbol ?? '',
      h.quantity != null ? String(h.quantity) : '',
      h.costBasis != null ? String(h.costBasis) : '',
      h.currency,
      item.valueBase.toFixed(2),
      item.weightPercent.toFixed(2),
      changePct != null ? changePct.toFixed(2) : '',
    ].join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}

/**
 * Export portfolio holdings as CSV and open the native share sheet.
 */
export async function exportPortfolioCSV(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): Promise<void> {
  const csv = buildCsvContent(holdings, pricesBySymbol, baseCurrency, fxRates);
  const file = new File(Paths.cache, 'stax-portfolio.csv');
  file.write(csv);
  await shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
}
