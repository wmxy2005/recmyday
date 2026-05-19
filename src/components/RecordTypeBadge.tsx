import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, useAppTheme } from '@/theme';
import type { RecordTypeIconName } from '@/utils/recordTypeIcon';

type RecordTypeBadgeProps = {
  iconName: RecordTypeIconName;
  label: string;
  active?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RecordTypeBadge({
  active = false,
  compact = false,
  iconName,
  label,
  style,
}: RecordTypeBadgeProps) {
  const { colors } = useAppTheme();
  const color = active ? colors.surface : colors.primary;

  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        {
          backgroundColor: active ? colors.primary : colors.primarySoft,
          borderColor: active ? colors.primary : colors.primarySoft,
        },
        style,
      ]}
    >
      <Ionicons color={color} name={iconName} size={compact ? 12 : 14} />
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          compact && styles.textCompact,
          { color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    minHeight: 23,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeCompact: {
    minHeight: 20,
    paddingVertical: 2,
    gap: 3,
  },
  text: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  textCompact: {
    fontSize: 11,
  },
});
