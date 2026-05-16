import { Ionicons } from '@expo/vector-icons';
import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
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

import { useAppTheme } from '@/theme';

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
  const { colors } = useAppTheme();
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
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pressedHalo,
          {
            backgroundColor: colors.primarySoft,
            shadowColor: colors.primary,
          },
          gradientStyle,
        ]}
      />
      <PlatformPressable
        {...rest}
        onPressIn={(event) => {
          scale.value = withSpring(0.96, tabPressSpring);
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
  const { colors, isDark } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        animation: 'none',
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: 'transparent',
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 12,
          height: 76,
          paddingBottom: 10,
          paddingTop: 8,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: isDark ? '#000000' : '#10231B',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: isDark ? 0.2 : 0.08,
          shadowRadius: 22,
          elevation: 24,
          zIndex: 20,
        },
        tabBarItemStyle: {
          height: 58,
          paddingVertical: 0,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          lineHeight: 14,
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
          tabBarIcon: tabIcon('bar-chart-outline', 'bar-chart'),
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
    flex: 1,
    height: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressedHalo: {
    position: 'absolute',
    top: 2,
    width: 94,
    height: 54,
    borderRadius: 27,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 7,
  },
  tabBarPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
});
