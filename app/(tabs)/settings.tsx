import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRecordUnit,
  getRecentRecordLimit,
  getStartTimeMinutes,
  setRecentRecordLimit as saveRecentRecordLimit,
  setRecordUnit as saveRecordUnit,
  setStartTimeMinutes,
} from '@/data/database';
import { radius, spacing, useAppTheme } from '@/theme';
import { formatTimeFromMinutes, type RecordUnit } from '@/utils/date';

type SettingSection = 'startTime' | 'recordUnit' | 'recentRecords';

const recentRecordOptions = [5, 10, 20, 30];
const wheelItemHeight = 46;
const wheelVisibleItems = 5;

type WheelPickerProps = {
  accentColor: string;
  onChange: (value: string) => void;
  value: string;
  values: string[];
};

function WheelPicker({ accentColor, onChange, value, values }: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = Math.max(0, values.indexOf(value));
  const latestOffsetRef = useRef(selectedIndex * wheelItemHeight);
  const verticalPadding = (wheelItemHeight * (wheelVisibleItems - 1)) / 2;

  const updateValueFromOffset = useCallback(
    (offsetY: number) => {
      const nextIndex = Math.max(
        0,
        Math.min(values.length - 1, Math.round(offsetY / wheelItemHeight)),
      );

      const nextValue = values[nextIndex];

      if (nextValue !== value) {
        onChange(nextValue);
      }

      scrollRef.current?.scrollTo({
        animated: true,
        y: nextIndex * wheelItemHeight,
      });
    },
    [onChange, value, values],
  );

  const scheduleCommitFromLatestOffset = useCallback(
    (delay = 260) => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }

      settleTimerRef.current = setTimeout(() => {
        updateValueFromOffset(latestOffsetRef.current);
      }, delay);
    },
    [updateValueFromOffset],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      animated: false,
      y: selectedIndex * wheelItemHeight,
    });
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    updateValueFromOffset(latestOffsetRef.current);
  };

  return (
    <View style={stylesStatic.wheelPicker}>
      <View pointerEvents="none" style={stylesStatic.wheelHighlight} />
      <ScrollView
        ref={scrollRef}
        bounces={false}
        decelerationRate={Platform.OS === 'ios' ? 0.96 : 0.985}
        nestedScrollEnabled
        onMomentumScrollBegin={() => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
          }
        }}
        onMomentumScrollEnd={(event) => {
          handleScrollEnd(event);
        }}
        onScroll={(event) => {
          latestOffsetRef.current = event.nativeEvent.contentOffset.y;
          scheduleCommitFromLatestOffset(360);
        }}
        onScrollBeginDrag={() => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
          }
        }}
        onScrollEndDrag={(event) => {
          latestOffsetRef.current = event.nativeEvent.contentOffset.y;
          scheduleCommitFromLatestOffset(420);
        }}
        overScrollMode="never"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={stylesStatic.wheelScroll}
        contentContainerStyle={{ paddingVertical: verticalPadding }}
      >
        {values.map((item) => {
          const isSelected = item === value;

          return (
            <View key={item} style={stylesStatic.wheelItem}>
              <Text
                style={[
                  stylesStatic.wheelItemText,
                  isSelected && { color: accentColor, fontSize: 31, opacity: 1 },
                ]}
              >
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  wheelPicker: {
    width: 112,
    height: wheelItemHeight * wheelVisibleItems,
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: wheelItemHeight * 2,
    height: wheelItemHeight,
    borderRadius: radius.md,
    backgroundColor: '#FFF7E9',
    borderWidth: 1,
    borderColor: '#FFDCA8',
  },
  wheelScroll: {
    flex: 1,
  },
  wheelItem: {
    height: wheelItemHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    color: '#9EA8B3',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 36,
    opacity: 0.76,
  },
});

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [hour, setHour] = useState('00');
  const [minute, setMinute] = useState('00');
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [recentRecordLimit, setRecentRecordLimit] = useState('5');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SettingSection | null>(null);
  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')),
    [],
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')),
    [],
  );
  const pendingStartMinutes = useMemo(() => Number(hour || 0) * 60 + Number(minute || 0), [
    hour,
    minute,
  ]);

  const loadSettings = useCallback(async () => {
    const [startMinutes, unit, limit] = await Promise.all([
      getStartTimeMinutes(db),
      getRecordUnit(db),
      getRecentRecordLimit(db),
    ]);

    setHour(String(Math.floor(startMinutes / 60)).padStart(2, '0'));
    setMinute(String(startMinutes % 60).padStart(2, '0'));
    setRecordUnit(unit);
    setRecentRecordLimit(String(limit));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  const handleSave = async () => {
    const parsedHour = Number(hour);
    const parsedMinute = Number(minute);

    if (
      !Number.isInteger(parsedHour) ||
      !Number.isInteger(parsedMinute) ||
      parsedHour < 0 ||
      parsedHour > 23 ||
      parsedMinute < 0 ||
      parsedMinute > 59
    ) {
      Alert.alert(t('settings.invalidTimeTitle'), t('settings.invalidTimeMessage'));
      return;
    }

    const parsedRecentRecordLimit = Number(recentRecordLimit);

    if (!Number.isInteger(parsedRecentRecordLimit) || parsedRecentRecordLimit < 1) {
      Alert.alert(
        t('settings.invalidRecentRecordsTitle'),
        t('settings.invalidRecentRecordsMessage'),
      );
      return;
    }

    setIsSaving(true);
    const [nextMinutes, , nextRecentRecordLimit] = await Promise.all([
      setStartTimeMinutes(db, parsedHour * 60 + parsedMinute),
      saveRecordUnit(db, recordUnit),
      saveRecentRecordLimit(db, parsedRecentRecordLimit),
    ]);

    setHour(String(Math.floor(nextMinutes / 60)).padStart(2, '0'));
    setMinute(String(nextMinutes % 60).padStart(2, '0'));
    setRecentRecordLimit(String(nextRecentRecordLimit));
    setIsSaving(false);
  };

  const renderChevron = (section: SettingSection, color: string) => (
    <Ionicons
      color={color}
      name={expandedSection === section ? 'chevron-up' : 'chevron-forward'}
      size={20}
    />
  );

  const handleToggleSection = (section: SettingSection) => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('settings.title')}</Text>
          </View>

          <View style={styles.panel}>
            <View
              style={[
                styles.optionCard,
                expandedSection === 'startTime' && styles.optionCardTimeActive,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('startTime')}
                style={styles.settingRow}
              >
                <View style={[styles.iconTile, styles.timeTile]}>
                  <Ionicons color={colors.accent} name="time-outline" size={25} />
                </View>
                <Text style={styles.rowLabel}>{t('settings.dayStart')}</Text>
                <Text
                  style={[
                    styles.rowValue,
                    expandedSection === 'startTime' && { color: colors.primary },
                  ]}
                >
                  {formatTimeFromMinutes(pendingStartMinutes)}
                </Text>
                {renderChevron(
                  'startTime',
                  expandedSection === 'startTime' ? colors.primary : colors.mutedSubtle,
                )}
              </Pressable>

              {expandedSection === 'startTime' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.primary }]}>
                    选择开始时间
                  </Text>
                  <View style={styles.timePickerPanel}>
                    <WheelPicker
                      accentColor={colors.primary}
                      onChange={setHour}
                      value={hour}
                      values={hourOptions}
                    />

                    <Text style={styles.wheelSeparator}>:</Text>

                    <WheelPicker
                      accentColor={colors.primary}
                      onChange={setMinute}
                      value={minute}
                      values={minuteOptions}
                    />
                  </View>
                  <View style={styles.tipRow}>
                    <Ionicons color={colors.accent} name="bulb-outline" size={17} />
                    <Text style={[styles.tipText, { color: colors.accent }]}>
                      设置每天记录的开始时间点
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.optionCard,
                expandedSection === 'recordUnit' && styles.optionCardUnitActive,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('recordUnit')}
                style={styles.settingRow}
              >
                <View style={[styles.iconTile, styles.unitTile]}>
                  <Ionicons color={colors.info} name="pencil" size={24} />
                </View>
                <Text style={styles.rowLabel}>{t('settings.recordUnit')}</Text>
                <Text
                  style={[
                    styles.rowValue,
                    expandedSection === 'recordUnit' && { color: colors.info },
                  ]}
                >
                  {recordUnit === 'minutes' ? t('settings.minutes') : t('settings.hours')}
                </Text>
                {renderChevron(
                  'recordUnit',
                  expandedSection === 'recordUnit' ? colors.info : colors.mutedSubtle,
                )}
              </Pressable>

              {expandedSection === 'recordUnit' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.info }]}>选择记录单位</Text>
                  {[
                    {
                      label: t('settings.minutes'),
                      value: 'minutes' as const,
                      description: '以分钟为单位记录时间',
                    },
                    {
                      label: t('settings.hours'),
                      value: 'hours' as const,
                      description: '以小时为单位记录时间',
                    },
                  ].map((item) => {
                    const isActive = recordUnit === item.value;

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={item.value}
                        onPress={() => setRecordUnit(item.value)}
                        style={[styles.choiceRow, isActive && styles.choiceRowUnitActive]}
                      >
                        <View style={[styles.radio, isActive && styles.radioUnitActive]}>
                          {isActive ? (
                            <Ionicons color={colors.surface} name="checkmark" size={18} />
                          ) : null}
                        </View>
                        <View style={styles.choiceCopy}>
                          <Text style={styles.choiceTitle}>{item.label}</Text>
                          <Text style={styles.choiceDescription}>{item.description}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  <View style={styles.tipRow}>
                    <Ionicons color={colors.info} name="information-circle-outline" size={17} />
                    <Text style={[styles.tipText, { color: colors.info }]}>
                      更改后，历史记录将按新单位显示
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.optionCard,
                expandedSection === 'recentRecords' && styles.optionCardListActive,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('recentRecords')}
                style={styles.settingRow}
              >
                <View style={[styles.iconTile, styles.listTile]}>
                  <Ionicons color={colors.highlight} name="list" size={25} />
                </View>
                <Text
                  style={[
                    styles.rowLabel,
                    expandedSection === 'recentRecords' && { color: colors.highlight },
                  ]}
                >
                  {t('settings.recentRecords')}
                </Text>
                <Text
                  style={[
                    styles.rowValue,
                    expandedSection === 'recentRecords' && { color: colors.highlight },
                  ]}
                >
                  {recentRecordLimit} 条
                </Text>
                {renderChevron(
                  'recentRecords',
                  expandedSection === 'recentRecords' ? colors.highlight : colors.mutedSubtle,
                )}
              </Pressable>

              {expandedSection === 'recentRecords' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.highlight }]}>
                    选择显示的最近记录条数
                  </Text>
                  {recentRecordOptions.map((option) => {
                    const isActive = recentRecordLimit === String(option);

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={option}
                        onPress={() => setRecentRecordLimit(String(option))}
                        style={[styles.limitRow, isActive && styles.limitRowActive]}
                      >
                        <Text style={[styles.limitText, isActive && styles.limitTextActive]}>
                          {option} 条
                        </Text>
                        <View style={[styles.radio, isActive && styles.radioListActive]}>
                          {isActive ? (
                            <Ionicons color={colors.surface} name="checkmark" size={16} />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  <View style={styles.tipRow}>
                    <Ionicons color={colors.highlight} name="information-circle-outline" size={17} />
                    <Text style={[styles.tipText, { color: colors.highlight }]}>
                      仅影响最近记录列表的显示数量
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              isSaving && styles.saveButtonDisabled,
            ]}
          >
            <Ionicons color={colors.surface} name="save-outline" size={20} />
            <Text style={styles.saveText}>
              {isSaving ? t('settings.saving') : t('settings.save')}
            </Text>
          </Pressable>

          <Text style={styles.subtitle}>
            {t('settings.currentStartTime', { time: formatTimeFromMinutes(pendingStartMinutes) })}
          </Text>
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
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: 132,
    },
    header: {
      minHeight: 54,
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.textSoft,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: spacing.md,
    },
    panel: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    optionCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadow,
    },
    optionCardTimeActive: {
      borderColor: '#FFD08A',
      backgroundColor: '#FFF9EF',
    },
    optionCardUnitActive: {
      borderColor: '#83DED8',
      backgroundColor: '#F5FFFE',
    },
    optionCardListActive: {
      borderColor: '#9CC8FF',
      backgroundColor: '#F7FBFF',
    },
    settingRow: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    iconTile: {
      width: 46,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeTile: {
      backgroundColor: '#FFF0BF',
    },
    unitTile: {
      backgroundColor: colors.infoSoft,
    },
    listTile: {
      backgroundColor: '#E5F0FF',
    },
    rowLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    rowValue: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    optionBody: {
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
    timePickerPanel: {
      minHeight: 190,
      borderRadius: radius.lg,
      backgroundColor: 'rgba(255,255,255,0.66)',
      borderWidth: 1,
      borderColor: '#FFE2B9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      overflow: 'hidden',
    },
    timeColumn: {
      width: 112,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    timeGhost: {
      color: colors.mutedSubtle,
      fontSize: 21,
      fontWeight: '800',
      opacity: 0.78,
      lineHeight: 26,
    },
    wheelInput: {
      width: 104,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: '#FFF7E9',
      borderWidth: 1,
      borderColor: '#FFDCA8',
      fontSize: 31,
      fontWeight: '900',
      textAlign: 'center',
      lineHeight: 38,
    },
    wheelSeparator: {
      color: colors.primary,
      fontSize: 30,
      fontWeight: '900',
      marginHorizontal: spacing.sm,
    },
    choiceRow: {
      minHeight: 78,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    choiceRowUnitActive: {
      backgroundColor: '#EEFFFD',
      borderColor: '#9BE7E2',
    },
    radio: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    radioUnitActive: {
      backgroundColor: colors.info,
      borderColor: colors.info,
    },
    radioListActive: {
      backgroundColor: colors.highlight,
      borderColor: colors.highlight,
    },
    choiceCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    choiceTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '900',
    },
    choiceDescription: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    limitRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    limitRowActive: {
      backgroundColor: '#EEF6FF',
      borderColor: '#B8D7FF',
    },
    limitText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    limitTextActive: {
      color: colors.highlight,
      fontWeight: '900',
    },
    tipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    tipText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '800',
    },
    saveButton: {
      height: 54,
      borderRadius: 18,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      ...shadow,
    },
    saveButtonPressed: {
      backgroundColor: colors.primaryDark,
    },
    saveButtonDisabled: {
      opacity: 0.7,
    },
    saveText: {
      color: colors.surface,
      fontSize: 15,
      fontWeight: '900',
    },
  });
};
