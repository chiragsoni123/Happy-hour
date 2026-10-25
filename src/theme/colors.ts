/**
 * Happy Hour palette.
 *
 * Derived from the reference shot's strategy — a near-black desaturated-green base,
 * layered surfaces, and a small set of very loud accents — but retuned for a POS that
 * staff stare at for 12 hours in a dim gaming cafe: higher contrast on text, and one
 * unmistakable colour per payment method so a tap is never ambiguous.
 *
 * `colors` is a live object. Screens read it at render time, and `applyTheme()` swaps
 * its values in place when the person changes mode or accent in Settings. Layout-only
 * styles may live in `StyleSheet.create`; anything with a colour reads `colors` inline,
 * because a module-scope stylesheet would snapshot the dark palette forever.
 */
export const palette = {
  /** Base: near-black with a green cast. */
  void: '#050703',
  ink: '#070B06',
  /** Layered surfaces, each step lighter. */
  surface1: '#0F1610',
  surface2: '#17211A',
  surface3: '#202C22',
  hairline: '#27332A',

  /** Accents. */
  lime: '#C9F73C',
  limeDeep: '#A8D520',
  green: '#5CB80C',
  greenDeep: '#3E8A05',
  orange: '#F6A502',
  orangeDeep: '#C77F00',
  olive: '#AEB400',
  chalk: '#F3F6F4',

  /** Feedback. */
  red: '#FF5B45',
  redDeep: '#B23324',
  violet: '#A78BFA',
} as const;

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedMode = 'dark' | 'light';

/**
 * Accent choices, one per person's phone. The three payment keys stay fixed whatever is
 * chosen — cash is always lime, UPI always orange, due always chalk — so the accent can
 * never make one payment method look like another.
 */
export type AccentName = 'lime' | 'orange' | 'sky' | 'rose' | 'violet' | 'mint';

export interface AccentSwatch {
  name: AccentName;
  label: string;
  color: string;
  deep: string;
  /** Text and icons drawn on top of the accent. */
  on: string;
  /** The accent used *as* text or an icon on a light page, where the bright fill fails. */
  text: string;
}

export const ACCENTS: Record<AccentName, AccentSwatch> = {
  lime: { name: 'lime', label: 'Lime', color: '#C9F73C', deep: '#A8D520', on: '#050703', text: '#5A7D00' },
  orange: { name: 'orange', label: 'Orange', color: '#F6A502', deep: '#C77F00', on: '#231500', text: '#A86600' },
  sky: { name: 'sky', label: 'Sky', color: '#5ED3FF', deep: '#2FB4E6', on: '#03151C', text: '#0B7FA6' },
  rose: { name: 'rose', label: 'Rose', color: '#FF6FA5', deep: '#E0457F', on: '#2A0512', text: '#C2185B' },
  violet: { name: 'violet', label: 'Violet', color: '#B393FF', deep: '#8C66F0', on: '#140A2E', text: '#5E3FCF' },
  mint: { name: 'mint', label: 'Mint', color: '#5FF0B8', deep: '#2FCF94', on: '#03211A', text: '#0F8A5F' },
};

export interface ThemeColors {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceRaised: string;
  surfaceHigh: string;
  hairline: string;
  /** Edge of every card. Faint on dark, where fills already differ; visible on light. */
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  onAccent: string;
  accent: string;
  accentDeep: string;
  /** Accent for text and icons on a surface. Same as `accent` on dark; deeper on light. */
  accentText: string;
  brand: string;
  brandDeep: string;
  warn: string;
  warnDeep: string;
  danger: string;
  dangerDeep: string;
  info: string;
  /** One colour per payment method — used identically everywhere, never themed. */
  cash: string;
  upi: string;
  due: string;
  /** Text on the payment keys. */
  onCash: string;
  onUpi: string;
  onDue: string;
  /** Cash and UPI amounts written on a surface, readable in either mode. */
  cashText: string;
  upiText: string;
  /** Scrim behind sheets. */
  backdrop: string;
}

