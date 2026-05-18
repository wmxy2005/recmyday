import type { ImportDayRecord, ImportRecordType } from '@/data/database';
import { defaultRecordTypeId } from '@/data/database';

const exportSchemaVersion = 2;
const supportedExportSchemaVersions = [1, 2] as const;
const exportAppId = 'recmyday';
export const maxImportFileBytes = 2 * 1024 * 1024;
export const maxImportRecordCount = 10000;

export type DayRecordsExportFile = {
  app: typeof exportAppId;
  schemaVersion: (typeof supportedExportSchemaVersions)[number];
  exportedAt: string;
  recordCount: number;
  recordTypes?: ImportRecordType[];
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
    (record.record_type_id === undefined || typeof record.record_type_id === 'string') &&
    typeof record.created_at === 'string' &&
    record.created_at.length > 0 &&
    typeof record.updated_at === 'string' &&
    record.updated_at.length > 0
  );
}

function isImportRecordType(value: unknown): value is ImportRecordType {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const recordType = value as Partial<ImportRecordType>;

  return (
    typeof recordType.id === 'string' &&
    recordType.id.length > 0 &&
    typeof recordType.name === 'string' &&
    recordType.name.length > 0 &&
    typeof recordType.sort_order === 'number' &&
    Number.isInteger(recordType.sort_order) &&
    (recordType.is_builtin === 0 || recordType.is_builtin === 1)
  );
}

export function createExportFile(
  records: ImportDayRecord[],
  exportedAt: string,
  recordTypes: ImportRecordType[] = [],
) {
  const payload: Omit<DayRecordsExportFile, 'checksum'> = {
    app: exportAppId,
    schemaVersion: exportSchemaVersion,
    exportedAt,
    recordCount: records.length,
    recordTypes,
    records,
  };

  return {
    ...payload,
    checksum: createExportChecksum(payload),
  };
}

export function parseExportFile(text: string) {
  return parseExportFileData(text).records;
}

export function parseExportFileData(text: string) {
  if (new Blob([text]).size > maxImportFileBytes) {
    throw new Error('Export file is too large');
  }

  const parsed = JSON.parse(text) as Partial<DayRecordsExportFile>;
  const { checksum, ...payload } = parsed;

  if (
    parsed.app !== exportAppId ||
    !supportedExportSchemaVersions.includes(
      parsed.schemaVersion as (typeof supportedExportSchemaVersions)[number],
    ) ||
    !isValidIsoDate(parsed.exportedAt) ||
    !Array.isArray(parsed.records) ||
    (parsed.recordTypes !== undefined &&
      (!Array.isArray(parsed.recordTypes) ||
        parsed.recordTypes.some((recordType) => !isImportRecordType(recordType)))) ||
    parsed.records.length > maxImportRecordCount ||
    parsed.records.some((record) => !isImportDayRecord(record)) ||
    parsed.recordCount !== parsed.records.length ||
    typeof checksum !== 'string' ||
    checksum !== createExportChecksum(payload as Omit<DayRecordsExportFile, 'checksum'>)
  ) {
    throw new Error('Invalid export file');
  }

  return {
    records: parsed.records.map((record) => ({
      ...record,
      record_type_id: record.record_type_id || defaultRecordTypeId,
    })),
    recordTypes: parsed.recordTypes ?? [],
  };
}
