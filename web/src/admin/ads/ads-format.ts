import { i18n, t, tp } from '../../lib/i18n';
import { metricLabel } from '../metric-labels';

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: n < 10 && n % 1 !== 0 ? 1 : 0 }).format(n);
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: n < 0.1 ? 1 : 0 }).format(n);
}

function known(key: string, fallback: string): string {
  const text = t(key);
  return text === key ? fallback : text;
}

export function channelLabel(channel: string): string {
  return known(`admin.ads.channel.${channel}`, channel);
}

export function triggerLabel(trigger: string): string {
  const [where, detail] = trigger.split('.', 2);
  if (where === 'gate' && detail) return tp('admin.ads.trigger.gate', { action: metricLabel('gate_actions', detail) });
  if (where === 'register' && detail) return tp('admin.ads.trigger.register', { place: known(`admin.ads.place.${detail}`, detail) });
  return known(`admin.ads.trigger.${trigger}`, trigger);
}
