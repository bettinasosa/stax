/**
 * Format a number as currency (no symbol, locale-aware decimals).
 */
export function formatMoney(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a weight (percentage) for display.
 */
export function formatWeight(weightPercent: number): string {
  return `${weightPercent.toFixed(1)}%`;
}

/**
 * MVP: FX rate to base currency. Returns 1.0 for same currency, else a simple placeholder.
 * Replace with real FX provider later.
 */
export function getRateToBase(currency: string, baseCurrency: string): number {
  if (currency === baseCurrency) return 1;
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 1.05,
    GBP: 1.27,
  };
  const from = rates[currency] ?? 1;
  const to = rates[baseCurrency] ?? 1;
  return to / from;
}
