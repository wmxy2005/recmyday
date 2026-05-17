import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const sheetFallbackHeight = 360;
const modalGestureRootStyle = StyleSheet.create({
  root: {
    flex: 1,
  },
});

type AnimatedSheetModalProps = {
  backdropStyle: StyleProp<ViewStyle>;
  children: ReactNode;
  dimBackdrop?: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  overlay?: ReactNode;
  sheetStyle: StyleProp<ViewStyle>;
  visible: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSheetAnimationMetrics(height: number) {
  const measuredHeight = Math.max(height, sheetFallbackHeight);

  return {
    backdropEnterDuration: clamp(Math.round(150 + measuredHeight * 0.1), 190, 270),
    backdropExitDuration: clamp(Math.round(120 + measuredHeight * 0.07), 150, 220),
    enterDuration: clamp(Math.round(190 + measuredHeight * 0.2), 260, 430),
    exitDuration: clamp(Math.round(220 + measuredHeight * 0.18), 300, 460),
    enterTravel: clamp(Math.round(measuredHeight * 0.18), 64, 128),
    exitTravel: measuredHeight + 48,
  };
}

export function AnimatedSheetModal({
  backdropStyle,
  children,
  dimBackdrop = true,
  onClose,
  onExitComplete,
  overlay,
  sheetStyle,
  visible,
}: AnimatedSheetModalProps) {
  const [isMounted, setIsMounted] = useState(visible);
  const backdropProgress = useSharedValue(visible ? 1 : 0);
  const onExitCompleteRef = useRef(onExitComplete);
  const sheetHeightRef = useRef(sheetFallbackHeight);
  const sheetProgress = useSharedValue(visible ? 1 : 0);
  const [sheetTravel, setSheetTravel] = useState(() => {
    const metrics = getSheetAnimationMetrics(sheetFallbackHeight);

    return {
      enter: metrics.enterTravel,
      exit: metrics.exitTravel,
    };
  });

  useEffect(() => {
    onExitCompleteRef.current = onExitComplete;
  }, [onExitComplete]);

  const handleExitFinished = useCallback(() => {
    setIsMounted(false);
    onExitCompleteRef.current?.();
  }, []);

  useEffect(() => {
    cancelAnimation(backdropProgress);
    cancelAnimation(sheetProgress);

    if (visible) {
      setIsMounted(true);
      const metrics = getSheetAnimationMetrics(sheetHeightRef.current);
      backdropProgress.value = withTiming(1, {
        duration: metrics.backdropEnterDuration,
        easing: Easing.out(Easing.cubic),
      });
      sheetProgress.value = withTiming(1, {
        duration: metrics.enterDuration,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      return;
    }

    if (!isMounted) {
      return;
    }

    const metrics = getSheetAnimationMetrics(sheetHeightRef.current);
    backdropProgress.value = withTiming(0, {
      duration: metrics.backdropExitDuration,
      easing: Easing.in(Easing.cubic),
    });
    sheetProgress.value = withTiming(
      0,
      {
        duration: metrics.exitDuration,
        easing: Easing.bezier(0.32, 0, 0.67, 0),
      },
      (finished) => {
        if (finished) {
          runOnJS(handleExitFinished)();
        }
      },
    );
  }, [backdropProgress, handleExitFinished, isMounted, sheetProgress, visible]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropProgress.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.9 + sheetProgress.value * 0.1,
    transform: [
      {
        translateY: (visible ? sheetTravel.enter : sheetTravel.exit) * (1 - sheetProgress.value),
      },
      {
        scale: 0.985 + sheetProgress.value * 0.015,
      },
    ],
  }));

  if (!isMounted) {
    return null;
  }

  const handleSheetLayout = (height: number) => {
    if (Math.abs(sheetHeightRef.current - height) < 1) {
      return;
    }

    sheetHeightRef.current = height;
    const metrics = getSheetAnimationMetrics(height);
    setSheetTravel({
      enter: metrics.enterTravel,
      exit: metrics.exitTravel,
    });
  };

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible>
      <GestureHandlerRootView style={modalGestureRootStyle.root}>
        {dimBackdrop ? (
          <Animated.View style={[backdropStyle, backdropAnimatedStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        )}
        <Animated.View
          onLayout={({ nativeEvent }) => handleSheetLayout(nativeEvent.layout.height)}
          style={[sheetStyle, sheetAnimatedStyle]}
        >
          {children}
        </Animated.View>
        {overlay}
      </GestureHandlerRootView>
    </Modal>
  );
}
