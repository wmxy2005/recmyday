import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
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
  const accentColor =
    variant === 'danger' ? colors.danger : variant === 'success' ? colors.info : colors.primary;
  const iconBackground =
    variant === 'danger'
      ? colors.dangerSoft
      : variant === 'success'
        ? colors.infoSoft
        : colors.primarySoft;
  const resolvedIconName =
    iconName ??
    (variant === 'danger'
      ? 'trash-outline'
      : variant === 'success'
        ? 'checkmark-circle-outline'
        : 'cloud-upload-outline');
  const handleDismiss = onCancel ?? onConfirm;

  const dialog = (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" onPress={handleDismiss} style={StyleSheet.absoluteFill} />
      <View style={styles.card}>
        <View style={[styles.iconHalo, { backgroundColor: iconBackground }]}>
          <Ionicons color={accentColor} name={resolvedIconName} size={34} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {cancelLabel ? (
            <AnimatedPressable
              accessibilityRole="button"
              containerStyle={styles.cancelButtonContainer}
              onPress={handleDismiss}
              pressedScale={0.96}
              pressedTranslateY={1}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            accessibilityRole="button"
            containerStyle={[
              styles.confirmButtonContainer,
              !cancelLabel && styles.confirmButtonSingleContainer,
            ]}
            onPress={onConfirm}
            pressedScale={0.96}
            pressedTranslateY={1}
            style={({ pressed }) => [
              styles.confirmButton,
              { backgroundColor: accentColor, shadowColor: accentColor },
              pressed && styles.confirmButtonPressed,
            ]}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );

  if (!visible) {
    return null;
  }

  if (contained) {
    return dialog;
  }

  return (
    <Modal animationType="fade" onRequestClose={handleDismiss} transparent visible={visible}>
      {dialog}
    </Modal>
  );
}

const makeStyles = (theme: ReturnType<typeof useAppTheme>) => {
  const { colors, isDark } = theme;

  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
      elevation: 999,
      paddingHorizontal: spacing.xl,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(9, 14, 20, 0.56)',
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
