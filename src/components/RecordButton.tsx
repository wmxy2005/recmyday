import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { spacing, useAppTheme } from '@/theme';

const cancelLongPressDurationMs = 800;

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
  recordingUnitLabel = 'min',
  secondsUnitLabel = 'sec',
  onPress,
  onCancelRecording,
  pointerEvents,
  tone = 'primary',
}: RecordButtonProps) {
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTriggeredRef = useRef(false);
  const cancelProgress = useSharedValue(0);
  const canCancelRecording = Boolean(recordingStartedAt && onCancelRecording);

  const cancelProgressStyle = useAnimatedStyle(() => ({
    width: `${cancelProgress.value * 100}%`,
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const clearCancelProgress = useCallback(() => {
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }

    cancelAnimation(cancelProgress);
    cancelProgress.value = 0;
  }, [cancelProgress]);

  useEffect(() => {
    return clearCancelProgress;
  }, [clearCancelProgress]);

  useEffect(() => {
    if (!recordingStartedAt) {
      cancelTriggeredRef.current = false;
      clearCancelProgress();
    }
  }, [clearCancelProgress, recordingStartedAt]);

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
    cancelAnimation(cancelProgress);
    cancelProgress.value = 0;
    cancelProgress.value = withTiming(1, {
      duration: cancelLongPressDurationMs,
      easing: Easing.linear,
    });
    cancelTimerRef.current = setTimeout(() => {
      cancelTriggeredRef.current = true;
      clearCancelProgress();
      onCancelRecording?.();
    }, cancelLongPressDurationMs);
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
      <AnimatedPressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        pressedScale={0.96}
        pressedTranslateY={1}
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
          <Animated.View
            pointerEvents="none"
            style={[styles.cancelProgressFill, cancelProgressStyle]}
          />
        ) : null}
        <View style={styles.iconBadge}>
          <Ionicons
            color={colors.surface}
            name={iconName ?? (hasRecord ? 'refresh' : 'add')}
            size={34}
          />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.label}>{label ?? (hasRecord ? 'Update' : 'Record')}</Text>
          <Text style={styles.time}>
            {elapsedMinutes === null || remainingSeconds === null
              ? currentTime
              : `${elapsedMinutes} ${recordingUnitLabel} ${remainingSeconds} ${secondsUnitLabel}`}
          </Text>
        </View>
      </AnimatedPressable>
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
      backgroundColor: colors.highlight,
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
      backgroundColor: colors.info,
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
  });
};
