/**
 * Liability repository: CRUD for debts and obligations.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { liabilitySchema, createLiabilitySchema, updateLiabilitySchema } from './schemas';
import type { Liability, CreateLiabilityInput, UpdateLiabilityInput } from './schemas';
import { generateId } from '../utils/uuid';

function rowToLiability(row: Record<string, unknown>): Liability | null {
  const mapped = {
    id: row.id,
    portfolioId: row.portfolioId,
    name: row.name,
    type: row.type,
    balance: row.balance,
    currency: row.currency,
    interestRate: row.interestRate ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  const parsed = liabilitySchema.safeParse(mapped);
  return parsed.success ? parsed.data : null;
}

const SELECT_ALL = `
  SELECT
    id,
    portfolio_id AS portfolioId,
    name,
    type,
    balance,
    currency,
    interest_rate AS interestRate,
    note,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM liability
`;

export async function getById(db: SQLiteDatabase, id: string): Promise<Liability | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `${SELECT_ALL} WHERE id = ?`,
    [id],
  );
  return row ? rowToLiability(row) : null;
}

export async function getByPortfolioId(db: SQLiteDatabase, portfolioId: string): Promise<Liability[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_ALL} WHERE portfolio_id = ? ORDER BY created_at DESC`,
    [portfolioId],
  );
  return rows.map(rowToLiability).filter((l): l is Liability => l !== null);
}

export async function create(db: SQLiteDatabase, input: CreateLiabilityInput): Promise<Liability> {
  const parsed = createLiabilitySchema.parse(input);
  const id = generateId();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO liability (id, portfolio_id, name, type, balance, currency, interest_rate, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.portfolioId,
      parsed.name,
      parsed.type,
      parsed.balance,
      parsed.currency,
      parsed.interestRate ?? null,
      parsed.note ?? null,
      now,
      now,
    ] as (string | number | null)[],
  );
  const created = await getById(db, id);
  if (!created) throw new Error('Liability create failed');
  return created;
}

export async function update(db: SQLiteDatabase, id: string, input: UpdateLiabilityInput): Promise<Liability | null> {
  const parsed = updateLiabilitySchema.parse(input);
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (parsed.name !== undefined) { sets.push('name = ?'); values.push(parsed.name); }
  if (parsed.type !== undefined) { sets.push('type = ?'); values.push(parsed.type); }
  if (parsed.balance !== undefined) { sets.push('balance = ?'); values.push(parsed.balance); }
  if (parsed.currency !== undefined) { sets.push('currency = ?'); values.push(parsed.currency); }
  if (parsed.interestRate !== undefined) { sets.push('interest_rate = ?'); values.push(parsed.interestRate ?? null); }
  if (parsed.note !== undefined) { sets.push('note = ?'); values.push(parsed.note ?? null); }

  values.push(id);
  await db.runAsync(`UPDATE liability SET ${sets.join(', ')} WHERE id = ?`, values);
  return getById(db, id);
}

export async function remove(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM liability WHERE id = ?', [id]);
}

export async function deleteByPortfolioId(db: SQLiteDatabase, portfolioId: string): Promise<void> {
  await db.runAsync('DELETE FROM liability WHERE portfolio_id = ?', [portfolioId]);
}
