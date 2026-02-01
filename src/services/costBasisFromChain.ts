/**
 * Cost-basis from on-chain history: build lots from Etherscan tokentx + txlist.
 * Type 1: pure transfer/airdrop → cost = USD at receipt time.
 * Type 2: swap → cost = USD value of outflows allocated to inbound tokens.
 */

import type { CreateLotInput } from '../data/schemas';
import {
  fetchTokenTransfers,
  fetchNormalTransactions,
  groupTransfersByTx,
  type TokenDelta,
  parseTokenValue,
} from './etherscan';
import {
  fetchHistoricalPricesByContract,
  nearestPriceAtOrBefore,
  type HistoricalPricePoint,
} from './coingecko';

const CHAIN_ID_ETH = 1;

/** One computed lot before we attach holdingId (assetId -> holdingId map applied later). */
export interface ComputedLot {
  assetId: string;
  contractAddress: string | null;
  timestamp: string;
  qtyIn: number;
  costBasisUsdTotal: number | null;
  source: 'transfer' | 'swap';
}

/**
 * Batch-fetch historical prices for multiple (contractAddress, timestampSec) pairs.
 * Groups by contract, fetches one range per contract, returns map keyed by "contractAddress|timestampSec".
 */
async function batchHistoricalPrices(
  platform: string,
  requests: { contractAddress: string | null; timestampSec: number }[]
): Promise<Map<string, number>> {
  const byContract = new Map<string, number[]>();
  for (const { contractAddress, timestampSec } of requests) {
    const key = contractAddress ?? 'native';
    if (!byContract.has(key)) byContract.set(key, []);
    byContract.get(key)!.push(timestampSec);
  }
  const result = new Map<string, number>();
  const platformId = (platform || 'ethereum').trim().toLowerCase();

  for (const [contractKey, timestamps] of byContract) {
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const from = (minTs - 3600) * 1000;
    const to = (maxTs + 3600) * 1000;

    let points: HistoricalPricePoint[];
    if (contractKey === 'native') {
      const { baseUrl, apiKey } = await import('./coingecko').then((m) => m.getCoinGeckoConfig());
      const url = `${baseUrl}/coins/ethereum/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
      const headers: Record<string, string> = {};
      if (apiKey) headers['x-cg-pro-api-key'] = apiKey;
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = (await res.json()) as { prices?: [number, number][] };
      points = (data.prices ?? []).map(([ts, p]) => ({ timestampMs: ts, priceUsd: p }));
    } else {
      points = await fetchHistoricalPricesByContract(
        platformId,
        contractKey,
        from,
        to
      );
    }
    for (const timestampSec of timestamps) {
      const price = nearestPriceAtOrBefore(points, timestampSec * 1000);
      if (price != null) result.set(`${contractKey}|${timestampSec}`, price);
    }
  }
  return result;
}

/**
 * Compute cost basis for one tx: either Type 1 (market value at receipt) or Type 2 (USD out allocated to inbounds).
 */
function computeTxLots(
  txHash: string,
  tokenDeltas: TokenDelta[],
  ethDelta: { wei: string; direction: 'in' | 'out' } | null,
  timestampSec: number,
  priceAtTime: (contractAddress: string | null) => number | null
): ComputedLot[] {
  const inflows = tokenDeltas.filter((d) => d.direction === 'in');
  const outflows = tokenDeltas.filter((d) => d.direction === 'out');
  const ethOutWei = ethDelta?.direction === 'out' ? ethDelta.wei : '0';
  const ethOutQty = parseTokenValue(ethOutWei, 18);
  const hasOutflow = outflows.length > 0 || (ethOutQty > 0);

  if (inflows.length === 0) return [];

  if (!hasOutflow) {
    const lots: ComputedLot[] = [];
    for (const d of inflows) {
      const price = priceAtTime(d.contractAddress);
      const costBasisUsdTotal = price != null ? d.qty * price : null;
      lots.push({
        assetId: d.assetId,
        contractAddress: d.contractAddress,
        timestamp: new Date(timestampSec * 1000).toISOString(),
        qtyIn: d.qty,
        costBasisUsdTotal,
        source: 'transfer',
      });
    }
    return lots;
  }

  let usdOutTotal = 0;
  if (ethOutQty > 0) {
    const ethPrice = priceAtTime(null);
    if (ethPrice != null) usdOutTotal += ethOutQty * ethPrice;
  }
  for (const d of outflows) {
    const price = priceAtTime(d.contractAddress);
    if (price != null) usdOutTotal += d.qty * price;
  }

  const inboundUsdValues = inflows.map((d) => {
    const price = priceAtTime(d.contractAddress);
    return price != null ? d.qty * price : 0;
  });
  const totalInboundUsd = inboundUsdValues.reduce((a, b) => a + b, 0);

  const lots: ComputedLot[] = [];
  if (totalInboundUsd <= 0) {
    for (const d of inflows) {
      lots.push({
        assetId: d.assetId,
        contractAddress: d.contractAddress,
        timestamp: new Date(timestampSec * 1000).toISOString(),
        qtyIn: d.qty,
        costBasisUsdTotal: null,
        source: 'swap',
      });
    }
    return lots;
  }
  for (let i = 0; i < inflows.length; i++) {
    const d = inflows[i];
    const share = inboundUsdValues[i] / totalInboundUsd;
    const costBasisUsdTotal = usdOutTotal * share;
    lots.push({
      assetId: d.assetId,
      contractAddress: d.contractAddress,
      timestamp: new Date(timestampSec * 1000).toISOString(),
      qtyIn: d.qty,
      costBasisUsdTotal,
      source: 'swap',
    });
  }
  return lots;
}

export interface BuildLotsFromChainInput {
  walletAddress: string;
  chainId?: number;
  platform?: string;
  /** Map assetId (chainId:contractAddress or chainId:) -> holdingId. Only these assets get lots. */
  holdingIdByAssetId: Map<string, string>;
}

export interface BuildLotsFromChainResult {
  lots: CreateLotInput[];
  unpricedCount: number;
}

/**
 * Build lots from on-chain transfer history. Fetches tokentx + txlist, groups by tx,
 * classifies Type 1 vs Type 2, batches historical price lookups, returns CreateLotInput[]
 * for assetIds present in holdingIdByAssetId.
 */
export async function buildLotsFromChain(input: BuildLotsFromChainInput): Promise<BuildLotsFromChainResult> {
  const {
    walletAddress,
    chainId = CHAIN_ID_ETH,
    platform = 'ethereum',
    holdingIdByAssetId,
  } = input;

  const [tokenRows, normalRows] = await Promise.all([
    fetchTokenTransfers(walletAddress, { chainId, sort: 'asc' }),
    fetchNormalTransactions(walletAddress, { chainId, sort: 'asc' }),
  ]);

  const byTx = groupTransfersByTx(walletAddress, chainId, tokenRows, normalRows);

  const priceRequests: { contractAddress: string | null; timestampSec: number }[] = [];
  for (const [, group] of byTx) {
    const ts = parseInt(group.timestamp, 10);
    if (Number.isNaN(ts)) continue;
    for (const d of group.tokenDeltas) {
      priceRequests.push({ contractAddress: d.contractAddress, timestampSec: ts });
    }
    if (group.ethDelta) {
      priceRequests.push({ contractAddress: null, timestampSec: ts });
    }
  }

  const priceMap = await batchHistoricalPrices(platform, priceRequests);

  const allComputed: ComputedLot[] = [];
  for (const [, group] of byTx) {
    const ts = parseInt(group.timestamp, 10);
    if (Number.isNaN(ts)) continue;
    const priceAtTimeForTx = (contract: string | null): number | null => {
      const k = contract ?? 'native';
      return priceMap.get(`${k}|${ts}`) ?? null;
    };
    const lots = computeTxLots(
      '',
      group.tokenDeltas,
      group.ethDelta,
      ts,
      priceAtTimeForTx
    );
    allComputed.push(...lots);
  }

  let unpricedCount = 0;
  const lots: CreateLotInput[] = [];
  for (const c of allComputed) {
    const holdingId = holdingIdByAssetId.get(c.assetId);
    if (!holdingId) continue;
    if (c.costBasisUsdTotal == null) unpricedCount++;
    lots.push({
      holdingId,
      assetId: c.assetId,
      timestamp: c.timestamp,
      qtyIn: c.qtyIn,
      costBasisUsdTotal: c.costBasisUsdTotal ?? undefined,
      source: c.source,
    });
  }

  return { lots, unpricedCount };
}
