import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, space, type } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Eyebrow, Text } from './Text';

export interface FieldProps {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  icon?: IconName;
  autoFocus?: boolean;
  maxLength?: number;
  multiline?: boolean;
  secure?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  icon,
  autoFocus,
  maxLength,
  multiline,
  secure,
  hint,
  style,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: space.sm }, style]}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <View
        style={[
          styles.box,
          focused && { borderColor: colors.accent },
          multiline && { minHeight: 96, alignItems: 'flex-start', paddingVertical: space.md },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={colors.textFaint} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          maxLength={maxLength}
          multiline={multiline}
          secureTextEntry={secure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, type.bodyStrong, { color: colors.text }]}
        />
      </View>
      {hint ? (
        <Text variant="small" color={colors.textFaint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text variant="small" color={active ? colors.onAccent : colors.textMuted}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="small" color={colors.textFaint}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={[styles.track, value && { backgroundColor: colors.accent }]}>
        <View style={[styles.knob, value && { alignSelf: 'flex-end' }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: space.lg,
    minHeight: 56,
  },
  input: {
    flex: 1,
    paddingVertical: space.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.md,
  },
  track: {
    width: 52,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    padding: 4,
    justifyContent: 'center',
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
});
