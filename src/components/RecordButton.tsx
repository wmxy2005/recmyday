import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  type AnimatedStyle,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spacing, useAppTheme } from '@/theme';

const cancelArmDelayMs = 500;
const pillEnterDurationMs = 180;
const pillExitDurationMs = 160;
const pillTravel = 20;
const pillHoverDurationMs = 130;
const pillHoverPadding = 12;

type PillRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const emptyPillRect: PillRect = { left: 0, top: 0, right: 0, bottom: 0 };

type RecordButtonProps = {
  animatedStyle: AnimatedStyle<ViewStyle>;
  backgroundColor?: string;
  cancelLabel?: string;
  disabled: boolean;
  hasRecord: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconLabel?: string;
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
  backgroundColor,
  cancelLabel = 'Cancel',
  disabled,
  hasRecord,
  iconName,
  iconLabel,
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
  const canCancelRecording = Boolean(recordingStartedAt && onCancelRecording);

  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillViewRef = useRef<View>(null);
  const onPressRef = useRef(onPress);
  const onCancelRef = useRef(onCancelRecording);

  const pressScale = useSharedValue(1);
  const pressTranslateY = useSharedValue(0);
  const pillProgress = useSharedValue(0);
  const hoverBool = useSharedValue(0);
  const hoverProgress = useSharedValue(0);
  const armedShared = useSharedValue(0);
  const disabledShared = useSharedValue(disabled ? 1 : 0);
  const canCancelShared = useSharedValue(canCancelRecording ? 1 : 0);
  const pillRectShared = useSharedValue<PillRect>(emptyPillRect);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    onCancelRef.current = onCancelRecording;
  }, [onCancelRecording]);

  useEffect(() => {
    disabledShared.value = disabled ? 1 : 0;
  }, [disabled, disabledShared]);

  useEffect(() => {
    canCancelShared.value = canCancelRecording ? 1 : 0;
  }, [canCancelRecording, canCancelShared]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  const measurePill = useCallback(() => {
    const node = pillViewRef.current;
    if (!node) {
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
        return;
      }
      pillRectShared.value = {
        left: x - pillHoverPadding,
        top: y - pillHoverPadding,
        right: x + width + pillHoverPadding,
        bottom: y + height + pillHoverPadding,
      };
    });
  }, [pillRectShared]);

  const showPill = useCallback(() => {
    measurePill();
    pillProgress.value = withTiming(1, {
      duration: pillEnterDurationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [measurePill, pillProgress]);

  const hidePill = useCallback(() => {
    pillProgress.value = withTiming(0, {
      duration: pillExitDurationMs,
      easing: Easing.in(Easing.cubic),
    });
  }, [pillProgress]);

  const armCancel = useCallback(() => {
    armedShared.value = 1;
    showPill();
  }, [armedShared, showPill]);

  const scheduleArm = useCallback(() => {
    clearArmTimer();
    armTimerRef.current = setTimeout(armCancel, cancelArmDelayMs);
  }, [armCancel, clearArmTimer]);

  const startPress = useCallback(() => {
    pressScale.value = withSpring(0.96, { damping: 16, stiffness: 420, mass: 0.35 });
    pressTranslateY.value = withSpring(1, { damping: 16, stiffness: 420, mass: 0.35 });
    if (canCancelShared.value === 1) {
      scheduleArm();
    }
  }, [canCancelShared, pressScale, pressTranslateY, scheduleArm]);

  const endPressVisuals = useCallback(() => {
    clearArmTimer();
    pressScale.value = withSpring(1, { damping: 16, stiffness: 420, mass: 0.35 });
    pressTranslateY.value = withSpring(0, { damping: 16, stiffness: 420, mass: 0.35 });
    hidePill();
  }, [clearArmTimer, hidePill, pressScale, pressTranslateY]);

  const firePress = useCallback(() => {
    onPressRef.current?.();
  }, []);

  const fireCancel = useCallback(() => {
    onCancelRef.current?.();
  }, []);

  useEffect(() => {
    if (!canCancelRecording) {
      armedShared.value = 0;
      hoverBool.value = 0;
      hoverProgress.value = 0;
      clearArmTimer();
      hidePill();
    }
  }, [armedShared, canCancelRecording, clearArmTimer, hidePill, hoverBool, hoverProgress]);

  useEffect(() => {
    return () => {
      clearArmTimer();
    };
  }, [clearArmTimer]);

  useAnimatedReaction(
    () => hoverBool.value,
    (current, previous) => {
      if (current === previous) {
        return;
      }
      hoverProgress.value = withTiming(current, {
        duration: pillHoverDurationMs,
        easing: Easing.out(Easing.cubic),
      });
    },
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((_event, state) => {
          if (disabledShared.value === 1) {
            state.fail();
            return;
          }
          state.activate();
          runOnJS(startPress)();
        })
        .onTouchesMove((event) => {
          if (armedShared.value !== 1 || event.allTouches.length === 0) {
            return;
          }
          const touch = event.allTouches[0];
          const rect = pillRectShared.value;
          const inside =
            touch.absoluteX >= rect.left &&
            touch.absoluteX <= rect.right &&
            touch.absoluteY >= rect.top &&
            touch.absoluteY <= rect.bottom;
          hoverBool.value = inside ? 1 : 0;
        })
        .onTouchesUp((_event, state) => {
          const wasArmed = armedShared.value === 1;
          const wasHovering = hoverBool.value === 1;

          if (wasArmed && wasHovering) {
            runOnJS(fireCancel)();
          } else if (!wasArmed) {
            runOnJS(firePress)();
          }

          armedShared.value = 0;
          hoverBool.value = 0;
          runOnJS(endPressVisuals)();
          state.end();
        })
        .onTouchesCancelled((_event, state) => {
          armedShared.value = 0;
          hoverBool.value = 0;
          runOnJS(endPressVisuals)();
          state.fail();
        }),
    [
      armedShared,
      disabledShared,
      endPressVisuals,
      fireCancel,
      firePress,
      hoverBool,
      pillRectShared,
      startPress,
    ],
  );

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

  const buttonPressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value },
      { translateY: pressTranslateY.value },
    ],
  }));

  const pillContainerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pillProgress.value,
    transform: [
      { translateY: (1 - pillProgress.value) * pillTravel },
      { scale: 1 + hoverProgress.value * 0.08 },
    ],
  }));

  const pillBackgroundAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      hoverProgress.value,
      [0, 1],
      [colors.surface, colors.danger],
    ),
  }));

  const pillHoverOverlayStyle = useAnimatedStyle(() => ({
    opacity: hoverProgress.value,
  }));

  return (
    <Animated.View pointerEvents={pointerEvents} style={animatedStyle}>
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[styles.cancelPillWrapper, pillContainerAnimatedStyle]}
        >
          <Animated.View
            ref={pillViewRef}
            onLayout={measurePill}
            style={[styles.cancelPill, pillBackgroundAnimatedStyle]}
          >
            <View style={styles.cancelPillRow}>
              <Ionicons color={colors.danger} name="close-circle" size={20} />
              <Text style={[styles.cancelPillLabel, { color: colors.danger }]}>
                {cancelLabel}
              </Text>
            </View>
            <Animated.View
              pointerEvents="none"
              style={[styles.cancelPillOverlay, pillHoverOverlayStyle]}
            >
              <Ionicons color={colors.surface} name="close-circle" size={20} />
              <Text style={[styles.cancelPillLabel, { color: colors.surface }]}>
                {cancelLabel}
              </Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityRole="button"
            style={[
              styles.button,
              tone === 'danger' && styles.danger,
              tone === 'success' && styles.success,
              hasRecord && styles.recorded,
              backgroundColor && {
                backgroundColor,
                shadowColor: backgroundColor,
              },
              isRecording && styles.disabled,
              buttonPressStyle,
            ]}
          >
            <View style={[styles.iconBadge, iconLabel && styles.iconBadgeWithLabel]}>
              <Ionicons
                color={colors.surface}
                name={iconName ?? (hasRecord ? 'refresh' : 'add')}
                size={32}
              />
              {iconLabel ? (
                <Text numberOfLines={1} style={styles.iconBadgeLabel}>
                  {iconLabel}
                </Text>
              ) : null}
            </View>
            <View style={styles.textGroup}>
              <Text style={styles.label}>{label ?? (hasRecord ? 'Update' : 'Record')}</Text>
              <Text style={styles.time}>
                {elapsedMinutes === null || remainingSeconds === null
                  ? currentTime
                  : `${elapsedMinutes} ${recordingUnitLabel} ${remainingSeconds} ${secondsUnitLabel}`}
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

