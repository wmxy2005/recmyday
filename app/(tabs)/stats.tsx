import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Pressable as GesturePressable,
} from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { AnimatedSheetModal } from '@/components/AnimatedSheetModal';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { DayRecordsPanel } from '@/components/DayRecordsPanel';
import {
  type DayRecord,
  type RecordType,
  clearRecordTypeTargetMinutes,
  getMonthRecords,
  getRecordTypes,
  maxRecordTypeTargetMinutes,
  updateRecordTypeTargetMinutes,
} from '@/data/database';
import { readRecordSettings } from '@/hooks/useRecordSettings';
import { componentSizes, radius, spacing, typography, useAppTheme } from '@/theme';
import {
  addMonths,
  formatDayKey,
  formatDuration,
  formatMonthTitle,
  getMonthCalendarCells,
  type RecordUnit,
} from '@/utils/date';
import { getRecordMinutesColor } from '@/utils/recordColor';
import { getRecordTypeColor, getRecordTypeSoftColor } from '@/utils/recordTypeColor';
import {
  allRecordTypesFilterIconName,
  getRecordIconName,
  getRecordTypeIconName,
} from '@/utils/recordTypeIcon';
import { getDayRecordTypeName, getRecordTypeName } from '@/utils/recordTypeName';

const chartMaxHeight = 86;
const chartMinHeight = 12;
const targetDeleteActionWidth = 82;
const filterTypeGridBaseColumns = 3;
const filterTypeGridBreakpoints = [
  { minWidth: 1024, columns: 10 },
  { minWidth: 768, columns: 8 },
  { minWidth: 600, columns: 6 },
  { minWidth: 360, columns: 4 },
] as const;
let sessionSelectedRecordTypeIds: string[] | null = null;

function getFilterTypeGridColumns(width: number) {
  return (
    filterTypeGridBreakpoints.find((breakpoint) => width >= breakpoint.minWidth)?.columns ??
    filterTypeGridBaseColumns
  );
}

