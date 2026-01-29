import type { Holding } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';
import { getRateToBase, formatMoney } from '../../utils/money';

/**
 * Compute current value of a holding in base currency.
 * Listed: quantity * price, then FX to base. Non-listed: manualValue, then FX to base.
 */
export function holdingValueInBase(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string
): number {
  const rate = getRateToBase(holding.currency, baseCurrency);
  if (holding.quantity != null && holding.symbol && priceResult) {
    return holding.quantity * priceResult.price * rate;
  }
  if (holding.manualValue != null) {
    return holding.manualValue * rate;
  }
  return 0;
}

/**
 * Compute total portfolio value from holdings and their prices.
 */
export function portfolioTotalBase(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string
): number {
  return holdings.reduce((sum, h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    return sum + holdingValueInBase(h, price, baseCurrency);
  }, 0);
}

export interface HoldingWithValue {
  holding: Holding;
  valueBase: number;
  weightPercent: number;
}

/**
 * Compute value and weight for each holding. Sorted by value desc.
 */
export function holdingsWithValues(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string
): HoldingWithValue[] {
  const withVal = holdings.map((holding) => {
    const price = holding.symbol ? pricesBySymbol.get(holding.symbol) ?? null : null;
    const valueBase = holdingValueInBase(holding, price, baseCurrency);
    return { holding, valueBase };
  });
  const total = withVal.reduce((s, x) => s + x.valueBase, 0);
  return withVal
    .map(({ holding, valueBase }) => ({
      holding,
      valueBase,
      weightPercent: total > 0 ? (valueBase / total) * 100 : 0,
    }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

export interface AllocationSlice {
  assetClass: string;
  value: number;
  percent: number;
}

/**
 * Allocation by asset class (for chart).
 */
export function allocationByAssetClass(
  holdingsWithVal: HoldingWithValue[]
): AllocationSlice[] {
  const byClass = new Map<string, number>();
  for (const { holding, valueBase } of holdingsWithVal) {
    const key = holding.type;
    byClass.set(key, (byClass.get(key) ?? 0) + valueBase);
  }
  const total = [...byClass.values()].reduce((s, v) => s + v, 0);
  return [...byClass.entries()].map(([assetClass, value]) => ({
    assetClass,
    value,
    percent: total > 0 ? (value / total) * 100 : 0,
  }));
}

/**
 * Format holding value for display; show "Price unavailable" for listed holdings without price.
 */
export function formatHoldingValueDisplay(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string
): string {
  const isListed =
    holding.symbol != null && ['stock', 'etf', 'crypto', 'metal'].includes(holding.type);
  if (
    isListed &&
    !priceResult &&
    holding.quantity != null &&
    holding.quantity > 0
  ) {
    return 'Price unavailable';
  }
  const value = holdingValueInBase(holding, priceResult, baseCurrency);
  return formatMoney(value, baseCurrency);
}
