import { i18n, t } from '../lib/i18n';

export function formatDateTime(iso: string | null): string {
  if (!iso) return t('admin.never');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
