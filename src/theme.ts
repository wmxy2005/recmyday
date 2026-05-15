import { useColorScheme } from 'react-native';

const lightColors = {
  background: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F3F1',
  surfaceElevated: '#FFFFFF',
  text: '#111816',
  textSoft: '#2C3632',
  muted: '#69746F',
  mutedSubtle: '#919B96',
  border: '#E2E7E3',
  borderStrong: '#CBD4CF',
  primary: '#167A55',
  primaryDark: '#0F5F42',
  primarySoft: '#E6F4EE',
  accent: '#D66A2C',
  info: '#2F6F9F',
  infoSoft: '#E8F2F7',
  highlight: '#F04438',
  middlelight: '#FEECEF',
  danger: '#D92D5B',
  dangerDark: '#A82445',
  dangerSoft: '#FCE8EF',
  shadow: '#10231B',
};

const darkColors = {
  background: '#0D1110',
  surface: '#171C1A',
  surfaceAlt: '#202724',
  surfaceElevated: '#1C2320',
  text: '#F2F5F3',
  textSoft: '#D6DED9',
  muted: '#A2ADA7',
  mutedSubtle: '#78847E',
  border: '#2B3531',
  borderStrong: '#3A4641',
  primary: '#42C58E',
  primaryDark: '#1E9C69',
  primarySoft: '#12382A',
  accent: '#F19054',
  info: '#7FC7E8',
  infoSoft: '#143140',
  highlight: '#FF6B61',
  middlelight: '#351B24',
  danger: '#FF5C8A',
  dangerDark: '#D83B68',
  dangerSoft: '#3B1725',
  shadow: '#000000',
};

export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 14,
  xl: 22,
};

export function useAppTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    shadow: {
      shadowColor: isDark ? darkColors.shadow : lightColors.shadow,
      shadowOffset: { width: 0, height: isDark ? 8 : 12 },
      shadowOpacity: isDark ? 0.26 : 0.08,
      shadowRadius: isDark ? 18 : 24,
      elevation: isDark ? 3 : 5,
    },
  };
}

export type AppTheme = ReturnType<typeof useAppTheme>;
