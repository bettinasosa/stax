/**
 * Supported price feeds for listed assets. Shown in Settings or Add flow.
 */
export const SUPPORTED_PRICE_FEEDS = [
  'Stocks & ETFs: Alpha Vantage (optional API key). Without key, demo values may be used.',
  'Crypto: CoinGecko (no key required).',
  'Metal: Gold (XAU) via CoinGecko or fallback.',
].join('\n');
