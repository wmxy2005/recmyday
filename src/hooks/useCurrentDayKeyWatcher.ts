import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { formatDayKey } from '@/utils/date';
import { getNextCurrentDayKeyState } from '@/hooks/currentDayKeyWatcher';

export const defaultCurrentDayKeyWatchIntervalMs = 60_000;

export function useCurrentDayKeyWatcher(
  onDayKeyChange: (dayKey: string) => void,
  intervalMs = defaultCurrentDayKeyWatchIntervalMs,
) {
  const currentDayKeyRef = useRef(formatDayKey(new Date()));
  const onDayKeyChangeRef = useRef(onDayKeyChange);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    onDayKeyChangeRef.current = onDayKeyChange;
  }, [onDayKeyChange]);

  useEffect(() => {
    const checkCurrentDayKey = () => {
      const nextState = getNextCurrentDayKeyState(currentDayKeyRef.current);

      if (!nextState.changed) {
        return;
      }

      currentDayKeyRef.current = nextState.dayKey;
      onDayKeyChangeRef.current(nextState.dayKey);
    };

    const timer = setInterval(checkCurrentDayKey, intervalMs);
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasInBackground = appStateRef.current.match(/inactive|background/);

      appStateRef.current = nextAppState;

      if (wasInBackground && nextAppState === 'active') {
        checkCurrentDayKey();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs]);
}
