import type { Holding } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';
import { getRateToBase, formatMoney } from '../../utils/money';

const PRICED_TYPES = ['stock', 'etf', 'crypto', 'metal', 'commodity'] as const;

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
 * Reference value for change calculation: value at comparison point (24h ago for crypto, previous close for stocks).
 * Manual holdings use manualValue (flat). Listed without ref data fall back to current value (no change).
 */
export function referenceValueInBase(
  holding: Holding,
  priceResult: PriceResult | null,
  baseCurrency: string
): number {
  const rate = getRateToBase(holding.currency, baseCurrency);
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
  baseCurrency: string
): number {
  return holdings.reduce((sum, h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    return sum + referenceValueInBase(h, price, baseCurrency);
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
  baseCurrency: string
): PortfolioChange | null {
  const totalNow = portfolioTotalBase(holdings, pricesBySymbol, baseCurrency);
  const totalRef = portfolioTotalRef(holdings, pricesBySymbol, baseCurrency);
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
    holding.symbol != null && ['stock', 'etf', 'crypto', 'metal', 'commodity'].includes(holding.type);
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
  baseCurrency: string
): PortfolioStats {
  const withVal = holdingsWithValues(holdings, pricesBySymbol, baseCurrency);
  const totalValue = withVal.reduce((s, h) => s + h.valueBase, 0);

  // Cost basis
  let totalCostBasis = 0;
  for (const h of holdings) {
    if (h.costBasis != null) {
      const rate = getRateToBase(h.costBasisCurrency ?? h.currency, baseCurrency);
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
  const change = portfolioChange(holdings, pricesBySymbol, baseCurrency);
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
  baseCurrency: string
): { rows: AttributionRow[]; totalPnl: number } {
  const totalRef = portfolioTotalRef(holdings, pricesBySymbol, baseCurrency);
  const totalNow = portfolioTotalBase(holdings, pricesBySymbol, baseCurrency);
  const totalPnl = totalNow - totalRef;

  const rows: AttributionRow[] = holdings.map((h) => {
    const price = h.symbol ? pricesBySymbol.get(h.symbol) ?? null : null;
    const refVal = referenceValueInBase(h, price, baseCurrency);
    const nowVal = holdingValueInBase(h, price, baseCurrency);
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
