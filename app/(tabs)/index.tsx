import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
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
import { getRecordMinutesColor } from '@/utils/recordColor';
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
  const todayTotalMinutes = useMemo(
    () => todayRecords.reduce((sum, record) => sum + record.minutes_since_start, 0),
    [todayRecords],
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
      ? t('home.endRecord')
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
            colors={['#FFE7B4', '#FFD991', '#FF895F']}
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
                        <Ionicons color={colors.textSoft} name="create" size={17} />
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.notRecorded}>{t('home.notRecorded')}</Text>
                  <Text style={styles.meta}> </Text>
                </>
              )}
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
            previousRecords.map((record) => (
              <View key={record.id} style={styles.recordRow}>
                {!separateRecordEnabled ? (
                  <View style={styles.recordTypeIconBlock}>
                    <Ionicons
                      color={getRecordColor(record)}
                      name={getRecordIconName(record)}
                      size={24}
                      style={styles.recordTypeIconCircle}
                    />
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.recordTypeIconText}>
                      {getDayRecordTypeName(record, t)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.recordMain}>
                  <View style={styles.recordDateRow}>
                    <Text style={styles.recordDate}>{formatDayLabel(record.day_key)}</Text>
                    <Text style={styles.recordWeekday}>{formatWeekdayLabel(record.day_key)}</Text>
                  </View>
                  <View style={styles.recordMetaRow}>
                    <Text style={styles.recordTime}>{formatRecordRange(record, startTimeMinutes)}</Text>
                  </View>
                </View>
                <View style={styles.recordValueRow}>
                  {recordUnit === 'minutes' ? (
                    <>
                      <Text
                        style={[
                          styles.recordMinutes,
                          { color: getRecordMinutesColor(record.minutes_since_start) },
                        ]}
                      >
                        {record.minutes_since_start}
                      </Text>
                      <Text style={styles.recordUnitText}>{t('date.minutesFullUnit')}</Text>
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.recordMinutes,
                        { color: getRecordMinutesColor(record.minutes_since_start) },
                      ]}
                    >
                      {formatDuration(record.minutes_since_start, recordUnit)}
                    </Text>
                  )}
                  <AnimatedPressable
                    accessibilityLabel={t('stats.dayRecordTitle', {
                      day: formatDayLabel(record.day_key),
                    })}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => handleOpenDayRecords(record.day_key)}
                    pressedScale={0.92}
                    pressedTranslateX={4}
                    style={styles.recordArrowButton}
                  >
                    <Ionicons color={colors.mutedSubtle} name="chevron-forward" size={18} />
                  </AnimatedPressable>
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
            disabled={isRecording || isHidingRecordButton || !shouldShowRecordButtonArea}
            hasRecord={separateRecordEnabled && Boolean(todayRecord)}
            iconName={recordButtonIconName}
            iconLabel={
              !separateRecordEnabled && activeSeparateRecordStartedAt
                ? activeSeparateRecordType
                  ? getRecordTypeName(activeSeparateRecordType, t)
                  : undefined
                : undefined
            }
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
    paddingBottom: 108,
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
    minHeight: 144,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
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
    color: colors.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 58,
  },
  minutesUnit: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginLeft: spacing.sm,
    marginBottom: 6,
  },
  minutesText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginTop: spacing.xs,
  },
  notRecorded: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.textSoft,
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
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  todayTimeSeparator: {
    color: colors.text,
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
  clock: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.54)',
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
    backgroundColor: '#FF8B40',
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
    height: 35,
    borderRadius: 2.5,
    backgroundColor: '#FF7B25',
    transform: [{ translateY: -17.5 }],
  },
  clockHandShort: {
    width: 5,
    height: 23,
    borderRadius: 2.5,
    backgroundColor: '#FF7B25',
    transform: [{ translateY: -11.5 }],
  },
  clockCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF7B25',
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    ...typography.sectionTitle,
  },
  recordList: {
    gap: spacing.sm,
  },
  recordRow: {
    minHeight: 58,
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
    width: 64,
    marginLeft: -spacing.md,
    marginVertical: -spacing.sm,
    borderTopLeftRadius: radius.md - 1,
    borderBottomLeftRadius: radius.md - 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  recordTypeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceElevated,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
  },
  recordTypeIconText: {
    maxWidth: '100%',
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 10,
    marginTop: -7,
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
    left: 0,
    right: 0,
    bottom: componentSizes.bottomActionOffset,
    alignItems: 'center',
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
