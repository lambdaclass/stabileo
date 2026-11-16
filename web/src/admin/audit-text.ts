import { t, tp } from '../lib/i18n';
import type { AuditEntry } from '../lib/api/admin';

const SETTING_LABEL: Record<string, string> = {
  user_login_enabled: 'admin.settings.userLogin',
  usage_telemetry_enabled: 'admin.settings.usageTelemetry',
  cloud_projects_enabled: 'admin.settings.cloudProjects',
  save_requires_account: 'admin.settings.saveRequiresAccount',
  cloud_projects_limit: 'admin.settings.projectLimit',
};

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function settingChange(key: string, value: unknown): string {
  const name = SETTING_LABEL[key] ? t(SETTING_LABEL[key]) : key;
  if (typeof value === 'boolean') return tp(value ? 'admin.audit.s.turnedOn' : 'admin.audit.s.turnedOff', { name });
  return tp('admin.audit.s.setTo', { name, value: text(value) });
}

/** One sentence for what an admin did, from the action and its recorded details. */
export function auditSentence(entry: AuditEntry): string {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'account.disable': return tp('admin.audit.s.disable', { email: text(d.email) });
    case 'account.enable': return tp('admin.audit.s.enable', { email: text(d.email) });
    case 'account.force_logout': return tp('admin.audit.s.forceLogout', { email: text(d.email), n: text(d.revoked ?? 0) });
    case 'allowlist.add': return tp('admin.audit.s.allowlistAdd', { email: text(d.email) });
    case 'allowlist.remove': return tp('admin.audit.s.allowlistRemove', { email: text(d.email) });
    case 'feedback.status':
      return tp('admin.audit.s.feedback', {
        status: t(`admin.feedback.status.${text(d.status)}`),
        excerpt: text(d.excerpt) || '…',
      });
    case 'settings.update':
      return Object.entries(d).map(([k, v]) => settingChange(k, v)).join(' · ');
    default:
      return `${entry.action} ${JSON.stringify(d)}`;
  }
}
