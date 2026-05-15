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
  TextInput,
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

function cleanNumericInput(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

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
  const [savedMinutes, setSavedMinutes] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const [startMinutes, unit, limit] = await Promise.all([
      getStartTimeMinutes(db),
      getRecordUnit(db),
      getRecentRecordLimit(db),
    ]);

    setSavedMinutes(startMinutes);
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

    setSavedMinutes(nextMinutes);
    setHour(String(Math.floor(nextMinutes / 60)).padStart(2, '0'));
    setMinute(String(nextMinutes % 60).padStart(2, '0'));
    setRecentRecordLimit(String(nextRecentRecordLimit));
    setIsSaving(false);
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
            <Text style={styles.subtitle}>
              {t('settings.currentStartTime', { time: formatTimeFromMinutes(savedMinutes) })}
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>{t('settings.dayStart')}</Text>
            <View style={styles.timeRow}>
              <TextInput
                keyboardType="number-pad"
                maxLength={2}
                onBlur={() => setHour((value) => value.padStart(2, '0'))}
                onChangeText={(value) => setHour(cleanNumericInput(value, 2))}
                placeholder="00"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
                style={styles.timeInput}
                value={hour}
              />
              <Text style={styles.separator}>:</Text>
              <TextInput
                keyboardType="number-pad"
                maxLength={2}
                onBlur={() => setMinute((value) => value.padStart(2, '0'))}
                onChangeText={(value) => setMinute(cleanNumericInput(value, 2))}
                placeholder="00"
                placeholderTextColor={colors.muted}
                selectTextOnFocus
                style={styles.timeInput}
                value={minute}
              />
            </View>

            <Text style={styles.label}>{t('settings.recordUnit')}</Text>
            <View style={styles.segmented}>
              {[
                { label: t('settings.hours'), value: 'hours' },
                { label: t('settings.minutes'), value: 'minutes' },
              ].map((item) => {
                const isActive = recordUnit === item.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={item.value}
                    onPress={() => setRecordUnit(item.value as RecordUnit)}
                    style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                  >
                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>{t('settings.recentRecords')}</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(value) => setRecentRecordLimit(cleanNumericInput(value, 2))}
              placeholder="5"
              placeholderTextColor={colors.muted}
              style={styles.numberInput}
              value={recentRecordLimit}
            />

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
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    header: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    panel: {
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow,
    },
    label: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    timeInput: {
      width: 82,
      height: 60,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
    },
    separator: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '900',
      marginHorizontal: spacing.sm,
    },
    segmented: {
      height: 44,
      padding: 3,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      flexDirection: 'row',
      marginBottom: spacing.lg,
    },
    numberInput: {
      height: 46,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      fontSize: 17,
      fontWeight: '900',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    segmentButton: {
      flex: 1,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentButtonActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: '800',
    },
    segmentTextActive: {
      color: colors.surface,
    },
    saveButton: {
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
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
