import { i18n } from '../../lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/** An instant as a `datetime-local` value, in this computer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value read in this computer's time zone, as ISO; null when empty or unreadable. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(i18n.locale || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** `h:mm:ss` from an hour up, `mm:ss` below it. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export type AssignmentStatus = 'upcoming' | 'open' | 'closed';

export function assignmentStatus(a: { opens_at: string; closes_at: string | null }, now = Date.now()): AssignmentStatus {
  if (now < Date.parse(a.opens_at)) return 'upcoming';
  if (a.closes_at && now >= Date.parse(a.closes_at)) return 'closed';
  return 'open';
}
