import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, type } from '@/theme';

type Variant = keyof typeof type;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
  /** Shortcut for numeric readouts that should not reflow while a timer ticks. */
  tabular?: boolean;
}

export function Text({
  variant = 'body',
  color = colors.text,
  align,
  tabular,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        type[variant],
        { color, textAlign: align },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}

export function Eyebrow({ children, color = colors.textFaint, ...rest }: TextProps) {
  return (
    <Text variant="eyebrow" color={color} {...rest}>
      {children}
    </Text>
  );
}
