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
 * FX rate to convert from `currency` to `baseCurrency`.
 * When a live `rates` map is provided (from fetchFxRates), uses real rates.
 * Falls back to hardcoded stubs when rates are unavailable.
 */
export function getRateToBase(
  currency: string,
  baseCurrency: string,
  rates?: Record<string, number>,
): number {
  if (currency === baseCurrency) return 1;
  if (rates) {
    const from = rates[currency];
    const to = rates[baseCurrency];
    if (from != null && to != null && from > 0) {
      return to / from;
    }
  }
  // Fallback: hardcoded stubs for when no live rates are available
  const fallback: Record<string, number> = { USD: 1, EUR: 1.05, GBP: 1.27 };
  const from = fallback[currency] ?? 1;
  const to = fallback[baseCurrency] ?? 1;
  return to / from;
}
