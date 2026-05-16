import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import {
  getAllDayRecords,
  getRecordUnit,
  getRecentRecordLimit,
  getStartTimeMinutes,
  getSeparateRecordEnabled,
  replaceAllDayRecords,
  setRecentRecordLimit as saveRecentRecordLimit,
  setRecordUnit as saveRecordUnit,
  setSeparateRecordEnabled as saveSeparateRecordEnabled,
  setStartTimeMinutes,
  type ImportDayRecord,
} from '@/data/database';
import { radius, spacing, useAppTheme } from '@/theme';
import { formatTimeFromMinutes, type RecordUnit } from '@/utils/date';

type SettingSection = 'startTime' | 'recordUnit' | 'recentRecords' | 'separateRecord';

type PromptDialog = {
  iconName: ComponentProps<typeof Ionicons>['name'];
  message: string;
  title: string;
  variant?: 'danger' | 'primary' | 'success';
};

const recentRecordOptions = [5, 10, 20, 30];
const exportSchemaVersion = 1;
const exportAppId = 'recmyday';

type DayRecordsExportFile = {
  app: typeof exportAppId;
  schemaVersion: typeof exportSchemaVersion;
  exportedAt: string;
  recordCount: number;
  records: ImportDayRecord[];
  checksum: string;
};

function checksumText(text: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createExportChecksum(payload: Omit<DayRecordsExportFile, 'checksum'>) {
  return checksumText(JSON.stringify(payload));
}

function isValidIsoDate(value: unknown) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isImportDayRecord(value: unknown): value is ImportDayRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<ImportDayRecord>;
  const timestampMs = record.timestamp_ms;
  const minutesSinceStart = record.minutes_since_start;

  return (
    typeof record.day_key === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.day_key) &&
    isValidIsoDate(record.recorded_at) &&
    Number.isInteger(timestampMs) &&
    typeof timestampMs === 'number' &&
    timestampMs >= 0 &&
    Number.isInteger(minutesSinceStart) &&
    typeof minutesSinceStart === 'number' &&
    minutesSinceStart >= 0 &&
    typeof record.created_at === 'string' &&
    record.created_at.length > 0 &&
    typeof record.updated_at === 'string' &&
    record.updated_at.length > 0
  );
}

function parseExportFile(text: string) {
  const parsed = JSON.parse(text) as Partial<DayRecordsExportFile>;
  const { checksum, ...payload } = parsed;

  if (
    parsed.app !== exportAppId ||
    parsed.schemaVersion !== exportSchemaVersion ||
    !isValidIsoDate(parsed.exportedAt) ||
    !Array.isArray(parsed.records) ||
    parsed.records.some((record) => !isImportDayRecord(record)) ||
    parsed.recordCount !== parsed.records.length ||
    typeof checksum !== 'string' ||
    checksum !== createExportChecksum(payload as Omit<DayRecordsExportFile, 'checksum'>)
  ) {
    throw new Error('Invalid export file');
  }

  return parsed.records;
}

