import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { can } from '@/domain/permissions';
import { rateLabel, resolvePricingRule, TARIFF_LABEL } from '@/domain/pricing';
import {
  formatClock,
  formatDuration,
  formatStopwatch,
  secondsBetween,
} from '@/domain/time';
import type { GameResource, ResourceStatus, TariffPeriod } from '@/domain/types';
import { GameAmountSheet } from '@/components/GameAmountSheet';
import { useNow } from '@/hooks/useNow';
import { useTariff } from '@/hooks/useTariff';
import { resourceBoard, type ResourceView } from '@/store/selectors';
import { useActor, useDb, useStore } from '@/store/useStore';
import { colors, radius, space, statusColors } from '@/theme';
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  Icon,
  Money,
  Screen,
  Section,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

/**
 * The board. Every console and table with its state visible at a glance; one tap to put
 * something on the clock, one tap to take it off. Amounts tick live so nobody has to
 * work out minutes times rate in their head.
 */
export default function Games() {
  const db = useDb();
  const actor = useActor();
  const router = useRouter();
  const now = useNow();
  const run = useStore((s) => s.run);
  const busy = useStore((s) => s.busy);

  const [selected, setSelected] = useState<ResourceView | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [stopping, setStopping] = useState<ResourceView | null>(null);
  const { period, setPeriod } = useTariff();

  const board = useMemo(() => resourceBoard(db, now), [db, now]);
  const live = board.filter((v) => v.session);
  const canManage = can(actor?.role, 'resource.manage');

  const current = selected ? board.find((v) => v.resource.id === selected.resource.id) ?? null : null;

  const start = async () => {
    if (!current) return;
    const result = await run((backend, actorId) =>
      backend.startSession({ actorId, resourceId: current.resource.id, period }),
    );
    setSelected(null);
    if (result) router.push(`/bill/${result.saleId}`);
  };

  /** Stopping opens the amount sheet rather than charging the meter outright. */
  const openStop = () => {
    if (!current?.session) return;
    setStopping(current);
    setSelected(null);
  };

  const stop = async (amount: number) => {
    const sessionId = stopping?.session?.session.id;
    if (!sessionId) return;
    const result = await run((backend, actorId) =>
      backend.stopSession({ actorId, sessionId, amount }),
    );
    setStopping(null);
    if (result) router.push(`/bill/${result.saleId}`);
  };

  const setStatus = async (status: ResourceStatus) => {
    if (!current) return;
    await run(
      (backend, actorId) =>
        backend.setResourceStatus({ actorId, resourceId: current.resource.id, status }),
      { success: `${current.resource.label} is now ${status.toLowerCase().replace('_', ' ')}` },
    );
    setSelected(null);
  };

  return (
    <Screen tabBarPadding>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>{live.length} running</Eyebrow>
          <Text variant="title">Games</Text>
        </View>
        {canManage ? (
          <Pressable onPress={() => setManageMode((m) => !m)} hitSlop={12} accessibilityRole="button">
            <Badge label={manageMode ? 'Done' : 'Manage'} color={manageMode ? colors.accentText : colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <Card level={2} style={{ gap: space.sm }}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Eyebrow>Charging</Eyebrow>
            <Text variant="bodyStrong">{TARIFF_LABEL[period]} rate</Text>
          </View>
          <View style={{ width: 168 }}>
            <Segmented
              options={[
                { value: 'DAY', label: 'Day' },
                { value: 'NIGHT', label: 'Night' },
              ]}
              value={period}
              onChange={(next) => setPeriod(next as TariffPeriod)}
            />
          </View>
        </View>
        <Text variant="small" color={colors.textFaint}>
          Applies to games you start from now on. Games already running keep the rate they
          started on.
        </Text>
      </Card>

      {db.game_types
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((type) => {
          const rows = board.filter((v) => v.gameType.id === type.id);
          if (rows.length === 0) return null;
          const rule = resolvePricingRule(db.pricing_rules, type.id, '', period);
          return (
            <Section
              key={type.id}
              title={`${type.name}${rule ? ` · ${rateLabel(rule)} ${TARIFF_LABEL[period].toLowerCase()}` : ''}`}
            >
              <View style={styles.grid}>
                {rows.map((view) => (
                  <ResourceTile
                    key={view.resource.id}
                    view={view}
                    now={now}
                    onPress={() => setSelected(view)}
                  />
                ))}
              </View>
            </Section>
          );
        })}

      <Sheet
        visible={!!current}
        onClose={() => setSelected(null)}
        eyebrow={current?.gameType.name}
        title={current?.resource.label ?? ''}
        footer={
          current ? (
            current.session ? (
              <>
                <Button
                  label="Stop and bill"
                  icon="stop"
                  tone="accent"
                  size="lg"
                  full
                  loading={busy}
                  onPress={openStop}
                />
                <Button
                  label={`Open ${current.resource.label}'s bill`}
                  tone="ghost"
                  full
                  onPress={() => {
                    const saleId = current.session?.sale.id;
                    setSelected(null);
                    if (saleId) router.push(`/bill/${saleId}`);
                  }}
                />
              </>
            ) : current.resource.status === 'AVAILABLE' ? (
              <Button
                label="Start session"
                icon="play"
                tone="accent"
                size="lg"
                full
                loading={busy}
                onPress={() => void start()}
              />
            ) : null
          ) : null
        }
      >
        {current?.session ? (
          <View style={{ gap: space.lg }}>
            <Card level={2} style={{ alignItems: 'center', gap: space.xs }}>
              <Eyebrow>Running for</Eyebrow>
              <Text variant="hero" color={colors.accentText} tabular>
                {formatStopwatch(secondsBetween(current.session.session.started_at, now))}
              </Text>
              <Text variant="small" color={colors.textMuted}>
                Started {formatClock(current.session.session.started_at)} ·{' '}
                {rateLabel(current.session.session)}
              </Text>
            </Card>
            <Card level={2} style={styles.amountRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow>Game time so far</Eyebrow>
                <Text variant="small" color={colors.textMuted}>
                  {formatDuration(current.session.priced.billedMinutes)} billable
                  {current.session.priced.minimumApplied ? ' · minimum charge' : ''}
                </Text>
              </View>
              <Money value={current.session.priced.amount} variant="title" color={colors.accentText} />
            </Card>
            {current.session.sale.total > 0 ? (
              <Card level={2} style={styles.amountRow}>
                <View style={{ flex: 1 }}>
                  <Eyebrow>Already on this bill</Eyebrow>
                </View>
                <Money value={current.session.sale.total} variant="heading" />
              </Card>
            ) : null}
            <Text variant="small" color={colors.textFaint}>
              Stopping puts the game time on {current.resource.label}&apos;s bill. Snacks for the
              same people go on that bill too; anyone else gets a separate sale from the Sale
              button.
            </Text>
          </View>
        ) : current ? (
          <View style={{ gap: space.lg }}>
            {current.resource.status === 'AVAILABLE' ? (
              <Card level={2} style={{ gap: space.md }}>
                <View style={{ gap: space.xs }}>
                  <Eyebrow>Rate</Eyebrow>
                  <Text variant="title">{rateLabelFor(db, current, period)}</Text>
                </View>
                <Segmented
                  options={[
                    { value: 'DAY', label: 'Day rate' },
                    { value: 'NIGHT', label: 'Night rate' },
                  ]}
                  value={period}
                  onChange={(next) => setPeriod(next as TariffPeriod)}
                />
                <Text variant="small" color={colors.textMuted}>
                  The timer starts the moment you tap Start, and the rate is locked to this
                  session. You can still change the amount when you stop it.
                </Text>
              </Card>
            ) : (
              <Card level={2} accentEdge={statusColors[current.resource.status]}>
                <Text variant="bodyStrong">
                  {current.resource.label} is {current.resource.status.toLowerCase().replace('_', ' ')}.
                </Text>
              </Card>
            )}

            {manageMode && canManage ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow>Table state</Eyebrow>
                <Segmented
                  options={[
                    { value: 'AVAILABLE', label: 'Available' },
                    { value: 'MAINTENANCE', label: 'Maintenance' },
                    { value: 'DISABLED', label: 'Disabled' },
                  ]}
                  value={current.resource.status === 'IN_USE' ? 'AVAILABLE' : current.resource.status}
                  onChange={(next) => void setStatus(next as ResourceStatus)}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <GameAmountSheet
        visible={!!stopping?.session}
        onClose={() => setStopping(null)}
        onConfirm={(amount) => void stop(amount)}
        busy={busy}
        mode="stop"
        resourceLabel={stopping?.resource.label ?? ''}
        metered={stopping?.session?.priced.amount ?? 0}
        minutes={stopping?.session?.priced.billedMinutes ?? 0}
        ratePerMinute={stopping?.session?.session.rate_per_minute ?? 0}
        period={stopping?.session?.session.period ?? 'DAY'}
      />
    </Screen>
  );
}

function rateLabelFor(
  db: ReturnType<typeof useDb>,
  view: ResourceView,
  period: TariffPeriod,
): string {
  const rule = resolvePricingRule(db.pricing_rules, view.gameType.id, view.resource.id, period);
  return rule ? rateLabel(rule) : `No ${period.toLowerCase()} price set`;
}

function ResourceTile({
  view,
  now,
  onPress,
}: {
  view: ResourceView;
  now: string;
  onPress: () => void;
}) {
  const { resource, session } = view;
  const tint = statusColors[resource.status];
  const busy = !!session;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${resource.label}, ${resource.status.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: busy ? colors.surfaceHigh : colors.surface,
          borderColor: busy ? colors.accent : colors.border,
          opacity: resource.status === 'DISABLED' ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.tileHead}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
          {resource.label}
        </Text>
        <Icon name={statusIcon(resource)} size={18} color={busy ? colors.accentText : colors.textFaint} />
      </View>

      {session ? (
        <>
          <Text variant="display" color={colors.accentText} tabular>
            {formatStopwatch(secondsBetween(session.session.started_at, now))}
          </Text>
          <View style={styles.tileFoot}>
            <Text variant="small" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
              {session.customer?.name ?? 'Walk-in'}
            </Text>
            <Money value={session.priced.amount} variant="bodyStrong" color={colors.accentText} />
          </View>
        </>
      ) : (
        <>
          <Text variant="display" color={colors.textFaint}>
            {resource.status === 'AVAILABLE' ? 'Free' : '—'}
          </Text>
          <Text variant="small" color={colors.textFaint}>
            {resource.status === 'AVAILABLE'
              ? 'Tap to start'
              : resource.status.toLowerCase().replace('_', ' ')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function statusIcon(resource: GameResource) {
  if (resource.status === 'IN_USE') return 'clock' as const;
  if (resource.status === 'MAINTENANCE') return 'alert' as const;
  if (resource.status === 'DISABLED') return 'lock' as const;
  return 'play' as const;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  tile: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: space.lg,
    gap: space.xs,
    minHeight: 132,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
