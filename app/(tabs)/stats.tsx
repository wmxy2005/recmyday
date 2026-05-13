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
  deleteRecordByDayKey,
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
  formatWeekdayLabel,
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
  const [showEditorActions, setShowEditorActions] = useState(false);
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
  const calendarWeeks = useMemo(() => {
    const weeks = [];

    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    return weeks;
  }, [cells]);
  const todayKey = useMemo(() => formatDayKey(new Date()), []);
  const selectedRecord = selectedDayKey ? recordMap[selectedDayKey] : undefined;

  const handleSelectDay = (dayKey: string) => {
    if (selectedDayKey === dayKey) {
      setSelectedDayKey(null);
      setShowEditorActions(false);
      return;
    }

    const record = recordMap[dayKey];
    setSelectedDayKey(dayKey);
    setEditedMinutes(String(record?.minutes_since_start ?? 0));
    setShowEditorActions(false);
  };

  const handleChangeMonth = (offset: number) => {
    setSelectedDayKey(null);
    setShowEditorActions(false);
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
    setSelectedDayKey(null);
    setShowEditorActions(false);
    setIsSaving(false);
  };

  const handleClearSelectedDay = async () => {
    if (!selectedDayKey) {
      return;
    }

    setIsSaving(true);
    await deleteRecordByDayKey(db, selectedDayKey);
    await loadData();
    setEditedMinutes('0');
    setSelectedDayKey(null);
    setShowEditorActions(false);
    setIsSaving(false);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          {calendarWeeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
              {week.map((cell, dayIndex) => {
                const record = cell.dayKey ? recordMap[cell.dayKey] : undefined;
                const hasRecord = Boolean(record);
                const isWeekend = dayIndex >= 5;
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
                      cell.day && isWeekend ? styles.weekendCell : null,
                      isToday && styles.todayCell,
                      selectedDayKey !== null &&
                        selectedDayKey === cell.dayKey &&
                        styles.dayCellSelected,
                    ]}
                  >
                    {cell.day ? (
                      <>
                        <Text
                          style={[
                            styles.dayNumber,
                            hasRecord && styles.dayNumberActive,
                            isToday && styles.todayDayNumber,
                          ]}
                        >
                          {cell.day}
                        </Text>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={[
                            styles.dayMinutes,
                            hasRecord && styles.dayMinutesActive,
                            isToday && styles.todayDayMinutes,
                          ]}
                        >
                          {record ? formatDuration(record.minutes_since_start, recordUnit) : ''}
                        </Text>
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {selectedDayKey ? (
          <View style={styles.editorPanel}>
            <View style={styles.editorHeader}>
              <View style={styles.editorTitleRow}>
                <Text style={styles.editorTitle}>{formatDayLabel(selectedDayKey)}</Text>
                <Text style={styles.weekdayPill}>{formatWeekdayLabel(selectedDayKey)}</Text>
                <Text style={styles.editorSubtitle}>
                  {selectedRecord
                    ? formatDuration(selectedRecord.minutes_since_start, recordUnit)
                    : '暂无记录'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={showEditorActions ? '隐藏编辑操作' : '显示编辑操作'}
                accessibilityRole="button"
                onPress={() => setShowEditorActions((current) => !current)}
                style={styles.editButton}
              >
                <Ionicons
                  color={colors.primary}
                  name={showEditorActions ? 'close-outline' : 'create-outline'}
                  size={24}
                />
              </Pressable>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailItem}>
                <View style={styles.minutesInputRow}>
                  <TextInput
                    editable={showEditorActions && !isSaving}
                    keyboardType="number-pad"
                    onChangeText={(value) => setEditedMinutes(cleanMinutesInput(value))}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    selectTextOnFocus={showEditorActions}
                    style={[
                      styles.minutesInput,
                      !showEditorActions && styles.minutesInputDisabled,
                    ]}
                    value={editedMinutes}
                  />
                  <Text style={styles.minutesUnit}>分</Text>
                  {showEditorActions ? (
                    <Pressable
                      accessibilityLabel="清除记录"
                      accessibilityRole="button"
                      disabled={isSaving}
                      onPress={handleClearSelectedDay}
                      style={({ pressed }) => [
                        styles.clearIconButton,
                        pressed && styles.clearIconButtonPressed,
                        isSaving && styles.saveButtonDisabled,
                      ]}
                    >
                      <Ionicons color={colors.surface} name="trash-outline" size={20} />
                    </Pressable>
                  ) : null}
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

            {showEditorActions ? (
              <View style={styles.editorActions}>
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
            ) : null}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  summary: {
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  weekHeader: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: spacing.xs,
  },
  weekday: {
    flex: 1,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
  calendarGrid: {
    gap: 3,
  },
  calendarWeek: {
    flexDirection: 'row',
    gap: 3,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 0.92,
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  weekendCell: {
    backgroundColor: '#ecf6f7',
  },
  todayCell: {
    backgroundColor: colors.danger,
  },
  dayCellSelected: {
    borderColor: colors.info,
    borderWidth: 2,
  },
  emptyCell: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  dayNumberActive: {
    color: colors.primaryDark,
  },
  todayDayNumber: {
    color: colors.surface,
  },
  dayMinutes: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  dayMinutesActive: {
    color: colors.danger,
  },
  todayDayMinutes: {
    color: colors.surface,
  },
  editorPanel: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  editorTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  editButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
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
  editorSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  detailGrid: {
    gap: spacing.sm,
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
    fontSize: 12,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  minutesInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  minutesInputDisabled: {
    color: colors.muted,
    opacity: 0.8,
  },
  minutesInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  minutesUnit: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  clearIconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  clearIconButtonPressed: {
    backgroundColor: '#963634',
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  saveButton: {
    flex: 1,
    height: 42,
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
