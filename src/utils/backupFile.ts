import type { ImportDayRecord } from '@/data/database';

const exportSchemaVersion = 1;
const exportAppId = 'recmyday';
export const maxImportFileBytes = 2 * 1024 * 1024;
export const maxImportRecordCount = 10000;

export type DayRecordsExportFile = {
  app: typeof exportAppId;
  schemaVersion: typeof exportSchemaVersion;
  exportedAt: string;
  recordCount: number;
  records: ImportDayRecord[];
  checksum: string;
};

function checksumText(text: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createExportChecksum(payload: Omit<DayRecordsExportFile, 'checksum'>) {
  return checksumText(JSON.stringify(payload));
}

function isValidIsoDate(value: unknown) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isImportDayRecord(value: unknown): value is ImportDayRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<ImportDayRecord>;
  const timestampMs = record.timestamp_ms;
  const minutesSinceStart = record.minutes_since_start;

  return (
    typeof record.day_key === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.day_key) &&
    isValidIsoDate(record.recorded_at) &&
    Number.isInteger(timestampMs) &&
    typeof timestampMs === 'number' &&
    timestampMs >= 0 &&
    Number.isInteger(minutesSinceStart) &&
    typeof minutesSinceStart === 'number' &&
    minutesSinceStart >= 0 &&
    typeof record.created_at === 'string' &&
    record.created_at.length > 0 &&
    typeof record.updated_at === 'string' &&
    record.updated_at.length > 0
  );
}

export function createExportFile(records: ImportDayRecord[], exportedAt: string) {
  const payload: Omit<DayRecordsExportFile, 'checksum'> = {
    app: exportAppId,
    schemaVersion: exportSchemaVersion,
    exportedAt,
    recordCount: records.length,
    records,
  };

  return {
    ...payload,
    checksum: createExportChecksum(payload),
  };
}

export function parseExportFile(text: string) {
  if (new Blob([text]).size > maxImportFileBytes) {
    throw new Error('Export file is too large');
  }

  const parsed = JSON.parse(text) as Partial<DayRecordsExportFile>;
  const { checksum, ...payload } = parsed;

  if (
    parsed.app !== exportAppId ||
    parsed.schemaVersion !== exportSchemaVersion ||
    !isValidIsoDate(parsed.exportedAt) ||
    !Array.isArray(parsed.records) ||
    parsed.records.length > maxImportRecordCount ||
    parsed.records.some((record) => !isImportDayRecord(record)) ||
    parsed.recordCount !== parsed.records.length ||
    typeof checksum !== 'string' ||
    checksum !== createExportChecksum(payload as Omit<DayRecordsExportFile, 'checksum'>)
  ) {
    throw new Error('Invalid export file');
  }

  return parsed.records;
}
