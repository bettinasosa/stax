import type { SQLiteDatabase } from 'expo-sqlite';
import { portfolioSchema, type Portfolio, type CreatePortfolioInput } from './schemas';
import { generateId } from '../utils/uuid';

const SELECT_COLS =
  'id, name, base_currency as baseCurrency, created_at as createdAt';

function rowToPortfolio(row: Record<string, unknown>): Portfolio {
  return portfolioSchema.parse(row);
}

/**
 * Get all portfolios.
 */
export async function getAll(db: SQLiteDatabase): Promise<Portfolio[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM portfolio ORDER BY created_at ASC`
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
    `INSERT INTO portfolio (id, name, base_currency, created_at) VALUES (?, ?, ?, ?)`,
    [id, input.name, input.baseCurrency, createdAt]
  );
  return portfolioSchema.parse({
    id,
    name: input.name,
    baseCurrency: input.baseCurrency,
    createdAt,
  });
}

/**
 * Update portfolio (name, baseCurrency).
 */
export async function update(
  db: SQLiteDatabase,
  id: string,
  updates: { name?: string; baseCurrency?: string }
): Promise<Portfolio | null> {
  const existing = await getById(db, id);
  if (!existing) return null;
  const updatesList: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) {
    updatesList.push('name = ?');
    values.push(updates.name);
  }
  if (updates.baseCurrency !== undefined) {
    updatesList.push('base_currency = ?');
    values.push(updates.baseCurrency);
  }
  if (updatesList.length === 0) return existing;
  values.push(id);
  await db.runAsync(
    `UPDATE portfolio SET ${updatesList.join(', ')} WHERE id = ?`,
    values
  );
  return getById(db, id);
}
