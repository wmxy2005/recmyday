import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Pressable as GesturePressable,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { AnimatedSheetModal } from '@/components/AnimatedSheetModal';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import {
  type DayRecord,
  type RecordType,
  deleteRecordById,
  getDayRecordsByDayKey,
  getRecordTypes,
  insertManualRecord,
  updateManualRecordById,
} from '@/data/database';
import { readRecordSettings } from '@/hooks/useRecordSettings';
import { radius, spacing, useAppTheme } from '@/theme';
import {
  formatDayLabel,
  formatDetailedDuration,
  formatDuration,
  formatWeekdayLabel,
  type RecordUnit,
} from '@/utils/date';
import { getRecordMinutesColor } from '@/utils/recordColor';
import {
  formatRecordDateTime,
  formatRecordRange,
  getRecordStartEndMinutes,
} from '@/utils/recordFormat';
import { getRecordIconName, getRecordTypeIconName } from '@/utils/recordTypeIcon';
import { getDayRecordTypeName, getRecordTypeName } from '@/utils/recordTypeName';

const deleteActionWidth = 82;
const editorRecordTypeGridBaseColumns = 3;
const editorRecordTypeGridBreakpoints = [
  { minWidth: 1024, columns: 10 },
  { minWidth: 768, columns: 8 },
  { minWidth: 600, columns: 6 },
  { minWidth: 360, columns: 4 },
] as const;

type EditorTimeSection = 'start' | 'end';
type EditorExpandedSection = EditorTimeSection | 'type';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type DayRecordsPanelProps = {
  visible: boolean;
  dayKey: string | null;
  onClose: () => void;
  onExitComplete?: () => void;
  onRecordsChanged?: () => void;
  recordTypeIds?: string[] | null;
};

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

function getEditorRecordTypeGridColumns(width: number) {
  return (
    editorRecordTypeGridBreakpoints.find((breakpoint) => width >= breakpoint.minWidth)
      ?.columns ?? editorRecordTypeGridBaseColumns
  );
}

