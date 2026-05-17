import { describe, expect, it } from 'vitest';

import { createExportFile, parseExportFile } from '@/utils/backupFile';

const record = {
  day_key: '2026-05-17',
  recorded_at: '2026-05-17T10:30:00.000Z',
  timestamp_ms: 1778994600000,
  minutes_since_start: 90,
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
});
