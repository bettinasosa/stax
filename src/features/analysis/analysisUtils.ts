import type { HoldingWithValue } from '../portfolio/portfolioUtils';
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
