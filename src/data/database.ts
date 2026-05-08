import type { SQLiteDatabase } from 'expo-sqlite';

import {
  formatMonthKey,
  getLogicalDayKey,
  getMinutesSinceDayStart,
  type RecordUnit,
} from '@/utils/date';

export const databaseName = 'rec-my-day.db';

const databaseVersion = 3;
const defaultStartTimeMinutes = 0;
const defaultRecordUnit: RecordUnit = 'minutes';
const defaultRecentRecordLimit = 5;

export type DayRecord = {
  id: number;
  day_key: string;
  recorded_at: string;
  timestamp_ms: number;
  minutes_since_start: number;
  created_at: string;
  updated_at: string;
};

type SettingRow = {
  value: string;
};

export async function migrateDatabase(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= databaseVersion) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS day_records (
        id INTEGER PRIMARY KEY NOT NULL,
        day_key TEXT NOT NULL UNIQUE,
        recorded_at TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        minutes_since_start INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_day_records_day_key
      ON day_records(day_key);
    `);

    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'start_time_minutes',
      String(defaultStartTimeMinutes),
    );
  }

  if (currentVersion < 2) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'record_unit',
      defaultRecordUnit,
    );
  }

  if (currentVersion < 3) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'recent_record_limit',
      String(defaultRecentRecordLimit),
    );
  }

  await db.execAsync(`PRAGMA user_version = ${databaseVersion}`);
}

function isRecordUnit(value: string | undefined): value is RecordUnit {
  return value === 'hours' || value === 'minutes';
}

export async function getStartTimeMinutes(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    'start_time_minutes',
  );

  const parsedValue = Number(row?.value ?? defaultStartTimeMinutes);
  return Number.isFinite(parsedValue) ? parsedValue : defaultStartTimeMinutes;
}

export async function setStartTimeMinutes(db: SQLiteDatabase, minutes: number) {
  const normalizedMinutes = Math.max(0, Math.min(1439, Math.trunc(minutes)));

  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'start_time_minutes',
    String(normalizedMinutes),
  );

  return normalizedMinutes;
}

export async function getRecordUnit(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    'record_unit',
  );

  return isRecordUnit(row?.value) ? row.value : defaultRecordUnit;
}

export async function setRecordUnit(db: SQLiteDatabase, unit: RecordUnit) {
  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'record_unit',
    unit,
  );

  return unit;
}

export async function getRecentRecordLimit(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    'recent_record_limit',
  );

  const parsedValue = Number(row?.value ?? defaultRecentRecordLimit);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : defaultRecentRecordLimit;
}

export async function setRecentRecordLimit(db: SQLiteDatabase, limit: number) {
  const normalizedLimit = Math.max(1, Math.min(99, Math.trunc(limit)));

  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'recent_record_limit',
    String(normalizedLimit),
  );

  return normalizedLimit;
}

export async function upsertCurrentRecord(db: SQLiteDatabase, date = new Date()) {
  const startTimeMinutes = await getStartTimeMinutes(db);
  const dayKey = getLogicalDayKey(date, startTimeMinutes);
  const minutesSinceStart = getMinutesSinceDayStart(date, startTimeMinutes);
  const recordedAt = date.toISOString();

  await db.runAsync(
    `
      INSERT INTO day_records (
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(day_key) DO UPDATE SET
        recorded_at = excluded.recorded_at,
        timestamp_ms = excluded.timestamp_ms,
        minutes_since_start = excluded.minutes_since_start,
        updated_at = CURRENT_TIMESTAMP
    `,
    dayKey,
    recordedAt,
    date.getTime(),
    minutesSinceStart,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function upsertRecordMinutes(
  db: SQLiteDatabase,
  dayKey: string,
  minutesSinceStart: number,
) {
  const normalizedMinutes = Math.max(0, Math.trunc(minutesSinceStart));
  const now = new Date();

  await db.runAsync(
    `
      INSERT INTO day_records (
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(day_key) DO UPDATE SET
        minutes_since_start = excluded.minutes_since_start,
        updated_at = CURRENT_TIMESTAMP
    `,
    dayKey,
    now.toISOString(),
    now.getTime(),
    normalizedMinutes,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function getRecordByDayKey(db: SQLiteDatabase, dayKey: string) {
  return db.getFirstAsync<DayRecord>('SELECT * FROM day_records WHERE day_key = ?', dayKey);
}

export async function getCurrentDayRecord(db: SQLiteDatabase, date = new Date()) {
  const startTimeMinutes = await getStartTimeMinutes(db);
  const dayKey = getLogicalDayKey(date, startTimeMinutes);
  return getRecordByDayKey(db, dayKey);
}

export async function getCurrentDayKey(db: SQLiteDatabase, date = new Date()) {
  const startTimeMinutes = await getStartTimeMinutes(db);
  return getLogicalDayKey(date, startTimeMinutes);
}

export async function getRecentRecords(db: SQLiteDatabase, limit = 8) {
  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records ORDER BY day_key DESC LIMIT ?',
    limit,
  );
}

export async function getMonthRecords(db: SQLiteDatabase, monthDate: Date) {
  const monthKey = formatMonthKey(monthDate);

  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records WHERE day_key LIKE ? ORDER BY day_key ASC',
    `${monthKey}-%`,
  );
}

export async function getMonthTotalMinutes(db: SQLiteDatabase, monthDate: Date) {
  const monthKey = formatMonthKey(monthDate);
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(minutes_since_start) AS total FROM day_records WHERE day_key LIKE ?',
    `${monthKey}-%`,
  );

  return row?.total ?? 0;
}
