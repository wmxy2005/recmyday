import { memo } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type AnimatedPressableProps = PressableProps & {
  containerStyle?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedTranslateX?: number;
  pressedTranslateY?: number;
};

function AnimatedPressableComponent({
  containerStyle,
  disabled,
  onPressIn,
  onPressOut,
  pressedScale = 0.94,
  pressedTranslateX = 0,
  pressedTranslateY = 0,
  ...pressableProps
}: AnimatedPressableProps) {
  const pressProgress = useSharedValue(0);

  const animateTo = (value: number) => {
    pressProgress.value = withSpring(value, {
      damping: 16,
      stiffness: 420,
      mass: 0.35,
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 + (pressedScale - 1) * pressProgress.value,
      },
      {
        translateX: pressedTranslateX * pressProgress.value,
      },
      {
        translateY: pressedTranslateY * pressProgress.value,
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        containerStyle,
        animatedStyle,
      ]}
    >
      <Pressable
        {...pressableProps}
        disabled={disabled}
        onPressIn={(event) => {
          if (!disabled) {
            animateTo(1);
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (!disabled) {
            animateTo(0);
          }
          onPressOut?.(event);
        }}
      />
    </Animated.View>
  );
}

export const AnimatedPressable = memo(AnimatedPressableComponent);