function downloadExportFileWeb(filename: string, content: string) {
  if (typeof document === 'undefined') {
    throw new Error('Web document is unavailable');
  }

  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readImportFileWeb() {
  if (typeof document === 'undefined') {
    throw new Error('Web document is unavailable');
  }

  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    let isSettled = false;

    const cleanup = () => {
      input.remove();
    };
    const settle = (value: string | null) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      reject(error);
    };

    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    input.style.top = '-1000px';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.addEventListener('cancel', () => settle(null));
    input.addEventListener('change', async () => {
      const selectedFile = input.files?.[0];

      if (!selectedFile) {
        settle(null);
        return;
      }

      try {
        settle(await selectedFile.text());
      } catch (error) {
        fail(error);
      }
    });

    document.body.appendChild(input);
    input.click();
  });
}

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
  const [isTransferring, setIsTransferring] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SettingSection | null>(null);
  const [pendingImportRecords, setPendingImportRecords] = useState<ImportDayRecord[] | null>(null);
  const [promptDialog, setPromptDialog] = useState<PromptDialog | null>(null);

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
      setPromptDialog({
        iconName: 'alert-circle-outline',
        title: t('settings.invalidTimeTitle'),
        message: t('settings.invalidTimeMessage'),
        variant: 'danger',
      });
      return;
    }

    const parsedRecentRecordLimit = Number(recentRecordLimit);

    if (!Number.isInteger(parsedRecentRecordLimit) || parsedRecentRecordLimit < 1) {
      setPromptDialog({
        iconName: 'alert-circle-outline',
        title: t('settings.invalidRecentRecordsTitle'),
        message: t('settings.invalidRecentRecordsMessage'),
        variant: 'danger',
      });
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

  const handleExport = async () => {
    try {
      setIsTransferring(true);
      const records = await getAllDayRecords(db);
      const exportedAt = new Date().toISOString();
      const payload: Omit<DayRecordsExportFile, 'checksum'> = {
        app: exportAppId,
        schemaVersion: exportSchemaVersion,
        exportedAt,
        recordCount: records.length,
        records: records.map(({ id, ...record }) => record),
      };
      const exportFile: DayRecordsExportFile = {
        ...payload,
        checksum: createExportChecksum(payload),
      };
      const filename = `recmyday-records-${exportedAt.slice(0, 10)}.json`;
      const fileContent = JSON.stringify(exportFile, null, 2);
      const showExportSuccess = () =>
        setPromptDialog({
          iconName: 'download-outline',
          title: t('settings.exportSuccessTitle'),
          message: t('settings.exportSuccessMessage', { count: records.length }),
          variant: 'success',
        });

      if (Platform.OS === 'web') {
        downloadExportFileWeb(filename, fileContent);
        showExportSuccess();
        return;
      }

      const file = new File(
        Paths.cache,
        filename,
      );

      file.create({ overwrite: true });
      file.write(fileContent);

      if (!(await Sharing.isAvailableAsync())) {
        setPromptDialog({
          iconName: 'alert-circle-outline',
          title: t('settings.exportUnavailableTitle'),
          message: t('settings.exportUnavailableMessage'),
          variant: 'danger',
        });
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: t('settings.exportShareTitle'),
        UTI: 'public.json',
      });
      showExportSuccess();
    } catch {
      setPromptDialog({
        iconName: 'alert-circle-outline',
        title: t('settings.exportFailedTitle'),
        message: t('settings.exportFailedMessage'),
        variant: 'danger',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const executeImport = async (records: ImportDayRecord[]) => {
    try {
      setIsTransferring(true);
      await replaceAllDayRecords(db, records);
      setPromptDialog({
        iconName: 'cloud-upload-outline',
        title: t('settings.importSuccessTitle'),
        message: t('settings.importSuccessMessage', { count: records.length }),
        variant: 'success',
      });
    } catch {
      setPromptDialog({
        iconName: 'alert-circle-outline',
        title: t('settings.importFailedTitle'),
        message: t('settings.importFailedMessage'),
        variant: 'danger',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const importRecords = (records: ImportDayRecord[]) => {
    setPendingImportRecords(records);
  };

  const handleCancelImport = () => {
    setPendingImportRecords(null);
  };

  const handleConfirmImport = () => {
    if (!pendingImportRecords) {
      return;
    }

    const records = pendingImportRecords;
    setPendingImportRecords(null);
    void executeImport(records);
  };

  const handleImport = async () => {
    try {
      let text: string | null;

      if (Platform.OS === 'web') {
        text = await readImportFileWeb();
      } else {
        setIsTransferring(true);
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
          multiple: false,
        });

        if (result.canceled || !result.assets[0]) {
          return;
        }

        text = await new File(result.assets[0].uri).text();
      }

      if (!text) {
        return;
      }

      setIsTransferring(true);
      const records = parseExportFile(text);

      setIsTransferring(false);
      importRecords(records);
    } catch {
      setPromptDialog({
        iconName: 'alert-circle-outline',
        title: t('settings.importInvalidTitle'),
        message: t('settings.importInvalidMessage'),
        variant: 'danger',
      });
    } finally {
      setIsTransferring(false);
    }
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
            <View style={styles.headerActions}>
              <AnimatedPressable
                accessibilityLabel={t('settings.exportRecords')}
                accessibilityRole="button"
                disabled={isTransferring}
                onPress={handleExport}
                pressedScale={0.9}
                pressedTranslateY={1}
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && styles.headerButtonPressed,
                  isTransferring && styles.headerButtonDisabled,
                ]}
              >
                <Ionicons color={colors.text} name="download-outline" size={23} />
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityLabel={t('settings.importRecords')}
                accessibilityRole="button"
                disabled={isTransferring}
                onPress={handleImport}
                pressedScale={0.9}
                pressedTranslateY={1}
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && styles.headerButtonPressed,
                  isTransferring && styles.headerButtonDisabled,
                ]}
              >
                <Ionicons color={colors.text} name="cloud-upload-outline" size={23} />
              </AnimatedPressable>
            </View>
          </View>

          <View style={styles.panel}>
            <View
              style={[
                styles.optionCard,
                expandedSection === 'startTime' && styles.optionCardTimeActive,
              ]}
            >
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('startTime')}
                pressedScale={0.985}
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
              </AnimatedPressable>

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
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('separateRecord')}
                pressedScale={0.985}
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
              </AnimatedPressable>

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
                      <AnimatedPressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={String(item.value)}
                        onPress={() => setSeparateRecordEnabled(item.value)}
                        pressedScale={0.985}
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
                      </AnimatedPressable>
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
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('recordUnit')}
                pressedScale={0.985}
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
              </AnimatedPressable>

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
                      <AnimatedPressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={item.value}
                        onPress={() => setRecordUnit(item.value)}
                        pressedScale={0.985}
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
                      </AnimatedPressable>
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
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => handleToggleSection('recentRecords')}
                pressedScale={0.985}
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
              </AnimatedPressable>

              {expandedSection === 'recentRecords' ? (
                <View style={styles.optionBody}>
                  <Text style={[styles.optionTitle, { color: colors.highlight }]}>
                    {t('settings.chooseRecentRecords')}
                  </Text>
                  {recentRecordOptions.map((option) => {
                    const isActive = recentRecordLimit === String(option);

                    return (
                      <AnimatedPressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isActive }}
                        key={option}
                        onPress={() => setRecentRecordLimit(String(option))}
                        pressedScale={0.985}
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
                      </AnimatedPressable>
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

          <AnimatedPressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSave}
            pressedScale={0.96}
            pressedTranslateY={1}
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
          </AnimatedPressable>

          <Text style={styles.subtitle}>
            {t('settings.currentStartTime', { time: formatTimeFromMinutes(pendingStartMinutes) })}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmationDialog
        cancelLabel={t('settings.importCancel')}
        confirmLabel={t('settings.importConfirmAction')}
        iconName="cloud-upload-outline"
        message={t('settings.importConfirmMessage', { count: pendingImportRecords?.length ?? 0 })}
        onCancel={handleCancelImport}
        onConfirm={handleConfirmImport}
        title={t('settings.importConfirmTitle')}
        variant="primary"
        visible={pendingImportRecords !== null}
      />
      <ConfirmationDialog
        confirmLabel={t('settings.promptOk')}
        iconName={promptDialog?.iconName}
        message={promptDialog?.message ?? ''}
        onConfirm={() => setPromptDialog(null)}
        title={promptDialog?.title ?? ''}
        variant={promptDialog?.variant ?? 'success'}
        visible={promptDialog !== null}
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: 0,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerButtonPressed: {
      backgroundColor: colors.surface,
    },
    headerButtonDisabled: {
      opacity: 0.55,
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