export const RecordButton = memo(RecordButtonComponent);

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors, shadow } = theme;

  return StyleSheet.create({
    root: {
      position: 'relative',
    },
    button: {
      minWidth: 152,
      height: 64,
      paddingLeft: 0,
      paddingRight: spacing.lg,
      borderRadius: 32,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
      overflow: 'hidden',
    },
    cancelPillWrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: '100%',
      marginBottom: spacing.sm,
      alignItems: 'center',
    },
    cancelPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 1,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.danger,
      ...shadow,
    },
    cancelPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    cancelPillOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 1,
    },
    cancelPillLabel: {
      fontSize: 13,
      fontWeight: '900',
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
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      marginLeft: -4,
      zIndex: 1,
    },
    iconBadgeWithLabel: {
      gap: 2,
      paddingHorizontal: spacing.xs,
    },
    iconBadgeLabel: {
      color: colors.surface,
      maxWidth: 44,
      fontSize: 10,
      fontWeight: '900',
      lineHeight: 12,
      textAlign: 'center',
    },
    textGroup: {
      alignItems: 'flex-start',
      justifyContent: 'center',
      zIndex: 1,
    },
    label: {
      color: colors.surface,
      fontSize: 14,
      fontWeight: '900',
      lineHeight: 18,
    },
    time: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 10,
      fontWeight: '800',
      marginTop: 2,
    },
    disabled: {
      opacity: 0.7,
    },
  });
};
