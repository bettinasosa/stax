import type { HoldingWithValue } from '../portfolio/portfolioUtils';
import type { PriceResult } from '../../services/pricing';
import { getRateToBase } from '../../utils/money';
import {
  STAX_SCORE_TOP_HOLDING_THRESHOLD,
  STAX_SCORE_TOP3_THRESHOLD,
  STAX_SCORE_COUNTRY_THRESHOLD,
  STAX_SCORE_SECTOR_THRESHOLD,
  STAX_SCORE_CRYPTO_PENALTY_THRESHOLD,
  STAX_SCORE_TOP_HOLDING_PENALTY,
  STAX_SCORE_TOP3_PENALTY,
  STAX_SCORE_COUNTRY_PENALTY,
  STAX_SCORE_SECTOR_PENALTY,
  STAX_SCORE_CRYPTO_PENALTY,
} from '../../utils/constants';

export interface ConcentrationMetrics {
  topHoldingPercent: number;
  top3CombinedPercent: number;
  largestCountryPercent: number;
  largestSectorPercent: number;
  hhi: number;
}

/**
 * Concentration: top holding %, top 3 %, largest country %, largest sector %, HHI.
 */
export function computeConcentration(
  withValues: HoldingWithValue[]
): ConcentrationMetrics {
  const total = withValues.reduce((s, x) => s + x.valueBase, 0);
  const topHoldingPercent = withValues[0]?.weightPercent ?? 0;
  const top3CombinedPercent = withValues
    .slice(0, 3)
    .reduce((s, x) => s + x.valueBase, 0) / (total > 0 ? total : 1) * 100;
  const hhi = withValues.reduce(
    (s, x) => s + Math.pow(x.weightPercent / 100, 2),
    0
  );

  const byCountry = new Map<string, number>();
  const bySector = new Map<string, number>();
  for (const { holding, valueBase } of withValues) {
    const meta = holding.metadata as { country?: string; sector?: string } | undefined;
    if (meta?.country) {
      byCountry.set(meta.country, (byCountry.get(meta.country) ?? 0) + valueBase);
    }
    if (meta?.sector) {
      bySector.set(meta.sector, (bySector.get(meta.sector) ?? 0) + valueBase);
    }
  }
  const largestCountryPercent =
    total > 0 && byCountry.size > 0
      ? (Math.max(...byCountry.values()) / total) * 100
      : 0;
  const largestSectorPercent =
    total > 0 && bySector.size > 0
      ? (Math.max(...bySector.values()) / total) * 100
      : 0;

  return {
    topHoldingPercent,
    top3CombinedPercent,
    largestCountryPercent,
    largestSectorPercent,
    hhi,
  };
}

/**
 * Stax Score: start 100, subtract per PRD rules, floor 0.
 * cryptoThresholdPercent: user-set default 30.
 */
export function computeStaxScore(
  concentration: ConcentrationMetrics,
  withValues: HoldingWithValue[],
  cryptoThresholdPercent: number = STAX_SCORE_CRYPTO_PENALTY_THRESHOLD
): number {
  let score = 100;
  if (concentration.topHoldingPercent > STAX_SCORE_TOP_HOLDING_THRESHOLD) {
    score -= STAX_SCORE_TOP_HOLDING_PENALTY;
  }
  if (concentration.top3CombinedPercent > STAX_SCORE_TOP3_THRESHOLD) {
    score -= STAX_SCORE_TOP3_PENALTY;
  }
  if (concentration.largestCountryPercent > STAX_SCORE_COUNTRY_THRESHOLD) {
    score -= STAX_SCORE_COUNTRY_PENALTY;
  }
  if (concentration.largestSectorPercent > STAX_SCORE_SECTOR_THRESHOLD) {
    score -= STAX_SCORE_SECTOR_PENALTY;
  }
  const cryptoPercent = withValues
    .filter((x) => x.holding.type === 'crypto')
    .reduce((s, x) => s + x.weightPercent, 0);
  if (cryptoPercent > cryptoThresholdPercent) {
    score -= STAX_SCORE_CRYPTO_PENALTY;
  }
  return Math.max(0, score);
}

