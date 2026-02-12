/**
 * Supabase Price Cache: client-side integration for the server-side price cache.
 *
 * Architecture:
 * - The Edge Function `refresh-prices` updates `price_cache` on a schedule.
 * - Clients read from `price_cache` first (fast, no rate limit concern).
 * - If Supabase is not configured or data is stale, clients fall back to direct API calls.
 * - After fetching from APIs, clients write prices back to `price_cache` via the
 *   `upsert_price` Postgres function (SECURITY DEFINER — bypasses RLS).
 * - Pro users can trigger on-demand refreshes via the Edge Function.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedPrice {
  symbol: string;
  price: number;
  currency: string;
  previousClose: number | null;
  changePercent: number | null;
  assetType: string;
  source: string;
  updatedAt: string;
}

interface PriceCacheRow {
  symbol: string;
  price: number;
  currency: string;
  previous_close: number | null;
  change_percent: number | null;
  asset_type: string;
  source: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Staleness thresholds
// ---------------------------------------------------------------------------

/** How old a cached price can be before we consider it stale (in minutes). */
const STALENESS_THRESHOLDS = {
  /** During market hours, prices older than this are stale. */
  marketOpen: 15,
  /** Outside market hours, cached prices are valid much longer. */
  marketClosed: 360, // 6 hours
  /** Crypto prices (24/7 market) staleness threshold. */
  crypto: 30,
  /** Metal prices staleness threshold. */
  metal: 60,
} as const;

/** Check if US market is roughly open (Mon-Fri, ~9:30 AM - 4 PM ET). */
function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // Weekend
  // Rough ET approximation: UTC-5 (EST) or UTC-4 (EDT)
  const etHour = (now.getUTCHours() - 5 + 24) % 24;
  return etHour >= 9 && etHour < 16;
}

/** Check if a cached price is fresh enough to use. */
function isFresh(row: PriceCacheRow): boolean {
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  const ageMinutes = ageMs / (1000 * 60);

  switch (row.asset_type) {
    case 'crypto':
      return ageMinutes < STALENESS_THRESHOLDS.crypto;
    case 'metal':
      return ageMinutes < STALENESS_THRESHOLDS.metal;
    default:
      return ageMinutes < (isMarketOpen()
        ? STALENESS_THRESHOLDS.marketOpen
        : STALENESS_THRESHOLDS.marketClosed);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single price from the Supabase cache.
 * Returns null if Supabase is not configured, no cache entry exists, or data is stale.
 */
export async function getCachedPrice(symbol: string): Promise<CachedPrice | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('price_cache')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (error || !data) return null;

    const row = data as PriceCacheRow;
    if (!isFresh(row)) return null;

    return mapRow(row);
  } catch {
    return null;
  }
}

/**
 * Fetch prices for multiple symbols from the Supabase cache.
 * Returns a Map of symbol → CachedPrice (only fresh entries included).
 */
export async function getCachedPrices(symbols: string[]): Promise<Map<string, CachedPrice>> {
  const result = new Map<string, CachedPrice>();
  if (!isSupabaseConfigured() || !supabase || symbols.length === 0) return result;

  try {
    const upperSymbols = symbols.map((s) => s.toUpperCase());
    const { data, error } = await supabase
      .from('price_cache')
      .select('*')
      .in('symbol', upperSymbols);

    if (error || !data) return result;

    for (const row of data as PriceCacheRow[]) {
      if (isFresh(row)) {
        result.set(row.symbol, mapRow(row));
      }
    }

    return result;
  } catch {
    return result;
  }
}

/**
 * Register symbols that this user's portfolio tracks.
 * Calls the Edge Function to ensure these symbols are in `tracked_symbols`.
 * This is called when the user adds/removes holdings.
 */
export async function syncTrackedSymbols(
  holdings: Array<{ symbol: string; type: string; metadata?: Record<string, string> }>,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const rows = holdings.map((h) => ({
      symbol: h.symbol.toUpperCase(),
      asset_type: h.type,
      metadata: h.metadata ?? null,
      ref_count: 1,
    }));

    // Upsert into tracked_symbols — always update metadata so new
    // providerId / contractAddress values propagate to the Edge Function.
    await supabase.from('tracked_symbols').upsert(rows, {
      onConflict: 'symbol',
      ignoreDuplicates: false,
    });
  } catch (err) {
    console.warn('[SupabaseCache] Failed to sync tracked symbols:', err);
  }
}

/**
 * Trigger an on-demand price refresh via the Edge Function.
 * Intended for Pro users who want real-time prices.
 * @param symbols - Optional subset of symbols to refresh. If omitted, refreshes all.
 */
export async function triggerPriceRefresh(symbols?: string[]): Promise<{
  updated: number;
  total: number;
  errors?: string[];
} | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke('refresh-prices', {
      body: symbols ? { symbols } : {},
    });

    if (error) {
      console.warn('[SupabaseCache] Edge Function error:', error);
      return null;
    }

    return data as { updated: number; total: number; errors?: string[] };
  } catch (err) {
    console.warn('[SupabaseCache] Failed to trigger refresh:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write API — uses `upsert_price` SECURITY DEFINER function to bypass RLS
// ---------------------------------------------------------------------------

export interface PriceCacheWrite {
  symbol: string;
  price: number;
  currency: string;
  previousClose?: number | null;
  changePercent?: number | null;
  assetType: string;
  source: string;
}

/**
 * Write a single price to the Supabase `price_cache` table.
 * Uses the `upsert_price` Postgres function (SECURITY DEFINER) so it
 * works from the anon role without needing service_role credentials.
 */
export async function writeCachedPrice(entry: PriceCacheWrite): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    await supabase.rpc('upsert_price', {
      p_symbol: entry.symbol.toUpperCase(),
      p_price: entry.price,
      p_currency: entry.currency,
      p_previous_close: entry.previousClose ?? null,
      p_change_percent: entry.changePercent ?? null,
      p_asset_type: entry.assetType,
      p_source: entry.source,
    });
  } catch {
    // Non-critical: Supabase write failure doesn't block the user
  }
}

/**
 * Batch-write multiple prices to the Supabase `price_cache` table.
 * Fires all RPCs in parallel for speed. Failures are silently ignored
 * (prices are still stored locally in SQLite as a fallback).
 */
export async function writeCachedPrices(entries: PriceCacheWrite[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || entries.length === 0) return;
  try {
    await Promise.allSettled(
      entries.map((entry) =>
        supabase!.rpc('upsert_price', {
          p_symbol: entry.symbol.toUpperCase(),
          p_price: entry.price,
          p_currency: entry.currency,
          p_previous_close: entry.previousClose ?? null,
          p_change_percent: entry.changePercent ?? null,
          p_asset_type: entry.assetType,
          p_source: entry.source,
        })
      )
    );
  } catch {
    // Non-critical
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: PriceCacheRow): CachedPrice {
  return {
    symbol: row.symbol,
    price: row.price,
    currency: row.currency,
    previousClose: row.previous_close,
    changePercent: row.change_percent,
    assetType: row.asset_type,
    source: row.source,
    updatedAt: row.updated_at,
  };
}
