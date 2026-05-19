import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { radius, spacing } from '@/theme';

const wheelItemHeight = 40;
const wheelVisibleItems = 5;

const hourOptions = Array.from({ length: 24 }, (_, index) => pad2(index));
const minuteOptions = Array.from({ length: 60 }, (_, index) => pad2(index));

type TimeWheelPickerProps = {
  accentColor: string;
  highlightBackgroundColor?: string;
  highlightBorderColor?: string;
  onChangeMinutes: (minutes: number) => void;
  style?: StyleProp<ViewStyle>;
  valueMinutes: number;
};

type WheelPickerProps = {
  accentColor: string;
  highlightBackgroundColor: string;
  highlightBorderColor: string;
  onChange: (value: string) => void;
  value: string;
  values: string[];
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
}

const WheelPicker = memo(function WheelPicker({
  accentColor,
  highlightBackgroundColor,
  highlightBorderColor,
  onChange,
  value,
  values,
}: WheelPickerProps) {
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
    <View style={styles.wheelPicker}>
      <View
        pointerEvents="none"
        style={[
          styles.wheelHighlight,
          {
            backgroundColor: highlightBackgroundColor,
            borderColor: highlightBorderColor,
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        bounces={false}
        contentContainerStyle={{ paddingVertical: verticalPadding }}
        decelerationRate={Platform.OS === 'ios' ? 0.96 : 0.985}
        nestedScrollEnabled
        onMomentumScrollBegin={() => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
          }
        }}
        onMomentumScrollEnd={handleScrollEnd}
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
        style={styles.wheelScroll}
      >
        {values.map((item) => {
          const isSelected = item === value;

          return (
            <View key={item} style={styles.wheelItem}>
              <Text
                style={[
                  styles.wheelItemText,
                  isSelected && { color: accentColor, fontSize: 27, opacity: 1 },
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
});

export function TimeWheelPicker({
  accentColor,
  highlightBackgroundColor = '#FFF7E9',
  highlightBorderColor = '#FFDCA8',
  onChangeMinutes,
  style,
  valueMinutes,
}: TimeWheelPickerProps) {
  const normalizedMinutes = normalizeMinutes(valueMinutes);
  const hour = pad2(Math.floor(normalizedMinutes / 60));
  const minute = pad2(normalizedMinutes % 60);

  const handleChange = useCallback(
    (part: 'hour' | 'minute', value: string) => {
      const nextHour = part === 'hour' ? Number(value) : Math.floor(normalizedMinutes / 60);
      const nextMinute = part === 'minute' ? Number(value) : normalizedMinutes % 60;

      onChangeMinutes(nextHour * 60 + nextMinute);
    },
    [normalizedMinutes, onChangeMinutes],
  );

  const highlightColors = useMemo(
    () => ({
      backgroundColor: highlightBackgroundColor,
      borderColor: highlightBorderColor,
    }),
    [highlightBackgroundColor, highlightBorderColor],
  );

  return (
    <View style={[styles.timePickerPanel, style]}>
      <WheelPicker
        accentColor={accentColor}
        highlightBackgroundColor={highlightColors.backgroundColor}
        highlightBorderColor={highlightColors.borderColor}
        onChange={(nextHour) => handleChange('hour', nextHour)}
        value={hour}
        values={hourOptions}
      />

      <Text style={[styles.wheelSeparator, { color: accentColor }]}>:</Text>

      <WheelPicker
        accentColor={accentColor}
        highlightBackgroundColor={highlightColors.backgroundColor}
        highlightBorderColor={highlightColors.borderColor}
        onChange={(nextMinute) => handleChange('minute', nextMinute)}
        value={minute}
        values={minuteOptions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timePickerPanel: {
    minHeight: 164,
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
  wheelPicker: {
    width: 96,
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
    borderWidth: 1,
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
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 32,
    opacity: 0.76,
    textAlign: 'center',
  },
  wheelSeparator: {
    fontSize: 26,
    fontWeight: '900',
    marginHorizontal: spacing.sm,
  },
});
