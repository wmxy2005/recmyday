import { formatDayKey } from '@/utils/date';

export function getNextCurrentDayKeyState(previousDayKey: string, date = new Date()) {
  const dayKey = formatDayKey(date);

  return {
    changed: dayKey !== previousDayKey,
    dayKey,
  };
}
