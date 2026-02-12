/**
 * Cloud Backup & Restore via Supabase.
 * Mirrors local SQLite tables to Supabase Postgres.
 * Requires Supabase tables with RLS policies to be set up server-side.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';

const LAST_BACKUP_KEY = 'lastCloudBackup';
const BATCH_SIZE = 500;

/** Tables to backup, in dependency order (restore must respect FK constraints). */
const TABLES = [
  { local: 'portfolio', remote: 'portfolio' },
  { local: 'holding', remote: 'holding' },
  { local: 'event', remote: 'event' },
  { local: 'lot', remote: 'lot' },
  { local: '"transaction"', remote: 'transaction' },
  { local: 'liability', remote: 'liability' },
  { local: 'portfolio_value_snapshot', remote: 'portfolio_value_snapshot' },
] as const;

async function getUserId(): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user.id;
}

/**
 * Upload all local data to Supabase (upsert, batched).
 */
export async function backupToCloud(db: SQLiteDatabase): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase not configured');
  const userId = await getUserId();

  for (const table of TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table.local}`);
    if (rows.length === 0) continue;

    // Attach user_id to each row for RLS
    const withUser = rows.map((r) => ({ ...r, user_id: userId }));

    // Upsert in batches
    for (let i = 0; i < withUser.length; i += BATCH_SIZE) {
      const batch = withUser.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from(table.remote)
        .upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`[Backup] Failed to upsert ${table.remote}:`, error.message);
        throw new Error(`Backup failed on table "${table.remote}": ${error.message}`);
      }
    }
  }

  const now = new Date().toISOString();
  await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
}

/**
 * Download all data from Supabase and replace local SQLite data.
 * DESTRUCTIVE: clears all local data first.
 */
export async function restoreFromCloud(db: SQLiteDatabase): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase not configured');
  await getUserId(); // Ensure authenticated

  // Clear local data (reverse dependency order)
  await db.runAsync('DELETE FROM portfolio_value_snapshot');
  await db.runAsync('DELETE FROM liability');
  await db.runAsync('DELETE FROM "transaction"');
  await db.runAsync('DELETE FROM lot');
  await db.runAsync('DELETE FROM event');
  await db.runAsync('DELETE FROM holding');
  await db.runAsync('DELETE FROM portfolio');

  // Restore in dependency order
  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table.remote)
      .select('*');

    if (error) {
      console.error(`[Restore] Failed to fetch ${table.remote}:`, error.message);
      throw new Error(`Restore failed on table "${table.remote}": ${error.message}`);
    }

    if (!data || data.length === 0) continue;

    for (const row of data) {
      // Remove user_id (not in local schema)
      const { user_id, ...localRow } = row;
      const columns = Object.keys(localRow);
      const placeholders = columns.map(() => '?').join(', ');
      const colNames = columns.map((c) => snakeCase(c)).join(', ');
      const values = columns.map((c) => localRow[c]);

      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table.local} (${colNames}) VALUES (${placeholders})`,
          values as (string | number | null)[],
        );
      } catch (e) {
        console.warn(`[Restore] Failed to insert row into ${table.local}:`, e);
      }
    }
  }
}

/**
 * Get the timestamp of the last successful backup, or null.
 */
export async function getLastBackupTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_BACKUP_KEY);
}

/** Convert camelCase to snake_case for SQL column names. */
function snakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