/**
 * Generate 3–5 plain-language insights from concentration and score.
 */
export function generateInsights(
  concentration: ConcentrationMetrics,
  score: number,
  withValues: HoldingWithValue[]
): string[] {
  const insights: string[] = [];
  if (concentration.topHoldingPercent > STAX_SCORE_TOP_HOLDING_THRESHOLD) {
    insights.push(
      `Top holding is ${concentration.topHoldingPercent.toFixed(1)}% — consider diversifying.`
    );
  }
  if (concentration.top3CombinedPercent > STAX_SCORE_TOP3_THRESHOLD) {
    insights.push(
      `Top 3 holdings make up ${concentration.top3CombinedPercent.toFixed(1)}% — concentration is high.`
    );
  }
  if (concentration.largestCountryPercent > STAX_SCORE_COUNTRY_THRESHOLD) {
    insights.push(
      `Largest country exposure is ${concentration.largestCountryPercent.toFixed(1)}% — consider geographic diversification.`
    );
  }
  if (concentration.largestSectorPercent > STAX_SCORE_SECTOR_THRESHOLD) {
    insights.push(
      `Largest sector is ${concentration.largestSectorPercent.toFixed(1)}% — sector risk is elevated.`
    );
  }
  const cryptoPercent = withValues
    .filter((x) => x.holding.type === 'crypto')
    .reduce((s, x) => s + x.weightPercent, 0);
  if (cryptoPercent > STAX_SCORE_CRYPTO_PENALTY_THRESHOLD) {
    insights.push(
      `Crypto is ${cryptoPercent.toFixed(1)}% of portfolio — volatility may be high.`
    );
  }
  if (score >= 80) {
    insights.push('Portfolio diversification looks healthy.');
  } else if (score >= 50) {
    insights.push('Moderate diversification — a few tweaks could improve balance.');
  } else {
    insights.push('Consider diversifying across holdings, sectors, and regions.');
  }
  return insights.slice(0, 5);
}

export interface ExposureSlice {
  label: string;
  percent: number;
  type: 'asset_class' | 'currency' | 'country' | 'sector';
}

/**
 * Exposure breakdown: asset class, currency, country (listed), sector (listed).
 */
export function exposureBreakdown(withValues: HoldingWithValue[]): ExposureSlice[] {
  const total = withValues.reduce((s, x) => s + x.valueBase, 0);
  if (total <= 0) return [];

  const byAssetClass = new Map<string, number>();
  const byCurrency = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const bySector = new Map<string, number>();

  for (const { holding, valueBase } of withValues) {
    byAssetClass.set(
      holding.type,
      (byAssetClass.get(holding.type) ?? 0) + valueBase
    );
    byCurrency.set(
      holding.currency,
      (byCurrency.get(holding.currency) ?? 0) + valueBase
    );
    const meta = holding.metadata as { country?: string; sector?: string } | undefined;
    if (meta?.country && ['stock', 'etf'].includes(holding.type)) {
      byCountry.set(meta.country, (byCountry.get(meta.country) ?? 0) + valueBase);
    }
    if (meta?.sector && ['stock', 'etf'].includes(holding.type)) {
      bySector.set(meta.sector, (bySector.get(meta.sector) ?? 0) + valueBase);
    }
  }

  const slices: ExposureSlice[] = [];
  for (const [k, v] of byAssetClass) {
    slices.push({
      label: k.replace(/_/g, ' '),
      percent: (v / total) * 100,
      type: 'asset_class',
    });
  }
  for (const [k, v] of byCurrency) {
    slices.push({ label: k, percent: (v / total) * 100, type: 'currency' });
  }
  for (const [k, v] of byCountry) {
    slices.push({ label: k, percent: (v / total) * 100, type: 'country' });
  }
  for (const [k, v] of bySector) {
    slices.push({ label: k, percent: (v / total) * 100, type: 'sector' });
  }
  return slices.sort((a, b) => b.percent - a.percent);
}

// ── Performance analysis ────────────────────────────────────────────────────

export interface PerfRow {
  holdingId: string;
  name: string;
  returnPct: number;
}

