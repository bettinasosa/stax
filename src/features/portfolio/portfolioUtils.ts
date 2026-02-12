import type { Holding, Transaction } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';
import { getRateToBase, formatMoney } from '../../utils/money';

const PRICED_TYPES = ['stock', 'etf', 'crypto', 'metal', 'commodity'] as const;

/**
 * Compute unrealized P&L for a single holding in base currency.
 * Listed: (valueBase - costBase) / costBase * 100. Non-listed: (manualValue*rate - costBasis in base) / costBasis * 100.
 * Returns null when cost basis or value data is missing.
 */
export function computeHoldingPnl(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): { pnl: number; pnlPct: number } | null {
  const valueBase = holdingValueInBase(holding, priceResult, baseCurrency, fxRates);
  const costRate = getRateToBase(holding.costBasisCurrency ?? holding.currency, baseCurrency, fxRates);

  if (holding.costBasis == null || holding.costBasis <= 0) return null;

  let costBase: number;
  if (holding.quantity != null && holding.quantity > 0 && holding.symbol) {
    costBase = holding.costBasis * holding.quantity * costRate;
  } else if (holding.manualValue != null) {
    costBase = holding.costBasis * costRate;
  } else {
    return null;
  }

  if (costBase <= 0) return null;
  const pnl = valueBase - costBase;
  const pnlPct = (pnl / costBase) * 100;
  return { pnl, pnlPct };
}

/**
 * Compute current value of a holding in base currency.
 * Listed: quantity * price, then FX to base. Non-listed: manualValue, then FX to base.
 */
export function holdingValueInBase(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): number {
  const rate = getRateToBase(holding.currency, baseCurrency, fxRates);
  if (holding.quantity != null && holding.symbol && priceResult) {
    return holding.quantity * priceResult.price * rate;
  }
  if (holding.manualValue != null) {
    return holding.manualValue * rate;
  }
  return 0;
}

/**
 * Reference value for change calculation: value at comparison point (24h ago for crypto, previous close for stocks).
 * Manual holdings use manualValue (flat). Listed without ref data fall back to current value (no change).
 */
export function referenceValueInBase(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): number {
  const rate = getRateToBase(holding.currency, baseCurrency, fxRates);
  if (holding.manualValue != null) {
    return holding.manualValue * rate;
  }
  if (holding.quantity == null || !holding.symbol || !priceResult) return 0;
  const qty = holding.quantity;
  const priceNow = priceResult.price;
  if (priceResult.previousClose != null) {
    return qty * priceResult.previousClose * rate;
  }
  if (priceResult.changePercent != null && priceResult.changePercent !== 0) {
    const priceRef = priceNow / (1 + priceResult.changePercent / 100);
    return qty * priceRef * rate;
  }
  return qty * priceNow * rate;
}

/**
 * Total portfolio value at reference time (previous close / 24h ago). Manual values stay constant.
 */
export function portfolioTotalRef(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): number {
  return holdings.reduce((sum, h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    return sum + referenceValueInBase(h, price, baseCurrency, fxRates);
  }, 0);
}

export interface PortfolioChange {
  totalNow: number;
  totalRef: number;
  pnl: number;
  pct: number;
  label: '24h' | 'previous_close' | 'priced_assets';
  hasManual: boolean;
}

/**
 * Compute portfolio change in a way that will not lie: valueNow/valueRef per holding, then aggregate.
 * Label: "24h" when crypto-heavy with 24h data, "previous_close" for stocks, "priced_assets" when mixed or manual present.
 */
export function portfolioChange(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): PortfolioChange | null {
  const totalNow = portfolioTotalBase(holdings, pricesBySymbol, baseCurrency, fxRates);
  const totalRef = portfolioTotalRef(holdings, pricesBySymbol, baseCurrency, fxRates);
  if (totalRef <= 0) return null;
  const pnl = totalNow - totalRef;
  const pct = (totalNow - totalRef) / totalRef;

  const hasManual = holdings.some((h) => h.manualValue != null);
  const priced = holdings.filter(
    (h) => h.symbol && PRICED_TYPES.includes(h.type as (typeof PRICED_TYPES)[number])
  );
  const withPrevClose = priced.filter((h) => {
    const pr = h.symbol ? pricesBySymbol.get(h.symbol) : null;
    return pr?.previousClose != null;
  });
  const with24hOnly = priced.filter((h) => {
    const pr = h.symbol ? pricesBySymbol.get(h.symbol) : null;
    return pr?.changePercent != null && pr.previousClose == null;
  });

  let label: PortfolioChange['label'] = 'priced_assets';
  if (hasManual || (withPrevClose.length > 0 && with24hOnly.length > 0)) {
    label = 'priced_assets';
  } else if (withPrevClose.length > 0) {
    label = 'previous_close';
  } else if (with24hOnly.length > 0) {
    label = '24h';
  }

  return { totalNow, totalRef, pnl, pct, label, hasManual };
}

/**
 * Compute total portfolio value from holdings and their prices.
 */
