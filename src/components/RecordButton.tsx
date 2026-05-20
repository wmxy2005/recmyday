import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
const cancelEnterDurationMs = 180;
const cancelExitDurationMs = 150;
const cancelTravel = 18;
const cancelHoverDurationMs = 130;
const cancelHitPadding = 14;

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
  containerStyle?: StyleProp<ViewStyle>;
  disabled: boolean;
  fullWidth?: boolean;
  hasRecord: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  isRecording: boolean;
  label?: string;
  dragCancelLabel?: string;
  holdCancelLabel?: string;
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
  containerStyle,
  disabled,
  fullWidth = false,
  hasRecord,
  iconName,
  isRecording,
  label,
  dragCancelLabel = 'Drag left to cancel',
  holdCancelLabel = 'Hold to cancel',
  recordingStartedAt,
  onPress,
  onCancelRecording,
  pointerEvents,
  tone = 'primary',
}: RecordButtonProps) {
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const canCancelRecording = Boolean(recordingStartedAt && onCancelRecording);
  const baseButtonColor =
    backgroundColor ??
    (tone === 'danger'
      ? colors.danger
      : tone === 'success'
        ? colors.info
        : hasRecord
          ? colors.primaryDark
          : colors.primary);
  const gradientColors = useMemo<[string, string, string]>(() => {
    if (tone === 'danger') {
      return [colors.danger, '#FF6A2E', colors.dangerDark];
    }

    if (tone === 'success') {
      return [baseButtonColor, '#35A7FF', colors.primary];
    }

    return [baseButtonColor, '#635BFF', '#7C3AED'];
  }, [baseButtonColor, colors.danger, colors.dangerDark, colors.primary, tone]);

  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTargetRef = useRef<View>(null);
  const onPressRef = useRef(onPress);
  const onCancelRef = useRef(onCancelRecording);

  const pressScale = useSharedValue(1);
  const pressTranslateY = useSharedValue(0);
  const cancelProgress = useSharedValue(0);
  const hoverBool = useSharedValue(0);
  const hoverProgress = useSharedValue(0);
  const armedShared = useSharedValue(0);
  const disabledShared = useSharedValue(disabled ? 1 : 0);
  const canCancelShared = useSharedValue(canCancelRecording ? 1 : 0);
  const cancelRectShared = useSharedValue<PillRect>(emptyPillRect);

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

  const measureCancelTarget = useCallback(() => {
    const node = cancelTargetRef.current;
    if (!node) {
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
        return;
      }
      cancelRectShared.value = {
        left: x - cancelHitPadding,
        top: y - cancelHitPadding,
        right: x + width + cancelHitPadding,
        bottom: y + height + cancelHitPadding,
      };
    });
  }, [cancelRectShared]);

  const showCancelTarget = useCallback(() => {
    measureCancelTarget();
    cancelProgress.value = withTiming(1, {
      duration: cancelEnterDurationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [cancelProgress, measureCancelTarget]);

  const hideCancelTarget = useCallback(() => {
    cancelProgress.value = withTiming(0, {
      duration: cancelExitDurationMs,
      easing: Easing.in(Easing.cubic),
    });
  }, [cancelProgress]);

  const armCancel = useCallback(() => {
    setIsCancelArmed(true);
    armedShared.value = 1;
    showCancelTarget();
  }, [armedShared, showCancelTarget]);

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
    setIsCancelArmed(false);
    pressScale.value = withSpring(1, { damping: 16, stiffness: 420, mass: 0.35 });
    pressTranslateY.value = withSpring(0, { damping: 16, stiffness: 420, mass: 0.35 });
    hideCancelTarget();
  }, [clearArmTimer, hideCancelTarget, pressScale, pressTranslateY]);

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
      setIsCancelArmed(false);
      clearArmTimer();
      hideCancelTarget();
    }
  }, [armedShared, canCancelRecording, clearArmTimer, hideCancelTarget, hoverBool, hoverProgress]);

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
        duration: cancelHoverDurationMs,
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
          const rect = cancelRectShared.value;
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
      cancelRectShared,
      disabledShared,
      endPressVisuals,
      fireCancel,
      firePress,
      hoverBool,
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
  const elapsedHours = elapsedSeconds === null ? null : Math.floor(elapsedSeconds / 3600);
  const elapsedClock =
    elapsedSeconds === null || elapsedHours === null
      ? null
      : [
          elapsedHours,
          Math.floor((elapsedSeconds % 3600) / 60),
          elapsedSeconds % 60,
        ]
          .map((part) => String(part).padStart(2, '0'))
          .join(':');

  const buttonPressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value },
      { translateY: pressTranslateY.value },
    ],
  }));

  const cancelTargetAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cancelProgress.value,
    transform: [
      { translateX: (1 - cancelProgress.value) * cancelTravel },
      { scale: 0.9 + cancelProgress.value * 0.1 + hoverProgress.value * 0.08 },
    ],
  }));

  const cancelBackgroundAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      hoverProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.92)', colors.danger],
    ),
    borderColor: interpolateColor(
      hoverProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.92)', colors.danger],
    ),
  }));

  const cancelIconDangerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - hoverProgress.value,
  }));

  const cancelIconSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: hoverProgress.value,
  }));

  const buttonContentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cancelProgress.value * 18 }],
  }));

  const buttonShadowAnimatedStyle = useAnimatedStyle(() => ({
    shadowColor: interpolateColor(
      cancelProgress.value,
      [0, 1],
      [baseButtonColor, colors.danger],
    ),
  }));

  const cancelOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cancelProgress.value,
    backgroundColor: interpolateColor(
      cancelProgress.value + hoverProgress.value * 0.25,
      [0, 1, 1.25],
      [baseButtonColor, colors.danger, colors.dangerDark],
    ),
  }));

  const visibleLabel = isCancelArmed ? dragCancelLabel : label ?? (hasRecord ? 'Update' : 'Record');
  const visibleTime = elapsedClock ?? currentTime;

  return (
    <Animated.View pointerEvents={pointerEvents} style={[animatedStyle, containerStyle]}>
      <View style={[styles.root, fullWidth && styles.rootFullWidth]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.cancelTargetWrapper, cancelTargetAnimatedStyle]}
        >
          <Animated.View
            accessibilityLabel={cancelLabel}
            ref={cancelTargetRef}
            onLayout={measureCancelTarget}
            style={[styles.cancelTarget, cancelBackgroundAnimatedStyle]}
          >
            <Animated.View style={cancelIconDangerAnimatedStyle}>
              <Ionicons color={colors.danger} name="close" size={28} />
            </Animated.View>
            <Animated.View style={[styles.cancelTargetIconOverlay, cancelIconSurfaceAnimatedStyle]}>
              <Ionicons color={colors.surface} name="close" size={28} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityRole="button"
            style={[
              styles.button,
              fullWidth && styles.buttonFullWidth,
              tone === 'danger' && styles.danger,
              tone === 'success' && styles.success,
              hasRecord && styles.recorded,
              backgroundColor && {
                backgroundColor,
                shadowColor: backgroundColor,
              },
              isRecording && styles.disabled,
              buttonShadowAnimatedStyle,
              buttonPressStyle,
            ]}
          >
            <LinearGradient
              colors={gradientColors}
              end={{ x: 0.05, y: 1 }}
              pointerEvents="none"
              start={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            />
            <Animated.View pointerEvents="none" style={[styles.cancelOverlay, cancelOverlayAnimatedStyle]} />
            <Animated.View style={[styles.buttonContent, buttonContentAnimatedStyle]}>
              {!isCancelArmed ? (
                <View style={styles.iconBadge}>
                  <Ionicons
                    color={colors.surface}
                    name={iconName ?? (hasRecord ? 'refresh' : 'add')}
                    size={20}
                  />
                </View>
              ) : null}
              <Text numberOfLines={1} style={styles.label}>
                {visibleLabel}
              </Text>
              <Text numberOfLines={1} style={[styles.time, elapsedClock && styles.recordingTime]}>
                {visibleTime}
              </Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        {recordingStartedAt ? (
          <Text style={styles.holdHint}>
            {isCancelArmed ? dragCancelLabel : holdCancelLabel}
          </Text>
        ) : null}
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
      alignItems: 'center',
    },
    rootFullWidth: {
      width: '100%',
    },
    button: {
      minWidth: 152,
      height: 50,
      paddingHorizontal: spacing.sm,
      borderRadius: 25,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
      overflow: 'hidden',
    },
    buttonGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    cancelOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    buttonFullWidth: {
      width: '100%',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      width: '100%',
      maxWidth: '100%',
      minHeight: 36,
      paddingHorizontal: spacing.lg,
    },
    cancelTargetWrapper: {
      position: 'absolute',
      left: 14,
      top: 5,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
    },
    cancelTarget: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      ...shadow,
    },
    cancelTargetIconOverlay: {
      position: 'absolute',
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
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      flexShrink: 0,
      zIndex: 1,
    },
    label: {
      flexShrink: 1,
      minWidth: 0,
      color: colors.surface,
      fontSize: 16,
      fontWeight: '900',
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 170,
    },
    time: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 14,
      fontWeight: '900',
      lineHeight: 18,
      textAlign: 'right',
      flexShrink: 0,
    },
    recordingTime: {
      color: colors.surface,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '900',
    },
    holdHint: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 16,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.7,
    },
  });
};
