import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type DayRecord,
  getMonthRecords,
  getMonthTotalMinutes,
  getRecordUnit,
  upsertRecordMinutes,
} from '@/data/database';
import { colors, radius, spacing } from '@/theme';
import {
  addMonths,
  formatDayLabel,
  formatDayKey,
  formatDuration,
  formatMonthTitle,
  getMonthCalendarCells,
  type RecordUnit,
} from '@/utils/date';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

function formatDateTime(value: string | undefined) {
  if (!value) {
    return '暂无';
  }

  return new Date(`${value.replace(' ', 'T')}Z`).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function cleanMinutesInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 5);
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [editedMinutes, setEditedMinutes] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const [monthRecords, total, unit] = await Promise.all([
      getMonthRecords(db, monthDate),
      getMonthTotalMinutes(db, monthDate),
      getRecordUnit(db),
    ]);

    setRecords(monthRecords);
    setTotalMinutes(total);
    setRecordUnit(unit);
    setIsLoading(false);
  }, [db, monthDate]);

  useFocusEffect(
    useCallback(() => {
      const showLoading = !hasLoadedRef.current;
      hasLoadedRef.current = true;
      loadData(showLoading);
    }, [loadData]),
  );

  const recordMap = useMemo(() => {
    return records.reduce<Record<string, DayRecord>>((map, record) => {
      map[record.day_key] = record;
      return map;
    }, {});
  }, [records]);

  const cells = useMemo(() => getMonthCalendarCells(monthDate), [monthDate]);
  const todayKey = useMemo(() => formatDayKey(new Date()), []);
  const selectedRecord = selectedDayKey ? recordMap[selectedDayKey] : undefined;

  const handleSelectDay = (dayKey: string) => {
    if (selectedDayKey === dayKey) {
      setSelectedDayKey(null);
      return;
    }

    const record = recordMap[dayKey];
    setSelectedDayKey(dayKey);
    setEditedMinutes(String(record?.minutes_since_start ?? 0));
  };

  const handleChangeMonth = (offset: number) => {
    setSelectedDayKey(null);
    setMonthDate((current) => addMonths(current, offset));
  };

  const handleSaveSelectedDay = async () => {
    if (!selectedDayKey) {
      return;
    }

    const parsedMinutes = Number(editedMinutes);

    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 0) {
      Alert.alert('分钟数无效', '请输入大于或等于 0 的整数。');
      return;
    }

    setIsSaving(true);
    await upsertRecordMinutes(db, selectedDayKey, parsedMinutes);
    await loadData();
    setEditedMinutes(String(parsedMinutes));
    setIsSaving(false);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(-1)}
            style={styles.monthButton}
          >
            <Ionicons color={colors.text} name="chevron-back" size={22} />
          </Pressable>

          <Text style={styles.monthTitle}>{formatMonthTitle(monthDate)}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(1)}
            style={styles.monthButton}
          >
            <Ionicons color={colors.text} name="chevron-forward" size={22} />
          </Pressable>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>当月总计</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.summaryValue}>{formatDuration(totalMinutes, recordUnit)}</Text>
          )}
        </View>

        <View style={styles.weekHeader}>
          {weekdays.map((weekday) => (
            <Text key={weekday} style={styles.weekday}>
              {weekday}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {cells.map((cell, index) => {
            const record = cell.dayKey ? recordMap[cell.dayKey] : undefined;
            const hasRecord = Boolean(record);
            const isWeekend = index % 7 >= 5;
            const isToday = cell.dayKey === todayKey;

            return (
              <Pressable
                key={cell.key}
                accessibilityRole={cell.day ? 'button' : undefined}
                disabled={!cell.dayKey}
                onPress={() => {
                  if (cell.dayKey) {
                    handleSelectDay(cell.dayKey);
                  }
                }}
                style={[
                  styles.dayCell,
                  !cell.day && styles.emptyCell,
                  hasRecord && styles.dayCellActive,
                  cell.day && isWeekend ? styles.weekendCell : null,
                  isToday && styles.todayCell,
                  selectedDayKey !== null &&
                    selectedDayKey === cell.dayKey &&
                    styles.dayCellSelected,
                ]}
              >
                {cell.day ? (
                  <>
                    <Text style={[styles.dayNumber, hasRecord && styles.dayNumberActive]}>
                      {cell.day}
                    </Text>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={[styles.dayMinutes, hasRecord && styles.dayMinutesActive]}
                    >
                      {record ? formatDuration(record.minutes_since_start, recordUnit) : ''}
                    </Text>
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {selectedDayKey ? (
          <View style={styles.editorPanel}>
            <View style={styles.editorHeader}>
              <View style={styles.editorTitleRow}>
                <Text style={styles.editorTitle}>{formatDayLabel(selectedDayKey)}</Text>
                <Text style={styles.editorSubtitle}>
                  {selectedRecord
                    ? formatDuration(selectedRecord.minutes_since_start, recordUnit)
                    : '暂无记录'}
                </Text>
              </View>
              <Ionicons color={colors.primary} name="create-outline" size={24} />
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailItem}>
                <View style={styles.minutesInputRow}>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => setEditedMinutes(cleanMinutesInput(value))}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={styles.minutesInput}
                    value={editedMinutes}
                  />
                  <Text style={styles.minutesUnit}>分</Text>
                </View>
              </View>
              <View style={styles.timeInfoRow}>
                <View style={styles.timeInfoItem}>
                  <Text style={styles.detailLabel}>创建时间</Text>
                  <Text style={styles.detailValue}>
                    {formatDateTime(selectedRecord?.created_at)}
                  </Text>
                </View>
                <View style={styles.timeInfoItem}>
                  <Text style={styles.detailLabel}>最后更新</Text>
                  <Text style={styles.detailValue}>
                    {formatDateTime(selectedRecord?.updated_at)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.editorActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => setSelectedDayKey(null)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={handleSaveSelectedDay}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.saveButtonPressed,
                  isSaving && styles.saveButtonDisabled,
                ]}
              >
                <Text style={styles.saveText}>{isSaving ? '保存中' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  summary: {
    minHeight: 122,
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  summaryLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekday: {
    flex: 1,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dayCell: {
    width: `${(100 - 6 * 1.2) / 7}%`,
    aspectRatio: 0.92,
    minHeight: 58,
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  dayCellActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
  },
  weekendCell: {
    backgroundColor: '#FFF3E8',
  },
  todayCell: {
    backgroundColor: '#E6F0FF',
  },
  dayCellSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  emptyCell: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dayNumberActive: {
    color: colors.primaryDark,
  },
  dayMinutes: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  dayMinutesActive: {
    color: colors.accent,
  },
  editorPanel: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  editorTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editorTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  editorSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  detailGrid: {
    gap: spacing.md,
  },
  detailItem: {
    gap: spacing.xs,
  },
  timeInfoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeInfoItem: {
    flex: 1,
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  minutesInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  minutesInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  minutesUnit: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
});
