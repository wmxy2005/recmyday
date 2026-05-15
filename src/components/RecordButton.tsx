import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
        <View style={styles.sparkRing}>
          <View style={[styles.spark, styles.sparkTop]} />
          <View style={[styles.spark, styles.sparkRight]} />
          <View style={[styles.spark, styles.sparkLeft]} />
        </View>
        <View style={styles.iconBadge}>
          <Ionicons color={colors.surface} name={hasRecord ? 'refresh' : 'add'} size={34} />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.label}>{hasRecord ? '更新' : '记录'}</Text>
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
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  recorded: {
    backgroundColor: colors.primaryDark,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  textGroup: {
    alignItems: 'flex-start',
    justifyContent: 'center',
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