function darkTokens(accent: AccentSwatch): ThemeColors {
  return {
    bg: palette.ink,
    bgDeep: palette.void,
    surface: palette.surface1,
    surfaceRaised: palette.surface2,
    surfaceHigh: palette.surface3,
    hairline: palette.hairline,
    border: '#1E2A20',
    text: palette.chalk,
    textMuted: '#9BA79D',
    textFaint: '#5F6B62',
    onAccent: accent.on,
    accent: accent.color,
    accentDeep: accent.deep,
    accentText: accent.color,
    brand: palette.green,
    brandDeep: palette.greenDeep,
    warn: palette.orange,
    warnDeep: palette.orangeDeep,
    danger: palette.red,
    dangerDeep: palette.redDeep,
    info: palette.violet,
    cash: palette.lime,
    upi: palette.orange,
    due: palette.chalk,
    onCash: palette.void,
    onUpi: '#231500',
    onDue: palette.void,
    cashText: palette.lime,
    upiText: palette.orange,
    backdrop: 'rgba(3,6,3,0.72)',
  };
}

/**
 * Light is the same structure with the layers inverted: paper instead of ink, and the
 * accent kept loud but with dark text on it. Payment keys keep their colours, with the
 * "due" key becoming dark-on-paper so it still reads as the third, quieter option.
 */
function lightTokens(accent: AccentSwatch): ThemeColors {
  return {
    // The page is visibly tinted so that white cards read as objects on it, not as more
    // page. Wells (inputs, keys, chips) are a grey that shows on white.
    bg: '#EDF0EA',
    bgDeep: '#E2E6DE',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceHigh: '#E8ECE5',
    hairline: '#E1E6DE',
    border: '#D7DDD4',
    text: '#0E140F',
    textMuted: '#5B665D',
    textFaint: '#8E988F',
    onAccent: accent.on,
    accent: accent.color,
    accentDeep: accent.deep,
    accentText: accent.text,
    brand: '#3E8A05',
    brandDeep: '#2E6604',
    warn: '#D98A00',
    warnDeep: '#A96A00',
    danger: '#D93B27',
    dangerDeep: '#A82A1B',
    info: '#7C5CE6',
    cash: palette.lime,
    upi: palette.orange,
    due: '#1B241C',
    onCash: palette.void,
    onUpi: '#231500',
    onDue: palette.chalk,
    cashText: '#5A7D00',
    upiText: '#A86600',
    backdrop: 'rgba(14,20,15,0.45)',
  };
}

/** The live palette. Read it at render time; never copy it into a module-scope style. */
export const colors: ThemeColors = darkTokens(ACCENTS.lime);

let currentMode: ResolvedMode = 'dark';

/** Swaps every token in place. Callers then re-render whatever is on screen. */
export function applyTheme(mode: ResolvedMode, accent: AccentName): void {
  const swatch = ACCENTS[accent];
  currentMode = mode;
  Object.assign(colors, mode === 'light' ? lightTokens(swatch) : darkTokens(swatch));
}

export interface Elevation {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

/**
 * Shadows have to change with the mode: the deep black drop that lifts a lime card off
 * near-black turns to mud on paper. Read at render, like the colours.
 */
export function elevation(kind: 'card' | 'float'): Elevation {
  const dark = currentMode === 'dark';
  if (kind === 'float') {
    return {
      shadowColor: dark ? '#000' : '#1B2A1E',
      shadowOpacity: dark ? 0.6 : 0.16,
      shadowRadius: dark ? 28 : 22,
      shadowOffset: { width: 0, height: dark ? 14 : 10 },
      elevation: dark ? 16 : 10,
    };
  }
  return {
    shadowColor: dark ? '#000' : '#1B2A1E',
    shadowOpacity: dark ? 0.45 : 0.08,
    shadowRadius: dark ? 20 : 14,
    shadowOffset: { width: 0, height: dark ? 10 : 6 },
    elevation: dark ? 8 : 3,
  };
}

export type PaymentTone = 'cash' | 'upi' | 'due';

/** Resource-state colours, mirrored by `GameResourceStatus`. */
export const statusColors = {
  AVAILABLE: palette.green,
  IN_USE: palette.lime,
  MAINTENANCE: palette.orange,
  DISABLED: '#5F6B62',
} as const;
