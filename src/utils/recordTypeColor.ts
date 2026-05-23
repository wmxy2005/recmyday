import type { DayRecord, RecordType } from '@/data/database';

export type RecordTypeColor = string;

export const fallbackRecordTypeColor = '#417FF5';

export const builtInRecordTypeColors: Record<string, RecordTypeColor> = {
  work: '#417FF5',
  study: '#8B5CF6',
  exercise: '#16B99F',
  rest: '#F5A623',
  other: '#F4604A',
};

export const recordTypeColorOptions: RecordTypeColor[] = [
  '#417FF5',
  '#7C3AED',
  '#0EA5E9',
  '#14B8A6',
  '#22C55E',
  '#F59E0B',
  '#F97316',
  '#F04A2A',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#84CC16',
];

const legacyRecordTypeColors: RecordTypeColor[] = [
  '#2563EB',
  '#3B82F6',
  '#6366F1',
  '#A855F7',
  '#EF4444',
];

const validRecordTypeColors = new Set<RecordTypeColor>([
  ...recordTypeColorOptions,
  ...Object.values(builtInRecordTypeColors),
  ...legacyRecordTypeColors,
]);

export function normalizeRecordTypeColor(
  color: string | null | undefined,
  fallback: RecordTypeColor = fallbackRecordTypeColor,
): RecordTypeColor {
  return validRecordTypeColors.has(color ?? '') ? (color as RecordTypeColor) : fallback;
}

export function getRecordTypeSoftColor(color: string | null | undefined, alpha = 0.14) {
  const normalizedColor = normalizeRecordTypeColor(color);
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16);
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16);

  return `rgba(${red},${green},${blue},${alpha})`;
}

export function getRecordTypeColor(recordType: Pick<RecordType, 'color' | 'id'>) {
  return normalizeRecordTypeColor(recordType.color || builtInRecordTypeColors[recordType.id]);
}

export function getRecordColor(record: Pick<DayRecord, 'record_type_color' | 'record_type_id'>) {
  return normalizeRecordTypeColor(
    record.record_type_color || builtInRecordTypeColors[record.record_type_id],
  );
}
