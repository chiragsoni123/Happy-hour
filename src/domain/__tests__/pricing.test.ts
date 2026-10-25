import { priceMinutes, priceSession, rateLabel, resolvePricingRule } from '../pricing';
import type { GamingSession, PricingRule } from '../types';

const snap = {
  rate_per_minute: 1000, // ₹10/min
  minimum_charge: 5000, // ₹50
  min_billable_minutes: 5,
  billing_increment_minutes: 1,
};

describe('priceMinutes', () => {
  it('charges the metered amount above the minimum', () => {
    expect(priceMinutes(32, snap)).toMatchObject({ billedMinutes: 32, amount: 32000 });
  });

  it('applies the minimum charge to a very short session', () => {
    const result = priceMinutes(1, snap);
    expect(result.billedMinutes).toBe(5);
    expect(result.amount).toBe(5000);
    expect(result.minimumApplied).toBe(false); // 5 min x ₹10 already equals the ₹50 minimum
  });

  it('flags when the floor, not the clock, set the price', () => {
    const result = priceMinutes(1, { ...snap, min_billable_minutes: 1, minimum_charge: 5000 });
    expect(result.billedMinutes).toBe(1);
    expect(result.amount).toBe(5000);
    expect(result.minimumApplied).toBe(true);
  });

  it('rounds up to the billing increment', () => {
    const result = priceMinutes(31, { ...snap, billing_increment_minutes: 15 });
    expect(result.billedMinutes).toBe(45);
    expect(result.amount).toBe(45000);
  });

  it('never returns a negative or fractional amount', () => {
    const result = priceMinutes(-10, snap);
    expect(result.elapsedMinutes).toBe(0);
    expect(Number.isInteger(result.amount)).toBe(true);
    expect(result.amount).toBeGreaterThanOrEqual(0);
  });
});

describe('priceSession', () => {
  const session: GamingSession = {
    id: 's1',
    resource_id: 'r1',
    game_type_id: 'g1',
    sale_id: 'sale1',
    customer_id: null,
    pricing_rule_id: 'rule1',
    ...snap,
    period: 'DAY',
    status: 'ACTIVE',
    started_at: '2026-08-31T19:00:00.000Z',
    ended_at: null,
    billed_minutes: null,
    metered_amount: null,
    amount: null,
    amount_source: 'METERED',
    business_day: '2026-08-31',
    started_by: 'staff1',
    ended_by: null,
    note: null,
  };

  it('prices a running session up to now', () => {
    expect(priceSession(session, '2026-08-31T19:32:00.000Z').amount).toBe(32000);
  });

  it('uses the recorded end time once stopped, ignoring the clock', () => {
    const stopped = { ...session, status: 'STOPPED' as const, ended_at: '2026-08-31T19:20:00.000Z' };
    expect(priceSession(stopped, '2026-09-05T00:00:00.000Z').amount).toBe(20000);
  });

  it('keeps the rate snapshotted at start when the rule later changes', () => {
    // The session carries its own rate; a new PricingRule cannot reach back into it.
    const cheap = { ...session, rate_per_minute: 800 };
    expect(priceSession(cheap, '2026-08-31T19:10:00.000Z').amount).toBe(8000);
  });
});

describe('resolvePricingRule', () => {
  const base = {
    model: 'PER_MINUTE' as const,
    period: 'DAY' as const,
    minimum_charge: 0,
    min_billable_minutes: 1,
    billing_increment_minutes: 1,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const rules: PricingRule[] = [
    { id: 'default', game_type_id: 'ps5', resource_id: null, name: 'PS5', rate_per_minute: 1000, ...base },
    { id: 'vip', game_type_id: 'ps5', resource_id: 'ps5-3', name: 'VIP', rate_per_minute: 1500, ...base },
    { id: 'off', game_type_id: 'pool', resource_id: null, name: 'Old', rate_per_minute: 500, ...base, active: false },
  ];

  it('prefers a rule bound to the specific resource', () => {
    expect(resolvePricingRule(rules, 'ps5', 'ps5-3')?.id).toBe('vip');
  });

  it('falls back to the game type default', () => {
    expect(resolvePricingRule(rules, 'ps5', 'ps5-1')?.id).toBe('default');
  });

  it('returns null rather than a free game when nothing is configured', () => {
    expect(resolvePricingRule(rules, 'pool', 'pool-1')).toBeNull();
  });

  it('keeps day and night rates apart', () => {
    const withNight: PricingRule[] = [
      ...rules,
      { id: 'night', game_type_id: 'ps5', resource_id: null, name: 'PS5 night', rate_per_minute: 2000, ...base, period: 'NIGHT' },
    ];
    expect(resolvePricingRule(withNight, 'ps5', 'ps5-1', 'DAY')?.rate_per_minute).toBe(1000);
    expect(resolvePricingRule(withNight, 'ps5', 'ps5-1', 'NIGHT')?.rate_per_minute).toBe(2000);
  });

  it('refuses to fall back to the other tariff when one is missing', () => {
    // Silently charging the day rate at night would be worse than refusing to start.
    expect(resolvePricingRule(rules, 'ps5', 'ps5-1', 'NIGHT')).toBeNull();
  });
});

describe('rateLabel', () => {
  it('renders whole rupees without decimals', () => {
    expect(rateLabel(snap)).toBe('₹10/min');
  });

  it('keeps paise when the rate is not whole', () => {
    expect(rateLabel({ ...snap, rate_per_minute: 850 })).toBe('₹8.50/min');
  });
});
