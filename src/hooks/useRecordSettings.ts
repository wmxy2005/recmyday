import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import {
  getRecentRecordLimit,
  getRecordUnit,
  getSeparateRecordEnabled,
  getStartTimeMinutes,
} from '@/data/database';
import type { RecordUnit } from '@/utils/date';

export type RecordSettings = {
  recentRecordLimit: number;
  recordUnit: RecordUnit;
  separateRecordEnabled: boolean;
  startTimeMinutes: number;
};

export const defaultRecordSettings: RecordSettings = {
  recentRecordLimit: 5,
  recordUnit: 'minutes',
  separateRecordEnabled: false,
  startTimeMinutes: 0,
};

export async function readRecordSettings(db: SQLiteDatabase): Promise<RecordSettings> {
  const [startTimeMinutes, recordUnit, recentRecordLimit, separateRecordEnabled] =
    await Promise.all([
      getStartTimeMinutes(db),
      getRecordUnit(db),
      getRecentRecordLimit(db),
      getSeparateRecordEnabled(db),
    ]);

  return {
    recentRecordLimit,
    recordUnit,
    separateRecordEnabled,
    startTimeMinutes,
  };
}

export function useRecordSettings(db: SQLiteDatabase) {
  const [settings, setSettings] = useState(defaultRecordSettings);

  const reload = useCallback(async () => {
    const nextSettings = await readRecordSettings(db);
    setSettings(nextSettings);
    return nextSettings;
  }, [db]);

  return {
    reload,
    settings,
  };
}
