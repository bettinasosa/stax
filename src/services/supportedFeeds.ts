/**
 * Supported price feeds and import sources for listed assets. Shown in Settings or Add flow.
 */
export const SUPPORTED_PRICE_FEEDS = [
  'Stocks & ETFs: Finnhub (symbol search, quote with latest/previous close/daily change %). Optional API key; free tier has per-minute limits. Fallback: Alpha Vantage.',
  'Crypto: CoinGecko (no key required; optional API key for higher rate limits). Optional fallback: CoinMarketCap (API key required).',
  'Crypto wallet import: Ethplorer (Ethereum address → token balances). Optional API key for higher limits.',
  'Metal: Gold (XAU) via CoinGecko or fallback.',
].join('\n');
