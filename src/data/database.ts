import type { SQLiteDatabase } from 'expo-sqlite';

import {
  builtInRecordTypeIcons,
  fallbackRecordTypeIconName,
  normalizeRecordTypeIconName,
  type RecordTypeIconName,
} from '@/utils/recordTypeIcon';
import {
  formatMonthKey,
  getCalendarDayKey,
  getMinutesSinceDayStart,
  type RecordUnit,
} from '@/utils/date';

export const databaseName = 'rec-my-day.db';

const databaseVersion = 7;
const defaultStartTimeMinutes = 0;
const defaultRecordUnit: RecordUnit = 'minutes';
const defaultRecentRecordLimit = 5;
const defaultSeparateRecordEnabled = false;
export const defaultRecordTypeId = 'work';
export const builtInRecordTypes = [
  { id: 'work', name: 'work', sort_order: 0, icon_name: builtInRecordTypeIcons.work },
  { id: 'study', name: 'study', sort_order: 1, icon_name: builtInRecordTypeIcons.study },
  { id: 'exercise', name: 'exercise', sort_order: 2, icon_name: builtInRecordTypeIcons.exercise },
  { id: 'rest', name: 'rest', sort_order: 3, icon_name: builtInRecordTypeIcons.rest },
  { id: 'other', name: 'other', sort_order: 4, icon_name: builtInRecordTypeIcons.other },
] as const;

export type RecordType = {
  id: string;
  name: string;
  sort_order: number;
  is_builtin: number;
  icon_name: RecordTypeIconName;
  created_at: string;
  updated_at: string;
  record_count?: number;
};

export type DayRecord = {
  id: number;
  day_key: string;
  recorded_at: string;
  timestamp_ms: number;
  minutes_since_start: number;
  record_type_id: string;
  record_type_name: string;
  record_type_icon_name: RecordTypeIconName;
  created_at: string;
  updated_at: string;
};

export type ImportDayRecord = Omit<
  DayRecord,
  'id' | 'record_type_name' | 'record_type_icon_name' | 'record_type_id'
> & {
  record_type_id?: string;
};

export type ImportRecordType = Pick<RecordType, 'id' | 'name' | 'sort_order' | 'is_builtin'> & {
  icon_name?: RecordTypeIconName;
};

type SettingRow = {
  value: string;
};

function boolToSettingValue(value: boolean) {
  return value ? '1' : '0';
}

function normalizeRecordTypeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 24);
}

async function seedBuiltInRecordTypes(db: SQLiteDatabase) {
  for (const type of builtInRecordTypes) {
    await db.runAsync(
      `
        INSERT INTO record_types (
          id,
          name,
          sort_order,
          icon_name,
          is_builtin,
          updated_at
        )
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          sort_order = excluded.sort_order,
          icon_name = excluded.icon_name,
          is_builtin = 1,
          updated_at = CURRENT_TIMESTAMP
      `,
      type.id,
      type.name,
      type.sort_order,
      type.icon_name,
    );
  }
}

async function repairRecordTypeIcons(db: SQLiteDatabase) {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(record_types)');
  const hasIconName = columns.some((column) => column.name === 'icon_name');

  if (!hasIconName) {
    await db.runAsync(
      `ALTER TABLE record_types ADD COLUMN icon_name TEXT NOT NULL DEFAULT '${fallbackRecordTypeIconName}'`,
    );
  }

  await seedBuiltInRecordTypes(db);

  const recordTypes = await db.getAllAsync<Pick<RecordType, 'id' | 'icon_name' | 'is_builtin'>>(
    'SELECT id, icon_name, is_builtin FROM record_types',
  );

  for (const recordType of recordTypes) {
    if (recordType.is_builtin) {
      continue;
    }

    const normalizedIconName = normalizeRecordTypeIconName(recordType.icon_name);

    if (normalizedIconName !== recordType.icon_name) {
      await db.runAsync(
        'UPDATE record_types SET icon_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_builtin = 0',
        normalizedIconName,
        recordType.id,
      );
    }
  }
}

