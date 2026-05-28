import { describe, expect, it } from 'vitest';

import { getNextCurrentDayKeyState } from '@/hooks/currentDayKeyWatcher';

describe('current day key watcher utilities', () => {
  it('does not report a change within the same day', () => {
    expect(
      getNextCurrentDayKeyState('2026-05-17', new Date(2026, 4, 17, 23, 59)),
    ).toEqual({
      changed: false,
      dayKey: '2026-05-17',
    });
  });

  it('reports a change when the day key changes', () => {
    expect(
      getNextCurrentDayKeyState('2026-05-17', new Date(2026, 4, 18, 0, 0)),
    ).toEqual({
      changed: true,
      dayKey: '2026-05-18',
    });
  });

  it('reports a change across a month boundary', () => {
    expect(
      getNextCurrentDayKeyState('2026-05-31', new Date(2026, 5, 1, 0, 0)),
    ).toEqual({
      changed: true,
      dayKey: '2026-06-01',
    });
  });
});
