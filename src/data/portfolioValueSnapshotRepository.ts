import type { SQLiteDatabase } from 'expo-sqlite';
import { portfolioValueSnapshotSchema, type PortfolioValueSnapshot } from './schemas';
import { generateId } from '../utils/uuid';

const KEEP_DAYS = 30;

/**
 * Insert a portfolio value snapshot (e.g. on refresh). Prunes snapshots older than KEEP_DAYS.
 */
export async function insert(
  db: SQLiteDatabase,
  data: {
    portfolioId: string;
    timestamp: string;
    valueBase: number;
    baseCurrency: string;
  }
): Promise<void> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO portfolio_value_snapshot (id, portfolio_id, timestamp, value_base, base_currency) VALUES (?, ?, ?, ?, ?)`,
    [id, data.portfolioId, data.timestamp, data.valueBase, data.baseCurrency]
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffIso = cutoff.toISOString();
  await db.runAsync(
    `DELETE FROM portfolio_value_snapshot WHERE timestamp < ?`,
    [cutoffIso]
  );
}

/**
 * Get snapshots for a portfolio since the given ISO timestamp (e.g. 7 days ago), ordered by timestamp asc.
 */
export async function getByPortfolioSince(
  db: SQLiteDatabase,
  portfolioId: string,
  sinceIso: string
): Promise<PortfolioValueSnapshot[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, portfolio_id as portfolioId, timestamp, value_base as valueBase, base_currency as baseCurrency
     FROM portfolio_value_snapshot
     WHERE portfolio_id = ? AND timestamp >= ?
     ORDER BY timestamp ASC`,
    [portfolioId, sinceIso]
  );
  return rows.map((r) => portfolioValueSnapshotSchema.parse(r));
}
