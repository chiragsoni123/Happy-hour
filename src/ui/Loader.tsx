import LottieView from 'lottie-react-native';
import {
  View,
} from 'react-native';

import { colors, space, themed } from '@/theme';

import { Text } from './Text';

export interface LoaderProps {
  /** Optional line under the animation, e.g. what is being waited for. */
  message?: string;
  size?: number;
}

/**
 * The full-screen wait, shown while the app restores its session and pulls the day's
 * tables. It is the first thing staff see each shift, so it is the venue's own artwork
 * rather than a spinner.
 */
export function Loader({ message, size = 180 }: LoaderProps) {
  return (
    <View style={styles.wrap}>
      <LottieView
        source={require('../../assets/ps5-loader.json')}
        autoPlay
        loop
        // Vector frames, so it scales without assets; keeping it modest also keeps the
        // per-frame cost down on the cheap Android handsets behind the counter.
        style={{ width: size, height: size }}
      />
      {message ? (
        <Text variant="small" color={colors.textMuted} align="center">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: colors.bg,
  },
}));