export function DayRecordsPanel({
  visible,
  dayKey,
  onClose,
  onExitComplete,
  onRecordsChanged,
  recordTypeIds = null,
}: DayRecordsPanelProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { colors } = theme;
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useSQLiteContext();

  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);
  const [recordUnit, setRecordUnit] = useState<RecordUnit>('minutes');
  const [separateRecordEnabled, setSeparateRecordEnabled] = useState(false);
  const [startTimeMinutes, setStartTimeMinutes] = useState(0);
  const [defaultRecordTypeId, setDefaultRecordTypeId] = useState('work');
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [recordEditorVisible, setRecordEditorVisible] = useState(false);
  const [editorTypeGridWidth, setEditorTypeGridWidth] = useState(0);
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<number | null>(null);
  const [promptDialog, setPromptDialog] = useState<{ message: string; title: string } | null>(
    null,
  );
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('09:30');
  const [draftRecordTypeId, setDraftRecordTypeId] = useState('work');
  const [expandedEditorSection, setExpandedEditorSection] =
    useState<EditorExpandedSection | null>(null);

  const editorTypeGridColumns = getEditorRecordTypeGridColumns(windowWidth);
  const estimatedEditorTypeGridWidth = Math.max(
    0,
    windowWidth - spacing.lg * 2 - spacing.md * 2 - 2,
  );
  const editorTypeGridContentWidth = Math.max(
    0,
    (editorTypeGridWidth || estimatedEditorTypeGridWidth) - spacing.md * 2,
  );
  const editorTypeCardWidth =
    editorTypeGridContentWidth > 0
      ? Math.floor(
          (editorTypeGridContentWidth - spacing.sm * (editorTypeGridColumns - 1)) /
            editorTypeGridColumns,
        )
      : undefined;

  const loadDayRecords = useCallback(async () => {
    if (!dayKey) {
      setDayRecords([]);
      return;
    }

    const records = await getDayRecordsByDayKey(db, dayKey);
    setDayRecords(records);
  }, [db, dayKey]);

  const loadSettings = useCallback(async () => {
    const [settings, nextRecordTypes] = await Promise.all([
      readRecordSettings(db),
      getRecordTypes(db),
    ]);

    setRecordUnit(settings.recordUnit);
    setSeparateRecordEnabled(settings.separateRecordEnabled);
    setStartTimeMinutes(settings.startTimeMinutes);
    setDefaultRecordTypeId(settings.defaultRecordTypeId);
    setRecordTypes(nextRecordTypes);
  }, [db]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (visible && dayKey) {
      loadDayRecords();
    }
  }, [visible, dayKey, loadDayRecords]);

  const displayRecords = useMemo(() => {
    let records = dayRecords;

    if (recordTypeIds && recordTypeIds.length > 0) {
      const selectedIds = new Set(recordTypeIds);
      records = records.filter((record) => selectedIds.has(record.record_type_id));
    }

    return [...records].sort((left, right) => {
      const leftRange = getRecordStartEndMinutes(left);
      const rightRange = getRecordStartEndMinutes(right);

      return (
        rightRange.endMinutes - leftRange.endMinutes ||
        rightRange.startMinutes - leftRange.startMinutes
      );
    });
  }, [dayRecords, recordTypeIds]);

  const displayDayTotal = displayRecords.reduce(
    (sum, record) => sum + record.minutes_since_start,
    0,
  );
  const canCreateRecord =
    dayKey !== null && (!separateRecordEnabled || dayRecords.length === 0);
  const dayRecordsListMaxHeight = Math.max(120, Math.round(windowHeight * 0.72 - 196));
  const recordEditorFormMaxHeight = Math.max(200, Math.round(windowHeight * 0.9 - 218));
  const draftRecordType = recordTypes.find((recordType) => recordType.id === draftRecordTypeId);

  const refreshAfterChange = useCallback(async () => {
    await loadDayRecords();
    onRecordsChanged?.();
  }, [loadDayRecords, onRecordsChanged]);

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
    await refreshAfterChange();
  };

  const handleOpenCreateRecord = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    setEditingRecordId(null);
    setDraftStartTime(formatTimeInput(startTimeMinutes));
    setDraftEndTime(formatTimeInput(currentMinutes));
    setDraftRecordTypeId(defaultRecordTypeId);
    setExpandedEditorSection(null);
    setRecordEditorVisible(true);
  };

  const handleOpenEditRecord = (record: DayRecord) => {
    const { endMinutes, startMinutes } = getRecordStartEndMinutes(record);
    setEditingRecordId(record.id);
    setDraftStartTime(formatTimeInput(startMinutes));
    setDraftEndTime(formatTimeInput(endMinutes));
    setDraftRecordTypeId(record.record_type_id);
    setExpandedEditorSection(null);
    setRecordEditorVisible(true);
  };

  const handleCloseRecordEditor = () => {
    setRecordEditorVisible(false);
  };

  const handleDayRecordsExitComplete = useCallback(() => {
    if (recordEditorVisible) {
      return;
    }

    onExitComplete?.();
  }, [recordEditorVisible, onExitComplete]);

  const handleRecordEditorExitComplete = useCallback(() => {
    setEditingRecordId(null);
    setExpandedEditorSection(null);
  }, []);

  const handleEditorTypeGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;

    setEditorTypeGridWidth((current) =>
      Math.abs(current - nextWidth) < 1 ? current : nextWidth,
    );
  };

  const handleSaveRecordEditor = async () => {
    if (!dayKey) {
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
      await insertManualRecord(db, dayKey, startMinutes, endMinutes, draftRecordTypeId);
    } else {
      await updateManualRecordById(
        db,
        editingRecordId,
        dayKey,
        startMinutes,
        endMinutes,
        draftRecordTypeId,
      );
    }

    setRecordEditorVisible(false);
    await refreshAfterChange();
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
    const isExpanded = expandedEditorSection === section;
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
          onPress={() => setExpandedEditorSection(isExpanded ? null : section)}
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
    <>
      <AnimatedSheetModal
        backdropStyle={styles.modalBackdrop}
        onClose={onClose}
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
        visible={visible && dayKey !== null}
      >
        <View style={styles.sheetGrabber} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleGroup}>
            <View style={styles.editorTitleLine}>
              <Text style={styles.sheetTitle}>
                {dayKey ? formatDayLabel(dayKey) : t('stats.noSelectedDay')}
              </Text>
              {dayKey ? (
                <Text style={styles.weekdayPill}>{formatWeekdayLabel(dayKey)}</Text>
              ) : null}
            </View>
            <Text style={styles.sheetSubtitle}>
              {t('stats.dayTotal', {
                count: displayRecords.length,
                value: formatDuration(displayDayTotal, recordUnit),
              })}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel={t('stats.closeRecords')}
            accessibilityRole="button"
            onPress={onClose}
            pressedScale={0.9}
            style={styles.sheetCloseButton}
          >
            <Ionicons color={colors.textSoft} name="close" size={24} />
          </AnimatedPressable>
        </View>

        <GestureScrollView
          contentContainerStyle={styles.sheetList}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.sheetScroll, { maxHeight: dayRecordsListMaxHeight }]}
        >
          {displayRecords.length > 0 ? (
            displayRecords.map((record) => (
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
        </GestureScrollView>
        {canCreateRecord ? (
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
              {dayKey ? formatDayLabel(dayKey) : t('stats.noSelectedDay')}
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

        <ScrollView
          contentContainerStyle={styles.editorForm}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.editorFormScroll, { maxHeight: recordEditorFormMaxHeight }]}
        >
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
          <View style={styles.editorTypeSection}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() =>
                setExpandedEditorSection((current) => (current === 'type' ? null : 'type'))
              }
              pressedScale={0.985}
              style={styles.editorTypeHeader}
            >
              <View style={[styles.editorInputIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons
                  color={colors.primary}
                  name={
                    draftRecordType ? getRecordTypeIconName(draftRecordType) : 'bookmark-outline'
                  }
                  size={22}
                />
              </View>
              <Text
                style={[
                  styles.editorInputLabel,
                  expandedEditorSection === 'type' && { color: colors.primary },
                ]}
              >
                {t('stats.recordType')}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.editorTypeValue,
                  expandedEditorSection === 'type' && { color: colors.primary },
                ]}
              >
                {draftRecordType
                  ? getRecordTypeName(draftRecordType, t)
                  : t('stats.allRecordTypes')}
              </Text>
              <Ionicons
                color={expandedEditorSection === 'type' ? colors.primary : colors.mutedSubtle}
                name={expandedEditorSection === 'type' ? 'chevron-up' : 'chevron-forward'}
                size={21}
              />
            </AnimatedPressable>
            {expandedEditorSection === 'type' ? (
              <View onLayout={handleEditorTypeGridLayout} style={styles.editorTypeCardGrid}>
                {recordTypes.map((recordType) => {
                  const isActive = draftRecordTypeId === recordType.id;

                  return (
                    <AnimatedPressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isActive }}
                      key={recordType.id}
                      onPress={() => setDraftRecordTypeId(recordType.id)}
                      pressedScale={0.985}
                      style={[
                        styles.editorTypeCard,
                        editorTypeCardWidth !== undefined && { width: editorTypeCardWidth },
                        isActive && styles.editorTypeCardActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.editorTypeCardIcon,
                          isActive && styles.editorTypeCardIconActive,
                        ]}
                      >
                        <Ionicons
                          color={isActive ? colors.surface : colors.textSoft}
                          name={getRecordTypeIconName(recordType)}
                          size={22}
                        />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.editorTypeCardText,
                          isActive && styles.editorTypeCardTextActive,
                        ]}
                      >
                        {getRecordTypeName(recordType, t)}
                      </Text>
                      <View style={[styles.editorTypeCardCheck, isActive && styles.radioActive]}>
                        {isActive ? (
                          <Ionicons color={colors.surface} name="checkmark" size={14} />
                        ) : null}
                      </View>
                    </AnimatedPressable>
                  );
                })}
              </View>
            ) : null}
          </View>
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
        </ScrollView>

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
    </>
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
  const renderDeleteAction = (
    _progress: unknown,
    _translation: unknown,
    swipeable: SwipeableMethods,
  ) => {
    if (deleteActionHidden) {
      return null;
    }

    return (
      <View style={styles.recordDeleteAction}>
        <GesturePressable
          accessibilityLabel={t('stats.deleteRecord')}
          accessibilityRole="button"
          cancelable={false}
          onPress={() => {
            swipeable.reset();
            onDelete(record.id);
          }}
          style={({ pressed }) => [
            styles.recordDeleteActionButton,
            pressed && styles.recordDeleteActionButtonPressed,
          ]}
        >
          <Ionicons color={colors.surface} name="trash-outline" size={21} />
          <Text style={styles.recordDeleteText}>{t('stats.delete')}</Text>
        </GesturePressable>
      </View>
    );
  };

  const recordIconName = getRecordIconName(record);
  const recordTypeName = getDayRecordTypeName(record, t);

  const renderRecordContent = () => (
    <>
      <View
        style={[
          styles.recordPopupType,
          { backgroundColor: getRecordMinutesColor(record.minutes_since_start) },
        ]}
      >
        <Ionicons color={colors.surface} name={recordIconName} size={22} />
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.recordPopupTypeText}>
          {recordTypeName}
        </Text>
      </View>
      <View style={styles.recordPopupCopy}>
        <Text style={styles.recordPopupTime}>{formatRecordRange(record, startTimeMinutes)}</Text>
        <View style={styles.recordPopupMetaRow}>
          <Text style={styles.recordPopupMeta}>
            {t('stats.updatedAt', {
              time: formatRecordDateTime(record.updated_at, t('stats.noData')),
            })}
          </Text>
        </View>
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
      <ReanimatedSwipeable
        containerStyle={[
          styles.swipeRecordShell,
          deleteActionHidden && styles.swipeRecordShellHidden,
        ]}
        dragOffsetFromLeftEdge={10}
        dragOffsetFromRightEdge={10}
        enabled={!deleteActionHidden}
        friction={1.15}
        overshootRight={false}
        renderRightActions={renderDeleteAction}
        rightThreshold={deleteActionWidth / 2}
      >
        <View style={styles.recordPopupRow}>{renderRecordContent()}</View>
      </ReanimatedSwipeable>
    </View>
  );
}

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors } = theme;

  return StyleSheet.create({
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
    sheetScroll: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 0,
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
      minHeight: 66,
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
      width: deleteActionWidth,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordDeleteActionButton: {
      width: 54,
      height: 54,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: colors.danger,
    },
    recordDeleteActionButtonPressed: {
      opacity: 0.86,
      transform: [{ translateX: -2 }, { scale: 0.94 }],
    },
    recordDeleteText: {
      color: colors.surface,
      fontSize: 12,
      fontWeight: '900',
    },
    recordPopupRow: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg - 1,
      backgroundColor: colors.surfaceElevated,
    },
    recordPopupType: {
      width: 50,
      minHeight: 48,
      paddingHorizontal: 5,
      paddingVertical: 6,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      flexShrink: 0,
    },
    recordPopupTypeText: {
      width: '100%',
      color: colors.surface,
      fontSize: 11,
      fontWeight: '900',
      lineHeight: 14,
      textAlign: 'center',
    },
    recordPopupCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    recordPopupMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    recordPopupTime: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    recordPopupMeta: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    recordPopupValue: {
      fontSize: 15,
      fontWeight: '900',
      flexShrink: 0,
    },
    recordEditButton: {
      width: 26,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -6,
    },
    createRecordButton: {
      height: 50,
      borderRadius: 18,
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
      fontSize: 16,
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
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg + spacing.sm,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
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
      marginBottom: spacing.md,
    },
    editorFormScroll: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 0,
    },
    editorForm: {
      gap: spacing.sm,
    },
    editorInputRow: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editorTypeSection: {
      overflow: 'hidden',
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editorTypeHeader: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    editorTypeValue: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 16,
      fontWeight: '900',
      textAlign: 'right',
    },
    editorTypeCardGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    editorTypeCard: {
      minHeight: 62,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editorTypeCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      shadowColor: colors.primaryDark,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 5,
    },
    editorTypeCardIcon: {
      width: 24,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editorTypeCardIconActive: {
      opacity: 1,
    },
    editorTypeCardText: {
      maxWidth: '100%',
      color: colors.textSoft,
      fontSize: 12,
      fontWeight: '900',
    },
    editorTypeCardTextActive: {
      color: colors.surface,
    },
    editorTypeCardCheck: {
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
    radioActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    editorTimeCard: {
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    editorTimeRow: {
      minHeight: 58,
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
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editorInputLabel: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    editorTimeValue: {
      color: colors.text,
      fontSize: 16,
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
      minHeight: 154,
      borderWidth: 0,
    },
    editorDurationValue: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900',
      flexShrink: 0,
    },
    editorSheetActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    cancelRecordButtonContainer: {
      flex: 1,
    },
    cancelRecordButton: {
      height: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelRecordText: {
      color: colors.textSoft,
      fontSize: 15,
      fontWeight: '900',
    },
    saveRecordButtonContainer: {
      flex: 1.5,
    },
    saveRecordButton: {
      height: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    saveRecordText: {
      color: colors.surface,
      fontSize: 15,
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
    editorTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
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
  });
};
