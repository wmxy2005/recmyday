import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import {
  getRecordUnit,
  getRecentRecordLimit,
  getStartTimeMinutes,
  getSeparateRecordEnabled,
  setRecentRecordLimit as saveRecentRecordLimit,
  setRecordUnit as saveRecordUnit,
  setSeparateRecordEnabled as saveSeparateRecordEnabled,
  setStartTimeMinutes,
} from '@/data/database';
import { radius, spacing, useAppTheme } from '@/theme';
import { formatTimeFromMinutes, type RecordUnit } from '@/utils/date';

type SettingSection = 'startTime' | 'recordUnit' | 'recentRecords' | 'separateRecord';

const recentRecordOptions = [5, 10, 20, 30];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [pendingStartMinutes, setPendingStartMinutes] = useState(0);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [recentRecordLimit, setRecentRecordLimit] = useState('5');
  const [separateRecordEnabled, setSeparateRecordEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SettingSection | null>(null);

  const loadSettings = useCallback(async () => {
    const [startMinutes, unit, limit, separateEnabled] = await Promise.all([
      getStartTimeMinutes(db),
      getRecordUnit(db),
      getRecentRecordLimit(db),
      getSeparateRecordEnabled(db),
    ]);

    setPendingStartMinutes(startMinutes);
    setRecordUnit(unit);
    setRecentRecordLimit(String(limit));
    setSeparateRecordEnabled(separateEnabled);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  const handleSave = async () => {
    if (
      !Number.isInteger(pendingStartMinutes) ||
      pendingStartMinutes < 0 ||
      pendingStartMinutes > 23 * 60 + 59
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
      setStartTimeMinutes(db, pendingStartMinutes),
      saveRecordUnit(db, recordUnit),
      saveRecentRecordLimit(db, parsedRecentRecordLimit),
      saveSeparateRecordEnabled(db, separateRecordEnabled),
    ]);

    setPendingStartMinutes(nextMinutes);
    setRecentRecordLimit(String(nextRecentRecordLimit));
    setExpandedSection(null);
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
                    {t('settings.chooseStartTime')}
                  </Text>
                  <TimeWheelPicker
                    accentColor={colors.primary}
                    onChangeMinutes={setPendingStartMinutes}
                    valueMinutes={pendingStartMinutes}
                  />
                  <View style={styles.tipRow}>
                    <Ionicons color={colors.accent} name="bulb-outline" size={17} />
                    <Text style={[styles.tipText, { color: colors.accent }]}>
                      {t('settings.startTimeDescription')}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.optionCard,
                expandedSection === 'separateRecord' && styles.optionCardSeparateActive,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('separateRecord')}
                style={styles.settingRow}
              >
                <View style={[styles.iconTile, styles.separateTile]}>
                  <Ionicons color={colors.danger} name="stopwatch-outline" size={25} />
                </View>
                <Text
                  style={[
                    styles.rowLabel,
                    expandedSection === 'separateRecord' && { color: colors.danger },
                  ]}
                >
                  {t('settings.separateRecord')}
                </Text>
                <Text
                  style={[
                    styles.rowValue,
                    expandedSection === 'separateRecord' && { color: colors.danger },
                  ]}
                >
                  {separateRecordEnabled ? t('settings.yes') : t('settings.no')}
                </Text>
                {renderChevron(
                  'separateRecord',
                  expandedSection === 'separateRecord' ? colors.danger : colors.mutedSubtle,
                )}
              </Pressable>

              {expandedSection === 'separateRecord' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.danger }]}>
                    {t('settings.chooseSeparateRecord')}
                  </Text>
                  {[
                    {
                      label: t('settings.no'),
                      value: false,
                      description: t('settings.separateRecordNoDescription'),
                    },
                    {
                      label: t('settings.yes'),
                      value: true,
                      description: t('settings.separateRecordYesDescription'),
                    },
                  ].map((item) => {
                    const isActive = separateRecordEnabled === item.value;

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={String(item.value)}
                        onPress={() => setSeparateRecordEnabled(item.value)}
                        style={[styles.choiceRow, isActive && styles.choiceRowSeparateActive]}
                      >
                        <View style={[styles.radio, isActive && styles.radioSeparateActive]}>
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
                    <Ionicons color={colors.danger} name="information-circle-outline" size={17} />
                    <Text style={[styles.tipText, { color: colors.danger }]}>
                      {t('settings.separateRecordDescription')}
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
                  <Text style={[styles.optionTitle, { color: colors.info }]}>
                    {t('settings.chooseRecordUnit')}
                  </Text>
                  {[
                    {
                      label: t('settings.minutes'),
                      value: 'minutes' as const,
                      description: t('settings.minutesUnitDescription'),
                    },
                    {
                      label: t('settings.hours'),
                      value: 'hours' as const,
                      description: t('settings.hoursUnitDescription'),
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
                      {t('settings.recordUnitDescription')}
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
                  {t('settings.recordsCount', { count: Number(recentRecordLimit) })}
                </Text>
                {renderChevron(
                  'recentRecords',
                  expandedSection === 'recentRecords' ? colors.highlight : colors.mutedSubtle,
                )}
              </Pressable>

              {expandedSection === 'recentRecords' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.highlight }]}>
                    {t('settings.chooseRecentRecords')}
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
                          {t('settings.recordsCount', { count: option })}
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
                      {t('settings.recentRecordsDescription')}
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
    optionCardSeparateActive: {
      borderColor: '#FFB7A7',
      backgroundColor: '#FFF7F3',
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
    separateTile: {
      backgroundColor: colors.dangerSoft,
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
    choiceRowSeparateActive: {
      backgroundColor: '#FFF1EC',
      borderColor: '#FFC5B8',
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
    radioSeparateActive: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
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
