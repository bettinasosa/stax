import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';
import type { Holding, Transaction } from '../data/schemas';
import type { PriceResult } from './pricing';
import { holdingsWithValues, totalRealizedGainLoss, totalDividendIncome } from '../features/portfolio/portfolioUtils';
import { formatMoney } from '../utils/money';

interface ReportData {
  portfolioName: string;
  baseCurrency: string;
  holdings: Holding[];
  pricesBySymbol: Map<string, PriceResult>;
  transactions: Transaction[];
  fxRates?: Record<string, number>;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReportHtml(data: ReportData): string {
  const { portfolioName, baseCurrency, holdings, pricesBySymbol, transactions, fxRates } = data;
  const withValues = holdingsWithValues(holdings, pricesBySymbol, baseCurrency, fxRates);
  const totalValue = withValues.reduce((s, h) => s + h.valueBase, 0);
  const realizedPnl = totalRealizedGainLoss(transactions);
  const dividendIncome = totalDividendIncome(transactions);
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  // Holdings table rows
  const holdingRows = withValues.map((h) => {
    const qty = h.holding.quantity != null ? h.holding.quantity.toFixed(4) : '-';
    const totalCost = h.holding.costBasis != null && h.holding.quantity != null
      ? h.holding.costBasis * h.holding.quantity
      : h.holding.costBasis;
    const costBasis = totalCost != null ? formatMoney(totalCost, h.holding.costBasisCurrency ?? h.holding.currency) : '-';
    return `<tr>
      <td>${escapeHtml(h.holding.name)}</td>
      <td>${h.holding.type.replace(/_/g, ' ')}</td>
      <td>${h.holding.symbol ?? '-'}</td>
      <td class="num">${qty}</td>
      <td class="num">${costBasis}</td>
      <td class="num">${formatMoney(h.valueBase, baseCurrency)}</td>
      <td class="num">${h.weightPercent.toFixed(1)}%</td>
    </tr>`;
  }).join('\n');

  // Allocation breakdown
  const allocationMap = new Map<string, number>();
  for (const h of withValues) {
    const key = h.holding.type.replace(/_/g, ' ');
    allocationMap.set(key, (allocationMap.get(key) ?? 0) + h.valueBase);
  }
  const allocationRows = [...allocationMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => {
      const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0.0';
      return `<tr><td>${type}</td><td class="num">${formatMoney(value, baseCurrency)}</td><td class="num">${pct}%</td></tr>`;
    }).join('\n');

  // Recent transactions (last 20)
  const recentTxns = transactions
    .slice(0, 20)
    .map((t) => {
      const holding = holdings.find((h) => h.id === t.holdingId);
      return `<tr>
        <td>${new Date(t.date).toLocaleDateString()}</td>
        <td>${t.type}</td>
        <td>${escapeHtml(holding?.name ?? '-')}</td>
        <td class="num">${formatMoney(t.totalAmount, t.currency)}</td>
        <td class="num">${t.realizedGainLoss != null ? formatMoney(t.realizedGainLoss, t.currency) : '-'}</td>
      </tr>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
    background: #0B0B0D; color: #fff;
    padding: 24px; font-size: 12px;
  }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }
  .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
  .summary { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .summary-box { background: #1a1a1d; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 120px; }
  .summary-label { color: #888; font-size: 10px; text-transform: uppercase; }
  .summary-value { font-size: 18px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .positive { color: #34D399; }
  .negative { color: #F87171; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; color: #888; border-bottom: 1px solid #333; padding: 6px 4px; font-weight: 500; }
  td { padding: 6px 4px; border-bottom: 1px solid #1a1a1d; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>${escapeHtml(portfolioName)}</h1>
  <div class="meta">${date} · ${baseCurrency}</div>

  <div class="summary">
    <div class="summary-box">
      <div class="summary-label">Total Assets</div>
      <div class="summary-value">${formatMoney(totalValue, baseCurrency)}</div>
    </div>
    ${realizedPnl !== 0 ? `<div class="summary-box">
      <div class="summary-label">Realized P&L</div>
      <div class="summary-value ${realizedPnl >= 0 ? 'positive' : 'negative'}">${realizedPnl >= 0 ? '+' : ''}${formatMoney(realizedPnl, baseCurrency)}</div>
    </div>` : ''}
    ${dividendIncome > 0 ? `<div class="summary-box">
      <div class="summary-label">Dividend Income</div>
      <div class="summary-value positive">+${formatMoney(dividendIncome, baseCurrency)}</div>
    </div>` : ''}
  </div>

  <h2>Holdings</h2>
  <table>
    <thead><tr><th>Name</th><th>Type</th><th>Symbol</th><th class="num">Qty</th><th class="num">Cost Basis</th><th class="num">Value</th><th class="num">Weight</th></tr></thead>
    <tbody>${holdingRows}</tbody>
  </table>

  <h2>Allocation</h2>
  <table>
    <thead><tr><th>Asset Class</th><th class="num">Value</th><th class="num">Weight</th></tr></thead>
    <tbody>${allocationRows}</tbody>
  </table>

  ${recentTxns ? `
  <h2>Recent Transactions</h2>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Holding</th><th class="num">Amount</th><th class="num">P&L</th></tr></thead>
    <tbody>${recentTxns}</tbody>
  </table>` : ''}

  <div class="meta" style="margin-top:24px;text-align:center;">Generated by Stax</div>
</body>
</html>`;
}

/**
 * Generate a PDF from portfolio data and open the share sheet.
 */
export async function exportPortfolioPDF(data: ReportData): Promise<void> {
  const html = buildReportHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  await shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${data.portfolioName} Report`,
  });
}
