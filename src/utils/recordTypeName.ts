import type { TFunction } from 'i18next';

import type { DayRecord, RecordType } from '@/data/database';

const builtInRecordTypeNameKeys: Record<string, string> = {
  work: 'recordTypes.builtIn.work',
  study: 'recordTypes.builtIn.study',
  exercise: 'recordTypes.builtIn.exercise',
  rest: 'recordTypes.builtIn.rest',
  other: 'recordTypes.builtIn.other',
};

function getBuiltInRecordTypeName(id: string, t: TFunction) {
  const key = builtInRecordTypeNameKeys[id];

  return key ? t(key) : null;
}

export function getRecordTypeName(
  recordType: Pick<RecordType, 'id' | 'name' | 'is_builtin'>,
  t: TFunction,
) {
  return (recordType.is_builtin ? getBuiltInRecordTypeName(recordType.id, t) : null) ?? recordType.name;
}

export function getDayRecordTypeName(
  record: Pick<DayRecord, 'record_type_id' | 'record_type_name'>,
  t: TFunction,
) {
  return getBuiltInRecordTypeName(record.record_type_id, t) ?? record.record_type_name ?? record.record_type_id;
}
