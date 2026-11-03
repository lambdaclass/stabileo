import { i18n, t, tp } from '../../lib/i18n';
import type { Display } from '../../lib/api/marketing-admin';
import { metricLabel } from '../metric-labels';

/** "Not measured" is never zero: a source that does not report a number shows a dash. */
export function count(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: n < 10 && n % 1 !== 0 ? 1 : 0 }).format(n);
}

export function money(n: number | null | undefined, display: Display): string {
  if (n === null || n === undefined) return '—';
  const digits = display === 'USD' && Math.abs(n) < 100 ? 2 : 0;
  return `${display === 'USD' ? 'US$' : '$'} ${new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}`;
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: n < 0.1 ? 1 : 0 }).format(n);
}

/** Change against the previous period, or null when there is nothing to compare with. */
export function delta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || !previous) return null;
  return (current - previous) / previous;
}

function known(key: string, fallback: string): string {
  const text = t(key);
  return text === key ? fallback : text;
}

export function channelLabel(channel: string): string {
  return known(`admin.ads.channel.${channel}`, channel);
}

export function objectiveLabel(objective: string | null): string {
  return objective ? known(`admin.ads.objective.${objective}`, objective) : '—';
}

export function goalLabel(goal: string | null): string {
  return goal ? known(`admin.ads.goal.${goal}`, goal) : t('admin.ads.goal.unknown');
}

export function statusLabel(status: string | null): string {
  return status ? known(`admin.ads.status.${status}`, status) : '—';
}

export function resultLabel(type: string | null): string {
  return type ? known(`admin.ads.result.${type.replace(/[^\w]+/g, '_')}`, type) : '—';
}

/** What asked for an account: a gate (`gate.save`), the register page (`register.hero`) or a button. */
export function triggerLabel(trigger: string): string {
  const [where, detail] = trigger.split('.', 2);
  if (where === 'gate' && detail) return tp('admin.ads.trigger.gate', { action: metricLabel('gate_actions', detail) });
  if (where === 'register' && detail) return tp('admin.ads.trigger.register', { place: known(`admin.ads.place.${detail}`, detail) });
  return known(`admin.ads.trigger.${trigger}`, trigger);
}