export interface PnlRow {
  holdingId: string;
  name: string;
  costBasis: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
}

export interface PerformanceResult {
  bestPerformers: PerfRow[];
  worstPerformers: PerfRow[];
  unrealizedPnl: PnlRow[];
  totalUnrealizedPnl: number;
  totalCostBasis: number;
  /** Percentage of portfolio value covered by cost basis data. */
  coveragePercent: number;
}

/**
 * Compute performance data from holdings and prices.
 * Best/worst performers by daily return %. Unrealized P&L from cost basis.
 */
export function computePerformance(
  withValues: HoldingWithValue[],
  pricesBySymbol: Map<string, PriceResult>,
  baseCurrency: string
): PerformanceResult {
  const perfRows: PerfRow[] = [];
  const pnlRows: PnlRow[] = [];
  let totalCostBasis = 0;
  let coveredValue = 0;
  const totalPortfolioValue = withValues.reduce((s, x) => s + x.valueBase, 0);

  for (const { holding, valueBase } of withValues) {
    // Daily return %
    if (holding.symbol) {
      const pr = pricesBySymbol.get(holding.symbol);
      if (pr) {
        let returnPct: number | null = null;
        if (pr.changePercent != null) {
          returnPct = pr.changePercent;
        } else if (pr.previousClose != null && pr.previousClose > 0) {
          returnPct = ((pr.price - pr.previousClose) / pr.previousClose) * 100;
        }
        if (returnPct != null) {
          perfRows.push({ holdingId: holding.id, name: holding.name, returnPct });
        }
      }
    }

    // Unrealized P&L
    if (
      holding.costBasis != null &&
      holding.costBasis > 0 &&
      holding.quantity != null &&
      holding.quantity > 0
    ) {
      const cbRate = getRateToBase(holding.costBasisCurrency ?? holding.currency, baseCurrency);
      const costInBase = holding.costBasis * cbRate;
      totalCostBasis += costInBase;
      coveredValue += valueBase;
      const pnl = valueBase - costInBase;
      const pnlPct = costInBase > 0 ? (pnl / costInBase) * 100 : 0;
      pnlRows.push({
        holdingId: holding.id,
        name: holding.name,
        costBasis: costInBase,
        currentValue: valueBase,
        pnl,
        pnlPct,
      });
    }
  }

  perfRows.sort((a, b) => b.returnPct - a.returnPct);
  pnlRows.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  const totalUnrealizedPnl = pnlRows.reduce((s, r) => s + r.pnl, 0);
  const coveragePercent = totalPortfolioValue > 0 ? (coveredValue / totalPortfolioValue) * 100 : 0;

  return {
    bestPerformers: perfRows.filter((r) => r.returnPct > 0).slice(0, 3),
    worstPerformers: perfRows
      .filter((r) => r.returnPct < 0)
      .sort((a, b) => a.returnPct - b.returnPct)
      .slice(0, 3),
    unrealizedPnl: pnlRows,
    totalUnrealizedPnl,
    totalCostBasis,
    coveragePercent,
  };
}

// ── Rich insights ───────────────────────────────────────────────────────────

export interface RichInsight {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  category: 'concentration' | 'diversification' | 'performance' | 'general' | 'real_estate' | 'fixed_income';
}

/**
 * Generate structured, actionable insights from concentration, score, performance, and holdings.
 */
