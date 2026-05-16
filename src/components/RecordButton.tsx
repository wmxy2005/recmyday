import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { spacing, useAppTheme } from '@/theme';

type RecordButtonProps = {
  animatedStyle: AnimatedStyle<ViewStyle>;
  disabled: boolean;
  hasRecord: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  isRecording: boolean;
  label?: string;
  recordingStartedAt?: Date | null;
  recordingUnitLabel?: string;
  secondsUnitLabel?: string;
  onPress: () => void;
  onCancelRecording?: () => void;
  pointerEvents: 'auto' | 'none';
  tone?: 'primary' | 'danger' | 'success';
};

function RecordButtonComponent({
  animatedStyle,
  disabled,
  hasRecord,
  iconName,
  isRecording,
  label,
  recordingStartedAt,
  recordingUnitLabel = '分钟',
  secondsUnitLabel = '秒',
  onPress,
  onCancelRecording,
  pointerEvents,
  tone = 'primary',
}: RecordButtonProps) {
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = makeStyles(theme);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [cancelProgress, setCancelProgress] = useState(0);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelStartedAtRef = useRef(0);
  const cancelTriggeredRef = useRef(false);
  const canCancelRecording = Boolean(recordingStartedAt && onCancelRecording);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const clearCancelProgress = () => {
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }

    if (cancelProgressTimerRef.current) {
      clearInterval(cancelProgressTimerRef.current);
      cancelProgressTimerRef.current = null;
    }

    cancelStartedAtRef.current = 0;
    setCancelProgress(0);
  };

  useEffect(() => {
    return clearCancelProgress;
  }, []);

  useEffect(() => {
    if (!recordingStartedAt) {
      cancelTriggeredRef.current = false;
      clearCancelProgress();
    }
  }, [recordingStartedAt]);

  const currentTime = currentDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const elapsedSeconds = recordingStartedAt
    ? Math.max(0, Math.floor((currentDate.getTime() - recordingStartedAt.getTime()) / 1000))
    : null;
  const elapsedMinutes = elapsedSeconds === null ? null : Math.floor(elapsedSeconds / 60);
  const remainingSeconds = elapsedSeconds === null ? null : elapsedSeconds % 60;
  const handlePressIn = () => {
    if (!canCancelRecording) {
      return;
    }

    cancelTriggeredRef.current = false;
    cancelStartedAtRef.current = Date.now();
    setCancelProgress(0);
    cancelProgressTimerRef.current = setInterval(() => {
      const nextProgress = Math.min(1, (Date.now() - cancelStartedAtRef.current) / 2000);
      setCancelProgress(nextProgress);
    }, 16);
    cancelTimerRef.current = setTimeout(() => {
      cancelTriggeredRef.current = true;
      clearCancelProgress();
      onCancelRecording?.();
    }, 2000);
  };

  const handlePressOut = () => {
    if (!canCancelRecording) {
      return;
    }

    if (!cancelTriggeredRef.current) {
      clearCancelProgress();
    }
  };

  const handlePress = () => {
    if (cancelTriggeredRef.current) {
      cancelTriggeredRef.current = false;
      return;
    }

    onPress();
  };

  return (
    <Animated.View pointerEvents={pointerEvents} style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          tone === 'danger' && styles.danger,
          tone === 'success' && styles.success,
          hasRecord && styles.recorded,
          pressed && !isRecording && !hasRecord && styles.pressed,
          isRecording && styles.disabled,
        ]}
      >
        {canCancelRecording ? (
          <View
            pointerEvents="none"
            style={[styles.cancelProgressFill, { width: `${cancelProgress * 100}%` }]}
          />
        ) : null}
        <View style={styles.sparkRing}>
          <View style={[styles.spark, styles.sparkTop]} />
          <View style={[styles.spark, styles.sparkRight]} />
          <View style={[styles.spark, styles.sparkLeft]} />
        </View>
        <View style={styles.iconBadge}>
          <Ionicons
            color={colors.surface}
            name={iconName ?? (hasRecord ? 'refresh' : 'add')}
            size={34}
          />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.label}>{label ?? (hasRecord ? '更新' : '记录')}</Text>
          <Text style={styles.time}>
            {elapsedMinutes === null || remainingSeconds === null
              ? currentTime
              : `${elapsedMinutes} ${recordingUnitLabel} ${remainingSeconds} ${secondsUnitLabel}`}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const RecordButton = memo(RecordButtonComponent);

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors, shadow } = theme;

  return StyleSheet.create({
  button: {
    minWidth: 148,
    height: 76,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    borderRadius: 38,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow,
    overflow: 'hidden',
  },
  cancelProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#0D7DFF',
    opacity: 0.76,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  recorded: {
    backgroundColor: colors.primaryDark,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  success: {
    backgroundColor: '#22B66E',
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 1,
  },
  textGroup: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  time: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  disabled: {
    opacity: 0.7,
  },
  sparkRing: {
    position: 'absolute',
    left: -11,
    top: -15,
    width: 92,
    height: 92,
    pointerEvents: 'none',
    zIndex: 1,
  },
  spark: {
    position: 'absolute',
    width: 4,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sparkTop: {
    left: 45,
    top: 0,
    transform: [{ rotate: '8deg' }],
  },
  sparkRight: {
    right: 5,
    top: 34,
    backgroundColor: colors.info,
    transform: [{ rotate: '48deg' }],
  },
  sparkLeft: {
    left: 7,
    bottom: 19,
    backgroundColor: colors.danger,
    transform: [{ rotate: '-35deg' }],
  },
  });
};
