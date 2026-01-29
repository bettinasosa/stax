import type { SQLiteDatabase } from 'expo-sqlite';
import {
  eventSchema,
  type Event,
  type CreateEventInput,
  type UpdateEventInput,
} from './schemas';
import { generateId } from '../utils/uuid';

const SELECT_COLS =
  'id, holding_id as holdingId, kind, date, amount, currency, remind_days_before as remindDaysBefore, note';

function rowToEvent(row: Record<string, unknown>): Event {
  return eventSchema.parse(row);
}

/**
 * Get all events for a holding.
 */
export async function getByHoldingId(
  db: SQLiteDatabase,
  holdingId: string
): Promise<Event[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM event WHERE holding_id = ? ORDER BY date ASC`,
    [holdingId]
  );
  return rows.map(rowToEvent);
}

/**
 * Get event by id.
 */
export async function getById(
  db: SQLiteDatabase,
  id: string
): Promise<Event | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM event WHERE id = ?`,
    [id]
  );
  return row ? rowToEvent(row) : null;
}

/**
 * Create an event.
 */
export async function create(
  db: SQLiteDatabase,
  input: CreateEventInput
): Promise<Event> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO event (id, holding_id, kind, date, amount, currency, remind_days_before, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.holdingId,
      input.kind,
      input.date,
      input.amount ?? null,
      input.currency ?? null,
      input.remindDaysBefore ?? 3,
      input.note ?? null,
    ]
  );
  const created = await getById(db, id);
  if (!created) throw new Error('Event create failed');
  return created;
}

/**
 * Update an event (partial).
 */
export async function update(
  db: SQLiteDatabase,
  id: string,
  input: UpdateEventInput
): Promise<Event | null> {
  const existing = await getById(db, id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.kind !== undefined) {
    updates.push('kind = ?');
    values.push(input.kind);
  }
  if (input.date !== undefined) {
    updates.push('date = ?');
    values.push(input.date);
  }
  if (input.amount !== undefined) {
    updates.push('amount = ?');
    values.push(input.amount);
  }
  if (input.currency !== undefined) {
    updates.push('currency = ?');
    values.push(input.currency);
  }
  if (input.remindDaysBefore !== undefined) {
    updates.push('remind_days_before = ?');
    values.push(input.remindDaysBefore);
  }
  if (input.note !== undefined) {
    updates.push('note = ?');
    values.push(input.note);
  }

  if (updates.length === 0) return existing;
  values.push(id);
  await db.runAsync(
    `UPDATE event SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  return getById(db, id);
}

/**
 * Delete an event.
 */
export async function remove(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM event WHERE id = ?', [id]);
}

/**
 * Count events (reminder schedules) for a portfolio (via holdings).
 */
export async function countSchedulesByPortfolioId(
  db: SQLiteDatabase,
  portfolioId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT e.id) as count FROM event e
     JOIN holding h ON e.holding_id = h.id WHERE h.portfolio_id = ?`,
    [portfolioId]
  );
  return row?.count ?? 0;
}
