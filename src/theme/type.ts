import { Platform, TextStyle } from 'react-native';

/**
 * System faces only — no font downloads, so a cold start in a cafe with bad wifi
 * still renders instantly. Weight and tracking carry the "bold editorial" feel.
 */
const family = Platform.select({
  ios: { display: 'System', text: 'System', mono: 'Menlo' },
  android: { display: 'sans-serif', text: 'sans-serif', mono: 'monospace' },
  default: { display: 'System', text: 'System', mono: 'monospace' },
});

export const font = family;

export const type = {
  /** Huge money readouts. */
  hero: {
    fontFamily: family.display,
    fontSize: 46,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.6,
  } as TextStyle,
  display: {
    fontFamily: family.display,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1.1,
  } as TextStyle,
  title: {
    fontFamily: family.display,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  } as TextStyle,
  heading: {
    fontFamily: family.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: -0.3,
  } as TextStyle,
  body: {
    fontFamily: family.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  } as TextStyle,
  bodyStrong: {
    fontFamily: family.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  } as TextStyle,
  small: {
    fontFamily: family.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  } as TextStyle,
  /** All-caps micro labels used as section eyebrows. */
  eyebrow: {
    fontFamily: family.text,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  } as TextStyle,
  mono: {
    fontFamily: family.mono,
    fontSize: 13,
    fontWeight: '600',
  } as TextStyle,
} as const;
