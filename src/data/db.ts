import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'stax.db';
export { DB_NAME };

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS portfolio (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS holding (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL REFERENCES portfolio(id),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT,
    quantity REAL,
    cost_basis REAL,
    cost_basis_currency TEXT,
    manual_value REAL,
    currency TEXT NOT NULL,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_holding_portfolio ON holding(portfolio_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS price_point (
    symbol TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (symbol, timestamp)
  );
  CREATE INDEX IF NOT EXISTS idx_price_point_symbol ON price_point(symbol);
  `,
  `
  CREATE TABLE IF NOT EXISTS event (
    id TEXT PRIMARY KEY NOT NULL,
    holding_id TEXT NOT NULL REFERENCES holding(id),
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL,
    currency TEXT,
    remind_days_before INTEGER NOT NULL DEFAULT 3,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_event_holding ON event(holding_id);
  `,
];

/** Valid UUID v4 format so Zod .uuid() accepts it. */
export const DEFAULT_PORTFOLIO_ID = '00000000-0000-4000-8000-000000000001';

const LEGACY_PORTFOLIO_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Run all migrations and seed default portfolio if empty.
 * Fixes legacy DB that used an invalid UUID for the default portfolio.
 */
export async function initDb(db: SQLiteDatabase): Promise<void> {
  for (const sql of MIGRATIONS) {
    await db.execAsync(sql);
  }
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM portfolio'
  );
  if (row?.count === 0) {
    await db.runAsync(
      `INSERT INTO portfolio (id, name, base_currency, created_at) VALUES (?, ?, ?, ?)`,
      [DEFAULT_PORTFOLIO_ID, 'My Portfolio', 'USD', new Date().toISOString()]
    );
  } else {
    const legacy = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM portfolio WHERE id = ?',
      [LEGACY_PORTFOLIO_ID]
    );
    if (legacy) {
      await db.runAsync('UPDATE holding SET portfolio_id = ? WHERE portfolio_id = ?', [
        DEFAULT_PORTFOLIO_ID,
        LEGACY_PORTFOLIO_ID,
      ]);
      await db.runAsync('UPDATE portfolio SET id = ? WHERE id = ?', [
        DEFAULT_PORTFOLIO_ID,
        LEGACY_PORTFOLIO_ID,
      ]);
    }
  }
}
