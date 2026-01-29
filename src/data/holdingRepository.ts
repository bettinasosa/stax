import type { SQLiteDatabase } from 'expo-sqlite';
import {
  holdingSchema,
  type Holding,
  type CreateListedHoldingInput,
  type CreateNonListedHoldingInput,
  type UpdateHoldingInput,
} from './schemas';
import { generateId } from '../utils/uuid';

const SELECT_COLS = `id, portfolio_id as portfolioId, type, name, symbol, quantity, cost_basis as costBasis,
  cost_basis_currency as costBasisCurrency, manual_value as manualValue, currency, metadata`;

function parseMetadata(meta: string | null): Holding['metadata'] {
  if (meta == null || meta === '') return undefined;
  try {
    return JSON.parse(meta) as Holding['metadata'];
  } catch {
    return undefined;
  }
}

function rowToHolding(row: Record<string, unknown>): Holding {
  const metadata = parseMetadata(row.metadata as string | null);
  return holdingSchema.parse({ ...row, metadata });
}

/**
 * Get all holdings for a portfolio.
 */
export async function getByPortfolioId(
  db: SQLiteDatabase,
  portfolioId: string
): Promise<Holding[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM holding WHERE portfolio_id = ? ORDER BY name ASC`,
    [portfolioId]
  );
  return rows.map(rowToHolding);
}

/**
 * Get holding by id.
 */
export async function getById(
  db: SQLiteDatabase,
  id: string
): Promise<Holding | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM holding WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  return rowToHolding(row);
}

/**
 * Create a listed holding.
 */
export async function createListed(
  db: SQLiteDatabase,
  input: CreateListedHoldingInput
): Promise<Holding> {
  const id = generateId();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  await db.runAsync(
    `INSERT INTO holding (id, portfolio_id, type, name, symbol, quantity, cost_basis, cost_basis_currency, currency, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.portfolioId,
      input.type,
      input.name,
      input.symbol,
      input.quantity,
      input.costBasis ?? null,
      input.costBasisCurrency ?? null,
      input.currency,
      metadataJson,
    ]
  );
  return getById(db, id) as Promise<Holding>;
}

/**
 * Create a non-listed holding.
 */
export async function createNonListed(
  db: SQLiteDatabase,
  input: CreateNonListedHoldingInput
): Promise<Holding> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO holding (id, portfolio_id, type, name, manual_value, currency)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.portfolioId,
      input.type,
      input.name,
      input.manualValue,
      input.currency,
    ]
  );
  return getById(db, id) as Promise<Holding>;
}

/**
 * Update a holding (partial).
 */
export async function update(
  db: SQLiteDatabase,
  id: string,
  input: UpdateHoldingInput
): Promise<Holding | null> {
  const existing = await getById(db, id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.type !== undefined) {
    updates.push('type = ?');
    values.push(input.type);
  }
  if (input.symbol !== undefined) {
    updates.push('symbol = ?');
    values.push(input.symbol);
  }
  if (input.quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(input.quantity);
  }
  if (input.costBasis !== undefined) {
    updates.push('cost_basis = ?');
    values.push(input.costBasis);
  }
  if (input.costBasisCurrency !== undefined) {
    updates.push('cost_basis_currency = ?');
    values.push(input.costBasisCurrency);
  }
  if (input.manualValue !== undefined) {
    updates.push('manual_value = ?');
    values.push(input.manualValue);
  }
  if (input.currency !== undefined) {
    updates.push('currency = ?');
    values.push(input.currency);
  }
  if (input.metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(input.metadata ? JSON.stringify(input.metadata) : null);
  }

  if (updates.length === 0) return existing;
  values.push(id);
  await db.runAsync(
    `UPDATE holding SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  return getById(db, id);
}

/**
 * Delete a holding.
 */
export async function remove(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM holding WHERE id = ?', [id]);
}

/**
 * Count holdings for a portfolio.
 */
export async function countByPortfolioId(
  db: SQLiteDatabase,
  portfolioId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM holding WHERE portfolio_id = ?',
    [portfolioId]
  );
  return row?.count ?? 0;
}
