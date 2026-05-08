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

  const handleRecord = async () => {
    setIsRecording(true);
    await upsertCurrentRecord(db);
    await loadData();
    setIsRecording(false);
  };

  const currentTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Rec My Day</Text>
          <Text style={styles.subtitle}>起始时间 {formatTimeFromMinutes(startTimeMinutes)}</Text>
        </View>

        <View style={styles.todayPanel}>
          <Text style={styles.sectionLabel}>今天</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : todayRecord ? (
            <>
              <Text style={styles.minutes}>
                {formatDuration(todayRecord.minutes_since_start, recordUnit)}
              </Text>
              <Text style={styles.meta}>{formatDayLabel(todayRecord.day_key)}</Text>
              <Text style={styles.updatedAt}>
                更新于{' '}
                {new Date(`${todayRecord.updated_at.replace(' ', 'T')}Z`).toLocaleString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.minutes}>尚未记录</Text>
              <Text style={styles.meta}>{currentDayKey ? formatDayLabel(currentDayKey) : ''}</Text>
            </>
          )}
        </View>

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
                  <Text style={styles.recordDate}>{formatDayLabel(record.day_key)}</Text>
                  <Text style={styles.recordTime}>
                    {new Date(record.recorded_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.recordMinutes}>
                  {formatDuration(record.minutes_since_start, recordUnit)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.actionArea}>
        <Pressable
          accessibilityRole="button"
          disabled={isRecording}
          onPress={handleRecord}
          style={({ pressed }) => [
            styles.recordButton,
            pressed && styles.recordButtonPressed,
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
    paddingBottom: 20,
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
    minHeight: 168,
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.sm,
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
  updatedAt: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  recordList: {
    gap: spacing.md,
  },
  recordRow: {
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordDate: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recordTime: {
    color: colors.muted,
    fontSize: 13,
    marginTop: spacing.xs,
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
