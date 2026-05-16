import { memo, useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
  const pressProgress = useRef(new Animated.Value(0)).current;

  const animateTo = (value: number) => {
    Animated.spring(pressProgress, {
      bounciness: 8,
      speed: 24,
      toValue: value,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        containerStyle,
        {
          transform: [
            {
              scale: pressProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, pressedScale],
              }),
            },
            {
              translateX: pressProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, pressedTranslateX],
              }),
            },
            {
              translateY: pressProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, pressedTranslateY],
              }),
            },
          ],
        },
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
