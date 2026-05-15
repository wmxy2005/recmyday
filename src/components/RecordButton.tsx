import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { spacing, useAppTheme } from '@/theme';

type RecordButtonProps = {
  animatedStyle: AnimatedStyle<ViewStyle>;
  disabled: boolean;
  hasRecord: boolean;
  isRecording: boolean;
  onPress: () => void;
  pointerEvents: 'auto' | 'none';
};

function RecordButtonComponent({
  animatedStyle,
  disabled,
  hasRecord,
  isRecording,
  onPress,
  pointerEvents,
}: RecordButtonProps) {
  const theme = useAppTheme();
  const { colors } = theme;
  const styles = makeStyles(theme);
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <Animated.View pointerEvents={pointerEvents} style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          hasRecord && styles.recorded,
          pressed && !isRecording && !hasRecord && styles.pressed,
          isRecording && styles.disabled,
        ]}
      >
        <View style={styles.iconBadge}>
          <Ionicons color={colors.surface} name="radio-button-on" size={20} />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.time}>{currentTime}</Text>
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
    minWidth: 174,
    height: 62,
    paddingHorizontal: spacing.md,
    borderRadius: 31,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  recorded: {
    backgroundColor: colors.danger,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  textGroup: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  time: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.7,
  },
  });
};
