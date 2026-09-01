/**
 * All money in the system is an integer number of paise. Floats are never used for
 * money: `0.1 + 0.2 !== 0.3` is not an acceptable property for a cash register.
 */
export type Paise = number;

export const RUPEE = '\u20B9';

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

/** `123450` -> `"₹1,234.50"`, `120000` -> `"₹1,200"`. */
export function formatMoney(paise: Paise, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  const { sign = false, symbol = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = groupIndian(whole) + (frac === 0 ? '' : '.' + String(frac).padStart(2, '0'));
  const prefix = negative ? '-' : sign ? '+' : '';
  return `${prefix}${symbol ? RUPEE : ''}${body}`;
}

/** Indian digit grouping: 1,23,45,678. */
export function groupIndian(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const head = s.slice(0, s.length - 3);
  const tail = s.slice(s.length - 3);
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
}

/** Parses free staff input ("500", "500.50", "₹500") into paise. Returns null if unusable. */
export function parseAmount(input: string): Paise | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
