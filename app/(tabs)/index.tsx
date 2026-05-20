import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { AnimatedSheetModal } from '@/components/AnimatedSheetModal';
import { DayRecordsPanel } from '@/components/DayRecordsPanel';
import { RecordButton } from '@/components/RecordButton';
import {
  type DayRecord,
  type RecordType,
  getCurrentDayKey,
  getCurrentDayRecord,
  getDayRecordsByDayKey,
  getRecentRecords,
  getRecordTypes,
  insertSeparateRecord,
  upsertCurrentRecord,
} from '@/data/database';
import { readRecordSettings } from '@/hooks/useRecordSettings';
import { componentSizes, radius, spacing, typography, useAppTheme } from '@/theme';
import {
  formatDayKey,
  formatDayLabel,
  formatDuration,
  formatWeekdayLabel,
  type RecordUnit,
} from '@/utils/date';
import {
  formatRecordRange,
  formatRecordRangeParts,
  formatRecordsRangeParts,
  parseRecordTime,
} from '@/utils/recordFormat';
import { getRecordColor, getRecordTypeColor } from '@/utils/recordTypeColor';
import { getRecordIconName, getRecordTypeIconName } from '@/utils/recordTypeIcon';
import { getDayRecordTypeName, getRecordTypeName } from '@/utils/recordTypeName';

const recordTypeGridBaseColumns = 3;
const dailyGoalMinutes = 480;
const recordTypeGridBreakpoints = [
  { minWidth: 1024, columns: 10 },
  { minWidth: 768, columns: 8 },
  { minWidth: 600, columns: 6 },
  { minWidth: 360, columns: 4 },
] as const;

function getIsBeforeStartTime(startTimeMinutes: number) {
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return currentMinutes < startTimeMinutes;
}

function getRecordTypeGridColumns(width: number) {
  return (
    recordTypeGridBreakpoints.find((breakpoint) => width >= breakpoint.minWidth)?.columns ??
    recordTypeGridBaseColumns
  );
}

function getClockHandsFromRecord(record: DayRecord | null) {
  const date = record
    ? parseRecordTime(record.updated_at) ?? parseRecordTime(record.recorded_at)
    : null;

  if (!date) {
    return {
      hour: 0,
      minute: 0,
    };
  }

  const hours = date.getHours() % 12;
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return {
    hour: hours * 30 + minutes * 0.5,
    minute: minutes * 6 + seconds * 0.1,
  };
}