async function getExistingRecordTypeId(db: SQLiteDatabase, id: string | null | undefined) {
  if (!id) {
    return null;
  }

  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM record_types WHERE id = ?',
    id,
  );

  return row?.id ?? null;
}

async function getFallbackRecordTypeId(db: SQLiteDatabase) {
  return (await getExistingRecordTypeId(db, await getDefaultRecordTypeId(db))) ?? defaultRecordTypeId;
}

export async function migrateDatabase(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion >= databaseVersion) {
    await repairRecordTypeIcons(db);
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
        record_type_id TEXT NOT NULL DEFAULT 'work',
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
        record_type_id TEXT NOT NULL DEFAULT 'work',
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

  if (currentVersion < 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS record_types (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        icon_name TEXT NOT NULL DEFAULT 'pricetag-outline',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await seedBuiltInRecordTypes(db);

    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(day_records)');
    const hasRecordTypeId = columns.some((column) => column.name === 'record_type_id');

    if (!hasRecordTypeId) {
      await db.runAsync(
        `ALTER TABLE day_records ADD COLUMN record_type_id TEXT NOT NULL DEFAULT '${defaultRecordTypeId}'`,
      );
    }

    await db.runAsync(
      'UPDATE day_records SET record_type_id = ? WHERE record_type_id IS NULL OR record_type_id = ?',
      defaultRecordTypeId,
      '',
    );
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_day_records_record_type_id
      ON day_records(record_type_id);
    `);
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'default_record_type_id',
      defaultRecordTypeId,
    );
  }

  if (currentVersion < 7) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(record_types)');
    const hasIconName = columns.some((column) => column.name === 'icon_name');

    if (!hasIconName) {
      await db.runAsync(
        `ALTER TABLE record_types ADD COLUMN icon_name TEXT NOT NULL DEFAULT '${fallbackRecordTypeIconName}'`,
      );
    }

    await db.runAsync(
      'UPDATE record_types SET icon_name = ? WHERE icon_name IS NULL OR icon_name = ?',
      fallbackRecordTypeIconName,
      '',
    );
  }

  await repairRecordTypeIcons(db);

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

export async function getRecordTypes(db: SQLiteDatabase) {
  return db.getAllAsync<RecordType>(
    `
      SELECT
        record_types.*,
        COUNT(day_records.id) AS record_count
      FROM record_types
      LEFT JOIN day_records ON day_records.record_type_id = record_types.id
      GROUP BY record_types.id
      ORDER BY record_types.sort_order ASC, record_types.created_at ASC
    `,
  );
}

export async function getDefaultRecordTypeId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    'default_record_type_id',
  );

  return row?.value || defaultRecordTypeId;
}

export async function setDefaultRecordTypeId(db: SQLiteDatabase, recordTypeId: string) {
  const existingId = await getExistingRecordTypeId(db, recordTypeId);
  const nextId = existingId ?? defaultRecordTypeId;

  await db.runAsync(
    `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    'default_record_type_id',
    nextId,
  );

  return nextId;
}

export async function createRecordType(
  db: SQLiteDatabase,
  name: string,
  iconName = fallbackRecordTypeIconName,
) {
  const normalizedName = normalizeRecordTypeName(name);
  const normalizedIconName = normalizeRecordTypeIconName(iconName);

  if (!normalizedName) {
    throw new Error('Record type name is required');
  }

  const row = await db.getFirstAsync<{ max_sort_order: number | null }>(
    'SELECT MAX(sort_order) AS max_sort_order FROM record_types',
  );
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sortOrder = (row?.max_sort_order ?? -1) + 1;

  await db.runAsync(
    `
      INSERT INTO record_types (
        id,
        name,
        sort_order,
        is_builtin,
        icon_name,
        updated_at
      )
      VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
    `,
    id,
    normalizedName,
    sortOrder,
    normalizedIconName,
  );

  return id;
}

export async function updateRecordTypeIcon(
  db: SQLiteDatabase,
  id: string,
  iconName: string,
) {
  await db.runAsync(
    `
      UPDATE record_types
      SET icon_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_builtin = 0
    `,
    normalizeRecordTypeIconName(iconName),
    id,
  );
}

export async function updateRecordTypeName(db: SQLiteDatabase, id: string, name: string) {
  const normalizedName = normalizeRecordTypeName(name);

  if (!normalizedName) {
    throw new Error('Record type name is required');
  }

  await db.runAsync(
    `
      UPDATE record_types
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_builtin = 0
    `,
    normalizedName,
    id,
  );
}

export async function reorderRecordType(db: SQLiteDatabase, id: string, direction: -1 | 1) {
  const types = await getRecordTypes(db);
  const customTypes = types.filter((type) => !type.is_builtin);
  const index = customTypes.findIndex((type) => type.id === id);
  const swapIndex = index + direction;

  if (index < 0 || swapIndex < 0 || swapIndex >= customTypes.length) {
    return;
  }

  const current = customTypes[index];
  const target = customTypes[swapIndex];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE record_types SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_builtin = 0',
      target.sort_order,
      current.id,
    );
    await db.runAsync(
      'UPDATE record_types SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_builtin = 0',
      current.sort_order,
      target.id,
    );
  });
}

