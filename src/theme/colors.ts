/**
 * Happy Hour palette.
 *
 * Derived from the reference shot's strategy — a near-black desaturated-green base,
 * layered surfaces, and a small set of very loud accents — but retuned for a POS that
 * staff stare at for 12 hours in a dim gaming cafe: higher contrast on text, and one
 * unmistakable colour per payment method so a tap is never ambiguous.
 */
export const palette = {
  /** Base: near-black with a green cast. */
  void: '#050703',
  ink: '#070B06',
  /** Layered surfaces, each step lighter. */
  surface: '#101710',
  surfaceRaised: '#182117',
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

export const colors = {
  bg: palette.ink,
  bgDeep: palette.void,

  surface: palette.surface1,
  surfaceRaised: palette.surface2,
  surfaceHigh: palette.surface3,
  hairline: palette.hairline,

  text: palette.chalk,
  textMuted: '#9BA79D',
  textFaint: '#5F6B62',
  onAccent: palette.void,

  accent: palette.lime,
  accentDeep: palette.limeDeep,
  brand: palette.green,
  brandDeep: palette.greenDeep,

  warn: palette.orange,
  warnDeep: palette.orangeDeep,
  danger: palette.red,
  dangerDeep: palette.redDeep,
  info: palette.violet,

  /** One colour per payment method — used identically everywhere. */
  cash: palette.lime,
  upi: palette.orange,
  due: palette.chalk,
} as const;

export type PaymentTone = 'cash' | 'upi' | 'due';

/** Resource-state colours, mirrored by `GameResourceStatus`. */
export const statusColors = {
  AVAILABLE: palette.green,
  IN_USE: palette.lime,
  MAINTENANCE: palette.orange,
  DISABLED: '#5F6B62',
} as const;
