import { describe, expect, it } from 'vitest';

import {
  formatDayKey,
  formatDuration,
  formatTimeFromMinutes,
  getCalendarDayKey,
  getMinutesSinceDayStart,
} from '@/utils/date';
import i18n from '@/i18n';

describe('date utilities', () => {
  it('keeps day ownership on the natural calendar date', () => {
    const date = new Date(2026, 4, 17, 1, 20);

    expect(formatDayKey(date)).toBe('2026-05-17');
    expect(getCalendarDayKey(date)).toBe('2026-05-17');
  });

  it('uses start time only for elapsed minute calculation', () => {
    expect(getMinutesSinceDayStart(new Date(2026, 4, 17, 10, 30), 9 * 60)).toBe(90);
    expect(getMinutesSinceDayStart(new Date(2026, 4, 17, 8, 30), 9 * 60)).toBe(0);
  });

  it('normalizes formatted clock minutes within one day', () => {
    expect(formatTimeFromMinutes(9 * 60 + 5)).toBe('09:05');
    expect(formatTimeFromMinutes(-1)).toBe('23:59');
  });

  it('falls back to minutes when the duration is less than one hour', () => {
    expect(formatDuration(59, 'hours')).toBe(i18n.t('date.durationMinutes', { value: 59 }));
    expect(formatDuration(60, 'hours')).toBe(i18n.t('date.durationDecimalHours', { value: '1' }));
  });
});
