/**
 * Ethplorer API: fetch Ethereum address token balances for wallet import.
 * Uses getAddressInfo; supports free key (rate limited) or personal API key.
 * @see https://github.com/EverexIO/Ethplorer/wiki/Ethplorer-API
 */

const ETHPLORER_BASE = 'https://api.ethplorer.io';
const DEFAULT_API_KEY = 'freekey';

/** Minimum quantity to include (filter dust). */
const MIN_QUANTITY = 1e-10;

/** Parsed holding from Ethplorer suitable for creating a listed crypto holding. */
export interface WalletHolding {
  symbol: string;
  name: string;
  quantity: number;
}

interface EthplorerTokenInfo {
  symbol?: string;
  name?: string;
  decimals?: string;
  address?: string;
}

interface EthplorerTokenBalance {
  tokenInfo: EthplorerTokenInfo;
  balance?: number;
  rawBalance?: string;
}

interface EthplorerAddressResponse {
  address?: string;
  ETH?: {
    balance?: number;
    rawBalance?: string;
    price?: { rate?: number };
  };
  tokens?: EthplorerTokenBalance[];
  error?: { code?: number; message?: string };
}

/**
 * Validates an Ethereum address (0x prefix + 40 hex chars). Case-insensitive.
 */
export function isValidEthereumAddress(address: string): boolean {
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}

/**
 * Fetches all token balances for an Ethereum address from Ethplorer.
 * Returns native ETH plus ERC-20 tokens; filters out zero and dust amounts.
 */
export async function fetchWalletHoldings(address: string): Promise<WalletHolding[]> {
  const trimmed = address.trim();
  if (!isValidEthereumAddress(trimmed)) {
    throw new Error('Invalid Ethereum address');
  }

  const apiKey = process.env.EXPO_PUBLIC_ETHPLORER_API_KEY ?? DEFAULT_API_KEY;
  const url = `${ETHPLORER_BASE}/getAddressInfo/${trimmed}?apiKey=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch wallet data: ${res.status}`);
  }

  const data = (await res.json()) as EthplorerAddressResponse;

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const holdings: WalletHolding[] = [];

  // Native ETH
  const ethBalance = data.ETH?.balance ?? data.ETH?.rawBalance;
  if (ethBalance != null) {
    const q = typeof ethBalance === 'string' ? parseRawBalance(ethBalance, 18) : ethBalance;
    if (q >= MIN_QUANTITY) {
      holdings.push({ symbol: 'ETH', name: 'Ethereum', quantity: q });
    }
  }

  // ERC-20 tokens
  const tokens = data.tokens ?? [];
  for (const t of tokens) {
    const info = t.tokenInfo;
    const symbol = (info.symbol ?? 'UNKNOWN').trim().toUpperCase();
    const name = (info.name ?? symbol).trim();
    const decimals = parseInt(info.decimals ?? '18', 10);
    const raw = t.rawBalance ?? (t.balance != null ? String(t.balance) : null);
    if (!raw) continue;
    const quantity = parseRawBalance(raw, decimals);
    if (quantity < MIN_QUANTITY) continue;
    holdings.push({ symbol, name, quantity });
  }

  return holdings;
}

/**
 * Parse raw balance string (smallest units) to human quantity using decimals.
 */
function parseRawBalance(raw: string, decimals: number): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || decimals < 0) return 0;
  return n / Math.pow(10, decimals);
}
