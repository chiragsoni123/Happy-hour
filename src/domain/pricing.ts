import type { Paise } from './money';
import type { GamingSession, PricingRule, TariffPeriod } from './types';
import { minutesBetween } from './time';

/**
 * The pricing engine is deliberately isolated: it takes a rate snapshot and a duration
 * and returns money. Peak hours, packages, memberships and per-player pricing are all
 * future variants of `PricingSnapshot` -> `priceSession`, and nothing outside this file
 * needs to change when they arrive.
 */
export interface PricingSnapshot {
  rate_per_minute: Paise;
  minimum_charge: Paise;
  min_billable_minutes: number;
  billing_increment_minutes: number;
}

export function snapshotOf(rule: PricingRule): PricingSnapshot {
  return {
    rate_per_minute: rule.rate_per_minute,
    minimum_charge: rule.minimum_charge,
    min_billable_minutes: rule.min_billable_minutes,
    billing_increment_minutes: rule.billing_increment_minutes,
  };
}

export interface PricedSession {
  elapsedMinutes: number;
  billedMinutes: number;
  amount: Paise;
  /** True when the minimum charge, not the clock, set the price. */
  minimumApplied: boolean;
}

/** Rounds elapsed minutes up to the billing increment and applies the floor minimum. */
export function priceMinutes(elapsedMinutes: number, snap: PricingSnapshot): PricedSession {
  const elapsed = Math.max(0, Math.floor(elapsedMinutes));
  const increment = Math.max(1, snap.billing_increment_minutes);
  const rounded = Math.ceil(elapsed / increment) * increment;
  const billedMinutes = Math.max(rounded, snap.min_billable_minutes);
  const metered = billedMinutes * snap.rate_per_minute;
  const amount = Math.max(metered, snap.minimum_charge);
  return {
    elapsedMinutes: elapsed,
    billedMinutes,
    amount,
    minimumApplied: amount > metered,
  };
}

/** Live or final price for a session, always using the rate snapshotted at start. */
export function priceSession(session: GamingSession, atIso: string): PricedSession {
  const end = session.ended_at ?? atIso;
  return priceMinutes(minutesBetween(session.started_at, end), session);
}

/**
 * Picks the rule that applies to a resource for the chosen tariff: a resource-specific
 * override beats the game-type default. Returns null when nothing is configured, which
 * callers must treat as "cannot start a session" rather than "free".
 */
export function resolvePricingRule(
  rules: readonly PricingRule[],
  gameTypeId: string,
  resourceId: string,
  period: TariffPeriod = 'DAY',
): PricingRule | null {
  const active = rules.filter(
    (r) => r.active && r.game_type_id === gameTypeId && r.period === period,
  );
  return (
    active.find((r) => r.resource_id === resourceId) ??
    active.find((r) => r.resource_id === null) ??
    null
  );
}

export const TARIFF_LABEL: Record<TariffPeriod, string> = {
  DAY: 'Day',
  NIGHT: 'Night',
};

/** `"₹10/min"` style label for the rate, used all over the gaming UI. */
export function rateLabel(snap: PricingSnapshot): string {
  const rupees = snap.rate_per_minute / 100;
  const value = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
  return `₹${value}/min`;
}