function RecentRecordTypeIcon({
  blockStyle,
  circleStyle,
  color,
  iconName,
}: {
  blockStyle: StyleProp<ViewStyle>;
  circleStyle: StyleProp<ViewStyle>;
  color: string;
  iconName: ComponentProps<typeof Ionicons>['name'];
}) {
  const [iconSize, setIconSize] = useState(28);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const nextIconSize = Math.max(22, Math.min(Math.round(height * 0.54), 40));

    setIconSize((current) => (current === nextIconSize ? current : nextIconSize));
  };

  return (
    <View onLayout={handleLayout} style={blockStyle}>
      <View style={circleStyle}>
        <Ionicons color={color} name={iconName} size={iconSize} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [currentDayKey, setCurrentDayKey] = useState('');
  const [todayRecord, setTodayRecord] = useState<DayRecord | null>(null);
  const [todayRecords, setTodayRecords] = useState<DayRecord[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [recentRecordLimit, setRecentRecordLimit] = useState(5);
  const [separateRecordEnabled, setSeparateRecordEnabled] = useState(false);
  const [defaultRecordTypeId, setDefaultRecordTypeId] = useState('work');
  const [activeSeparateRecordStartedAt, setActiveSeparateRecordStartedAt] = useState<Date | null>(
    null,
  );
  const [activeSeparateRecordTypeId, setActiveSeparateRecordTypeId] = useState<string | null>(null);
  const [dayRecordsPanelVisible, setDayRecordsPanelVisible] = useState(false);
  const [dayRecordsPanelDayKey, setDayRecordsPanelDayKey] = useState<string | null>(null);
  const [recordTypePickerVisible, setRecordTypePickerVisible] = useState(false);
  const [recordTypeGridWidth, setRecordTypeGridWidth] = useState(0);
  const [isBeforeStartTime, setIsBeforeStartTime] = useState(() => getIsBeforeStartTime(0));
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isHidingRecordButton, setIsHidingRecordButton] = useState(false);
  const [showRecordButton, setShowRecordButton] = useState(false);
  const [recordButtonMounted, setRecordButtonMounted] = useState(false);
  const hasLoadedRef = useRef(false);
  const skipRecordButtonAnimationRef = useRef(true);
  /** Start hidden so we never paint a full-size button before visibility is synced (avoids a bogus “hide” on first load). */
  const recordButtonScale = useSharedValue(0);
  const singleRecordButtonVisibilityRef = useRef({
    dayKey: '',
    visible: false,
  });
  const recordTypeGridColumns = getRecordTypeGridColumns(windowWidth);
  const recordTypeCardWidth =
    recordTypeGridWidth > 0
      ? Math.floor(
          (recordTypeGridWidth - spacing.sm * (recordTypeGridColumns - 1)) /
            recordTypeGridColumns,
        )
      : undefined;

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }

    const settings = await readRecordSettings(db);
    const [dayKey, currentRecord, recentRecords, nextRecordTypes] = await Promise.all([
      getCurrentDayKey(db),
      getCurrentDayRecord(db),
      getRecentRecords(db, settings.recentRecordLimit),
      getRecordTypes(db),
    ]);
    const currentDayRecords = await getDayRecordsByDayKey(db, dayKey);

    setStartTimeMinutes(settings.startTimeMinutes);
    setRecordUnit(settings.recordUnit);
    setRecentRecordLimit(settings.recentRecordLimit);
    setSeparateRecordEnabled(settings.separateRecordEnabled);
    setDefaultRecordTypeId(settings.defaultRecordTypeId);
    setRecordTypes(nextRecordTypes);
    if (settings.separateRecordEnabled) {
      setActiveSeparateRecordStartedAt(null);
      setActiveSeparateRecordTypeId(null);
      setRecordTypePickerVisible(false);
    }
    setCurrentDayKey(dayKey);
    setTodayRecord(currentRecord);
    setTodayRecords(currentDayRecords);
    setShowRecordButton(() => {
      const isBeforeStartTimeNow = getIsBeforeStartTime(settings.startTimeMinutes);

      if (!settings.separateRecordEnabled || !currentRecord) {
        return !isBeforeStartTimeNow;
      }

      return (
        !isBeforeStartTimeNow &&
        singleRecordButtonVisibilityRef.current.dayKey === dayKey &&
        singleRecordButtonVisibilityRef.current.visible
      );
    });
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
        .filter((record) => !separateRecordEnabled || record.day_key !== currentDayKey)
        .slice(0, recentRecordLimit),
    [currentDayKey, recentRecordLimit, records, separateRecordEnabled],
  );
  const groupedPreviousRecords = useMemo(
    () =>
      previousRecords.reduce<{ dayKey: string; records: DayRecord[] }[]>((groups, record) => {
        const lastGroup = groups[groups.length - 1];

        if (lastGroup?.dayKey === record.day_key) {
          lastGroup.records.push(record);
          return groups;
        }

        groups.push({ dayKey: record.day_key, records: [record] });
        return groups;
      }, []),
    [previousRecords],
  );
  const todayTotalMinutes = useMemo(
    () => todayRecords.reduce((sum, record) => sum + record.minutes_since_start, 0),
    [todayRecords],
  );
  const todayProgress = Math.min(
    1,
    (separateRecordEnabled ? todayRecord?.minutes_since_start ?? 0 : todayTotalMinutes) /
      dailyGoalMinutes,
  );
  const todayDisplayRangeParts = separateRecordEnabled
    ? todayRecord
      ? formatRecordRangeParts(todayRecord, startTimeMinutes)
      : null
    : formatRecordsRangeParts(todayRecords, startTimeMinutes);

  const shouldShowRecordButtonArea =
    !isLoading &&
    !isBeforeStartTime &&
    (!separateRecordEnabled ||
      !todayRecord ||
      showRecordButton ||
      Boolean(activeSeparateRecordStartedAt));

  const recordButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordButtonScale.value }],
  }));

  useEffect(() => {
    const snapRecordButtonVisibility = (visible: boolean) => {
      setIsHidingRecordButton(false);
      recordButtonScale.value = visible ? 1 : 0;
      setRecordButtonMounted(visible);
    };

    if (!isLoading && skipRecordButtonAnimationRef.current) {
      skipRecordButtonAnimationRef.current = false;
      snapRecordButtonVisibility(shouldShowRecordButtonArea);
      return;
    }

    if (separateRecordEnabled || isBeforeStartTime || !todayRecord) {
      snapRecordButtonVisibility(shouldShowRecordButtonArea);
      return;
    }

    if (showRecordButton) {
      setIsHidingRecordButton(false);
      setRecordButtonMounted(true);
      recordButtonScale.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

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
    separateRecordEnabled,
    todayRecord,
  ]);

  const handleRecord = async () => {
    if (isBeforeStartTime || isRecording || isHidingRecordButton) {
      return;
    }

    if (!separateRecordEnabled && !activeSeparateRecordStartedAt) {
      setRecordTypePickerVisible(true);
      return;
    }

    setIsRecording(true);

    try {
      if (!separateRecordEnabled) {
        const startedAt = activeSeparateRecordStartedAt;

        if (!startedAt) {
          return;
        }

        await insertSeparateRecord(
          db,
          startedAt,
          new Date(),
          activeSeparateRecordTypeId ?? undefined,
        );
        setActiveSeparateRecordStartedAt(null);
        setActiveSeparateRecordTypeId(null);
        await loadData();
        return;
      }

      await upsertCurrentRecord(db);
      singleRecordButtonVisibilityRef.current = {
        dayKey: currentDayKey,
        visible: false,
      };
      setShowRecordButton(false);
      await loadData();
    } finally {
      setIsRecording(false);
    }
  };

  const handleCancelActiveRecord = () => {
    setActiveSeparateRecordStartedAt(null);
    setActiveSeparateRecordTypeId(null);
  };

  const handleStartSeparateRecordWithType = (recordTypeId: string) => {
    setActiveSeparateRecordStartedAt(new Date());
    setActiveSeparateRecordTypeId(recordTypeId);
    setRecordTypePickerVisible(false);
  };

  const handleRecordTypeGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setRecordTypeGridWidth((current) =>
      Math.abs(current - nextWidth) < 1 ? current : nextWidth,
    );
  };

  const handleToggleRecordButton = () => {
    if (!separateRecordEnabled || !todayRecord || isBeforeStartTime) {
      return;
    }

    setShowRecordButton((current) => {
      const next = !current;
      singleRecordButtonVisibilityRef.current = {
        dayKey: todayRecord.day_key,
        visible: next,
      };
      return next;
    });
  };

  const handleOpenDayRecords = (dayKey: string) => {
    setDayRecordsPanelDayKey(dayKey);
    setDayRecordsPanelVisible(true);
  };

  const canToggleRecordButton = Boolean(
    separateRecordEnabled && todayRecord && !isBeforeStartTime,
  );
  const isTodayPanelSelected = Boolean(separateRecordEnabled && todayRecord && showRecordButton);
  const headerDayKey = currentDayKey || formatDayKey(new Date());
  const todayClockHands = useMemo(() => getClockHandsFromRecord(todayRecord), [todayRecord]);
  const activeSeparateRecordType = activeSeparateRecordTypeId
    ? recordTypes.find((recordType) => recordType.id === activeSeparateRecordTypeId)
    : null;
  const activeSeparateRecordTypeName = activeSeparateRecordType
    ? getRecordTypeName(activeSeparateRecordType, t)
    : null;
  const defaultRecordType = recordTypes.find((recordType) => recordType.id === defaultRecordTypeId);
  const defaultRecordTypeColor = defaultRecordType ? getRecordTypeColor(defaultRecordType) : colors.primary;
  const recordButtonBackgroundColor = separateRecordEnabled
    ? defaultRecordTypeColor
    : activeSeparateRecordType
      ? getRecordTypeColor(activeSeparateRecordType)
      : defaultRecordTypeColor;
  const recordButtonLabel = separateRecordEnabled
    ? todayRecord
      ? t('home.updateRecord')
      : t('home.createRecord')
    : activeSeparateRecordStartedAt
      ? `${activeSeparateRecordTypeName ?? t('home.endRecord')} · ${t('home.recordingStatus')}`
      : t('home.startRecord');
  const recordButtonIconName =
    !separateRecordEnabled && activeSeparateRecordStartedAt && activeSeparateRecordType
      ? getRecordTypeIconName(activeSeparateRecordType)
      : !separateRecordEnabled
        ? activeSeparateRecordStartedAt
          ? 'stop'
          : 'play'
        : undefined;
  const recordButtonTone = separateRecordEnabled
    ? todayRecord
      ? 'primary'
      : 'success'
    : activeSeparateRecordStartedAt
      ? 'danger'
      : 'success';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerDateRow}>
            <Text style={styles.title}>{formatDayLabel(headerDayKey)}</Text>
            <Text style={styles.headerWeekday}>{formatWeekdayLabel(headerDayKey)}</Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.dayRecordTitle', {
              day: formatDayLabel(headerDayKey),
            })}
            accessibilityRole="button"
            disabled={!currentDayKey}
            hitSlop={10}
            onPress={() => handleOpenDayRecords(currentDayKey)}
            pressedScale={0.9}
            style={({ pressed }) => [
              styles.headerIcon,
              pressed && styles.headerIconPressed,
              !currentDayKey && styles.headerIconDisabled,
            ]}
          >
            <Ionicons color={colors.text} name="calendar-clear-outline" size={24} />
          </AnimatedPressable>
        </View>

        <AnimatedPressable
          accessibilityRole={canToggleRecordButton ? 'button' : undefined}
          disabled={!canToggleRecordButton}
          onPress={handleToggleRecordButton}
          pressedScale={canToggleRecordButton ? 0.99 : 1}
          style={({ pressed }) => [
            styles.todayPanelShell,
            todayRecord && styles.todayPanelRecorded,
            pressed && todayRecord && styles.todayPanelRecordedPressed,
            isTodayPanelSelected && styles.todayPanelSelected,
          ]}
        >
          <LinearGradient
            colors={['#35A7FF', '#635BFF', '#7C3AED']}
            end={{ x: 0.05, y: 1 }}
            start={{ x: 1, y: 0 }}
            style={styles.todayPanel}
          >
            <View style={styles.todayCopy}>
              {isLoading ? (
                <ActivityIndicator color={colors.primary} style={styles.loadingIndicator} />
              ) : todayRecord ? (
                <>
                  <Text style={styles.todayRecordTitle}>{t('home.todayRecordTitle')}</Text>
                  {recordUnit === 'minutes' ? (
                    <View style={styles.minutesRow}>
                      <Text style={styles.minutesNumber}>
                        {separateRecordEnabled ? todayRecord.minutes_since_start : todayTotalMinutes}
                      </Text>
                      <Text style={styles.minutesUnit}>{t('date.minutesFullUnit')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.minutesText}>
                      {formatDuration(
                        separateRecordEnabled ? todayRecord.minutes_since_start : todayTotalMinutes,
                        recordUnit,
                      )}
                    </Text>
                  )}
                  {todayDisplayRangeParts ? (
                    <View style={styles.todayMetaRow}>
                      <View style={styles.todayTimeFields}>
                        <Text style={styles.todayTimeField}>{todayDisplayRangeParts.start}</Text>
                        <Text style={styles.todayTimeSeparator}>-</Text>
                        <Text style={styles.todayTimeField}>{todayDisplayRangeParts.end}</Text>
                        <Ionicons color={colors.surface} name="create" size={17} />
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.todayRecordTitle}>{t('home.todayRecordTitle')}</Text>
                  <Text style={styles.notRecorded}>{t('home.notRecorded')}</Text>
                  <Text style={styles.meta}> </Text>
                </>
              )}
              {!isLoading ? (
                <View style={styles.todayProgressBlock}>
                  <View style={styles.todayProgressMeta}>
                    <View style={styles.todayGoalRow}>
                      <Ionicons color={colors.surface} name="flag-outline" size={16} />
                      <Text style={styles.todayGoalText}>
                        {t('home.dailyGoal', { minutes: dailyGoalMinutes })}
                      </Text>
                    </View>
                    <Text style={styles.todayProgressText}>
                      {Math.round(todayProgress * 100)}%
                    </Text>
                  </View>
                  <View style={styles.todayProgressTrack}>
                    <View
                      style={[
                        styles.todayProgressFill,
                        { width: `${Math.max(2, todayProgress * 100)}%` },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
            </View>
            <View style={styles.clock}>
              <View style={[styles.clockTick, styles.clockTickTop]} />
              <View style={[styles.clockTick, styles.clockTickRight]} />
              <View style={[styles.clockTick, styles.clockTickBottom]} />
              <View style={[styles.clockTick, styles.clockTickLeft]} />
              <View
                style={[
                  styles.clockHandPivot,
                  {
                    transform: [{ rotate: `${todayClockHands.minute}deg` }],
                  },
                ]}
              >
                <View style={styles.clockHandLong} />
              </View>
              <View
                style={[
                  styles.clockHandPivot,
                  {
                    transform: [{ rotate: `${todayClockHands.hour}deg` }],
                  },
                ]}
              >
                <View style={styles.clockHandShort} />
              </View>
              <View style={styles.clockCenter} />
            </View>
          </LinearGradient>
        </AnimatedPressable>

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
            groupedPreviousRecords.map((group) => (
              <View key={group.dayKey} style={styles.recordGroup}>
                <View style={styles.recordGroupHeader}>
                  <View style={styles.recordGroupDot} />
                  <Text style={styles.recordGroupTitle}>
                    {group.dayKey === currentDayKey ? t('home.today') : formatDayLabel(group.dayKey)}
                  </Text>
                  <Text style={styles.recordGroupDate}>{formatWeekdayLabel(group.dayKey)}</Text>
                </View>
                <View style={styles.recordGroupRows}>
                  {group.records.map((record) => {
                    const recordColor = getRecordColor(record);

                    return (
                      <AnimatedPressable
                        accessibilityLabel={t('stats.dayRecordTitle', {
                          day: formatDayLabel(record.day_key),
                        })}
                        accessibilityRole="button"
                        key={record.id}
                        onPress={() => handleOpenDayRecords(record.day_key)}
                        pressedScale={0.985}
                        style={styles.recordRow}
                      >
                        {!separateRecordEnabled ? (
                          <RecentRecordTypeIcon
                            blockStyle={styles.recordTypeIconBlock}
                            circleStyle={styles.recordTypeIconCircle}
                            color={recordColor}
                            iconName={getRecordIconName(record)}
                          />
                        ) : null}
                        <View style={styles.recordMain}>
                          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.recordTypeLabel}>
                            {getDayRecordTypeName(record, t)}
                          </Text>
                          <Text style={styles.recordTime}>
                            {formatRecordRange(record, startTimeMinutes)}
                          </Text>
                        </View>
                        <View style={styles.recordValueRow}>
                          {recordUnit === 'minutes' ? (
                            <>
                              <Text style={[styles.recordMinutes, { color: recordColor }]}>
                                {record.minutes_since_start}
                              </Text>
                              <Text style={styles.recordUnitText}>{t('date.minutesFullUnit')}</Text>
                            </>
                          ) : (
                            <Text style={[styles.recordMinutes, { color: recordColor }]}>
                              {formatDuration(record.minutes_since_start, recordUnit)}
                            </Text>
                          )}
                          <View style={styles.recordArrowButton}>
                            <Ionicons color={colors.mutedSubtle} name="chevron-forward" size={18} />
                          </View>
                        </View>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {recordButtonMounted ? (
        <View pointerEvents="box-none" style={styles.actionArea}>
          <RecordButton
            animatedStyle={recordButtonAnimatedStyle}
            backgroundColor={recordButtonBackgroundColor}
            cancelLabel={t('home.cancelRecord')}
            containerStyle={styles.recordButtonContainer}
            disabled={isRecording || isHidingRecordButton || !shouldShowRecordButtonArea}
            dragCancelLabel={t('home.dragCancelRecord')}
            fullWidth
            hasRecord={separateRecordEnabled && Boolean(todayRecord)}
            holdCancelLabel={t('home.holdCancelRecord')}
            iconName={recordButtonIconName}
            isRecording={isRecording}
            label={recordButtonLabel}
            onCancelRecording={handleCancelActiveRecord}
            onPress={handleRecord}
            pointerEvents={shouldShowRecordButtonArea && !isHidingRecordButton ? 'auto' : 'none'}
            recordingStartedAt={!separateRecordEnabled ? activeSeparateRecordStartedAt : null}
            recordingUnitLabel={t('date.minutesShortUnit')}
            secondsUnitLabel={t('date.secondsShortUnit')}
            tone={recordButtonTone}
          />
        </View>
      ) : null}

      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={() => setRecordTypePickerVisible(false)}
        sheetStyle={styles.recordTypeSheet}
        visible={recordTypePickerVisible}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <Text style={styles.sheetTitle}>{t('home.chooseRecordType')}</Text>
            <Text style={styles.sheetSubtitle}>{t('home.chooseRecordTypeHint')}</Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={() => setRecordTypePickerVisible(false)}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>
        <View onLayout={handleRecordTypeGridLayout} style={styles.typeChoiceGrid}>
          {recordTypes.map((recordType) => {
            const isDefault = recordType.id === defaultRecordTypeId;
            const typeColor = getRecordTypeColor(recordType);

            return (
              <AnimatedPressable
                accessibilityRole="button"
                key={recordType.id}
                onPress={() => handleStartSeparateRecordWithType(recordType.id)}
                pressedScale={0.985}
                style={[
                  styles.typeChoiceCard,
                  recordTypeCardWidth !== undefined && { width: recordTypeCardWidth },
                  isDefault && [
                    styles.typeChoiceCardDefault,
                    { borderColor: typeColor, shadowColor: typeColor },
                  ],
                ]}
              >
                <View
                  style={[
                    styles.typeChoiceIcon,
                    isDefault && styles.typeChoiceIconDefault,
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
                    styles.typeChoiceTitle,
                    isDefault && styles.typeChoiceTitleDefault,
                    isDefault && { color: typeColor },
                  ]}
                >
                  {getRecordTypeName(recordType, t)}
                </Text>
                <View
                  style={[
                    styles.typeChoiceCheck,
                    isDefault && [
                      styles.typeChoiceCheckDefault,
                      { backgroundColor: typeColor, borderColor: typeColor },
                    ],
                  ]}
                >
                  {isDefault ? (
                    <Ionicons color={colors.surface} name="checkmark" size={14} />
                  ) : null}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </AnimatedSheetModal>

      <DayRecordsPanel
        dayKey={dayRecordsPanelDayKey}
        onClose={() => setDayRecordsPanelVisible(false)}
        onExitComplete={() => setDayRecordsPanelDayKey(null)}
        onRecordsChanged={loadData}
        separateRecordEnabled={separateRecordEnabled}
        visible={dayRecordsPanelVisible}
      />
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
    paddingTop: spacing.sm,
    paddingBottom: 140,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerDateRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  headerWeekday: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    ...typography.screenTitle,
  },
  headerIcon: {
    width: componentSizes.headerIconButton,
    height: componentSizes.headerIconButton,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerIconPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  headerIconDisabled: {
    opacity: 0.55,
  },
  todayPanelShell: {
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    ...shadow,
    overflow: 'hidden',
  },
  todayPanel: {
    minHeight: 178,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayPanelRecorded: {
    opacity: 1,
  },
  todayPanelRecordedPressed: {
    transform: [{ scale: 0.99 }],
  },
  todayPanelSelected: {
    opacity: 0.92,
  },
  todayPanelTextSelected: {
    color: colors.surface,
  },
  todayPanelTextRecorded: {
    color: colors.surface,
  },
  todayCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  todayRecordTitle: {
    alignSelf: 'flex-start',
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
    textShadowColor: 'rgba(18,24,54,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  loadingIndicator: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
  minutesRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  minutesNumber: {
    color: colors.surface,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 58,
  },
  minutesUnit: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
    marginLeft: spacing.sm,
    marginBottom: 6,
  },
  minutesText: {
    color: colors.surface,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: spacing.xs,
  },
  notRecorded: {
    color: colors.surface,
    fontSize: 28,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  meta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  todayMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  todayTimeFields: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.xs,
  },
  todayTimeField: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  todayTimeSeparator: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  recordTypePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.7)',
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  todayProgressBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.24)',
  },
  todayProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  todayGoalRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  todayGoalText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  todayProgressText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  todayProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  todayProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  clock: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 9,
    borderColor: 'rgba(238,240,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  clockTick: {
    position: 'absolute',
    width: 3,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#8B8CFF',
  },
  clockTickTop: {
    top: 11,
  },
  clockTickRight: {
    right: 13,
    transform: [{ rotate: '90deg' }],
  },
  clockTickBottom: {
    bottom: 11,
  },
  clockTickLeft: {
    left: 13,
    transform: [{ rotate: '90deg' }],
  },
  clockHandPivot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockHandLong: {
    width: 5,
    height: 39,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
    transform: [{ translateY: -19.5 }],
  },
  clockHandShort: {
    width: 5,
    height: 28,
    borderRadius: 2.5,
    backgroundColor: colors.highlight,
    transform: [{ translateY: -14 }],
  },
  clockCenter: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#C7D0FF',
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    ...typography.sectionTitle,
  },
  recordList: {
    gap: spacing.md,
  },
  recordGroup: {
    gap: spacing.sm,
  },
  recordGroupHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  recordGroupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  recordGroupTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  recordGroupDate: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  recordGroupRows: {
    gap: spacing.sm,
  },
  recordRow: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recordTypeIconBlock: {
    alignSelf: 'stretch',
    aspectRatio: 1,
    marginLeft: -spacing.md,
    marginVertical: -spacing.sm,
    borderTopLeftRadius: radius.md - 1,
    borderBottomLeftRadius: radius.md - 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  recordTypeIconCircle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  recordTypeLabel: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recordMain: {
    flex: 1,
    minWidth: 0,
    marginLeft: -spacing.xs,
  },
  recordDate: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  recordWeekday: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  recordTime: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  recordMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 5,
  },
  recordValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    flexShrink: 0,
  },
  recordMinutes: {
    color: colors.info,
    fontSize: 18,
    fontWeight: '900',
  },
  recordUnitText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  recordArrowButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -7,
  },
  emptyBox: {
    minHeight: 112,
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
    fontSize: 14,
    fontWeight: '700',
  },
  actionArea: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: componentSizes.tabBarHeight + spacing.sm,
    alignItems: 'center',
  },
  recordButtonContainer: {
    width: '100%',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 18, 28, 0.34)',
  },
  recordTypeSheet: {
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
  typeChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChoiceCard: {
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
  typeChoiceCardDefault: {
    borderColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  typeChoiceIcon: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChoiceIconDefault: {
    opacity: 1,
  },
  typeChoiceTitle: {
    maxWidth: '100%',
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  typeChoiceTitleDefault: {
    color: colors.primary,
  },
  typeChoiceCheck: {
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
  typeChoiceCheckDefault: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  });
};
