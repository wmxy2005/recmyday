import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { AnimatedSheetModal } from '@/components/AnimatedSheetModal';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import {
  type DayRecord,
  deleteRecordById,
  getMonthRecords,
  getMonthTotalMinutes,
  insertManualRecord,
  updateManualRecordById,
} from '@/data/database';
import { readRecordSettings } from '@/hooks/useRecordSettings';
import { radius, spacing, useAppTheme } from '@/theme';
import {
  addMonths,
  formatDayLabel,
  formatDayKey,
  formatDetailedDuration,
  formatDuration,
  formatMonthTitle,
  formatWeekdayLabel,
  getMonthCalendarCells,
  type RecordUnit,
} from '@/utils/date';
import { getRecordMinutesColor } from '@/utils/recordColor';
import {
  formatRecordDateTime,
  formatRecordRange,
  getRecordStartEndMinutes,
} from '@/utils/recordFormat';

const chartMaxHeight = 104;
const chartMinHeight = 14;
const deleteActionWidth = 82;

type EditorTimeSection = 'start' | 'end';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatTimeInput(minutes: number) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function parseTimeInput(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function cleanTimeInput(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 5);
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
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [separateRecordEnabled, setSeparateRecordEnabled] = useState(false);
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [dayRecordsSheetVisible, setDayRecordsSheetVisible] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [recordEditorVisible, setRecordEditorVisible] = useState(false);
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<number | null>(null);
  const [promptDialog, setPromptDialog] = useState<{ message: string; title: string } | null>(null);
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('09:30');
  const [expandedEditorTimeSection, setExpandedEditorTimeSection] =
    useState<EditorTimeSection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);

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

    setMonthDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setSelectedDayKey(dayKey);
    setDayRecordsSheetVisible(true);
  }, [routeSelectedDayKey, selectedAt]);

  const weekdays = t('stats.weekdaysShort', { returnObjects: true }) as string[];

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const [monthRecords, total, settings] = await Promise.all([
      getMonthRecords(db, monthDate),
      getMonthTotalMinutes(db, monthDate),
      readRecordSettings(db),
    ]);

    setRecords(monthRecords);
    setTotalMinutes(total);
    setRecordUnit(settings.recordUnit);
    setSeparateRecordEnabled(settings.separateRecordEnabled);
    setStartTimeMinutes(settings.startTimeMinutes);
    setIsLoading(false);
  }, [db, monthDate]);

  useFocusEffect(
    useCallback(() => {
      const showLoading = !hasLoadedRef.current;
      hasLoadedRef.current = true;
      loadData(showLoading);
    }, [loadData]),
  );

  const recordsByDay = useMemo(() => {
    return records.reduce<Record<string, DayRecord[]>>((map, record) => {
      if (!map[record.day_key]) {
        map[record.day_key] = [];
      }

      map[record.day_key].push(record);
      return map;
    }, {});
  }, [records]);

  const dayTotals = useMemo(() => {
    return Object.entries(recordsByDay).reduce<Record<string, number>>(
      (map, [dayKey, dayRecords]) => {
        map[dayKey] = dayRecords.reduce((sum, record) => sum + record.minutes_since_start, 0);
        return map;
      },
      {},
    );
  }, [recordsByDay]);

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
  const selectedDayRecords = useMemo(() => {
    const dayRecords = selectedDayKey ? recordsByDay[selectedDayKey] ?? [] : [];

    return [...dayRecords].sort((left, right) => {
      const leftRange = getRecordStartEndMinutes(left);
      const rightRange = getRecordStartEndMinutes(right);

      return (
        rightRange.endMinutes - leftRange.endMinutes ||
        rightRange.startMinutes - leftRange.startMinutes
      );
    });
  }, [recordsByDay, selectedDayKey]);
  const selectedDayTotal = selectedDayRecords.reduce(
    (sum, record) => sum + record.minutes_since_start,
    0,
  );
  const canCreateSelectedDayRecord =
    selectedDayKey !== null && (!separateRecordEnabled || selectedDayRecords.length === 0);
  const chartRecords = useMemo(() => {
    const latestRecords = records.slice(-7);
    const maxMinutes = Math.max(...latestRecords.map((record) => record.minutes_since_start), 1);

    return latestRecords.map((record) => ({
      dayKey: record.day_key,
      id: record.id,
      height: Math.max(
        chartMinHeight,
        Math.round((record.minutes_since_start / maxMinutes) * chartMaxHeight),
      ),
      minutes: record.minutes_since_start,
    }));
  }, [records]);

  const handleSelectDay = (dayKey: string) => {
    if (selectedDayKey === dayKey) {
      setDayRecordsSheetVisible(false);
      return;
    }

    setSelectedDayKey(dayKey);
    setDayRecordsSheetVisible(true);
  };

  const handleChangeMonth = (offset: number) => {
    setDayRecordsSheetVisible(false);
    setMonthDate((current) => addMonths(current, offset));
  };

  const handleGoToCurrentMonth = () => {
    setDayRecordsSheetVisible(false);
    setMonthDate(new Date());
  };

  const handleRequestDeleteRecord = (recordId: number) => {
    setPendingDeleteRecordId(recordId);
  };

  const handleCancelDeleteRecord = () => {
    setPendingDeleteRecordId(null);
  };

  const handleConfirmDeleteRecord = async () => {
    if (pendingDeleteRecordId === null) {
      return;
    }

    const recordId = pendingDeleteRecordId;
    setPendingDeleteRecordId(null);
    await deleteRecordById(db, recordId);
    await loadData();
  };

  const handleOpenCreateRecord = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    setEditingRecordId(null);
    setDraftStartTime(formatTimeInput(startTimeMinutes));
    setDraftEndTime(formatTimeInput(currentMinutes));
    setExpandedEditorTimeSection(null);
    setRecordEditorVisible(true);
  };

  const handleOpenEditRecord = (record: DayRecord) => {
    const { endMinutes, startMinutes } = getRecordStartEndMinutes(record);
    setEditingRecordId(record.id);
    setDraftStartTime(formatTimeInput(startMinutes));
    setDraftEndTime(formatTimeInput(endMinutes));
    setExpandedEditorTimeSection(null);
    setRecordEditorVisible(true);
  };

  const handleCloseRecordEditor = () => {
    setRecordEditorVisible(false);
  };

  const handleCloseDayRecords = () => {
    setDayRecordsSheetVisible(false);
  };

  const handleDayRecordsExitComplete = useCallback(() => {
    if (recordEditorVisible) {
      return;
    }

    setSelectedDayKey(null);
  }, [recordEditorVisible]);

  const handleRecordEditorExitComplete = useCallback(() => {
    setEditingRecordId(null);
    setExpandedEditorTimeSection(null);
  }, []);

  const handleSaveRecordEditor = async () => {
    if (!selectedDayKey) {
      return;
    }

    const startMinutes = parseTimeInput(draftStartTime);
    const endMinutes = parseTimeInput(draftEndTime);

    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setPromptDialog({
        title: t('stats.invalidRecordTimeTitle'),
        message: t('stats.invalidRecordTimeMessage'),
      });
      return;
    }

    if (editingRecordId === null) {
      await insertManualRecord(db, selectedDayKey, startMinutes, endMinutes);
    } else {
      await updateManualRecordById(db, editingRecordId, selectedDayKey, startMinutes, endMinutes);
    }

    setRecordEditorVisible(false);
    await loadData();
  };

  const renderEditorTimePicker = (
    section: EditorTimeSection,
    label: string,
    value: string,
    iconName: IoniconName,
    accentColor: string,
    iconBackground: string,
    onChange: (value: string) => void,
  ) => {
    const isExpanded = expandedEditorTimeSection === section;
    const timeMinutes = parseTimeInput(value) ?? 0;

    return (
      <View
        style={[
          styles.editorTimeCard,
          isExpanded && { borderColor: accentColor, backgroundColor: '#FFFDFC' },
        ]}
      >
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setExpandedEditorTimeSection(isExpanded ? null : section)}
          pressedScale={0.985}
          style={styles.editorTimeRow}
        >
          <View style={styles.editorInputMain}>
            <View style={[styles.editorInputIcon, { backgroundColor: iconBackground }]}>
              <Ionicons color={accentColor} name={iconName} size={22} />
            </View>
            <Text style={styles.editorInputLabel}>{label}</Text>
          </View>
          <Text style={[styles.editorTimeValue, isExpanded && { color: accentColor }]}>
            {value}
          </Text>
          <Ionicons
            color={isExpanded ? accentColor : colors.mutedSubtle}
            name={isExpanded ? 'chevron-up' : 'chevron-forward'}
            size={21}
          />
        </AnimatedPressable>

        {isExpanded ? (
          <View style={styles.editorTimePickerBody}>
            <TimeWheelPicker
              accentColor={accentColor}
              onChangeMinutes={(minutes) => onChange(formatTimeInput(minutes))}
              style={styles.editorTimePicker}
              valueMinutes={timeMinutes}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.titleHeader}>
          <Text style={styles.screenTitle}>{t('tabs.stats')}</Text>
          <AnimatedPressable
            accessibilityLabel={t('stats.goToCurrentMonth')}
            accessibilityRole="button"
            disabled={isCurrentMonth}
            hitSlop={10}
            onPress={handleGoToCurrentMonth}
            pressedScale={0.9}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed && styles.headerIconButtonPressed,
              isCurrentMonth && styles.headerIconButtonDisabled,
            ]}
          >
            <Ionicons color={colors.text} name="today-outline" size={24} />
          </AnimatedPressable>
        </View>

        <View style={styles.monthSelector}>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(-1)}
            pressedScale={0.9}
            pressedTranslateX={-4}
            style={styles.monthButton}
          >
            <Ionicons color={colors.text} name="chevron-back" size={23} />
          </AnimatedPressable>

          <View style={styles.monthTitleGroup}>
            <Text style={styles.monthTitle}>{formatMonthTitle(monthDate)}</Text>
          </View>

          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => handleChangeMonth(1)}
            pressedScale={0.9}
            pressedTranslateX={4}
            style={styles.monthButton}
          >
            <Ionicons color={colors.highlight} name="chevron-forward" size={23} />
          </AnimatedPressable>
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
                key={`${record.dayKey}-${record.id}`}
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
                  const dayTotal = cell.dayKey ? dayTotals[cell.dayKey] : undefined;
                  const isToday = cell.dayKey === todayKey;
                  const isSelected = selectedDayKey !== null && selectedDayKey === cell.dayKey;

                  return (
                    <AnimatedPressable
                      key={cell.key}
                      accessibilityRole={cell.day ? 'button' : undefined}
                      containerStyle={styles.dayCellContainer}
                      disabled={!cell.dayKey}
                      onPress={() => {
                        if (cell.dayKey) {
                          handleSelectDay(cell.dayKey);
                        }
                      }}
                      pressedScale={cell.dayKey ? 0.94 : 1}
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
                              dayTotal !== undefined && {
                                color: getRecordMinutesColor(dayTotal),
                              },
                              isToday && styles.todayDayMinutes,
                            ]}
                          >
                            {dayTotal !== undefined
                              ? recordUnit === 'minutes'
                                ? dayTotal
                                : formatDuration(dayTotal, recordUnit)
                              : ''}
                          </Text>
                        </>
                      ) : null}
                    </AnimatedPressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
        </ScrollView>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={handleCloseDayRecords}
        onExitComplete={handleDayRecordsExitComplete}
        overlay={
          <ConfirmationDialog
            cancelLabel={t('stats.cancel')}
            confirmLabel={t('stats.delete')}
            contained
            iconName="trash-outline"
            message={t('stats.confirmClearMessage')}
            onCancel={handleCancelDeleteRecord}
            onConfirm={handleConfirmDeleteRecord}
            title={`${t('stats.deleteRecord')}?`}
            variant="danger"
            visible={pendingDeleteRecordId !== null}
          />
        }
        sheetStyle={styles.dayRecordsSheet}
        visible={selectedDayKey !== null && dayRecordsSheetVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <View style={styles.editorTitleLine}>
              <Text style={styles.sheetTitle}>
                {selectedDayKey ? formatDayLabel(selectedDayKey) : t('stats.noSelectedDay')}
              </Text>
              {selectedDayKey ? (
                <Text style={styles.weekdayPill}>{formatWeekdayLabel(selectedDayKey)}</Text>
              ) : null}
            </View>
            <Text style={styles.sheetSubtitle}>
              {t('stats.dayTotal', {
                count: selectedDayRecords.length,
                value: formatDuration(selectedDayTotal, recordUnit),
              })}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={handleCloseDayRecords}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {selectedDayRecords.length > 0 ? (
            selectedDayRecords.map((record) => (
              <SwipeRecordRow
                colors={colors}
                deleteActionHidden={pendingDeleteRecordId !== null}
                key={record.id}
                onDelete={handleRequestDeleteRecord}
                onEdit={handleOpenEditRecord}
                record={record}
                recordUnit={recordUnit}
                startTimeMinutes={startTimeMinutes}
                styles={styles}
                t={t}
              />
            ))
          ) : (
            <View style={styles.emptyRecords}>
              <Ionicons color={colors.mutedSubtle} name="calendar-clear-outline" size={26} />
              <Text style={styles.emptyRecordsText}>{t('stats.noRecord')}</Text>
            </View>
          )}
        </ScrollView>
        {canCreateSelectedDayRecord ? (
          <>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={handleOpenCreateRecord}
              pressedScale={0.96}
              pressedTranslateY={1}
              style={styles.createRecordButton}
            >
              <Ionicons color={colors.surface} name="add" size={28} />
              <Text style={styles.createRecordText}>{t('stats.newRecord')}</Text>
            </AnimatedPressable>
            <Text style={styles.createRecordHint}>{t('stats.newRecordHint')}</Text>
          </>
        ) : null}
      </AnimatedSheetModal>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        dimBackdrop={false}
        onClose={handleCloseRecordEditor}
        onExitComplete={handleRecordEditorExitComplete}
        sheetStyle={styles.recordEditorSheet}
        visible={recordEditorVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.editorSheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>
              {editingRecordId === null ? t('stats.newRecord') : t('stats.editRecord')}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {selectedDayKey ? formatDayLabel(selectedDayKey) : t('stats.noSelectedDay')}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={handleCloseRecordEditor}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>

        <View style={styles.editorForm}>
          {renderEditorTimePicker(
            'start',
            t('stats.startTime'),
            draftStartTime,
            'time-outline',
            colors.accent,
            colors.primarySoft,
            (value) => setDraftStartTime(cleanTimeInput(value)),
          )}
          {renderEditorTimePicker(
            'end',
            t('stats.endTime'),
            draftEndTime,
            'time',
            colors.info,
            colors.infoSoft,
            (value) => setDraftEndTime(cleanTimeInput(value)),
          )}
          <View style={styles.editorInputRow}>
            <View style={styles.editorInputMain}>
              <View style={[styles.editorInputIcon, { backgroundColor: '#EAF4FF' }]}>
                <Ionicons color={colors.highlight} name="hourglass-outline" size={22} />
              </View>
              <Text style={styles.editorInputLabel}>{t('stats.duration')}</Text>
            </View>
            <Text style={styles.editorDurationValue}>
              {(() => {
                const startMinutes = parseTimeInput(draftStartTime);
                const endMinutes = parseTimeInput(draftEndTime);

                return startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                  ? formatDetailedDuration(endMinutes - startMinutes)
                  : t('stats.autoCalculate');
              })()}
            </Text>
          </View>
        </View>

        <View style={styles.editorSheetActions}>
          <AnimatedPressable
            accessibilityRole="button"
            containerStyle={styles.cancelRecordButtonContainer}
            onPress={handleCloseRecordEditor}
            pressedScale={0.96}
            pressedTranslateY={1}
            style={styles.cancelRecordButton}
          >
            <Text style={styles.cancelRecordText}>{t('stats.cancel')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            containerStyle={styles.saveRecordButtonContainer}
            onPress={handleSaveRecordEditor}
            pressedScale={0.96}
            pressedTranslateY={1}
            style={styles.saveRecordButton}
          >
            <Text style={styles.saveRecordText}>{t('stats.saveRecord')}</Text>
          </AnimatedPressable>
        </View>
      </AnimatedSheetModal>
      <ConfirmationDialog
        confirmLabel={t('stats.promptOk')}
        iconName="alert-circle-outline"
        message={promptDialog?.message ?? ''}
        onConfirm={() => setPromptDialog(null)}
        title={promptDialog?.title ?? ''}
        variant="danger"
        visible={promptDialog !== null}
      />
    </SafeAreaView>
  );
}

type SwipeRecordRowProps = {
  colors: ReturnType<typeof useAppTheme>['colors'];
  deleteActionHidden?: boolean;
  onDelete: (id: number) => void;
  onEdit: (record: DayRecord) => void;
  record: DayRecord;
  recordUnit: RecordUnit;
  startTimeMinutes: number;
  styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useTranslation>['t'];
};

function SwipeRecordRow({
  colors,
  deleteActionHidden = false,
  onDelete,
  onEdit,
  record,
  recordUnit,
  startTimeMinutes,
  styles,
  t,
}: SwipeRecordRowProps) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const latestTranslateXRef = useRef(0);

  const isHorizontalSwipe = useCallback(
    (dx: number, dy: number) =>
      !deleteActionHidden && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.25,
    [deleteActionHidden],
  );

  const snapTo = useCallback(
    (value: number) => {
      latestTranslateXRef.current = value;
      RNAnimated.spring(translateX, {
        bounciness: 0,
        speed: 18,
        toValue: value,
        useNativeDriver: true,
      }).start();
    },
    [translateX],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          isHorizontalSwipe(gestureState.dx, gestureState.dy),
        onMoveShouldSetPanResponder: (_, gestureState) =>
          isHorizontalSwipe(gestureState.dx, gestureState.dy),
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            latestTranslateXRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.max(
            -deleteActionWidth,
            Math.min(0, latestTranslateXRef.current + gestureState.dx),
          );
          translateX.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          const nextValue = latestTranslateXRef.current + gestureState.dx;
          const isFastLeftSwipe = gestureState.vx < -0.35;
          const isFastRightSwipe = gestureState.vx > 0.35;
          const shouldOpen =
            !isFastRightSwipe && (isFastLeftSwipe || nextValue < -deleteActionWidth / 2);

          snapTo(shouldOpen ? -deleteActionWidth : 0);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          snapTo(latestTranslateXRef.current < -deleteActionWidth / 2 ? -deleteActionWidth : 0);
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [isHorizontalSwipe, snapTo, translateX],
  );

  useEffect(() => {
    if (deleteActionHidden) {
      snapTo(0);
    }
  }, [deleteActionHidden, snapTo]);

  const renderDeleteAction = () => {
    if (deleteActionHidden) {
      return null;
    }

    return (
      <AnimatedPressable
        accessibilityLabel={t('stats.deleteRecord')}
        accessibilityRole="button"
        containerStyle={styles.recordDeleteAction}
        onPress={() => onDelete(record.id)}
        pressedScale={0.94}
        pressedTranslateX={-2}
        style={styles.recordDeleteActionButton}
      >
        <Ionicons color={colors.surface} name="trash-outline" size={21} />
        <Text style={styles.recordDeleteText}>{t('stats.delete')}</Text>
      </AnimatedPressable>
    );
  };

  const renderRecordContent = () => (
    <>
      <View
        style={[
          styles.recordPopupIcon,
          { backgroundColor: getRecordMinutesColor(record.minutes_since_start) },
        ]}
      >
        <Ionicons color={colors.surface} name="time-outline" size={22} />
      </View>
      <View style={styles.recordPopupCopy}>
        <Text style={styles.recordPopupTime}>{formatRecordRange(record, startTimeMinutes)}</Text>
        <Text style={styles.recordPopupMeta}>
          {formatRecordDateTime(record.updated_at, t('stats.noData'))}
        </Text>
      </View>
      <Text
        style={[
          styles.recordPopupValue,
          { color: getRecordMinutesColor(record.minutes_since_start) },
        ]}
      >
        {formatDuration(record.minutes_since_start, recordUnit)}
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => onEdit(record)}
        pressedScale={0.92}
        pressedTranslateX={4}
        style={styles.recordEditButton}
      >
        <Ionicons color={colors.mutedSubtle} name="chevron-forward" size={20} />
      </AnimatedPressable>
    </>
  );

  return (
    <View style={styles.swipeRecordShadow}>
      <View style={[styles.swipeRecordShell, deleteActionHidden && styles.swipeRecordShellHidden]}>
        {renderDeleteAction()}
        <RNAnimated.View
          {...panResponder.panHandlers}
          style={[
            styles.recordPopupRow,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          {renderRecordContent()}
        </RNAnimated.View>
      </View>
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  screenTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerIconButtonPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  headerIconButtonDisabled: {
    opacity: 0.55,
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
  dayCellContainer: {
    flex: 1,
  },
  dayCell: {
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
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 18, 28, 0.34)',
  },
  dayRecordsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 28,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 56,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sheetTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  sheetCloseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    flexShrink: 0,
  },
  sheetList: {
    gap: spacing.sm,
    paddingBottom: 0,
  },
  swipeRecordShadow: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  swipeRecordShell: {
    minHeight: 78,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  swipeRecordShellHidden: {
    backgroundColor: colors.surfaceElevated,
  },
  recordDeleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: deleteActionWidth,
  },
  recordDeleteActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: colors.danger,
  },
  recordDeleteText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  recordPopupRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg - 1,
    backgroundColor: colors.surfaceElevated,
  },
  recordPopupIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recordPopupCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  recordPopupTime: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  recordPopupMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  recordPopupValue: {
    fontSize: 16,
    fontWeight: '900',
    flexShrink: 0,
  },
  recordEditButton: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  createRecordButton: {
    height: 58,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  createRecordText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '900',
  },
  createRecordHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  recordEditorSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl + spacing.sm,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 28,
  },
  editorSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  editorForm: {
    gap: spacing.md,
  },
  editorInputRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editorTimeCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  editorTimeRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  editorInputMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editorInputIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorInputLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  editorTimeValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    flexShrink: 0,
  },
  editorTimePickerBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  editorTimePicker: {
    minHeight: 178,
    borderWidth: 0,
  },
  editorDurationValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    flexShrink: 0,
  },
  editorSheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelRecordButtonContainer: {
    flex: 1,
  },
  cancelRecordButton: {
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelRecordText: {
    color: colors.textSoft,
    fontSize: 16,
    fontWeight: '900',
  },
  saveRecordButtonContainer: {
    flex: 1.5,
  },
  saveRecordButton: {
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  saveRecordText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyRecords: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyRecordsText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
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
