import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type DayRecord,
  deleteRecordByDayKey,
  getMonthRecords,
  getMonthTotalMinutes,
  getRecordUnit,
  getStartTimeMinutes,
  upsertRecordMinutes,
} from '@/data/database';
import { radius, spacing, useAppTheme } from '@/theme';
import {
  addMonths,
  formatDayLabel,
  formatDayKey,
  formatDuration,
  formatMonthTitle,
  formatWeekdayLabel,
  formatTimeFromMinutes,
  getMonthCalendarCells,
  type RecordUnit,
} from '@/utils/date';
import { getRecordMinutesColor } from '@/utils/recordColor';

const chartMaxHeight = 104;
const chartMinHeight = 14;

function formatDateTime(value: string | undefined, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
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

function formatRecordRange(record: DayRecord, startTimeMinutes: number) {
  const start = formatTimeFromMinutes(startTimeMinutes);
  const end = new Date(record.recorded_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${start} - ${end}`;
}

function getDateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const { selectedAt, selectedDayKey: routeSelectedDayKey } = useLocalSearchParams<{
    selectedAt?: string;
    selectedDayKey?: string;
  }>();
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const scrollViewRef = useRef<ScrollView>(null);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [editedMinutes, setEditedMinutes] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showEditorActions, setShowEditorActions] = useState(false);
  const hasLoadedRef = useRef(false);
  const hideEditorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollEditorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingEditorScroll = useCallback(() => {
    if (scrollEditorTimerRef.current) {
      clearTimeout(scrollEditorTimerRef.current);
      scrollEditorTimerRef.current = null;
    }
  }, []);

  const scrollEditorIntoView = useCallback((delay = 280) => {
    clearPendingEditorScroll();

    requestAnimationFrame(() => {
      scrollEditorTimerRef.current = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
        scrollEditorTimerRef.current = null;
      }, delay);
    });
  }, [clearPendingEditorScroll]);

  const clearPendingEditorHide = useCallback(() => {
    if (hideEditorTimerRef.current) {
      clearTimeout(hideEditorTimerRef.current);
      hideEditorTimerRef.current = null;
    }
  }, []);

  const hideEditorPanel = useCallback(() => {
    clearPendingEditorHide();
    clearPendingEditorScroll();
    Keyboard.dismiss();
    setShowEditorActions(false);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ animated: true, y: 0 });
    });
    hideEditorTimerRef.current = setTimeout(() => {
      setSelectedDayKey(null);
      hideEditorTimerRef.current = null;
    }, 320);
  }, [clearPendingEditorHide, clearPendingEditorScroll]);

  useEffect(() => {
    return () => {
      clearPendingEditorHide();
      clearPendingEditorScroll();
    };
  }, [clearPendingEditorHide, clearPendingEditorScroll]);

  useEffect(() => {
    if (selectedDayKey && showEditorActions) {
      scrollEditorIntoView();
    }
  }, [scrollEditorIntoView, selectedDayKey, showEditorActions]);

  useEffect(() => {
    if (!routeSelectedDayKey) {
      return;
    }

    const dayKey = Array.isArray(routeSelectedDayKey)
      ? routeSelectedDayKey[0]
      : routeSelectedDayKey;
    const selectedDate = getDateFromDayKey(dayKey);

    if (!selectedDate) {
      return;
    }

    clearPendingEditorHide();
    clearPendingEditorScroll();
    setMonthDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setSelectedDayKey(dayKey);
  }, [
    clearPendingEditorHide,
    clearPendingEditorScroll,
    routeSelectedDayKey,
    selectedAt,
  ]);

  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(eventName, () => {
      if (selectedDayKey && showEditorActions) {
        scrollEditorIntoView();
      }
    });

    return () => subscription.remove();
  }, [selectedDayKey, showEditorActions, scrollEditorIntoView]);

  const weekdays = t('stats.weekdaysShort', { returnObjects: true }) as string[];

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const [monthRecords, total, unit, startTime] = await Promise.all([
      getMonthRecords(db, monthDate),
      getMonthTotalMinutes(db, monthDate),
      getRecordUnit(db),
      getStartTimeMinutes(db),
    ]);

    setRecords(monthRecords);
    setTotalMinutes(total);
    setRecordUnit(unit);
    setStartTimeMinutes(startTime);
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
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      monthDate.getFullYear() === now.getFullYear() && monthDate.getMonth() === now.getMonth()
    );
  }, [monthDate]);
  const calendarWeeks = useMemo(() => {
    const weeks = [];

    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    return weeks;
  }, [cells]);
  const todayKey = useMemo(() => formatDayKey(new Date()), []);
  const selectedRecord = selectedDayKey ? recordMap[selectedDayKey] : undefined;
  const chartRecords = useMemo(() => {
    const latestRecords = records.slice(-7);
    const maxMinutes = Math.max(...latestRecords.map((record) => record.minutes_since_start), 1);

    return latestRecords.map((record) => ({
      dayKey: record.day_key,
      height: Math.max(
        chartMinHeight,
        Math.round((record.minutes_since_start / maxMinutes) * chartMaxHeight),
      ),
      minutes: record.minutes_since_start,
    }));
  }, [records]);

  useEffect(() => {
    if (selectedDayKey && !isSaving) {
      setEditedMinutes(String(selectedRecord?.minutes_since_start ?? 0));
    }
  }, [isSaving, selectedDayKey, selectedRecord?.minutes_since_start]);

  const handleSelectDay = (dayKey: string) => {
    if (selectedDayKey === dayKey) {
      clearPendingEditorHide();
      clearPendingEditorScroll();
      Keyboard.dismiss();
      setSelectedDayKey(null);
      setEditedMinutes('0');
      setShowEditorActions(false);
      return;
    }

    const record = recordMap[dayKey];
    clearPendingEditorHide();
    clearPendingEditorScroll();
    setSelectedDayKey(dayKey);
    setEditedMinutes(String(record?.minutes_since_start ?? 0));
  };

  const handleChangeMonth = (offset: number) => {
    hideEditorPanel();
    setMonthDate((current) => addMonths(current, offset));
  };

  const handleGoToCurrentMonth = () => {
    hideEditorPanel();
    setMonthDate(new Date());
  };

  const handleSaveSelectedDay = async () => {
    if (!selectedDayKey) {
      return;
    }

    const parsedMinutes = Number(editedMinutes);

    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 0) {
      Alert.alert(t('stats.invalidMinutesTitle'), t('stats.invalidMinutesMessage'));
      return;
    }

    setIsSaving(true);
    await upsertRecordMinutes(db, selectedDayKey, parsedMinutes);
    await loadData();
    setEditedMinutes(String(parsedMinutes));
    setIsSaving(false);
  };

  const clearSelectedDay = async (dayKey: string) => {
    setIsSaving(true);
    await deleteRecordByDayKey(db, dayKey);
    await loadData();
    setEditedMinutes('0');
    setIsSaving(false);
  };

  const handleClearSelectedDay = () => {
    if (!selectedDayKey) {
      return;
    }

    const dayKey = selectedDayKey;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `${t('stats.confirmClearTitle')}\n\n${t('stats.confirmClearMessage')}`,
      );

      if (confirmed) {
        void clearSelectedDay(dayKey);
      }

      return;
    }

    Alert.alert(t('stats.confirmClearTitle'), t('stats.confirmClearMessage'), [
      {
        style: 'cancel',
        text: t('stats.cancel'),
      },
      {
        onPress: () => {
          void clearSelectedDay(dayKey);
        },
        style: 'destructive',
        text: t('stats.confirmClearAction'),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.titleHeader}>
          <Text style={styles.screenTitle}>{t('tabs.stats')}</Text>
        </View>

        <View style={styles.monthSelector}>
          <Pressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(-1)}
            style={styles.monthButton}
          >
            <Ionicons color={colors.text} name="chevron-back" size={23} />
          </Pressable>

          <Pressable
            accessibilityLabel={t('stats.goToCurrentMonth')}
            accessibilityRole="button"
            disabled={isCurrentMonth}
            onPress={handleGoToCurrentMonth}
            style={styles.monthTitleGroup}
          >
            <Text style={styles.monthTitle}>{formatMonthTitle(monthDate)}</Text>
            <Ionicons color={colors.text} name="caret-down" size={13} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(1)}
            style={styles.monthButton}
          >
            <Ionicons color={colors.highlight} name="chevron-forward" size={23} />
          </Pressable>
        </View>

        <LinearGradient
          colors={['#14BDB4', '#5FD9CD', '#BEEFE6']}
          end={{ x: 1, y: 0 }}
          start={{ x: 0, y: 1 }}
          style={styles.summary}
        >
          <View>
            <Text style={styles.summaryLabel}>{t('stats.monthTotal')}</Text>
            {isLoading ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.summaryValue}>{formatDuration(totalMinutes, recordUnit)}</Text>
            )}
          </View>
          <View style={styles.chart}>
            {chartRecords.map((record, index) => (
              <View
                key={record.dayKey}
                style={[
                  styles.chartBar,
                  {
                    height: record.height,
                    backgroundColor: getRecordMinutesColor(record.minutes),
                    opacity: 0.66 + index * 0.04,
                  },
                ]}
              />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.calendarCard}>
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
                {week.map((cell) => {
                  const record = cell.dayKey ? recordMap[cell.dayKey] : undefined;
                  const isToday = cell.dayKey === todayKey;
                  const isSelected = selectedDayKey !== null && selectedDayKey === cell.dayKey;

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
                        isToday && styles.todayCell,
                        isSelected && styles.dayCellSelected,
                      ]}
                    >
                      {cell.day ? (
                        <>
                          <Text
                            style={[
                              styles.dayNumber,
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
                              record && {
                                color: getRecordMinutesColor(record.minutes_since_start),
                              },
                              isToday && styles.todayDayMinutes,
                            ]}
                          >
                            {record
                              ? recordUnit === 'minutes'
                                ? record.minutes_since_start
                                : formatDuration(record.minutes_since_start, recordUnit)
                              : ''}
                          </Text>
                        </>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.editorPanel, showEditorActions && styles.editorPanelActive]}>
          <Pressable
            accessibilityLabel={
              showEditorActions ? t('stats.hideEditActions') : t('stats.showEditActions')
            }
            accessibilityRole="button"
            disabled={!selectedDayKey}
            onPress={() => setShowEditorActions((current) => !current)}
            style={styles.editorOptionRow}
          >
            <View style={styles.editorIconTile}>
              <Ionicons color={colors.info} name="create-outline" size={24} />
            </View>
            <View style={styles.editorRowCopy}>
              <View style={styles.editorTitleLine}>
                <Text style={[styles.editorTitle, showEditorActions && { color: colors.info }]}>
                  {selectedDayKey ? formatDayLabel(selectedDayKey) : t('stats.noSelectedDay')}
                </Text>
                {selectedDayKey ? (
                  <Text style={styles.weekdayPill}>{formatWeekdayLabel(selectedDayKey)}</Text>
                ) : null}
              </View>
              <Text style={styles.editorSubtitle}>
                {selectedRecord
                  ? formatRecordRange(selectedRecord, startTimeMinutes)
                  : t('stats.noRecord')}
              </Text>
            </View>
            <Text style={[styles.editorRowValue, showEditorActions && { color: colors.info }]}>
              {selectedRecord
                ? formatDuration(selectedRecord.minutes_since_start, recordUnit)
                : t('stats.noRecord')}
            </Text>
            <Ionicons
              color={showEditorActions ? colors.info : colors.mutedSubtle}
              name={showEditorActions ? 'chevron-up' : 'chevron-forward'}
              size={20}
            />
          </Pressable>

          {showEditorActions && selectedDayKey ? (
            <View onLayout={() => scrollEditorIntoView()} style={styles.editorBody}>
              <Text style={[styles.optionTitle, { color: colors.info }]}>
                {t('stats.editRecordDetails')}
              </Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <View style={styles.minutesInputRow}>
                    <TextInput
                      editable={!isSaving}
                      keyboardType="number-pad"
                      onFocus={() => scrollEditorIntoView()}
                      onChangeText={(value) => setEditedMinutes(cleanMinutesInput(value))}
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      selectTextOnFocus
                      style={styles.minutesInput}
                      value={editedMinutes}
                    />
                    <Text style={styles.minutesUnit}>{t('date.minutesUnit')}</Text>
                    <Pressable
                      accessibilityLabel={t('stats.clearRecord')}
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
                  </View>
                </View>
                <View style={styles.timeInfoRow}>
                  <View style={styles.timeInfoItem}>
                    <Text style={styles.detailLabel}>{t('stats.createdAt')}</Text>
                    <Text style={styles.detailValue}>
                      {formatDateTime(selectedRecord?.created_at, t('stats.noData'))}
                    </Text>
                  </View>
                  <View style={styles.timeInfoItem}>
                    <Text style={styles.detailLabel}>{t('stats.lastUpdated')}</Text>
                    <Text style={styles.detailValue}>
                      {formatDateTime(selectedRecord?.updated_at, t('stats.noData'))}
                    </Text>
                  </View>
                </View>
              </View>

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
                  <Text style={styles.saveText}>
                    {isSaving ? t('stats.saving') : t('stats.save')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 132,
  },
  titleHeader: {
    minHeight: 54,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  monthSelector: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadow,
  },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  monthTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minWidth: 160,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    includeFontPadding: false,
  },
  summary: {
    minHeight: 142,
    padding: spacing.xl,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    ...shadow,
    overflow: 'hidden',
  },
  summaryLabel: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  summaryValue: {
    color: colors.surface,
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
    textShadowColor: 'rgba(0,0,0,0.16)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  chart: {
    width: 126,
    height: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 9,
  },
  chartBar: {
    width: 12,
    borderRadius: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  weekday: {
    flex: 1,
    color: colors.textSoft,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  calendarCard: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  calendarGrid: {
    gap: spacing.sm,
  },
  calendarWeek: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 0.94,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  todayCell: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  dayCellSelected: {
    borderColor: colors.highlight,
  },
  emptyCell: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  todayDayNumber: {
    color: colors.surface,
  },
  dayMinutes: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    minHeight: 15,
    marginTop: 2,
  },
  todayDayMinutes: {
    color: colors.surface,
  },
  editorPanel: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    marginTop: spacing.lg,
    overflow: 'hidden',
    ...shadow,
  },
  editorPanelActive: {
    borderColor: '#83DED8',
    backgroundColor: '#F5FFFE',
  },
  editorOptionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editorIconTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoSoft,
  },
  editorRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  editorTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  editorTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  weekdayPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.infoSoft,
    color: colors.info,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  editorSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  editorRowValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 0,
  },
  editorBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: spacing.md,
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
    minWidth: 0,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
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
    flexShrink: 0,
  },
  clearIconButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    flexShrink: 0,
  },
  clearIconButtonPressed: {
    backgroundColor: colors.dangerDark,
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: radius.lg,
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
};
