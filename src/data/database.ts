import type { SQLiteDatabase } from 'expo-sqlite';

import {
  formatMonthKey,
  getCalendarDayKey,
  getMinutesSinceDayStart,
  type RecordUnit,
} from '@/utils/date';

export const databaseName = 'rec-my-day.db';

const databaseVersion = 5;
const defaultStartTimeMinutes = 0;
const defaultRecordUnit: RecordUnit = 'minutes';
const defaultRecentRecordLimit = 5;
const defaultSeparateRecordEnabled = false;

export type DayRecord = {
  id: number;
  day_key: string;
  recorded_at: string;
  timestamp_ms: number;
  minutes_since_start: number;
  created_at: string;
  updated_at: string;
};

export type ImportDayRecord = Omit<DayRecord, 'id'>;

type SettingRow = {
  value: string;
};

function boolToSettingValue(value: boolean) {
  return value ? '1' : '0';
}

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
        day_key TEXT NOT NULL,
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

  if (currentVersion < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS day_records_v4 (
        id INTEGER PRIMARY KEY NOT NULL,
        day_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        minutes_since_start INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO day_records_v4 (
        id,
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        created_at,
        updated_at
      )
      SELECT
        id,
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        created_at,
        updated_at
      FROM day_records;

      DROP TABLE day_records;
      ALTER TABLE day_records_v4 RENAME TO day_records;

      CREATE INDEX IF NOT EXISTS idx_day_records_day_key
      ON day_records(day_key);
    `);
  }

  if (currentVersion < 5) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'separate_record_enabled',
      boolToSettingValue(defaultSeparateRecordEnabled),
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

export async function getSeparateRecordEnabled(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    'separate_record_enabled',
  );

  return row?.value === '1';
}

export async function setSeparateRecordEnabled(db: SQLiteDatabase, enabled: boolean) {
  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'separate_record_enabled',
    boolToSettingValue(enabled),
  );

  return enabled;
}

export async function upsertCurrentRecord(db: SQLiteDatabase, date = new Date()) {
  const startTimeMinutes = await getStartTimeMinutes(db);
  const dayKey = getCalendarDayKey(date);
  const minutesSinceStart = getMinutesSinceDayStart(date, startTimeMinutes);
  const recordedAt = date.toISOString();
  const existingRecord = await getRecordByDayKey(db, dayKey);

  if (existingRecord) {
    await db.runAsync(
      `
        UPDATE day_records
        SET
          recorded_at = ?,
          timestamp_ms = ?,
          minutes_since_start = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      recordedAt,
      date.getTime(),
      minutesSinceStart,
      existingRecord.id,
    );

    return getRecordByDayKey(db, dayKey);
  }

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
    `,
    dayKey,
    recordedAt,
    date.getTime(),
    minutesSinceStart,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function insertSeparateRecord(
  db: SQLiteDatabase,
  startedAt: Date,
  endedAt = new Date(),
) {
  const dayKey = getCalendarDayKey(endedAt);
  const minutes = Math.max(0, Math.ceil((endedAt.getTime() - startedAt.getTime()) / 60000));

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
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
  );

  return getRecordByDayKey(db, dayKey);
}

function getDateForDayTime(dayKey: string, minutes: number) {
  const [year, month, day] = dayKey.split('-').map(Number);

  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
}

export async function insertManualRecord(
  db: SQLiteDatabase,
  dayKey: string,
  startMinutes: number,
  endMinutes: number,
) {
  const endedAt = getDateForDayTime(dayKey, endMinutes);
  const minutes = Math.max(0, Math.trunc(endMinutes - startMinutes));

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
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function updateManualRecordById(
  db: SQLiteDatabase,
  id: number,
  dayKey: string,
  startMinutes: number,
  endMinutes: number,
) {
  const endedAt = getDateForDayTime(dayKey, endMinutes);
  const minutes = Math.max(0, Math.trunc(endMinutes - startMinutes));

  await db.runAsync(
    `
      UPDATE day_records
      SET
        day_key = ?,
        recorded_at = ?,
        timestamp_ms = ?,
        minutes_since_start = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
    id,
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
    `,
    dayKey,
    now.toISOString(),
    now.getTime(),
    normalizedMinutes,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function getRecordByDayKey(db: SQLiteDatabase, dayKey: string) {
  return db.getFirstAsync<DayRecord>(
    'SELECT * FROM day_records WHERE day_key = ? ORDER BY timestamp_ms DESC LIMIT 1',
    dayKey,
  );
}

export async function getDayRecordsByDayKey(db: SQLiteDatabase, dayKey: string) {
  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records WHERE day_key = ? ORDER BY timestamp_ms ASC',
    dayKey,
  );
}

export async function deleteRecordByDayKey(db: SQLiteDatabase, dayKey: string) {
  await db.runAsync('DELETE FROM day_records WHERE day_key = ?', dayKey);
}

export async function deleteRecordById(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM day_records WHERE id = ?', id);
}

export async function getCurrentDayRecord(db: SQLiteDatabase, date = new Date()) {
  const dayKey = getCalendarDayKey(date);
  return getRecordByDayKey(db, dayKey);
}

export async function getCurrentDayKey(db: SQLiteDatabase, date = new Date()) {
  return getCalendarDayKey(date);
}

export async function getRecentRecords(db: SQLiteDatabase, limit = 8) {
  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records ORDER BY day_key DESC, timestamp_ms DESC LIMIT ?',
    limit,
  );
}

export async function getAllDayRecords(db: SQLiteDatabase) {
  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records ORDER BY day_key ASC, timestamp_ms ASC, id ASC',
  );
}

export async function replaceAllDayRecords(db: SQLiteDatabase, records: ImportDayRecord[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM day_records');

    for (const record of records) {
      await db.runAsync(
        `
          INSERT INTO day_records (
            day_key,
            recorded_at,
            timestamp_ms,
            minutes_since_start,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        record.day_key,
        record.recorded_at,
        record.timestamp_ms,
        record.minutes_since_start,
        record.created_at,
        record.updated_at,
      );
    }
  });
}

export async function getMonthRecords(db: SQLiteDatabase, monthDate: Date) {
  const monthKey = formatMonthKey(monthDate);

  return db.getAllAsync<DayRecord>(
    'SELECT * FROM day_records WHERE day_key LIKE ? ORDER BY day_key ASC, timestamp_ms ASC',
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
