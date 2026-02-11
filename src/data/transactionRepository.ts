/**
 * Transaction repository: CRUD for sell and dividend records.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { transactionSchema, createTransactionSchema } from './schemas';
import type { Transaction, CreateTransactionInput } from './schemas';
import { generateId } from '../utils/uuid';

function rowToTransaction(row: Record<string, unknown>): Transaction | null {
  const mapped = {
    id: row.id,
    holdingId: row.holdingId,
    type: row.type,
    date: row.date,
    quantity: row.quantity ?? null,
    pricePerUnit: row.pricePerUnit ?? null,
    totalAmount: row.totalAmount,
    currency: row.currency,
    realizedGainLoss: row.realizedGainLoss ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
  };
  const parsed = transactionSchema.safeParse(mapped);
  return parsed.success ? parsed.data : null;
}

const SELECT_ALL = `
  SELECT
    id,
    holding_id AS holdingId,
    type,
    date,
    quantity,
    price_per_unit AS pricePerUnit,
    total_amount AS totalAmount,
    currency,
    realized_gain_loss AS realizedGainLoss,
    note,
    created_at AS createdAt
  FROM "transaction"
`;

export async function getById(db: SQLiteDatabase, id: string): Promise<Transaction | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `${SELECT_ALL} WHERE id = ?`,
    [id],
  );
  return row ? rowToTransaction(row) : null;
}

export async function getByHoldingId(db: SQLiteDatabase, holdingId: string): Promise<Transaction[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_ALL} WHERE holding_id = ? ORDER BY date DESC`,
    [holdingId],
  );
  return rows.map(rowToTransaction).filter((t): t is Transaction => t !== null);
}

export async function getByPortfolioId(db: SQLiteDatabase, portfolioId: string): Promise<Transaction[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `${SELECT_ALL} WHERE holding_id IN (SELECT id FROM holding WHERE portfolio_id = ?) ORDER BY date DESC`,
    [portfolioId],
  );
  return rows.map(rowToTransaction).filter((t): t is Transaction => t !== null);
}

export async function create(db: SQLiteDatabase, input: CreateTransactionInput): Promise<Transaction> {
  const parsed = createTransactionSchema.parse(input);
  const id = generateId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO "transaction" (id, holding_id, type, date, quantity, price_per_unit, total_amount, currency, realized_gain_loss, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.holdingId,
      parsed.type,
      parsed.date,
      parsed.quantity ?? null,
      parsed.pricePerUnit ?? null,
      parsed.totalAmount,
      parsed.currency,
      parsed.realizedGainLoss ?? null,
      parsed.note ?? null,
      createdAt,
    ] as (string | number | null)[],
  );
  const created = await getById(db, id);
  if (!created) throw new Error('Transaction create failed');
  return created;
}

export async function remove(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM "transaction" WHERE id = ?', [id]);
}

export async function deleteByHoldingId(db: SQLiteDatabase, holdingId: string): Promise<void> {
  await db.runAsync('DELETE FROM "transaction" WHERE holding_id = ?', [holdingId]);
}
