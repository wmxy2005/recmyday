import { describe, expect, it } from 'vitest';

import {
  createExportChecksum,
  createExportFile,
  parseExportFile,
  parseExportFileData,
} from '@/utils/backupFile';
import { normalizeRecordTypeColor } from '@/utils/recordTypeColor';

const record = {
  day_key: '2026-05-17',
  recorded_at: '2026-05-17T10:30:00.000Z',
  timestamp_ms: 1778994600000,
  minutes_since_start: 90,
  record_type_id: 'work',
  created_at: '2026-05-17 10:30:00',
  updated_at: '2026-05-17 10:30:00',
};

describe('backup file format', () => {
  it('round-trips exported records with checksum validation', () => {
    const file = createExportFile([record], '2026-05-17T10:31:00.000Z');

    expect(parseExportFile(JSON.stringify(file))).toEqual([record]);
  });

  it('rejects tampered payloads', () => {
    const file = createExportFile([record], '2026-05-17T10:31:00.000Z');
    const tampered = {
      ...file,
      records: [{ ...record, minutes_since_start: 91 }],
    };

    expect(() => parseExportFile(JSON.stringify(tampered))).toThrow('Invalid export file');
  });

  it('maps old records without a type to the default type', () => {
    const { record_type_id, ...oldRecord } = record;
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 1 as const,
      exportedAt,
      recordCount: 1,
      records: [oldRecord],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    expect(parseExportFile(JSON.stringify(file))).toEqual([record]);
  });

  it('round-trips custom record types in the export payload', () => {
    const recordTypes = [
      {
        color: '#14B8A6',
        id: 'custom-focus',
        icon_name: 'bulb-outline' as const,
        name: '专注',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: 120,
      },
    ];
    const file = createExportFile(
      [{ ...record, record_type_id: 'custom-focus' }],
      '2026-05-17T10:31:00.000Z',
      recordTypes,
    );

    expect(parseExportFileData(JSON.stringify(file))).toEqual({
      records: [{ ...record, record_type_id: 'custom-focus' }],
      recordTypes,
    });
  });

  it('adds fallback icons to old custom record types', () => {
    const recordTypes = [
      {
        id: 'custom-focus',
        name: '专注',
        sort_order: 5,
        is_builtin: 0,
      },
    ];
    const file = createExportFile(
      [{ ...record, record_type_id: 'custom-focus' }],
      '2026-05-17T10:31:00.000Z',
      recordTypes,
    );

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes).toEqual([
      {
        ...recordTypes[0],
        color: '#417FF5',
        icon_name: 'pricetag-outline',
        target_minutes: null,
      },
    ]);
  });

  it('adds fallback colors to old custom record types', () => {
    const recordTypes = [
      {
        id: 'custom-focus',
        icon_name: 'bulb-outline' as const,
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
      },
    ];
    const file = createExportFile(
      [{ ...record, record_type_id: 'custom-focus' }],
      '2026-05-17T10:31:00.000Z',
      recordTypes,
    );

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes).toEqual([
      {
        ...recordTypes[0],
        color: '#417FF5',
        target_minutes: null,
      },
    ]);
  });

  it('keeps old custom record type targets unset', () => {
    const recordTypes = [
      {
        color: '#14B8A6',
        id: 'custom-focus',
        icon_name: 'bulb-outline' as const,
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
      },
    ];
    const file = createExportFile(
      [{ ...record, record_type_id: 'custom-focus' }],
      '2026-05-17T10:31:00.000Z',
      recordTypes,
    );

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes[0].target_minutes).toBeNull();
  });

  it('round-trips unset record type target minutes', () => {
    const recordTypes = [
      {
        color: '#14B8A6',
        id: 'custom-focus',
        icon_name: 'bulb-outline' as const,
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: null,
      },
    ];
    const file = createExportFile(
      [{ ...record, record_type_id: 'custom-focus' }],
      '2026-05-17T10:31:00.000Z',
      recordTypes,
    );

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes[0].target_minutes).toBeNull();
  });

  it('preserves legacy record type colors', () => {
    expect(normalizeRecordTypeColor('#3B82F6')).toBe('#3B82F6');
  });

  it('normalizes invalid imported record type icons', () => {
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const recordTypes = [
      {
        id: 'custom-focus',
        icon_name: 'not-real',
        name: '专注',
        sort_order: 5,
        is_builtin: 0,
      },
    ];
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 3 as const,
      exportedAt,
      recordCount: 1,
      recordTypes,
      records: [{ ...record, record_type_id: 'custom-focus' }],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes[0].icon_name).toBe('pricetag-outline');
  });

  it('normalizes invalid imported record type colors', () => {
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const recordTypes = [
      {
        id: 'custom-focus',
        color: '#000000',
        icon_name: 'bulb-outline',
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: 120,
      },
    ];
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 4 as const,
      exportedAt,
      recordCount: 1,
      recordTypes,
      records: [{ ...record, record_type_id: 'custom-focus' }],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes[0].color).toBe('#417FF5');
  });

  it('rejects invalid imported record type target minutes', () => {
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const recordTypes = [
      {
        id: 'custom-focus',
        color: '#14B8A6',
        icon_name: 'bulb-outline',
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: 0,
      },
    ];
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 5 as const,
      exportedAt,
      recordCount: 1,
      recordTypes,
      records: [{ ...record, record_type_id: 'custom-focus' }],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    expect(() => parseExportFileData(JSON.stringify(file))).toThrow('Invalid export file');
  });

  it('accepts the monthly record type target minute maximum', () => {
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const recordTypes = [
      {
        id: 'custom-focus',
        color: '#14B8A6',
        icon_name: 'bulb-outline',
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: 99999,
      },
    ];
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 5 as const,
      exportedAt,
      recordCount: 1,
      recordTypes,
      records: [{ ...record, record_type_id: 'custom-focus' }],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    const parsed = parseExportFileData(JSON.stringify(file));

    expect(parsed.recordTypes[0].target_minutes).toBe(99999);
  });

  it('rejects imported record type target minutes above the monthly maximum', () => {
    const exportedAt = '2026-05-17T10:31:00.000Z';
    const recordTypes = [
      {
        id: 'custom-focus',
        color: '#14B8A6',
        icon_name: 'bulb-outline',
        name: '涓撴敞',
        sort_order: 5,
        is_builtin: 0,
        target_minutes: 100000,
      },
    ];
    const payload = {
      app: 'recmyday' as const,
      schemaVersion: 5 as const,
      exportedAt,
      recordCount: 1,
      recordTypes,
      records: [{ ...record, record_type_id: 'custom-focus' }],
    };
    const file = {
      ...payload,
      checksum: createExportChecksum(payload as never),
    };

    expect(() => parseExportFileData(JSON.stringify(file))).toThrow('Invalid export file');
  });
});
