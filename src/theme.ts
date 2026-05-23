import { useColorScheme } from 'react-native';

const lightColors = {
  background: '#F7F8FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F6FF',
  surfaceElevated: '#FFFFFF',
  text: '#111827',
  textSoft: '#374151',
  muted: '#667085',
  mutedSubtle: '#A9B1C3',
  border: '#E4E8F5',
  borderStrong: '#CCD4EA',
  primary: '#417FF5',
  primaryDark: '#2F6FE8',
  primarySoft: '#EAF2FF',
  accent: '#7C3AED',
  info: '#417FF5',
  infoSoft: '#EAF2FF',
  highlight: '#2F6FE8',
  middlelight: '#F2EDFF',
  danger: '#F04A2A',
  dangerDark: '#C93418',
  dangerSoft: '#FFE7DE',
  shadow: '#263B73',
};

const darkColors = {
  background: '#0E1020',
  surface: '#171A2E',
  surfaceAlt: '#20243B',
  surfaceElevated: '#1C2036',
  text: '#F5F7FF',
  textSoft: '#DCE2F8',
  muted: '#A8B0CC',
  mutedSubtle: '#77809F',
  border: '#2D3352',
  borderStrong: '#40486E',
  primary: '#8B8CFF',
  primaryDark: '#6D63F6',
  primarySoft: '#272B5F',
  accent: '#B084FF',
  info: '#6EA8FF',
  infoSoft: '#18325E',
  highlight: '#7C9BFF',
  middlelight: '#2D2557',
  danger: '#FF5C8A',
  dangerDark: '#D83B68',
  dangerSoft: '#3B1725',
  shadow: '#000000',
};

export const colors = lightColors;

export const spacing = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
};

export const typography = {
  screenTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
} as const;

export const componentSizes = {
  headerIconButton: 36,
  settingsIconTile: 40,
  tabBarHeight: 64,
  bottomActionOffset: 78,
} as const;

export const cardVariants = {
  settingsTime: {
    activeBackground: '#F2F0FF',
    activeBorder: '#C8C2FF',
    tileBackground: '#E8E7FF',
  },
  settingsUnit: {
    activeBackground: '#EEF4FF',
    activeBorder: '#AFCBFF',
    choiceBackground: '#F3F7FF',
    choiceBorder: '#BFD4FF',
  },
  settingsList: {
    activeBackground: '#F1F4FF',
    activeBorder: '#BAC6FF',
    choiceBackground: '#F5F7FF',
    choiceBorder: '#C7D0FF',
    tileBackground: '#E5F0FF',
  },
  settingsSeparate: {
    activeBackground: '#F3F0FF',
    activeBorder: '#C7BBFF',
    choiceBackground: '#F7F5FF',
    choiceBorder: '#D1C7FF',
  },
} as const;

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
