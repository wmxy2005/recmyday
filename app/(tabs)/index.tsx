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
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { colors, radius, spacing } from '@/theme';
import {
  formatDayLabel,
  formatDuration,
  formatTimeFromMinutes,
  formatWeekdayLabel,
  type RecordUnit,
} from '@/utils/date';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [currentDayKey, setCurrentDayKey] = useState('');
  const [todayRecord, setTodayRecord] = useState<DayRecord | null>(null);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [recentRecordLimit, setRecentRecordLimit] = useState(5);
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordButton, setShowRecordButton] = useState(true);
  const hasLoadedRef = useRef(false);

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
    setShowRecordButton(!currentRecord);
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
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const previousRecords = useMemo(
    () =>
      records
        .filter((record) => record.day_key !== currentDayKey)
        .slice(0, recentRecordLimit),
    [currentDayKey, recentRecordLimit, records],
  );

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isBeforeStartTime = currentMinutes < startTimeMinutes;

  const handleRecord = async () => {
    if (isBeforeStartTime) {
      return;
    }

    setIsRecording(true);
    await upsertCurrentRecord(db);
    await loadData();
    setIsRecording(false);
  };

  const handleToggleRecordButton = () => {
    if (!todayRecord) {
      return;
    }

    setShowRecordButton((current) => !current);
  };

  const currentTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const isTodayPanelSelected = Boolean(todayRecord && showRecordButton);
  const hasNoTodayRecord = !isLoading && !todayRecord;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Rec My Day</Text>
          <Text style={styles.subtitle}>🚀开始时间 {formatTimeFromMinutes(startTimeMinutes)}</Text>
        </View>

        <Pressable
          accessibilityRole={todayRecord ? 'button' : undefined}
          disabled={!todayRecord}
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
              今天
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
                  更新于{' '}
                  {new Date(`${todayRecord.updated_at.replace(' ', 'T')}Z`).toLocaleString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.minutes}>尚未记录</Text>
              <Text style={styles.meta}>{currentDayKey ? formatDayLabel(currentDayKey) : ''}</Text>
            </>
          )}
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>最近记录</Text>
        </View>

        <View style={styles.recordList}>
          {previousRecords.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons color={colors.muted} name="time-outline" size={24} />
              <Text style={styles.emptyText}>暂无历史记录</Text>
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

      {!isBeforeStartTime && (!todayRecord || showRecordButton) ? (
        <View pointerEvents="box-none" style={styles.actionArea}>
          <Pressable
            accessibilityRole="button"
            disabled={isRecording}
            onPress={handleRecord}
            style={({ pressed }) => [
              styles.recordButton,
              todayRecord && styles.recordButtonRecorded,
              pressed &&
                (todayRecord ? styles.recordButtonRecordedPressed : styles.recordButtonPressed),
              isRecording && styles.recordButtonDisabled,
            ]}
          >
            {isRecording ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <>
                <Ionicons color={colors.surface} name="radio-button-on" size={24} />
                <View style={styles.recordButtonTextGroup}>
                  <Text style={styles.recordButtonTime}>{currentTime}</Text>
                </View>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 96,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
  },
  todayPanel: {
    minHeight: 128,
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayPanelRecorded: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  todayPanelRecordedPressed: {
    backgroundColor: '#285F88',
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
    backgroundColor: '#FDECEF',
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
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabelEmpty: {
    color: colors.info,
  },
  weekdayPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  minutes: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '800',
  },
  meta: {
    color: colors.muted,
    fontSize: 15,
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
  },
  todayUpdatedAt: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  recordList: {
    gap: spacing.sm,
  },
  recordRow: {
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recordDate: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recordTime: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  recordMinutes: {
    color: colors.info,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  actionArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
  },
  recordButton: {
    minWidth: 152,
    height: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: 32,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  recordButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  recordButtonRecorded: {
    backgroundColor: colors.danger,
  },
  recordButtonRecordedPressed: {
    backgroundColor: '#963634',
  },
  recordButtonDisabled: {
    opacity: 0.7,
  },
  recordButtonTextGroup: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  recordButtonTime: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '800',
  },
});
