import { useColorScheme } from 'react-native';

const lightColors = {
  background: '#F6F9FE',
  surface: '#FFFFFF',
  surfaceAlt: '#F7FAFD',
  surfaceElevated: '#FFFFFF',
  text: '#070707',
  textSoft: '#31363C',
  muted: '#5C646E',
  mutedSubtle: '#A1AAB5',
  border: '#E4EAF2',
  borderStrong: '#D2DAE6',
  primary: '#FF681E',
  primaryDark: '#E9500C',
  primarySoft: '#FFF0DF',
  accent: '#F6A40D',
  info: '#13B7AD',
  infoSoft: '#E4F8F6',
  highlight: '#0D7DFF',
  middlelight: '#FFF6D9',
  danger: '#F04A2A',
  dangerDark: '#C93418',
  dangerSoft: '#FFE7DE',
  shadow: '#31506B',
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
  md: 10,
  lg: 16,
  xl: 20,
};

export function useAppTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    shadow: {
      shadowColor: isDark ? darkColors.shadow : lightColors.shadow,
      shadowOffset: { width: 0, height: isDark ? 8 : 10 },
      shadowOpacity: isDark ? 0.26 : 0.09,
      shadowRadius: isDark ? 18 : 22,
      elevation: isDark ? 3 : 4,
    },
  };
}

export type AppTheme = ReturnType<typeof useAppTheme>;
