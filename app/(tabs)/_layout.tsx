import { Ionicons } from '@expo/vector-icons';
import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

type TabIconName = keyof typeof Ionicons.glyphMap;

const tabPressSpring = {
  damping: 16,
  stiffness: 420,
  mass: 0.35,
};

const tabGradientFade = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
};

function AnimatedTabBarButton({
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: BottomTabBarButtonProps) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: pressed.value,
  }));

  return (
    <Animated.View style={[style, styles.tabBarButton, animatedStyle]}>
      <Animated.View pointerEvents="none" style={[styles.gradientBackground, gradientStyle]}>
        <LinearGradient
          colors={['rgba(31, 122, 90, 0.28)', 'rgba(31, 122, 90, 0.12)', 'rgba(31, 122, 90, 0)']}
          end={{ x: 0.5, y: 1 }}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <PlatformPressable
        {...rest}
        onPressIn={(event) => {
          scale.value = withSpring(0.9, tabPressSpring);
          pressed.value = withTiming(1, tabGradientFade);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.value = withSpring(1, tabPressSpring);
          pressed.value = withTiming(0, tabGradientFade);
          onPressOut?.(event);
        }}
        style={styles.tabBarPressable}
      >
        {children}
      </PlatformPressable>
    </Animated.View>
  );
}

function tabIcon(name: TabIconName, focusedName: TabIconName) {
  function TabBarIcon({
    color,
    focused,
    size,
  }: {
    color: string;
    focused: boolean;
    size: number;
  }) {
    return <Ionicons color={color} name={focused ? focusedName : name} size={size} />;
  }

  return TabBarIcon;
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs.stats'),
          tabBarIcon: tabIcon('calendar-outline', 'calendar'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: tabIcon('settings-outline', 'settings'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarButton: {
    overflow: 'hidden',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: 10,
    marginVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tabBarPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
