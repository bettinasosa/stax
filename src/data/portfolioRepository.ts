import type { SQLiteDatabase } from 'expo-sqlite';
import { portfolioSchema, type Portfolio, type CreatePortfolioInput } from './schemas';
import { generateId } from '../utils/uuid';

const SELECT_COLS =
  'id, name, base_currency as baseCurrency, created_at as createdAt, archived_at as archivedAt';

function rowToPortfolio(row: Record<string, unknown>): Portfolio {
  return portfolioSchema.parse(row);
}

/**
 * Get all portfolios (including archived).
 */
export async function getAll(db: SQLiteDatabase): Promise<Portfolio[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM portfolio ORDER BY created_at ASC`
  );
  return rows.map(rowToPortfolio);
}

/**
 * Get active (non-archived) portfolios for selection.
 */
export async function listActive(db: SQLiteDatabase): Promise<Portfolio[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM portfolio WHERE archived_at IS NULL ORDER BY created_at ASC`
  );
  return rows.map(rowToPortfolio);
}

/**
 * Get portfolio by id.
 */
export async function getById(
  db: SQLiteDatabase,
  id: string
): Promise<Portfolio | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM portfolio WHERE id = ?`,
    [id]
  );
  return row ? rowToPortfolio(row) : null;
}

/**
 * Create a portfolio.
 */
export async function create(
  db: SQLiteDatabase,
  input: CreatePortfolioInput
): Promise<Portfolio> {
  const id = generateId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO portfolio (id, name, base_currency, created_at, archived_at) VALUES (?, ?, ?, ?, NULL)`,
    [id, input.name, input.baseCurrency, createdAt]
  );
  return portfolioSchema.parse({
    id,
    name: input.name,
    baseCurrency: input.baseCurrency,
    createdAt,
    archivedAt: null,
  });
}

/**
 * Update portfolio (name, baseCurrency).
 */
export async function update(
  db: SQLiteDatabase,
  id: string,
  updates: { name?: string; baseCurrency?: string; archivedAt?: string | null }
): Promise<Portfolio | null> {
  const existing = await getById(db, id);
  if (!existing) return null;
  const updatesList: string[] = [];
  const values: (string | null)[] = [];
  if (updates.name !== undefined) {
    updatesList.push('name = ?');
    values.push(updates.name);
  }
  if (updates.baseCurrency !== undefined) {
    updatesList.push('base_currency = ?');
    values.push(updates.baseCurrency);
  }
  if (updates.archivedAt !== undefined) {
    updatesList.push('archived_at = ?');
    values.push(updates.archivedAt);
  }
  if (updatesList.length === 0) return existing;
  values.push(id);
  await db.runAsync(
    `UPDATE portfolio SET ${updatesList.join(', ')} WHERE id = ?`,
    ...values
  );
  return getById(db, id);
}

/**
 * Archive a portfolio (soft delete). Does not remove holdings or snapshots.
 */
export async function archive(
  db: SQLiteDatabase,
  id: string
): Promise<Portfolio | null> {
  const archivedAt = new Date().toISOString();
  return update(db, id, { archivedAt });
}
