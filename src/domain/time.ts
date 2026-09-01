/**
 * A gaming cafe does not close at midnight. A session started at 11:40 PM and a sale
 * rung up at 1:15 AM belong to the *same* trading day, otherwise the cash count at
 * closing can never balance. Everything financial is bucketed by "business day",
 * which starts at `BUSINESS_DAY_START_HOUR` local time.
 */
export const BUSINESS_DAY_START_HOUR = 6;

/** ISO date (YYYY-MM-DD) of the business day a timestamp belongs to. */
export function businessDayOf(iso: string, startHour = BUSINESS_DAY_START_HOUR): string {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() - startHour * 3600_000);
  return toDateKey(shifted);
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentBusinessDay(now: Date = new Date()): string {
  return businessDayOf(now.toISOString());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Whole minutes between two ISO timestamps, never negative. */
export function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / 60_000));
}

export function secondsBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

/** `95` -> `"1h 35m"`, `42` -> `"42 min"`. */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Live ticking clock label, e.g. `"32:07"` or `"1:04:12"`. */
export function formatStopwatch(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** `"7:32 PM"` */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `"2026-08-31"` -> `"31 Aug"` */
export function formatDayKey(key: string, withYear = false): string {
  const [y, m, d] = key.split('-');
  const monthIndex = Number(m) - 1;
  const month = MONTHS[monthIndex] ?? m;
  return `${Number(d)} ${month}${withYear ? ` ${y}` : ''}`;
}

export function relativeDayLabel(key: string, today = currentBusinessDay()): string {
  if (key === today) return 'Today';
  const t = new Date(`${today}T00:00:00`);
  t.setDate(t.getDate() - 1);
  if (key === toDateKey(t)) return 'Yesterday';
  return formatDayKey(key);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