export async function deleteRecordType(db: SQLiteDatabase, id: string) {
  const [type, defaultTypeId, usage] = await Promise.all([
    db.getFirstAsync<RecordType>('SELECT * FROM record_types WHERE id = ?', id),
    getDefaultRecordTypeId(db),
    db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM day_records WHERE record_type_id = ?',
      id,
    ),
  ]);

  if (!type || type.is_builtin || defaultTypeId === id || (usage?.count ?? 0) > 0) {
    return false;
  }

  await db.runAsync('DELETE FROM record_types WHERE id = ? AND is_builtin = 0', id);
  return true;
}

export async function upsertCurrentRecord(db: SQLiteDatabase, date = new Date()) {
  const startTimeMinutes = await getStartTimeMinutes(db);
  const recordTypeId = await getFallbackRecordTypeId(db);
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
          record_type_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      recordedAt,
      date.getTime(),
      minutesSinceStart,
      recordTypeId,
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
        record_type_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    dayKey,
    recordedAt,
    date.getTime(),
    minutesSinceStart,
    recordTypeId,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function insertSeparateRecord(
  db: SQLiteDatabase,
  startedAt: Date,
  endedAt = new Date(),
  recordTypeId?: string,
) {
  const nextRecordTypeId =
    (await getExistingRecordTypeId(db, recordTypeId)) ?? (await getFallbackRecordTypeId(db));
  const dayKey = getCalendarDayKey(endedAt);
  const minutes = Math.max(0, Math.ceil((endedAt.getTime() - startedAt.getTime()) / 60000));

  await db.runAsync(
    `
      INSERT INTO day_records (
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        record_type_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
    nextRecordTypeId,
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
  recordTypeId?: string,
) {
  const nextRecordTypeId =
    (await getExistingRecordTypeId(db, recordTypeId)) ?? (await getFallbackRecordTypeId(db));
  const endedAt = getDateForDayTime(dayKey, endMinutes);
  const minutes = Math.max(0, Math.trunc(endMinutes - startMinutes));

  await db.runAsync(
    `
      INSERT INTO day_records (
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        record_type_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
    nextRecordTypeId,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function updateManualRecordById(
  db: SQLiteDatabase,
  id: number,
  dayKey: string,
  startMinutes: number,
  endMinutes: number,
  recordTypeId?: string,
) {
  const nextRecordTypeId =
    (await getExistingRecordTypeId(db, recordTypeId)) ?? (await getFallbackRecordTypeId(db));
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
        record_type_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    dayKey,
    endedAt.toISOString(),
    endedAt.getTime(),
    minutes,
    nextRecordTypeId,
    id,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function upsertRecordMinutes(
  db: SQLiteDatabase,
  dayKey: string,
  minutesSinceStart: number,
  recordTypeId?: string,
) {
  const nextRecordTypeId =
    (await getExistingRecordTypeId(db, recordTypeId)) ?? (await getFallbackRecordTypeId(db));
  const normalizedMinutes = Math.max(0, Math.trunc(minutesSinceStart));
  const now = new Date();

  await db.runAsync(
    `
      INSERT INTO day_records (
        day_key,
        recorded_at,
        timestamp_ms,
        minutes_since_start,
        record_type_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    dayKey,
    now.toISOString(),
    now.getTime(),
    normalizedMinutes,
    nextRecordTypeId,
  );

  return getRecordByDayKey(db, dayKey);
}

export async function getRecordByDayKey(db: SQLiteDatabase, dayKey: string) {
  return db.getFirstAsync<DayRecord>(
    `
      SELECT
        day_records.*,
        record_types.name AS record_type_name,
        record_types.icon_name AS record_type_icon_name
      FROM day_records
      LEFT JOIN record_types ON record_types.id = day_records.record_type_id
      WHERE day_key = ?
      ORDER BY timestamp_ms DESC
      LIMIT 1
    `,
    dayKey,
  );
}

export async function getDayRecordsByDayKey(db: SQLiteDatabase, dayKey: string) {
  return db.getAllAsync<DayRecord>(
    `
      SELECT
        day_records.*,
        record_types.name AS record_type_name,
        record_types.icon_name AS record_type_icon_name
      FROM day_records
      LEFT JOIN record_types ON record_types.id = day_records.record_type_id
      WHERE day_key = ?
      ORDER BY timestamp_ms ASC
    `,
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
    `
      SELECT
        day_records.*,
        record_types.name AS record_type_name,
        record_types.icon_name AS record_type_icon_name
      FROM day_records
      LEFT JOIN record_types ON record_types.id = day_records.record_type_id
      ORDER BY day_key DESC, timestamp_ms DESC
      LIMIT ?
    `,
    limit,
  );
}

export async function getAllDayRecords(db: SQLiteDatabase) {
  return db.getAllAsync<DayRecord>(
    `
      SELECT
        day_records.*,
        record_types.name AS record_type_name,
        record_types.icon_name AS record_type_icon_name
      FROM day_records
      LEFT JOIN record_types ON record_types.id = day_records.record_type_id
      ORDER BY day_key ASC, timestamp_ms ASC, day_records.id ASC
    `,
  );
}

export async function replaceAllDayRecords(
  db: SQLiteDatabase,
  records: ImportDayRecord[],
  recordTypes: ImportRecordType[] = [],
) {
  const fallbackRecordTypeId = await getFallbackRecordTypeId(db);

  await db.withTransactionAsync(async () => {
    for (const recordType of recordTypes) {
      const normalizedName = normalizeRecordTypeName(recordType.name);
      const normalizedIconName = normalizeRecordTypeIconName(recordType.icon_name);

      if (!normalizedName || recordType.is_builtin) {
        continue;
      }

      await db.runAsync(
        `
          INSERT INTO record_types (
            id,
            name,
            sort_order,
            is_builtin,
            icon_name,
            updated_at
          )
          VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            sort_order = excluded.sort_order,
            icon_name = excluded.icon_name,
            updated_at = CURRENT_TIMESTAMP
          WHERE record_types.is_builtin = 0
        `,
        recordType.id,
        normalizedName,
        recordType.sort_order,
        normalizedIconName,
      );
    }

    await db.runAsync('DELETE FROM day_records');

    for (const record of records) {
      const recordTypeId =
        (await getExistingRecordTypeId(db, record.record_type_id)) ?? fallbackRecordTypeId;

      await db.runAsync(
        `
          INSERT INTO day_records (
            day_key,
            recorded_at,
            timestamp_ms,
            minutes_since_start,
            record_type_id,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        record.day_key,
        record.recorded_at,
        record.timestamp_ms,
        record.minutes_since_start,
        recordTypeId,
        record.created_at,
        record.updated_at,
      );
    }
  });
}

export async function getMonthRecords(db: SQLiteDatabase, monthDate: Date) {
  const monthKey = formatMonthKey(monthDate);

  return db.getAllAsync<DayRecord>(
    `
      SELECT
        day_records.*,
        record_types.name AS record_type_name,
        record_types.icon_name AS record_type_icon_name
      FROM day_records
      LEFT JOIN record_types ON record_types.id = day_records.record_type_id
      WHERE day_key LIKE ?
      ORDER BY day_key ASC, timestamp_ms ASC
    `,
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
