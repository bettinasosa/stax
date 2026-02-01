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
  `ALTER TABLE price_point ADD COLUMN previous_close REAL;`,
  `ALTER TABLE price_point ADD COLUMN change_percent REAL;`,
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
  `
  CREATE TABLE IF NOT EXISTS lot (
    id TEXT PRIMARY KEY NOT NULL,
    holding_id TEXT NOT NULL REFERENCES holding(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    qty_in REAL NOT NULL,
    cost_basis_usd_total REAL,
    source TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lot_holding ON lot(holding_id);
  CREATE INDEX IF NOT EXISTS idx_lot_asset ON lot(asset_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS portfolio_value_snapshot (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    value_base REAL NOT NULL,
    base_currency TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_portfolio_value_snapshot_portfolio_time ON portfolio_value_snapshot(portfolio_id, timestamp);
  `,
];

/** Valid UUID v4 format so Zod .uuid() accepts it. */
export const DEFAULT_PORTFOLIO_ID = '00000000-0000-4000-8000-000000000001';

const LEGACY_PORTFOLIO_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Delete all user data (events, holdings, price points). Keeps the default portfolio so the app can start fresh.
 */
export async function clearAllData(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM event');
  await db.runAsync('DELETE FROM lot');
  await db.runAsync('DELETE FROM holding');
  await db.runAsync('DELETE FROM price_point');
  await db.runAsync('DELETE FROM portfolio_value_snapshot');
}

/**
 * Run all migrations and seed default portfolio if empty.
 * Fixes legacy DB that used an invalid UUID for the default portfolio.
 */
export async function initDb(db: SQLiteDatabase): Promise<void> {
  for (const sql of MIGRATIONS) {
    const isAlter = sql.trim().startsWith('ALTER TABLE');
    if (isAlter) {
      try {
        await db.runAsync(sql);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('duplicate column name')) throw e;
      }
    } else {
      await db.execAsync(sql);
    }
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
