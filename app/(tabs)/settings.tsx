import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRecordUnit,
  getRecentRecordLimit,
  getStartTimeMinutes,
  setRecentRecordLimit as saveRecentRecordLimit,
  setRecordUnit as saveRecordUnit,
  setStartTimeMinutes,
} from '@/data/database';
import { colors, radius, spacing } from '@/theme';
import { formatTimeFromMinutes, type RecordUnit } from '@/utils/date';

function cleanNumericInput(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export default function SettingsScreen() {
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
      Alert.alert('时间无效', '请输入 00:00 到 23:59 之间的时间。');
      return;
    }

    const parsedRecentRecordLimit = Number(recentRecordLimit);

    if (!Number.isInteger(parsedRecentRecordLimit) || parsedRecentRecordLimit < 1) {
      Alert.alert('最近记录无效', '请输入大于或等于 1 的整数。');
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
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>设定</Text>
          <Text style={styles.subtitle}>当前起始时间 {formatTimeFromMinutes(savedMinutes)}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>一天开始</Text>
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

          <Text style={styles.label}>记录单位</Text>
          <View style={styles.segmented}>
            {[
              { label: '小时', value: 'hours' },
              { label: '分钟', value: 'minutes' },
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

          <Text style={styles.label}>最近记录</Text>
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
            <Text style={styles.saveText}>{isSaving ? '保存中' : '保存'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
  },
  panel: {
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  timeInput: {
    width: 92,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  separator: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    marginHorizontal: spacing.md,
  },
  segmented: {
    height: 46,
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  numberInput: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
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
    fontSize: 15,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: colors.surface,
  },
  saveButton: {
    height: 52,
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
    fontSize: 16,
    fontWeight: '800',
  },
});
