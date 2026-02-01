import type { SQLiteDatabase } from 'expo-sqlite';
import { lotSchema, type Lot, type CreateLotInput } from './schemas';
import { generateId } from '../utils/uuid';

const SELECT_COLS = `id, holding_id as holdingId, asset_id as assetId, timestamp, qty_in as qtyIn,
  cost_basis_usd_total as costBasisUsdTotal, source`;

function rowToLot(row: Record<string, unknown>): Lot {
  return lotSchema.parse(row);
}

/**
 * Get all lots for a holding (e.g. for cost basis / FIFO).
 */
export async function getByHoldingId(
  db: SQLiteDatabase,
  holdingId: string
): Promise<Lot[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM lot WHERE holding_id = ? ORDER BY timestamp ASC`,
    [holdingId]
  );
  return rows.map(rowToLot);
}

/**
 * Get lots by assetId (chainId:contractAddress).
 */
export async function getByAssetId(
  db: SQLiteDatabase,
  assetId: string
): Promise<Lot[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM lot WHERE asset_id = ? ORDER BY timestamp ASC`,
    [assetId]
  );
  return rows.map(rowToLot);
}

/**
 * Create a single lot.
 */
export async function create(
  db: SQLiteDatabase,
  input: CreateLotInput
): Promise<Lot> {
  const id = generateId();
  await db.runAsync(
    `INSERT INTO lot (id, holding_id, asset_id, timestamp, qty_in, cost_basis_usd_total, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.holdingId,
      input.assetId,
      input.timestamp,
      input.qtyIn,
      input.costBasisUsdTotal ?? null,
      input.source,
    ]
  );
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT ${SELECT_COLS} FROM lot WHERE id = ?`,
    [id]
  );
  return rowToLot(row!);
}

/**
 * Insert many lots (e.g. after cost-basis import). Uses a single transaction.
 */
export async function createMany(
  db: SQLiteDatabase,
  inputs: CreateLotInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      const id = generateId();
      await db.runAsync(
        `INSERT INTO lot (id, holding_id, asset_id, timestamp, qty_in, cost_basis_usd_total, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.holdingId,
          input.assetId,
          input.timestamp,
          input.qtyIn,
          input.costBasisUsdTotal ?? null,
          input.source,
        ]
      );
    }
  });
}

/**
 * Delete all lots for a holding (e.g. before re-import).
 */
export async function deleteByHoldingId(
  db: SQLiteDatabase,
  holdingId: string
): Promise<void> {
  await db.runAsync('DELETE FROM lot WHERE holding_id = ?', [holdingId]);
}

/**
 * Compute average cost basis and total cost from lots (for display / holding summary).
 * Returns { totalCostUsd, qtySum, costBasisUsdPerUnit } or null if no lots / no priced lots.
 */
export function aggregateLotsCost(lots: Lot[]): {
  totalCostUsd: number;
  qtySum: number;
  costBasisUsdPerUnit: number;
} | null {
  const priced = lots.filter((l) => l.costBasisUsdTotal != null && l.costBasisUsdTotal > 0);
  if (priced.length === 0) return null;
  const totalCostUsd = priced.reduce((s, l) => s + (l.costBasisUsdTotal ?? 0), 0);
  const qtySum = priced.reduce((s, l) => s + l.qtyIn, 0);
  if (qtySum <= 0) return null;
  return {
    totalCostUsd,
    qtySum,
    costBasisUsdPerUnit: totalCostUsd / qtySum,
  };
}