export function portfolioTotalBase(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): number {
  return holdings.reduce((sum, h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    return sum + holdingValueInBase(h, price, baseCurrency, fxRates);
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
  baseCurrency: string,
  fxRates?: Record<string, number>,
): HoldingWithValue[] {
  const withVal = holdings.map((holding) => {
    const price = holding.symbol ? pricesBySymbol.get(holding.symbol) ?? null : null;
    const valueBase = holdingValueInBase(holding, price, baseCurrency, fxRates);
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
  baseCurrency: string,
  fxRates?: Record<string, number>,
): string {
  const isListed =
    holding.symbol != null && ['stock', 'etf', 'crypto', 'metal', 'commodity'].includes(holding.type);
  if (
    isListed &&
    !priceResult &&
    holding.quantity != null &&
    holding.quantity > 0
  ) {
    return 'Price unavailable';
  }
  const value = holdingValueInBase(holding, priceResult, baseCurrency, fxRates);
  return formatMoney(value, baseCurrency);
}

// ---------------------------------------------------------------------------
// Portfolio Summary Stats
// ---------------------------------------------------------------------------

export interface PortfolioStats {
  /** Total current value in base currency. */
  totalValue: number;
  /** Total cost basis in base currency (sum of costBasis across all holdings). */
  totalCostBasis: number;
  /** Total unrealised gain/loss (totalValue - totalCostBasis). */
  totalGainLoss: number;
  /** Total unrealised gain/loss as a percentage of cost basis. */
  totalGainLossPct: number;
  /** Number of holdings. */
  holdingCount: number;
  /** Number of distinct asset classes represented. */
  assetClassCount: number;
  /** Weight of the single largest holding (0-100). */
  topHoldingWeight: number;
  /** Name of the largest holding. */
  topHoldingName: string;
  /** Combined weight of the top 3 holdings (0-100). */
  top3Weight: number;
  /** Herfindahl-Hirschman Index (0-10000) — lower = more diversified. */
  hhi: number;
  /** Diversification label based on HHI. */
  diversificationLabel: 'Well diversified' | 'Moderately concentrated' | 'Highly concentrated';
  /** Number of priced holdings (with live price data). */
  pricedCount: number;
  /** Number of manual-value holdings (no live price). */
  manualCount: number;
  /** Average holding weight. */
  avgWeight: number;
  /** Day change P&L in base currency (null when no price data). */
  dayChangePnl: number | null;
  /** Day change % (null when no price data). */
  dayChangePct: number | null;
}

/**
 * Compute comprehensive portfolio summary statistics.
 */
export function computePortfolioStats(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): PortfolioStats {
  const withVal = holdingsWithValues(holdings, pricesBySymbol, baseCurrency, fxRates);
  const totalValue = withVal.reduce((s, h) => s + h.valueBase, 0);

  // Cost basis
  let totalCostBasis = 0;
  for (const h of holdings) {
    if (h.costBasis != null) {
      const rate = getRateToBase(h.costBasisCurrency ?? h.currency, baseCurrency, fxRates);
      totalCostBasis += h.costBasis * rate;
    }
  }
  const totalGainLoss = totalCostBasis > 0 ? totalValue - totalCostBasis : 0;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  // Counts
  const holdingCount = holdings.length;
  const assetClasses = new Set(holdings.map((h) => h.type));
  const assetClassCount = assetClasses.size;
  const pricedCount = holdings.filter(
    (h) => h.symbol && PRICED_TYPES.includes(h.type as (typeof PRICED_TYPES)[number])
  ).length;
  const manualCount = holdings.filter((h) => h.manualValue != null).length;

  // Concentration
  const topHoldingWeight = withVal.length > 0 ? withVal[0].weightPercent : 0;
  const topHoldingName = withVal.length > 0 ? withVal[0].holding.name : '';
  const top3Weight = withVal.slice(0, 3).reduce((s, h) => s + h.weightPercent, 0);
  const avgWeight = holdingCount > 0 ? 100 / holdingCount : 0;

  // HHI: sum of squared weights (as fractions)
  const hhi = withVal.reduce((s, h) => {
    const w = h.weightPercent / 100;
    return s + w * w * 10000;
  }, 0);
  const diversificationLabel: PortfolioStats['diversificationLabel'] =
    hhi < 1500
      ? 'Well diversified'
      : hhi < 2500
        ? 'Moderately concentrated'
        : 'Highly concentrated';

  // Day change
  const change = portfolioChange(holdings, pricesBySymbol, baseCurrency, fxRates);
  const dayChangePnl = change?.pnl ?? null;
  const dayChangePct = change?.pct != null ? change.pct * 100 : null;

  return {
    totalValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPct,
    holdingCount,
    assetClassCount,
    topHoldingWeight,
    topHoldingName,
    top3Weight,
    hhi,
    diversificationLabel,
    pricedCount,
    manualCount,
    avgWeight,
    dayChangePnl,
    dayChangePct,
  };
}

export interface AttributionRow {
  holdingId: string;
  holdingName: string;
  contributionAbs: number;
  contributionPct: number;
  returnPct: number | null;
}

/**
 * Performance attribution: per-holding contribution to portfolio change (ref -> now).
 * Uses same ref as portfolioChange (previous close / 24h). Sorted by absolute contribution desc.
 */
export function attributionFromChange(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): { rows: AttributionRow[]; totalPnl: number } {
  const totalRef = portfolioTotalRef(holdings, pricesBySymbol, baseCurrency, fxRates);
  const totalNow = portfolioTotalBase(holdings, pricesBySymbol, baseCurrency, fxRates);
  const totalPnl = totalNow - totalRef;

  const rows: AttributionRow[] = holdings.map((h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    const refVal = referenceValueInBase(h, price, baseCurrency, fxRates);
    const nowVal = holdingValueInBase(h, price, baseCurrency, fxRates);
    const contributionAbs = nowVal - refVal;
    const returnPct = refVal > 0 ? ((nowVal - refVal) / refVal) * 100 : null;
    const contributionPct = totalPnl !== 0 ? (contributionAbs / totalPnl) * 100 : 0;
    return {
      holdingId: h.id,
      holdingName: h.name,
      contributionAbs,
      contributionPct,
      returnPct,
    };
  });

  rows.sort((a, b) => Math.abs(b.contributionAbs) - Math.abs(a.contributionAbs));
  return { rows, totalPnl };
}

// ---------------------------------------------------------------------------
// Since-inception (cost basis) returns
// ---------------------------------------------------------------------------

export interface InceptionReturn {
  /** Cost basis in base currency. */
  costBasis: number;
  /** Current value in base currency. */
  currentValue: number;
  /** Absolute gain/loss (currentValue - costBasis). */
  gainLoss: number;
  /** Percentage return ((currentValue - costBasis) / costBasis * 100). */
  returnPct: number;
}

/**
 * Compute per-holding since-inception return using costBasis (per-unit purchase price).
 * Returns null when the holding has no cost basis set.
 *
 * costBasis on the holding is stored as per-unit cost (price at acquisition).
 * We multiply by quantity to get total cost, then compare to current total value.
 */
export function holdingInceptionReturn(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): InceptionReturn | null {
  if (holding.costBasis == null || holding.costBasis <= 0) return null;
  const cbRate = getRateToBase(holding.costBasisCurrency ?? holding.currency, baseCurrency, fxRates);
  const qty = holding.quantity ?? 1;
  const costBasis = holding.costBasis * qty * cbRate;
  const currentValue = holdingValueInBase(holding, priceResult, baseCurrency, fxRates);
  const gainLoss = currentValue - costBasis;
  const returnPct = (gainLoss / costBasis) * 100;
  return { costBasis, currentValue, gainLoss, returnPct };
}

/**
 * Compute aggregate portfolio since-inception return across all holdings with cost basis.
 * Returns null if no holdings have cost basis data.
 */
export function portfolioInceptionReturn(
  holdings: Holding[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string,
  fxRates?: Record<string, number>,
): InceptionReturn | null {
  let totalCost = 0;
  let totalValue = 0;
  let hasData = false;

  for (const h of holdings) {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    const ret = holdingInceptionReturn(h, price, baseCurrency, fxRates);
    if (ret) {
      totalCost += ret.costBasis;
      totalValue += ret.currentValue;
      hasData = true;
    }
  }

  if (!hasData || totalCost <= 0) return null;
  const gainLoss = totalValue - totalCost;
  const returnPct = (gainLoss / totalCost) * 100;
  return { costBasis: totalCost, currentValue: totalValue, gainLoss, returnPct };
}

// ---------------------------------------------------------------------------
// Transaction summaries (realized P&L, dividend income)
// ---------------------------------------------------------------------------

/** Sum realized gain/loss from sell transactions. */
export function totalRealizedGainLoss(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'sell' && t.realizedGainLoss != null)
    .reduce((sum, t) => sum + (t.realizedGainLoss ?? 0), 0);
}

/** Sum total dividend income. */
export function totalDividendIncome(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'dividend')
    .reduce((sum, t) => sum + t.totalAmount, 0);
}

/** Monthly dividend income for the last N months. Returns array of { month: 'YYYY-MM', amount }. */
export function monthlyDividendIncome(
  transactions: Transaction[],
  monthsBack: number = 12,
): { month: string; amount: number }[] {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const sinceISO = since.toISOString();

  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'dividend' || t.date < sinceISO) continue;
    const month = t.date.slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) ?? 0) + t.totalAmount);
  }

  // Fill in missing months with 0
  const result: { month: string; amount: number }[] = [];
  const cursor = new Date(since);
  cursor.setDate(1);
  const now = new Date();
  while (cursor <= now) {
    const key = cursor.toISOString().slice(0, 7);
    result.push({ month: key, amount: byMonth.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

/** Dividend totals grouped by holding ID. */
export function dividendsByHolding(
  transactions: Transaction[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'dividend') continue;
    map.set(t.holdingId, (map.get(t.holdingId) ?? 0) + t.totalAmount);
  }
  return map;
}
