import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { OverlayPortal } from '@/components/OverlayPortal';
import { radius, spacing, useAppTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type ConfirmationDialogVariant = 'danger' | 'primary' | 'success';

type ConfirmationDialogProps = {
  cancelLabel?: string;
  confirmLabel: string;
  contained?: boolean;
  iconName?: IoniconName;
  message: string;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  variant?: ConfirmationDialogVariant;
  visible: boolean;
};

type ConfirmationDialogContent = Omit<ConfirmationDialogProps, 'contained' | 'visible'> & {
  variant: ConfirmationDialogVariant;
};

export function ConfirmationDialog({
  cancelLabel,
  confirmLabel,
  contained = false,
  iconName,
  message,
  onCancel,
  onConfirm,
  title,
  variant = 'danger',
  visible,
}: ConfirmationDialogProps) {
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const currentContent: ConfirmationDialogContent = {
    cancelLabel,
    confirmLabel,
    iconName,
    message,
    onCancel,
    onConfirm,
    title,
    variant,
  };
  const lastVisibleContentRef = useRef(currentContent);

  if (visible) {
    lastVisibleContentRef.current = currentContent;
  }

  const displayContent = visible ? currentContent : lastVisibleContentRef.current;
  const {
    cancelLabel: displayCancelLabel,
    confirmLabel: displayConfirmLabel,
    iconName: displayIconName,
    message: displayMessage,
    onCancel: displayOnCancel,
    onConfirm: displayOnConfirm,
    title: displayTitle,
    variant: displayVariant,
  } = displayContent;
  const accentColor =
    displayVariant === 'danger'
      ? colors.danger
      : displayVariant === 'success'
        ? colors.info
        : colors.primary;
  const iconBackground =
    displayVariant === 'danger'
      ? colors.dangerSoft
      : displayVariant === 'success'
        ? colors.infoSoft
        : colors.primarySoft;
  const resolvedIconName =
    displayIconName ??
    (displayVariant === 'danger'
      ? 'trash-outline'
      : displayVariant === 'success'
        ? 'checkmark-circle-outline'
        : 'cloud-upload-outline');
  const [isMounted, setIsMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const handleDismiss = useCallback(() => {
    (displayOnCancel ?? displayOnConfirm)();
  }, [displayOnCancel, displayOnConfirm]);

  const handleExitFinished = useCallback(() => {
    setIsMounted(false);
  }, []);

  useEffect(() => {
    cancelAnimation(progress);

    if (visible) {
      setIsMounted(true);
      progress.value = withTiming(1, {
        duration: 170,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    if (!isMounted) {
      return;
    }

    progress.value = withTiming(
      0,
      {
        duration: 140,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(handleExitFinished)();
        }
      },
    );
  }, [handleExitFinished, isMounted, progress, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismiss();
      return true;
    });

    return () => subscription.remove();
  }, [handleDismiss, visible]);

  const rootAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: (1 - progress.value) * 8,
      },
      {
        scale: 0.97 + progress.value * 0.03,
      },
    ],
  }));

  const dialog = (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.root,
        contained ? styles.containedRoot : styles.screenRoot,
        rootAnimatedStyle,
      ]}
    >
      <Pressable accessibilityRole="button" onPress={handleDismiss} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.card, cardAnimatedStyle]}>
        <View style={[styles.iconHalo, { backgroundColor: iconBackground }]}>
          <Ionicons color={accentColor} name={resolvedIconName} size={34} />
        </View>
        <Text style={styles.title}>{displayTitle}</Text>
        <Text style={styles.message}>{displayMessage}</Text>
        <View style={styles.actions}>
          {displayCancelLabel ? (
            <AnimatedPressable
              accessibilityRole="button"
              containerStyle={styles.cancelButtonContainer}
              onPress={handleDismiss}
              pressedScale={0.96}
              pressedTranslateY={1}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>{displayCancelLabel}</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            accessibilityRole="button"
            containerStyle={[
              styles.confirmButtonContainer,
              !displayCancelLabel && styles.confirmButtonSingleContainer,
            ]}
            onPress={displayOnConfirm}
            pressedScale={0.96}
            pressedTranslateY={1}
            style={({ pressed }) => [
              styles.confirmButton,
              { backgroundColor: accentColor, shadowColor: accentColor },
              pressed && styles.confirmButtonPressed,
            ]}
          >
            <Text style={styles.confirmText}>{displayConfirmLabel}</Text>
          </AnimatedPressable>
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (!isMounted) {
    return null;
  }

  return <OverlayPortal>{dialog}</OverlayPortal>;
}

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors, isDark } = theme;

  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(9, 14, 20, 0.56)',
    },
    screenRoot: {
      zIndex: 120,
      elevation: 120,
    },
    containedRoot: {
      zIndex: 999,
      elevation: 999,
    },
    card: {
      width: '100%',
      maxWidth: 430,
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      borderRadius: 28,
      backgroundColor: colors.surfaceElevated,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: isDark ? 0.3 : 0.16,
      shadowRadius: 34,
      elevation: 34,
    },
    iconHalo: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 23,
      fontWeight: '900',
      lineHeight: 30,
      textAlign: 'center',
    },
    message: {
      color: colors.textSoft,
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 26,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    actions: {
      width: '100%',
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    cancelButtonContainer: {
      flex: 1,
    },
    cancelButton: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    cancelText: {
      color: colors.textSoft,
      fontSize: 17,
      fontWeight: '900',
    },
    confirmButtonContainer: {
      flex: 1.2,
    },
    confirmButton: {
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.xl,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
      elevation: 8,
    },
    confirmButtonSingleContainer: {
      flex: 1,
    },
    confirmButtonPressed: {
      opacity: 0.88,
      transform: [{ translateY: 1 }],
    },
    confirmText: {
      color: colors.surface,
      fontSize: 17,
      fontWeight: '900',
    },
  });
};
