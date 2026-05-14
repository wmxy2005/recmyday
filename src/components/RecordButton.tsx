import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

type RecordButtonProps = {
  animatedStyle: AnimatedStyle<ViewStyle>;
  disabled: boolean;
  isRecording: boolean;
  isRecordedAppearance: boolean;
  onPress: () => void;
  pointerEvents: 'auto' | 'none';
};

function RecordButtonComponent({
  animatedStyle,
  disabled,
  isRecording,
  isRecordedAppearance,
  onPress,
  pointerEvents,
}: RecordButtonProps) {
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
          isRecordedAppearance && styles.recorded,
          pressed &&
            !isRecording &&
            (isRecordedAppearance ? styles.recordedPressed : styles.pressed),
          isRecording && styles.disabled,
        ]}
      >
        <Ionicons color={colors.surface} name="radio-button-on" size={24} />
        <View style={styles.textGroup}>
          <Text style={styles.time}>{currentTime}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const RecordButton = memo(RecordButtonComponent);

const styles = StyleSheet.create({
  button: {
    minWidth: 152,
    height: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: 32,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  recorded: {
    backgroundColor: colors.danger,
  },
  recordedPressed: {
    backgroundColor: '#963634',
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