export function generateRichInsights(
  concentration: ConcentrationMetrics,
  score: number,
  withValues: HoldingWithValue[],
  performance?: PerformanceResult
): RichInsight[] {
  const insights: RichInsight[] = [];

  // Concentration warnings
  if (concentration.topHoldingPercent > STAX_SCORE_TOP_HOLDING_THRESHOLD) {
    insights.push({
      severity: concentration.topHoldingPercent > 50 ? 'critical' : 'warning',
      title: `Top holding is ${concentration.topHoldingPercent.toFixed(1)}%`,
      body: 'Consider reducing your largest position to lower single-asset risk.',
      category: 'concentration',
    });
  }
  if (concentration.top3CombinedPercent > STAX_SCORE_TOP3_THRESHOLD) {
    insights.push({
      severity: concentration.top3CombinedPercent > 80 ? 'critical' : 'warning',
      title: `Top 3 make up ${concentration.top3CombinedPercent.toFixed(1)}%`,
      body: 'Your portfolio is heavily concentrated in a few holdings.',
      category: 'concentration',
    });
  }

  // Diversification
  const assetTypes = new Set(withValues.map((x) => x.holding.type));
  if (assetTypes.size <= 2 && withValues.length > 3) {
    insights.push({
      severity: 'warning',
      title: `Only ${assetTypes.size} asset type${assetTypes.size === 1 ? '' : 's'}`,
      body: 'Consider adding different asset classes for better diversification.',
      category: 'diversification',
    });
  }

  // Crypto volatility
  const cryptoPercent = withValues
    .filter((x) => x.holding.type === 'crypto')
    .reduce((s, x) => s + x.weightPercent, 0);
  if (cryptoPercent > STAX_SCORE_CRYPTO_PENALTY_THRESHOLD) {
    insights.push({
      severity: 'warning',
      title: `Crypto is ${cryptoPercent.toFixed(1)}% of portfolio`,
      body: 'High crypto allocation increases volatility. Consider balancing with stable assets.',
      category: 'diversification',
    });
  }

  // Metadata gaps
  const stocksWithoutMeta = withValues.filter(
    (x) =>
      ['stock', 'etf'].includes(x.holding.type) &&
      !(x.holding.metadata as { country?: string } | undefined)?.country
  );
  if (stocksWithoutMeta.length > 0) {
    insights.push({
      severity: 'info',
      title: `${stocksWithoutMeta.length} holding${stocksWithoutMeta.length === 1 ? '' : 's'} missing metadata`,
      body: 'Add country and sector info to unlock deeper diversification analysis.',
      category: 'general',
    });
  }

  // Performance insights
  if (performance) {
    if (performance.bestPerformers.length > 0) {
      const top = performance.bestPerformers[0];
      insights.push({
        severity: 'info',
        title: `${top.name} up ${top.returnPct.toFixed(2)}% today`,
        body: 'Your top performer is contributing positively to your portfolio.',
        category: 'performance',
      });
    }
    if (performance.worstPerformers.length > 0) {
      const worst = performance.worstPerformers[0];
      insights.push({
        severity: Math.abs(worst.returnPct) > 5 ? 'warning' : 'info',
        title: `${worst.name} down ${Math.abs(worst.returnPct).toFixed(2)}% today`,
        body: 'Monitor this position — consider if it still fits your strategy.',
        category: 'performance',
      });
    }
    if (performance.coveragePercent < 50 && withValues.length > 2) {
      insights.push({
        severity: 'info',
        title: 'Cost basis data is incomplete',
        body: 'Add cost basis to your holdings to track real returns and unrealized P&L.',
        category: 'general',
      });
    }
  }

  // ── Real estate insights ──
  const reHoldings = withValues.filter((x) => x.holding.type === 'real_estate');
  if (reHoldings.length > 0) {
    const totalReValue = reHoldings.reduce((s, x) => s + x.valueBase, 0);
    const rePercent = withValues.reduce((s, x) => s + x.valueBase, 0) > 0
      ? (totalReValue / withValues.reduce((s, x) => s + x.valueBase, 0)) * 100
      : 0;

    if (rePercent > 50) {
      insights.push({
        severity: 'warning',
        title: `Real estate is ${rePercent.toFixed(0)}% of portfolio`,
        body: 'Heavy real estate exposure creates illiquidity risk. Consider diversifying into liquid assets.',
        category: 'real_estate',
      });
    }

    const reWithRentalIncome = reHoldings.filter((x) => {
      const meta = x.holding.metadata as { rentalIncome?: number } | undefined;
      return meta?.rentalIncome != null && meta.rentalIncome > 0;
    });
    if (reWithRentalIncome.length > 0) {
      let totalAnnualRental = 0;
      for (const h of reWithRentalIncome) {
        const meta = h.holding.metadata as { rentalIncome?: number } | undefined;
        totalAnnualRental += (meta?.rentalIncome ?? 0) * 12;
      }
      const yieldPct = totalReValue > 0 ? (totalAnnualRental / totalReValue) * 100 : 0;
      insights.push({
        severity: yieldPct < 3 ? 'warning' : 'info',
        title: `Rental yield: ${yieldPct.toFixed(1)}%`,
        body: yieldPct < 3
          ? 'Your rental yield is below typical benchmarks (4-8%). Consider if appreciation justifies the position.'
          : `Your properties generate ~${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAnnualRental)}/year in rental income.`,
        category: 'real_estate',
      });
    }

    const reWithoutPurchasePrice = reHoldings.filter((x) => {
      const meta = x.holding.metadata as { purchasePrice?: number } | undefined;
      return !meta?.purchasePrice;
    });
    if (reWithoutPurchasePrice.length > 0) {
      insights.push({
        severity: 'info',
        title: `${reWithoutPurchasePrice.length} propert${reWithoutPurchasePrice.length === 1 ? 'y' : 'ies'} missing purchase price`,
        body: 'Add purchase price to track appreciation and capital gains.',
        category: 'real_estate',
      });
    }
  }

  // ── Fixed income insights ──
  const fiHoldings = withValues.filter((x) => x.holding.type === 'fixed_income');
  if (fiHoldings.length > 0) {
    const totalFiValue = fiHoldings.reduce((s, x) => s + x.valueBase, 0);

    // Average coupon rate
    const fiWithCoupon = fiHoldings.filter((x) => {
      const meta = x.holding.metadata as { couponRate?: number } | undefined;
      return meta?.couponRate != null && meta.couponRate > 0;
    });
    if (fiWithCoupon.length > 0) {
      const weightedCoupon = fiWithCoupon.reduce((s, x) => {
        const meta = x.holding.metadata as { couponRate?: number } | undefined;
        return s + (meta?.couponRate ?? 0) * x.valueBase;
      }, 0);
      const avgCoupon = totalFiValue > 0 ? weightedCoupon / totalFiValue : 0;
      insights.push({
        severity: 'info',
        title: `Weighted avg coupon: ${avgCoupon.toFixed(2)}%`,
        body: `Across ${fiWithCoupon.length} fixed income holding${fiWithCoupon.length === 1 ? '' : 's'}.`,
        category: 'fixed_income',
      });
    }

    // Upcoming maturities
    const now = new Date();
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const maturingSoon = fiHoldings.filter((x) => {
      const meta = x.holding.metadata as { maturityDate?: string } | undefined;
      if (!meta?.maturityDate) return false;
      const d = new Date(meta.maturityDate);
      return d >= now && d <= sixMonths;
    });
    if (maturingSoon.length > 0) {
      insights.push({
        severity: 'warning',
        title: `${maturingSoon.length} bond${maturingSoon.length === 1 ? '' : 's'} maturing within 6 months`,
        body: 'Plan for reinvestment or redemption of maturing fixed income positions.',
        category: 'fixed_income',
      });
    }

    // Credit quality check
    const lowRated = fiHoldings.filter((x) => {
      const meta = x.holding.metadata as { creditRating?: string } | undefined;
      const rating = meta?.creditRating?.toUpperCase() ?? '';
      return rating.startsWith('B') && !rating.startsWith('BB') && !rating.startsWith('BA');
    });
    if (lowRated.length > 0) {
      insights.push({
        severity: 'warning',
        title: `${lowRated.length} holding${lowRated.length === 1 ? '' : 's'} with low credit rating`,
        body: 'Holdings rated below BB carry higher default risk. Ensure you\'re compensated with adequate yield.',
        category: 'fixed_income',
      });
    }
  }

  // Positive reinforcement
  if (score >= 80) {
    insights.push({
      severity: 'info',
      title: 'Strong diversification',
      body: `Your portfolio is spread across ${assetTypes.size} asset types. Keep it up!`,
      category: 'general',
    });
  } else if (score >= 50) {
    insights.push({
      severity: 'info',
      title: 'Moderate diversification',
      body: 'A few tweaks could improve your portfolio balance.',
      category: 'general',
    });
  }

  return insights.slice(0, 8);
}
