import type { SQLiteDatabase } from 'expo-sqlite';
import { pricePointSchema, type PricePoint } from './schemas';

/**
 * Get latest price for a symbol.
 */
export async function getLatestBySymbol(
  db: SQLiteDatabase,
  symbol: string
): Promise<PricePoint | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT symbol, timestamp, price, currency, source, previous_close as previousClose, change_percent as changePercent
     FROM price_point WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1`,
    [symbol]
  );
  return row ? pricePointSchema.parse(row) : null;
}

/**
 * Get latest prices for multiple symbols.
 */
export async function getLatestBySymbols(
  db: SQLiteDatabase,
  symbols: string[]
): Promise<Map<string, PricePoint>> {
  const result = new Map<string, PricePoint>();
  if (symbols.length === 0) return result;
  const placeholders = symbols.map(() => '?').join(',');
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT symbol, timestamp, price, currency, source, previous_close as previousClose, change_percent as changePercent FROM price_point p
     WHERE p.symbol IN (${placeholders})
     AND p.timestamp = (SELECT MAX(timestamp) FROM price_point WHERE symbol = p.symbol)`,
    symbols
  );
  for (const row of rows) {
    const pp = pricePointSchema.parse(row);
    result.set(pp.symbol, pp);
  }
  return result;
}

/**
 * Upsert a price point (insert or replace by symbol+timestamp).
 */
export async function upsert(
  db: SQLiteDatabase,
  point: PricePoint
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO price_point (symbol, timestamp, price, currency, source, previous_close, change_percent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      point.symbol,
      point.timestamp,
      point.price,
      point.currency,
      point.source,
      point.previousClose ?? null,
      point.changePercent ?? null,
    ]
  );
}

/**
 * Upsert multiple price points.
 */
export async function upsertMany(
  db: SQLiteDatabase,
  points: PricePoint[]
): Promise<void> {
  for (const point of points) {
    await upsert(db, point);
  }
}
