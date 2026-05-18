import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
import { RecordButton } from '@/components/RecordButton';
import { RecordTypeBadge } from '@/components/RecordTypeBadge';
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
import { radius, spacing, useAppTheme } from '@/theme';
import {
  formatDayLabel,
  formatDayWithWeekdayLabel,
  formatDuration,
  formatWeekdayLabel,
  type RecordUnit,
} from '@/utils/date';
import { getRecordMinutesColor } from '@/utils/recordColor';
import { formatRecordRange, formatRecordsRange, parseRecordTime } from '@/utils/recordFormat';
import {
  getRecordIconName,
  getRecordTypeIconName,
  mixedRecordTypeIconName,
} from '@/utils/recordTypeIcon';

function getIsBeforeStartTime(startTimeMinutes: number) {
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return currentMinutes < startTimeMinutes;
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

function getRecordTypeName(record: DayRecord) {
  return record.record_type_name || record.record_type_id;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const { colors } = theme;
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
  const [recordTypePickerVisible, setRecordTypePickerVisible] = useState(false);
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
  const todayDisplayRange = separateRecordEnabled
    ? todayRecord
      ? formatRecordRange(todayRecord, startTimeMinutes)
      : ''
    : formatRecordsRange(todayRecords, startTimeMinutes);
  const todayTypeInfo = useMemo(() => {
    if (!todayRecord) {
      return null;
    }

    if (separateRecordEnabled) {
      return {
        iconName: getRecordIconName(todayRecord),
        label: getRecordTypeName(todayRecord),
      };
    }

    const typeIds = Array.from(new Set(todayRecords.map((record) => record.record_type_id)));
    if (typeIds.length > 1) {
      return {
        iconName: mixedRecordTypeIconName,
        label: t('recordTypes.mixed'),
      };
    }

    const firstRecord = todayRecords[0];
    return firstRecord
      ? {
          iconName: getRecordIconName(firstRecord),
          label: getRecordTypeName(firstRecord),
        }
      : null;
  }, [separateRecordEnabled, t, todayRecord, todayRecords]);

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

  const handleOpenRecordInStats = (dayKey: string) => {
    router.push({
      pathname: '/(tabs)/stats',
      params: {
        selectedDayKey: dayKey,
        selectedAt: String(Date.now()),
      },
    });
  };

  const canToggleRecordButton = Boolean(
    separateRecordEnabled && todayRecord && !isBeforeStartTime,
  );
  const isTodayPanelSelected = Boolean(separateRecordEnabled && todayRecord && showRecordButton);
  const todayClockHands = useMemo(() => getClockHandsFromRecord(todayRecord), [todayRecord]);
  const activeSeparateRecordTypeName = activeSeparateRecordTypeId
    ? recordTypes.find((recordType) => recordType.id === activeSeparateRecordTypeId)?.name
    : null;
  const recordButtonLabel = separateRecordEnabled
    ? todayRecord
      ? t('home.updateRecord')
      : t('home.createRecord')
    : activeSeparateRecordStartedAt
      ? activeSeparateRecordTypeName ?? t('home.endRecord')
      : t('home.startRecord');
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
          <View>
            <Text style={styles.title}>{t('home.today')}</Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={`${t('home.today')} ${t('tabs.stats')}`}
            accessibilityRole="button"
            disabled={!currentDayKey}
            hitSlop={10}
            onPress={() => handleOpenRecordInStats(currentDayKey)}
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
              <Text style={styles.cardLabel}>
                {currentDayKey
                  ? formatDayWithWeekdayLabel(currentDayKey)
                  : t('home.today')}
              </Text>
              {isLoading ? (
                <ActivityIndicator color={colors.primary} style={styles.loadingIndicator} />
              ) : todayRecord ? (
                <>
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
                  <View style={styles.todayMetaRow}>
                    {todayTypeInfo ? (
                      <RecordTypeBadge
                        compact
                        iconName={todayTypeInfo.iconName}
                        label={todayTypeInfo.label}
                      />
                    ) : null}
                    <Text style={styles.todayDate}>{todayDisplayRange}</Text>
                    <Ionicons color={colors.textSoft} name="create" size={17} />
                  </View>
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
                <View>
                  <View style={styles.recordDateRow}>
                    <Text style={styles.recordDate}>{formatDayLabel(record.day_key)}</Text>
                    <Text style={styles.recordWeekday}>{formatWeekdayLabel(record.day_key)}</Text>
                  </View>
                  <Text style={styles.recordTime}>{formatRecordRange(record, startTimeMinutes)}</Text>
                  <RecordTypeBadge
                    compact
                    iconName={getRecordIconName(record)}
                    label={getRecordTypeName(record)}
                    style={styles.recordTypeText}
                  />
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
                    accessibilityLabel={`${formatDayLabel(record.day_key)} ${t('tabs.stats')}`}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => handleOpenRecordInStats(record.day_key)}
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
            disabled={isRecording || isHidingRecordButton || !shouldShowRecordButtonArea}
            hasRecord={separateRecordEnabled && Boolean(todayRecord)}
            iconName={
              !separateRecordEnabled
                ? activeSeparateRecordStartedAt
                  ? 'stop'
                  : 'play'
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
          <View>
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
        <View style={styles.typeChoiceList}>
          {recordTypes.map((recordType) => {
            const isDefault = recordType.id === defaultRecordTypeId;

            return (
              <AnimatedPressable
                accessibilityRole="button"
                key={recordType.id}
                onPress={() => handleStartSeparateRecordWithType(recordType.id)}
                pressedScale={0.985}
                style={[styles.typeChoiceRow, isDefault && styles.typeChoiceRowDefault]}
              >
                <View style={[styles.typeChoiceIcon, isDefault && styles.typeChoiceIconDefault]}>
                  <Ionicons
                    color={isDefault ? colors.surface : colors.primary}
                    name={getRecordTypeIconName(recordType)}
                    size={22}
                  />
                </View>
                <View style={styles.typeChoiceCopy}>
                  <Text style={styles.typeChoiceTitle}>{recordType.name}</Text>
                  {isDefault ? (
                    <Text style={styles.typeChoiceMeta}>{t('settings.defaultRecordType')}</Text>
                  ) : null}
                </View>
                <Ionicons color={colors.mutedSubtle} name="chevron-forward" size={20} />
              </AnimatedPressable>
            );
          })}
        </View>
      </AnimatedSheetModal>
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
    paddingTop: spacing.md,
    paddingBottom: 132,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
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
    marginBottom: spacing.xl,
    ...shadow,
    overflow: 'hidden',
  },
  todayPanel: {
    minHeight: 178,
    paddingHorizontal: spacing.xl,
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
  todayPanelWeekdayRecorded: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: colors.surface,
  },
  todayPanelWeekdaySelected: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    color: colors.danger,
  },
  todayCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  cardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  loadingIndicator: {
    alignSelf: 'flex-start',
    marginTop: spacing.xl,
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  minutesNumber: {
    color: colors.text,
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 64,
  },
  minutesUnit: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginLeft: spacing.sm,
    marginBottom: 8,
  },
  minutesText: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 48,
    marginTop: spacing.sm,
  },
  notRecorded: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.textSoft,
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
    color: colors.text,
    fontSize: 17,
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
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 8,
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
    width: 4,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#FF8B40',
  },
  clockTickTop: {
    top: 13,
  },
  clockTickRight: {
    right: 15,
    transform: [{ rotate: '90deg' }],
  },
  clockTickBottom: {
    bottom: 13,
  },
  clockTickLeft: {
    left: 15,
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
    width: 6,
    height: 43,
    borderRadius: 3,
    backgroundColor: '#FF7B25',
    transform: [{ translateY: -21.5 }],
  },
  clockHandShort: {
    width: 6,
    height: 28,
    borderRadius: 3,
    backgroundColor: '#FF7B25',
    transform: [{ translateY: -14 }],
  },
  clockCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF7B25',
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  recordList: {
    gap: spacing.sm,
  },
  recordRow: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
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
    gap: spacing.sm,
  },
  recordDate: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  recordWeekday: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  recordTime: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  recordTypeText: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  recordValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  recordMinutes: {
    color: colors.info,
    fontSize: 20,
    fontWeight: '900',
  },
  recordUnitText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  recordArrowButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -7,
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
    bottom: 92,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    marginTop: spacing.xs,
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
  typeChoiceList: {
    gap: spacing.sm,
  },
  typeChoiceRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChoiceRowDefault: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  typeChoiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    flexShrink: 0,
  },
  typeChoiceIconDefault: {
    backgroundColor: colors.primary,
  },
  typeChoiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  typeChoiceTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  typeChoiceMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  });
};
