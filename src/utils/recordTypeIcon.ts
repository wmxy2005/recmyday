import type { ComponentProps } from 'react';

import { type Ionicons } from '@expo/vector-icons';

import type { DayRecord, RecordType } from '@/data/database';

export type RecordTypeIconName = ComponentProps<typeof Ionicons>['name'];

export const fallbackRecordTypeIconName: RecordTypeIconName = 'pricetag-outline';
export const mixedRecordTypeIconName: RecordTypeIconName = 'apps-outline';
export const allRecordTypesFilterIconName: RecordTypeIconName = 'grid';

export const builtInRecordTypeIcons: Record<string, RecordTypeIconName> = {
  work: 'briefcase',
  study: 'book',
  exercise: 'fitness',
  rest: 'cafe',
  other: 'shapes-outline',
};

export const recordTypeIconOptions: RecordTypeIconName[] = [
  'briefcase',
  'book',
  'fitness',
  'cafe',
  'grid',
  'shapes-outline',
  'pricetag-outline',
  'pencil',
  'laptop-outline',
  'bulb-outline',
  'rocket-outline',
  'heart-outline',
  'home-outline',
  'walk-outline',
  'bicycle-outline',
  'musical-notes-outline',
  'game-controller-outline',
  'restaurant-outline',
  'bed-outline',
  'people-outline',
  'star',
];

const validRecordTypeIconNames = new Set<RecordTypeIconName>(recordTypeIconOptions);

export function normalizeRecordTypeIconName(
  iconName: string | null | undefined,
): RecordTypeIconName {
  return validRecordTypeIconNames.has(iconName as RecordTypeIconName)
    ? (iconName as RecordTypeIconName)
    : fallbackRecordTypeIconName;
}

export function getRecordTypeIconName(recordType: Pick<RecordType, 'icon_name' | 'id'>) {
  return normalizeRecordTypeIconName(recordType.icon_name || builtInRecordTypeIcons[recordType.id]);
}

export function getRecordIconName(record: Pick<DayRecord, 'record_type_icon_name' | 'record_type_id'>) {
  return normalizeRecordTypeIconName(
    record.record_type_icon_name || builtInRecordTypeIcons[record.record_type_id],
  );
}
