import type { DayRecord, RecordType } from '@/data/database';

export type RecordTypeColor = string;

export const fallbackRecordTypeColor = '#3B82F6';

export const builtInRecordTypeColors: Record<string, RecordTypeColor> = {
  work: '#2563EB',
  study: '#8B5CF6',
  exercise: '#22C55E',
  rest: '#F97316',
  other: '#EC4899',
};

export const recordTypeColorOptions: RecordTypeColor[] = [
  '#2563EB',
  '#8B5CF6',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#14B8A6',
  '#0EA5E9',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#84CC16',
  '#A855F7',
];

const validRecordTypeColors = new Set<RecordTypeColor>([
  ...recordTypeColorOptions,
  ...Object.values(builtInRecordTypeColors),
]);

export function normalizeRecordTypeColor(
  color: string | null | undefined,
  fallback: RecordTypeColor = fallbackRecordTypeColor,
): RecordTypeColor {
  return validRecordTypeColors.has(color ?? '') ? (color as RecordTypeColor) : fallback;
}

export function getRecordTypeColor(recordType: Pick<RecordType, 'color' | 'id'>) {
  return normalizeRecordTypeColor(recordType.color || builtInRecordTypeColors[recordType.id]);
}

export function getRecordColor(record: Pick<DayRecord, 'record_type_color' | 'record_type_id'>) {
  return normalizeRecordTypeColor(
    record.record_type_color || builtInRecordTypeColors[record.record_type_id],
  );
}
