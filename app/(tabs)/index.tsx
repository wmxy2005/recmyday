import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordButton } from '@/components/RecordButton';
import {
  type DayRecord,
  getCurrentDayKey,
  getCurrentDayRecord,
  getRecentRecords,
  getRecentRecordLimit,
  getRecordUnit,
  getStartTimeMinutes,
  upsertCurrentRecord,
} from '@/data/database';
import { radius, spacing, useAppTheme } from '@/theme';
import {
  formatDayLabel,
  formatDuration,
  formatTimeFromMinutes,
  formatWeekdayLabel,
  type RecordUnit,
} from '@/utils/date';

function getIsBeforeStartTime(startTimeMinutes: number) {
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return currentMinutes < startTimeMinutes;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [currentDayKey, setCurrentDayKey] = useState('');
  const [todayRecord, setTodayRecord] = useState<DayRecord | null>(null);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [recentRecordLimit, setRecentRecordLimit] = useState(5);
  const [isBeforeStartTime, setIsBeforeStartTime] = useState(() => getIsBeforeStartTime(0));
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isHidingRecordButton, setIsHidingRecordButton] = useState(false);
  const [showRecordButton, setShowRecordButton] = useState(false);
  const [recordButtonMounted, setRecordButtonMounted] = useState(false);
  const hasLoadedRef = useRef(false);
  const skipRecordButtonAnimationRef = useRef(true);
  const recordButtonHideAnimationRef = useRef(false);
  /** Start hidden so we never paint a full-size button before visibility is synced (avoids a bogus “hide” on first load). */
  const recordButtonScale = useSharedValue(0);

  const finishHidingRecordButton = useCallback(() => {
    recordButtonHideAnimationRef.current = false;
    setIsHidingRecordButton(false);
    setRecordButtonMounted(false);
  }, []);

  const startHideRecordButton = useCallback(() => {
    if (recordButtonHideAnimationRef.current) {
      return;
    }

    recordButtonHideAnimationRef.current = true;
    setIsHidingRecordButton(true);
    recordButtonScale.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(finishHidingRecordButton)();
        }
      },
    );
  }, [finishHidingRecordButton, recordButtonScale]);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const [startTime, unit, limit] = await Promise.all([
      getStartTimeMinutes(db),
      getRecordUnit(db),
      getRecentRecordLimit(db),
    ]);
    const [dayKey, currentRecord, recentRecords] = await Promise.all([
      getCurrentDayKey(db),
      getCurrentDayRecord(db),
      getRecentRecords(db, limit + 1),
    ]);

    setStartTimeMinutes(startTime);
    setRecordUnit(unit);
    setRecentRecordLimit(limit);
    setCurrentDayKey(dayKey);
    setTodayRecord(currentRecord);
    setShowRecordButton(!currentRecord && !getIsBeforeStartTime(startTime));
    setRecords(recentRecords);
    setIsLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      const showLoading = !hasLoadedRef.current;
      hasLoadedRef.current = true;
      loadData(showLoading);
    }, [loadData]),
  );

  useEffect(() => {
    setIsBeforeStartTime(getIsBeforeStartTime(startTimeMinutes));

    const timer = setInterval(() => {
      const next = getIsBeforeStartTime(startTimeMinutes);
      setIsBeforeStartTime((current) => (current === next ? current : next));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTimeMinutes]);

  const previousRecords = useMemo(
    () =>
      records
        .filter((record) => record.day_key !== currentDayKey)
        .slice(0, recentRecordLimit),
    [currentDayKey, recentRecordLimit, records],
  );

  const shouldShowRecordButtonArea =
    !isLoading && !isBeforeStartTime && (!todayRecord || showRecordButton);

  const recordButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordButtonScale.value }],
  }));

  useEffect(() => {
    const snapRecordButtonVisibility = (visible: boolean) => {
      recordButtonHideAnimationRef.current = false;
      setIsHidingRecordButton(false);
      recordButtonScale.value = visible ? 1 : 0;
      setRecordButtonMounted(visible);
    };

    if (!isLoading && skipRecordButtonAnimationRef.current) {
      skipRecordButtonAnimationRef.current = false;
      snapRecordButtonVisibility(shouldShowRecordButtonArea);
      return;
    }

    if (isBeforeStartTime || !todayRecord) {
      snapRecordButtonVisibility(shouldShowRecordButtonArea);
      return;
    }

    if (showRecordButton) {
      recordButtonHideAnimationRef.current = false;
      setIsHidingRecordButton(false);
      setRecordButtonMounted(true);
      recordButtonScale.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    // Toggle / default hidden: snap off without shrink animation. Recording still uses
    // `startHideRecordButton` from `handleRecord`; skip while that animation is in flight.
    if (isRecording) {
      return;
    }

    snapRecordButtonVisibility(shouldShowRecordButtonArea);
  }, [
    isBeforeStartTime,
    isLoading,
    isRecording,
    recordButtonScale,
    shouldShowRecordButtonArea,
    showRecordButton,
    todayRecord,
  ]);

  const handleRecord = async () => {
    if (isBeforeStartTime || isRecording || isHidingRecordButton) {
      return;
    }

    setIsRecording(true);
    startHideRecordButton();

    try {
      await upsertCurrentRecord(db);
      setShowRecordButton(false);
      await loadData();
    } finally {
      setIsRecording(false);
    }
  };

  const handleToggleRecordButton = () => {
    if (!todayRecord || isBeforeStartTime) {
      return;
    }

    setShowRecordButton((current) => !current);
  };

  const canToggleRecordButton = Boolean(todayRecord && !isBeforeStartTime);
  const isTodayPanelSelected = Boolean(todayRecord && showRecordButton);
  const hasNoTodayRecord = !isLoading && !todayRecord;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('home.title')}</Text>
          <Text style={styles.subtitle}>
            {t('home.startTime', { time: formatTimeFromMinutes(startTimeMinutes) })}
          </Text>
        </View>

        <Pressable
          accessibilityRole={canToggleRecordButton ? 'button' : undefined}
          disabled={!canToggleRecordButton}
          onPress={handleToggleRecordButton}
          style={({ pressed }) => [
            styles.todayPanel,
            todayRecord && styles.todayPanelRecorded,
            pressed && todayRecord && styles.todayPanelRecordedPressed,
            isTodayPanelSelected && styles.todayPanelSelected,
          ]}
        >
          <View style={styles.sectionLabelRow}>
            <Text
              style={[
                styles.sectionLabel,
                hasNoTodayRecord && styles.sectionLabelEmpty,
                todayRecord && styles.todayPanelTextRecorded,
                isTodayPanelSelected && styles.todayPanelTextSelected,
              ]}
            >
              {t('home.today')}
            </Text>
            {currentDayKey ? (
              <Text
                style={[
                  styles.weekdayPill,
                  todayRecord && styles.todayPanelWeekdayRecorded,
                  isTodayPanelSelected && styles.todayPanelWeekdaySelected,
                ]}
              >
                {formatWeekdayLabel(currentDayKey)}
              </Text>
            ) : null}
          </View>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : todayRecord ? (
            <>
              <Text
                style={[
                  styles.minutes,
                  todayRecord && styles.todayPanelTextRecorded,
                  isTodayPanelSelected && styles.todayPanelTextSelected,
                ]}
              >
                {formatDuration(todayRecord.minutes_since_start, recordUnit)}
              </Text>
              <View style={styles.todayMetaRow}>
                <Text
                  style={[
                    styles.todayDate,
                    todayRecord && styles.todayPanelTextRecorded,
                    isTodayPanelSelected && styles.todayPanelTextSelected,
                  ]}
                >
                  {formatDayLabel(todayRecord.day_key)}
                </Text>
                <Text
                  style={[
                    styles.todayUpdatedAt,
                    todayRecord && styles.todayPanelTextRecorded,
                    isTodayPanelSelected && styles.todayPanelTextSelected,
                  ]}
                >
                  {t('home.updatedAt', {
                    time: new Date(`${todayRecord.updated_at.replace(' ', 'T')}Z`).toLocaleString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }),
                  })}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.minutes}>{t('home.notRecorded')}</Text>
              <Text style={styles.meta}>{currentDayKey ? formatDayLabel(currentDayKey) : ''}</Text>
            </>
          )}
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.recentRecords')}</Text>
        </View>

        <View style={styles.recordList}>
          {previousRecords.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons color={colors.muted} name="time-outline" size={24} />
              <Text style={styles.emptyText}>{t('home.noHistory')}</Text>
            </View>
          ) : (
            previousRecords.map((record) => (
              <View key={record.day_key} style={styles.recordRow}>
                <View>
                  <View style={styles.recordDateRow}>
                    <Text style={styles.recordDate}>{formatDayLabel(record.day_key)}</Text>
                    <Text style={styles.weekdayPill}>{formatWeekdayLabel(record.day_key)}</Text>
                    <Text style={styles.recordTime}>
                      {new Date(record.recorded_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recordMinutes}>
                  {formatDuration(record.minutes_since_start, recordUnit)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {recordButtonMounted ? (
        <View pointerEvents="box-none" style={styles.actionArea}>
          <RecordButton
            animatedStyle={recordButtonAnimatedStyle}
            disabled={isRecording || isHidingRecordButton || !shouldShowRecordButtonArea}
            hasRecord={Boolean(todayRecord)}
            isRecording={isRecording}
            onPress={handleRecord}
            pointerEvents={shouldShowRecordButtonArea && !isHidingRecordButton ? 'auto' : 'none'}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors, shadow } = theme;

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 118,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  todayPanel: {
    minHeight: 164,
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    ...shadow,
  },
  todayPanelRecorded: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  todayPanelRecordedPressed: {
    backgroundColor: colors.primaryDark,
  },
  todayPanelSelected: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  todayPanelTextSelected: {
    color: colors.surface,
  },
  todayPanelTextRecorded: {
    color: colors.surface,
  },
  todayPanelWeekdayRecorded: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: colors.surface,
  },
  todayPanelWeekdaySelected: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    color: colors.danger,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sectionLabelEmpty: {
    color: colors.info,
  },
  weekdayPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
  minutes: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 0,
  },
  meta: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  todayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  todayDate: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  todayUpdatedAt: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  recordList: {
    gap: spacing.sm,
  },
  recordRow: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  recordDate: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  recordTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  recordMinutes: {
    color: colors.info,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyBox: {
    minHeight: 144,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderStyle: 'dashed',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  actionArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    alignItems: 'center',
  },
  });
};