export default function StatsScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);
  const [selectedRecordTypeIds, setSelectedRecordTypeIds] = useState<string[] | null>(
    () => sessionSelectedRecordTypeIds,
  );
  const [targetPanelVisible, setTargetPanelVisible] = useState(false);
  const [targetEditorVisible, setTargetEditorVisible] = useState(false);
  const [targetEditorMode, setTargetEditorMode] = useState<'add' | 'edit'>('add');
  const [targetEditorTypeId, setTargetEditorTypeId] = useState<string | null>(null);
  const [targetMinuteDraft, setTargetMinuteDraft] = useState('');
  const [targetMinuteErrorVisible, setTargetMinuteErrorVisible] = useState(false);
  const [pendingDeleteTargetTypeId, setPendingDeleteTargetTypeId] = useState<string | null>(null);
  const [recordTypeFilterVisible, setRecordTypeFilterVisible] = useState(false);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [separateRecordEnabled, setSeparateRecordEnabled] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [dayRecordsSheetVisible, setDayRecordsSheetVisible] = useState(false);
  const [filterTypeGridWidth, setFilterTypeGridWidth] = useState(0);
  const [targetTypeGridWidth, setTargetTypeGridWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const filterTypeGridColumns = getFilterTypeGridColumns(windowWidth);
  const filterTypeCardWidth =
    filterTypeGridWidth > 0
      ? Math.floor(
          (filterTypeGridWidth - spacing.sm * (filterTypeGridColumns - 1)) /
            filterTypeGridColumns,
        )
      : undefined;
  const targetTypeCardWidth =
    targetTypeGridWidth > 0
      ? Math.floor(
          (targetTypeGridWidth - spacing.sm * (filterTypeGridColumns - 1)) /
            filterTypeGridColumns,
        )
      : undefined;
  const weekdays = t('stats.weekdaysShort', { returnObjects: true }) as string[];
  const targetedRecordTypes = useMemo(
    () => recordTypes.filter((recordType) => recordType.target_minutes !== null),
    [recordTypes],
  );
  const untargetedRecordTypes = useMemo(
    () => recordTypes.filter((recordType) => recordType.target_minutes === null),
    [recordTypes],
  );
  const targetEditorRecordType = targetEditorTypeId
    ? recordTypes.find((recordType) => recordType.id === targetEditorTypeId)
    : null;
  const canShowTargetEditorForm =
    targetEditorMode === 'edit' ? Boolean(targetEditorRecordType) : untargetedRecordTypes.length > 0;

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const [monthRecords, nextRecordTypes, settings] = await Promise.all([
      getMonthRecords(db, monthDate),
      getRecordTypes(db),
      readRecordSettings(db),
    ]);
    const validTypeIds = new Set(nextRecordTypes.map((recordType) => recordType.id));
    const nextSelectedTypeIds = sessionSelectedRecordTypeIds?.filter((id) =>
      validTypeIds.has(id),
    );

    setRecords(monthRecords);
    setRecordTypes(nextRecordTypes);
    if (nextSelectedTypeIds && nextSelectedTypeIds.length > 0) {
      setSelectedRecordTypeIds(nextSelectedTypeIds);
      sessionSelectedRecordTypeIds = nextSelectedTypeIds;
    } else {
      setSelectedRecordTypeIds(null);
      sessionSelectedRecordTypeIds = null;
    }
    setRecordUnit(settings.recordUnit);
    setSeparateRecordEnabled(settings.separateRecordEnabled);
    setIsLoading(false);
  }, [db, monthDate]);

  useFocusEffect(
    useCallback(() => {
      const showLoading = !hasLoadedRef.current;
      hasLoadedRef.current = true;
      loadData(showLoading);
    }, [loadData]),
  );

  const isFilteringRecordTypes = selectedRecordTypeIds !== null;
  const isRecordTypeFilterButtonActive = recordTypeFilterVisible || isFilteringRecordTypes;
  const filteredRecords = useMemo(() => {
    if (!selectedRecordTypeIds) {
      return records;
    }

    const selectedIds = new Set(selectedRecordTypeIds);
    return records.filter((record) => selectedIds.has(record.record_type_id));
  }, [records, selectedRecordTypeIds]);
  const filteredTotalMinutes = useMemo(
    () => filteredRecords.reduce((sum, record) => sum + record.minutes_since_start, 0),
    [filteredRecords],
  );

  const recordsByDay = useMemo(() => {
    return filteredRecords.reduce<Record<string, DayRecord[]>>((map, record) => {
      if (!map[record.day_key]) {
        map[record.day_key] = [];
      }

      map[record.day_key].push(record);
      return map;
    }, {});
  }, [filteredRecords]);

  const dayTotals = useMemo(() => {
    return Object.entries(recordsByDay).reduce<Record<string, number>>(
      (map, [dayKey, dayRecords]) => {
        map[dayKey] = dayRecords.reduce((sum, record) => sum + record.minutes_since_start, 0);
        return map;
      },
      {},
    );
  }, [recordsByDay]);
  const monthlyTypeStats = useMemo(() => {
    const typeOrder = new Map(
      recordTypes.map((recordType, index) => [recordType.id, recordType.sort_order ?? index]),
    );
    const statsByType = filteredRecords.reduce<
      Record<string, { record: DayRecord; totalMinutes: number }>
    >((map, record) => {
      const current = map[record.record_type_id];

      if (current) {
        current.totalMinutes += record.minutes_since_start;
      } else {
        map[record.record_type_id] = {
          record,
          totalMinutes: record.minutes_since_start,
        };
      }

      return map;
    }, {});

    return Object.entries(statsByType)
      .map(([recordTypeId, stat]) => ({
        ...stat,
        recordTypeId,
        sortOrder: typeOrder.get(recordTypeId) ?? Number.MAX_SAFE_INTEGER,
      }))
      .filter((stat) => stat.totalMinutes > 0)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || right.totalMinutes - left.totalMinutes,
      );
  }, [filteredRecords, recordTypes]);
  const maxMonthlyTypeMinutes = useMemo(
    () => Math.max(...monthlyTypeStats.map((stat) => stat.totalMinutes), 1),
    [monthlyTypeStats],
  );

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
  const chartRecords = useMemo(() => {
    const latestRecords = filteredRecords.slice(-7);
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
  }, [filteredRecords]);

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

  const handleCloseDayRecords = () => {
    setDayRecordsSheetVisible(false);
  };

  const handleDayRecordsExitComplete = useCallback(() => {
    setSelectedDayKey(null);
  }, []);

  const handleToggleRecordTypeFilter = (recordTypeId: string) => {
    setSelectedRecordTypeIds((current) => {
      const currentIds = current ?? [];
      const next = currentIds.includes(recordTypeId)
        ? currentIds.filter((id) => id !== recordTypeId)
        : [...currentIds, recordTypeId];
      const normalizedNext = next.length === 0 ? null : next;

      sessionSelectedRecordTypeIds = normalizedNext;
      return normalizedNext;
    });
  };

  const handleClearRecordTypeFilter = () => {
    sessionSelectedRecordTypeIds = null;
    setSelectedRecordTypeIds(null);
  };

  const handleOpenAddTarget = () => {
    setTargetEditorMode('add');
    setTargetEditorTypeId(untargetedRecordTypes[0]?.id ?? null);
    setTargetMinuteDraft('');
    setTargetMinuteErrorVisible(false);
    setTargetEditorVisible(true);
  };

  const handleOpenEditTarget = (recordType: RecordType) => {
    setTargetEditorMode('edit');
    setTargetEditorTypeId(recordType.id);
    setTargetMinuteDraft(String(recordType.target_minutes ?? ''));
    setTargetMinuteErrorVisible(false);
    setTargetEditorVisible(true);
  };

  const handleCloseTargetEditor = () => {
    setTargetEditorVisible(false);
  };

  const handleSaveTargetEditor = async () => {
    if (!targetEditorTypeId) {
      return;
    }

    const minutes = Number(targetMinuteDraft);

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > maxRecordTypeTargetMinutes
    ) {
      setTargetMinuteErrorVisible(true);
      return;
    }

    const nextMinutes = await updateRecordTypeTargetMinutes(db, targetEditorTypeId, minutes);
    setRecordTypes((types) =>
      types.map((type) =>
        type.id === targetEditorTypeId ? { ...type, target_minutes: nextMinutes } : type,
      ),
    );
    setTargetMinuteDraft(String(nextMinutes));
    setTargetMinuteErrorVisible(false);
    setTargetEditorVisible(false);
  };

  const handleConfirmDeleteTarget = async () => {
    if (!pendingDeleteTargetTypeId) {
      return;
    }

    const recordTypeId = pendingDeleteTargetTypeId;

    await clearRecordTypeTargetMinutes(db, recordTypeId);
    setPendingDeleteTargetTypeId(null);
    setRecordTypes((types) =>
      types.map((type) =>
        type.id === recordTypeId ? { ...type, target_minutes: null } : type,
      ),
    );
  };

  const handleFilterTypeGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setFilterTypeGridWidth((current) =>
      Math.abs(current - nextWidth) < 1 ? current : nextWidth,
    );
  };

  const handleTargetTypeGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setTargetTypeGridWidth((current) =>
      Math.abs(current - nextWidth) < 1 ? current : nextWidth,
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
          <View style={styles.headerActions}>
            <AnimatedPressable
              accessibilityLabel={t('stats.manageGoals')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setTargetPanelVisible(true)}
              pressedScale={0.9}
              style={({ pressed }) => [
                styles.headerIconButton,
                targetPanelVisible && styles.headerIconButtonActive,
                pressed && styles.headerIconButtonPressed,
              ]}
            >
              <Ionicons
                color={targetPanelVisible ? colors.surface : colors.text}
                name="flag-outline"
                size={23}
              />
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityLabel={t('stats.filterRecordTypes')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setRecordTypeFilterVisible(true)}
              pressedScale={0.9}
              style={({ pressed }) => [
                styles.headerIconButton,
                isRecordTypeFilterButtonActive && styles.headerIconButtonActive,
                pressed && styles.headerIconButtonPressed,
              ]}
            >
              <Ionicons
                color={isRecordTypeFilterButtonActive ? colors.surface : colors.text}
                name="filter"
                size={23}
              />
            </AnimatedPressable>
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
            <Ionicons color={colors.primary} name="chevron-forward" size={23} />
          </AnimatedPressable>
        </View>

        <LinearGradient
          colors={['#35A7FF', '#635BFF', '#7C3AED']}
          end={{ x: 1, y: 0 }}
          start={{ x: 0, y: 1 }}
          style={styles.summary}
        >
          <View>
            <Text style={styles.summaryLabel}>{t('stats.monthTotal')}</Text>
            {isLoading ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.summaryValue}>
                {formatDuration(filteredTotalMinutes, recordUnit)}
              </Text>
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
                  const isSelectedToday = isSelected && isToday;

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
                        isSelectedToday && styles.selectedTodayCell,
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

        <View style={styles.typeStatsCard}>
          <View style={styles.typeStatsHeader}>
            <Text style={styles.typeStatsTitle}>{t('stats.monthByType')}</Text>
          </View>
          {isLoading ? (
            <View style={styles.typeStatsEmpty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : monthlyTypeStats.length > 0 ? (
            <View style={styles.typeStatsList}>
              {monthlyTypeStats.map((stat) => {
                const typeColor = getRecordTypeColor({
                  id: stat.record.record_type_id,
                  color: stat.record.record_type_color,
                });
                const progressPercent = Math.max(
                  6,
                  Math.round((stat.totalMinutes / maxMonthlyTypeMinutes) * 100),
                );
                const progressWidth = `${progressPercent}%` as `${number}%`;

                return (
                  <View key={stat.recordTypeId} style={styles.typeStatsRow}>
                    <Ionicons
                      color={typeColor}
                      name={getRecordIconName(stat.record)}
                      size={15}
                      style={styles.typeStatsIcon}
                    />
                    <Text numberOfLines={1} style={styles.typeStatsName}>
                      {getDayRecordTypeName(stat.record, t)}
                    </Text>
                    <View style={styles.typeStatsVisual}>
                      <View style={styles.typeStatsTrack}>
                        <View
                          style={[
                            styles.typeStatsProgress,
                            {
                              backgroundColor: typeColor,
                              width: progressWidth,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.typeStatsValue, { color: typeColor }]}>
                      {formatDuration(stat.totalMinutes, recordUnit)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.typeStatsEmpty}>
              <Ionicons color={colors.mutedSubtle} name="pie-chart-outline" size={24} />
              <Text style={styles.typeStatsEmptyText}>{t('stats.noRecord')}</Text>
            </View>
          )}
        </View>
        </ScrollView>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={() => setRecordTypeFilterVisible(false)}
        sheetStyle={styles.filterSheet}
        visible={recordTypeFilterVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <Text style={styles.sheetTitle}>{t('stats.filterRecordTypes')}</Text>
            <Text style={styles.sheetSubtitle}>
              {isFilteringRecordTypes
                ? t('stats.filterActiveCount', { count: selectedRecordTypeIds?.length ?? 0 })
                : t('stats.filterAllTypes')}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={() => setRecordTypeFilterVisible(false)}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>
        <View onLayout={handleFilterTypeGridLayout} style={styles.filterCardGrid}>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={handleClearRecordTypeFilter}
            pressedScale={0.985}
            style={[
              styles.filterTypeCard,
              filterTypeCardWidth !== undefined && { width: filterTypeCardWidth },
              !isFilteringRecordTypes && styles.filterTypeCardActive,
            ]}
          >
            <View
              style={[
                styles.filterTypeIcon,
                !isFilteringRecordTypes && styles.filterTypeIconActive,
              ]}
            >
              <Ionicons
                color={!isFilteringRecordTypes ? colors.primary : colors.textSoft}
                name={allRecordTypesFilterIconName}
                size={22}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.filterTypeText,
                !isFilteringRecordTypes && styles.filterTypeTextActive,
              ]}
            >
              {t('stats.allRecordTypes')}
            </Text>
            <View style={[styles.filterTypeCheck, !isFilteringRecordTypes && styles.radioActive]}>
              {!isFilteringRecordTypes ? (
                <Ionicons color={colors.surface} name="checkmark" size={14} />
              ) : null}
            </View>
          </AnimatedPressable>
          {recordTypes.map((recordType) => {
            const isActive = Boolean(selectedRecordTypeIds?.includes(recordType.id));
            const typeColor = getRecordTypeColor(recordType);

            return (
              <AnimatedPressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isActive }}
                key={recordType.id}
                onPress={() => handleToggleRecordTypeFilter(recordType.id)}
                pressedScale={0.985}
                style={[
                  styles.filterTypeCard,
                  filterTypeCardWidth !== undefined && { width: filterTypeCardWidth },
                  isActive && [
                    styles.filterTypeCardActive,
                    { borderColor: typeColor, shadowColor: typeColor },
                  ],
                ]}
              >
                <View
                  style={[
                    styles.filterTypeIcon,
                    isActive && styles.filterTypeIconActive,
                  ]}
                >
                  <Ionicons
                    color={typeColor}
                    name={getRecordTypeIconName(recordType)}
                    size={22}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.filterTypeText,
                    isActive && styles.filterTypeTextActive,
                    isActive && { color: typeColor },
                  ]}
                >
                  {getRecordTypeName(recordType, t)}
                </Text>
                <View
                  style={[
                    styles.filterTypeCheck,
                    isActive && [
                      styles.radioActive,
                      { backgroundColor: typeColor, borderColor: typeColor },
                    ],
                  ]}
                >
                  {isActive ? (
                    <Ionicons color={colors.surface} name="checkmark" size={14} />
                  ) : null}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </AnimatedSheetModal>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={() => setTargetPanelVisible(false)}
        sheetStyle={styles.filterSheet}
        visible={targetPanelVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <Text style={styles.sheetTitle}>{t('stats.taskGoals')}</Text>
            <Text style={styles.sheetSubtitle}>{t('stats.taskGoalsDescription')}</Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={() => setTargetPanelVisible(false)}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.targetList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.targetScroll}
        >
          {targetedRecordTypes.length > 0 ? (
            targetedRecordTypes.map((recordType) => (
              <SwipeTargetRow
                colors={colors}
                key={recordType.id}
                onDelete={(id) => setPendingDeleteTargetTypeId(id)}
                onEdit={handleOpenEditTarget}
                recordType={recordType}
                styles={styles}
                t={t}
              />
            ))
          ) : (
            <View style={styles.emptyTargetBox}>
              <Ionicons color={colors.muted} name="flag-outline" size={24} />
              <Text style={styles.emptyTargetText}>{t('stats.noTaskGoals')}</Text>
            </View>
          )}
        </ScrollView>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={handleOpenAddTarget}
          pressedScale={0.98}
          style={styles.addTargetButton}
        >
          <Ionicons color={colors.surface} name="add" size={22} />
          <Text style={styles.addTargetText}>{t('stats.addTaskGoal')}</Text>
        </AnimatedPressable>
      </AnimatedSheetModal>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={handleCloseTargetEditor}
        sheetStyle={styles.filterSheet}
        visible={targetEditorVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <Text style={styles.sheetTitle}>
              {targetEditorMode === 'add' ? t('stats.addTaskGoal') : t('stats.editTaskGoal')}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {targetEditorMode === 'add'
                ? t('stats.chooseTaskGoalType')
                : t('stats.editTaskGoalDescription')}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={handleCloseTargetEditor}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>

        {targetEditorMode === 'add' ? (
          untargetedRecordTypes.length > 0 ? (
            <View onLayout={handleTargetTypeGridLayout} style={styles.filterCardGrid}>
              {untargetedRecordTypes.map((recordType) => {
                const isActive = targetEditorTypeId === recordType.id;
                const typeColor = getRecordTypeColor(recordType);

                return (
                  <AnimatedPressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    key={recordType.id}
                    onPress={() => setTargetEditorTypeId(recordType.id)}
                    pressedScale={0.985}
                    style={[
                      styles.filterTypeCard,
                      targetTypeCardWidth !== undefined && { width: targetTypeCardWidth },
                      isActive && [
                        styles.filterTypeCardActive,
                        { borderColor: typeColor, shadowColor: typeColor },
                      ],
                    ]}
                  >
                    <View style={[styles.filterTypeIcon, isActive && styles.filterTypeIconActive]}>
                      <Ionicons
                        color={typeColor}
                        name={getRecordTypeIconName(recordType)}
                        size={22}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.filterTypeText,
                        isActive && styles.filterTypeTextActive,
                        isActive && { color: typeColor },
                      ]}
                    >
                      {getRecordTypeName(recordType, t)}
                    </Text>
                    <View
                      style={[
                        styles.filterTypeCheck,
                        isActive && [
                          styles.radioActive,
                          { backgroundColor: typeColor, borderColor: typeColor },
                        ],
                      ]}
                    >
                      {isActive ? (
                        <Ionicons color={colors.surface} name="checkmark" size={14} />
                      ) : null}
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyTargetBox}>
              <Ionicons color={colors.muted} name="checkmark-circle-outline" size={24} />
              <Text style={styles.emptyTargetText}>{t('stats.allTaskGoalsSet')}</Text>
            </View>
          )
        ) : targetEditorRecordType ? (
          <View style={styles.lockedTargetTypeRow}>
            <View
              style={[
                styles.targetIcon,
                { backgroundColor: getRecordTypeSoftColor(getRecordTypeColor(targetEditorRecordType)) },
              ]}
            >
              <Ionicons
                color={getRecordTypeColor(targetEditorRecordType)}
                name={getRecordTypeIconName(targetEditorRecordType)}
                size={22}
              />
            </View>
            <View style={styles.targetMain}>
              <Text numberOfLines={1} style={styles.targetName}>
                {getRecordTypeName(targetEditorRecordType, t)}
              </Text>
              <Text style={styles.targetMeta}>{t('stats.taskGoalTypeLocked')}</Text>
            </View>
            <Ionicons color={colors.mutedSubtle} name="lock-closed-outline" size={18} />
          </View>
        ) : null}

        {canShowTargetEditorForm ? (
          <>
            <View style={styles.targetEditorBlock}>
              <View
                style={[
                  styles.targetEditorInputRow,
                  targetMinuteErrorVisible && styles.targetInputError,
                ]}
              >
                <View style={styles.targetEditorInputMain}>
                  <View style={styles.targetEditorInputIcon}>
                    <Ionicons color={colors.highlight} name="flag-outline" size={22} />
                  </View>
                  <Text style={styles.targetEditorLabel}>{t('stats.targetMinutes')}</Text>
                </View>
                <TextInput
                  accessibilityLabel={t('stats.targetMinutes')}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setTargetMinuteErrorVisible(false);
                    setTargetMinuteDraft(value);
                  }}
                  onSubmitEditing={() => {
                    void handleSaveTargetEditor();
                  }}
                  placeholder={t('stats.targetMinutesPlaceholder')}
                  placeholderTextColor={colors.mutedSubtle}
                  returnKeyType="done"
                  selectTextOnFocus
                  style={styles.targetEditorInput}
                  value={targetMinuteDraft}
                />
              </View>
              {targetMinuteErrorVisible ? (
                <Text style={styles.targetError}>{t('stats.invalidTargetMinutes')}</Text>
              ) : null}
            </View>

            <View style={styles.targetEditorActions}>
              <AnimatedPressable
                accessibilityRole="button"
                containerStyle={styles.targetCancelButtonContainer}
                onPress={handleCloseTargetEditor}
                pressedScale={0.96}
                pressedTranslateY={1}
                style={styles.targetCancelButton}
              >
                <Text style={styles.targetCancelText}>{t('stats.cancel')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                containerStyle={styles.targetSaveButtonContainer}
                disabled={targetEditorMode === 'add' && !targetEditorTypeId}
                onPress={() => {
                  void handleSaveTargetEditor();
                }}
                pressedScale={0.96}
                pressedTranslateY={1}
                style={[
                  styles.targetSaveButton,
                  targetEditorMode === 'add' &&
                    !targetEditorTypeId &&
                    styles.targetSaveButtonDisabled,
                ]}
              >
                <Text style={styles.targetSaveText}>{t('stats.save')}</Text>
              </AnimatedPressable>
            </View>
          </>
        ) : null}
      </AnimatedSheetModal>
      <ConfirmationDialog
        cancelLabel={t('stats.cancel')}
        confirmLabel={t('stats.delete')}
        iconName="trash-outline"
        message={t('stats.confirmDeleteTaskGoalMessage')}
        onCancel={() => setPendingDeleteTargetTypeId(null)}
        onConfirm={() => {
          void handleConfirmDeleteTarget();
        }}
        title={t('stats.confirmDeleteTaskGoalTitle')}
        variant="danger"
        visible={pendingDeleteTargetTypeId !== null}
      />
      <DayRecordsPanel
        dayKey={selectedDayKey}
        onClose={handleCloseDayRecords}
        onExitComplete={handleDayRecordsExitComplete}
        onRecordsChanged={loadData}
        recordTypeIds={selectedRecordTypeIds}
        separateRecordEnabled={separateRecordEnabled}
        visible={selectedDayKey !== null && dayRecordsSheetVisible}
      />
    </SafeAreaView>
  );
}

type SwipeTargetRowProps = {
  colors: ReturnType<typeof useAppTheme>['colors'];
  onDelete: (id: string) => void;
  onEdit: (recordType: RecordType) => void;
  recordType: RecordType;
  styles: ReturnType<typeof makeStyles>;
  t: ReturnType<typeof useTranslation>['t'];
};

function SwipeTargetRow({
  colors,
  onDelete,
  onEdit,
  recordType,
  styles,
  t,
}: SwipeTargetRowProps) {
  const typeColor = getRecordTypeColor(recordType);

  const renderDeleteAction = (
    _progress: unknown,
    _translation: unknown,
    swipeable: SwipeableMethods,
  ) => (
    <View style={styles.targetDeleteAction}>
      <GesturePressable
        accessibilityLabel={t('stats.deleteTaskGoal')}
        accessibilityRole="button"
        cancelable={false}
        onPress={() => {
          swipeable.reset();
          onDelete(recordType.id);
        }}
        style={({ pressed }) => [
          styles.targetDeleteActionButton,
          pressed && styles.targetDeleteActionButtonPressed,
        ]}
      >
        <Ionicons color={colors.surface} name="trash-outline" size={21} />
        <Text style={styles.targetDeleteText}>{t('stats.delete')}</Text>
      </GesturePressable>
    </View>
  );

  return (
    <View style={styles.targetSwipeShadow}>
      <ReanimatedSwipeable
        containerStyle={styles.targetSwipeShell}
        dragOffsetFromLeftEdge={10}
        dragOffsetFromRightEdge={10}
        friction={1.15}
        overshootRight={false}
        renderRightActions={renderDeleteAction}
        rightThreshold={targetDeleteActionWidth / 2}
      >
        <View style={styles.targetRow}>
          <View style={[styles.targetIcon, { backgroundColor: getRecordTypeSoftColor(typeColor) }]}>
            <Ionicons color={typeColor} name={getRecordTypeIconName(recordType)} size={22} />
          </View>
          <View style={styles.targetMain}>
            <Text numberOfLines={1} style={styles.targetName}>
              {getRecordTypeName(recordType, t)}
            </Text>
            <Text style={styles.targetMeta}>
              {t('stats.targetMinutesValue', {
                minutes: recordType.target_minutes,
              })}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onEdit(recordType)}
            pressedScale={0.92}
            pressedTranslateX={4}
            style={styles.targetEditButton}
          >
            <Ionicons color={colors.mutedSubtle} name="chevron-forward" size={20} />
          </AnimatedPressable>
        </View>
      </ReanimatedSwipeable>
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
    paddingTop: spacing.sm,
    paddingBottom: 108,
  },
  titleHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  screenTitle: {
    flex: 1,
    color: colors.text,
    ...typography.screenTitle,
  },
  headerIconButton: {
    width: componentSizes.headerIconButton,
    height: componentSizes.headerIconButton,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  headerIconButtonPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  headerIconButtonDisabled: {
    opacity: 0.55,
  },
  monthSelector: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow,
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
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
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    includeFontPadding: false,
  },
  summary: {
    minHeight: 112,
    padding: spacing.lg,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    ...shadow,
    overflow: 'hidden',
  },
  summaryLabel: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  summaryValue: {
    color: colors.surface,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.16)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  chart: {
    width: 106,
    height: 86,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 7,
  },
  chartBar: {
    width: 10,
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
    fontSize: 13,
    fontWeight: '800',
  },
  calendarCard: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  typeStatsCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  typeStatsHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeStatsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  typeStatsList: {
    gap: 1,
  },
  typeStatsRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  typeStatsIcon: {
    width: 18,
    height: 18,
    lineHeight: 18,
    flexShrink: 0,
  },
  typeStatsName: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  typeStatsValue: {
    width: 58,
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 18,
    textAlign: 'right',
    flexShrink: 0,
  },
  typeStatsVisual: {
    width: 104,
    flexShrink: 0,
  },
  typeStatsTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  typeStatsProgress: {
    height: '100%',
    borderRadius: 999,
  },
  typeStatsEmpty: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceAlt,
  },
  typeStatsEmptyText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  calendarGrid: {
    gap: spacing.xs,
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
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selectedTodayCell: {
    backgroundColor: colors.danger,
    borderColor: colors.text,
    shadowColor: colors.text,
    shadowOpacity: 0.24,
  },
  emptyCell: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 14,
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
  filterSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 28,
  },
  filterList: {
    gap: spacing.sm,
  },
  filterCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  targetScroll: {
    maxHeight: 420,
  },
  targetList: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  targetSwipeShadow: {
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow,
  },
  targetSwipeShell: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  targetRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetDeleteAction: {
    width: targetDeleteActionWidth,
    paddingLeft: spacing.sm,
  },
  targetDeleteActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  targetDeleteActionButtonPressed: {
    backgroundColor: colors.dangerDark,
  },
  targetDeleteText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  targetIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  targetMain: {
    flex: 1,
    minWidth: 0,
  },
  targetName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  targetMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  targetError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  targetEditButton: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  targetInputShell: {
    width: 78,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    flexShrink: 0,
  },
  targetInputError: {
    borderColor: colors.danger,
  },
  targetInput: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
    minHeight: 40,
  },
  emptyTargetBox: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderStyle: 'dashed',
  },
  emptyTargetText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  addTargetButton: {
    minHeight: 50,
    marginTop: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  addTargetText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  lockedTargetTypeRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetEditorBlock: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  targetEditorInputRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetEditorInputMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  targetEditorInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4FF',
  },
  targetEditorLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  targetEditorInput: {
    minWidth: 76,
    maxWidth: 112,
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
    minHeight: 40,
  },
  targetEditorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  targetCancelButtonContainer: {
    flex: 1,
  },
  targetCancelButton: {
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetCancelText: {
    color: colors.textSoft,
    fontSize: 15,
    fontWeight: '900',
  },
  targetSaveButtonContainer: {
    flex: 1.5,
  },
  targetSaveButton: {
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  targetSaveButtonDisabled: {
    opacity: 0.5,
  },
  targetSaveText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
  filterTypeCard: {
    width: 96,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTypeCardActive: {
    borderColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  filterTypeIcon: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTypeIconActive: {
    opacity: 1,
  },
  filterTypeText: {
    maxWidth: '100%',
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  filterTypeTextActive: {
    color: colors.primary,
  },
  filterTypeCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  filterRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterRowActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterTitle: {
    color: colors.text,
    ...typography.rowTitle,
  },
  filterTitleActive: {
    color: colors.primary,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  radioActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  sheetCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    flexShrink: 0,
  },
  });
};
