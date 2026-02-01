/**
 * Etherscan API: ERC-20 token transfers (tokentx) and normal transactions (txlist) by address.
 * Used to build cost-basis lots from on-chain history. Rate limits apply; group and cache aggressively.
 * @see https://docs.etherscan.io/api-reference/endpoint/tokentx
 * @see https://docs.etherscan.io/api-reference/endpoint/txlist
 */

const DEFAULT_BASE = 'https://api.etherscan.io/api';
const CHAIN_ID_ETH = 1;

/** Single ERC-20 transfer from tokentx. */
export interface TokenTransferRow {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  contractAddress: string;
  value: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

/** Normal tx from txlist (ETH value in wei). */
export interface NormalTxRow {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
}

/** Normalized token delta: asset + quantity (positive = inflow to wallet). */
export interface TokenDelta {
  assetId: string;
  contractAddress: string | null;
  symbol: string;
  decimals: number;
  qty: number;
  /** Inflow to wallet (positive) or outflow (negative). */
  direction: 'in' | 'out';
}

/** Normalized ETH delta in a tx (wei as string for precision; direction relative to wallet). */
export interface EthDelta {
  wei: string;
  direction: 'in' | 'out';
}

function getBaseUrl(): string {
  return process.env.EXPO_PUBLIC_ETHERSCAN_API_URL?.trim() || DEFAULT_BASE;
}

function getApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_ETHERSCAN_API_KEY?.trim() || undefined;
}

/**
 * Fetches ERC-20 token transfers for an address. Paginated; use offset/sort to get full history.
 */
export async function fetchTokenTransfers(
  address: string,
  options: {
    chainId?: number;
    page?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
  } = {}
): Promise<TokenTransferRow[]> {
  const { page = 1, offset = 10000, sort = 'asc' } = options;
  const base = getBaseUrl();
  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address: address.trim(),
    page: String(page),
    offset: String(offset),
    sort,
  });
  const chainId = options.chainId ?? CHAIN_ID_ETH;
  if (chainId !== CHAIN_ID_ETH) {
    params.set('chainid', String(chainId));
  }
  const apiKey = getApiKey();
  if (apiKey) params.set('apikey', apiKey);

  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan tokentx: ${res.status}`);

  const data = (await res.json()) as {
    status: string;
    message?: string;
    result?: TokenTransferRow[] | string;
  };
  if (data.status !== '1' || !Array.isArray(data.result)) {
    const msg = typeof data.result === 'string' ? data.result : data.message ?? 'Unknown error';
    throw new Error(msg);
  }
  return data.result;
}

/**
 * Fetches normal transactions (ETH moves) for an address.
 */
export async function fetchNormalTransactions(
  address: string,
  options: {
    chainId?: number;
    page?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
  } = {}
): Promise<NormalTxRow[]> {
  const { page = 1, offset = 10000, sort = 'asc' } = options;
  const base = getBaseUrl();
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address: address.trim(),
    page: String(page),
    offset: String(offset),
    sort,
  });
  const chainId = options.chainId ?? CHAIN_ID_ETH;
  if (chainId !== CHAIN_ID_ETH) {
    params.set('chainid', String(chainId));
  }
  const apiKey = getApiKey();
  if (apiKey) params.set('apikey', apiKey);

  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan txlist: ${res.status}`);

  const data = (await res.json()) as {
    status: string;
    message?: string;
    result?: NormalTxRow[] | string;
  };
  if (data.status !== '1' || !Array.isArray(data.result)) {
    const msg = typeof data.result === 'string' ? data.result : data.message ?? 'Unknown error';
    throw new Error(msg);
  }
  return data.result;
}

/**
 * Parse raw token value to human quantity using decimals.
 */
export function parseTokenValue(raw: string, decimals: number): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || decimals < 0) return 0;
  return n / Math.pow(10, decimals);
}

/**
 * Build assetId for ERC-20 (chainId:contractAddress) or native (chainId:).
 */
export function assetIdFromContract(chainId: number, contractAddress: string | null): string {
  const addr = contractAddress?.trim().toLowerCase();
  return addr ? `${chainId}:${addr}` : `${chainId}:`;
}

/**
 * Group token transfers and normal txs by tx hash and compute per-tx deltas for the given wallet.
 * Wallet address is normalized to lowercase for comparison.
 */
export function groupTransfersByTx(
  walletAddress: string,
  chainId: number,
  tokenTransfers: TokenTransferRow[],
  normalTxs: NormalTxRow[]
): Map<
  string,
  { tokenDeltas: TokenDelta[]; ethDelta: EthDelta | null; timestamp: string }
> {
  const wallet = walletAddress.trim().toLowerCase();
  const byHash = new Map<
    string,
    { tokenDeltas: TokenDelta[]; ethDelta: EthDelta | null; timestamp: string }
  >();

  for (const row of tokenTransfers) {
    const from = row.from?.trim().toLowerCase();
    const to = row.to?.trim().toLowerCase();
    const decimals = parseInt(row.tokenDecimal ?? '18', 10);
    const qty = parseTokenValue(row.value, decimals);
    const contract = row.contractAddress?.trim().toLowerCase() ?? null;
    const assetId = assetIdFromContract(chainId, contract);
    const symbol = (row.tokenSymbol ?? 'UNKNOWN').trim();

    const direction: 'in' | 'out' = to === wallet ? 'in' : 'out';
    const signedQty = direction === 'in' ? qty : -qty;
    const delta: TokenDelta = {
      assetId,
      contractAddress: contract,
      symbol,
      decimals,
      qty: Math.abs(signedQty),
      direction,
    };

    const existing = byHash.get(row.hash);
    const timestamp = row.timeStamp;
    if (existing) {
      existing.tokenDeltas.push(delta);
      if (!existing.timestamp) existing.timestamp = timestamp;
    } else {
      byHash.set(row.hash, { tokenDeltas: [delta], ethDelta: null, timestamp });
    }
  }

  for (const row of normalTxs) {
    const from = row.from?.trim().toLowerCase();
    const to = row.to?.trim().toLowerCase();
    const valueWei = (row.value ?? '0').trim();
    if (valueWei === '0' || valueWei === '') continue;

    const direction: 'in' | 'out' = to === wallet ? 'in' : from === wallet ? 'out' : null;
    if (direction == null) continue;

    const ethDelta: EthDelta = { wei: valueWei, direction };

    const existing = byHash.get(row.hash);
    if (existing) {
      existing.ethDelta = ethDelta;
      if (!existing.timestamp) existing.timestamp = row.timeStamp;
    } else {
      byHash.set(row.hash, { tokenDeltas: [], ethDelta, timestamp: row.timeStamp });
    }
  }

  return byHash;
}
