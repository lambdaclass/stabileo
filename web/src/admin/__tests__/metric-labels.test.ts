import { describe, it, expect, beforeEach } from 'vitest';
import { metricLabel } from '../metric-labels';
import { auditSentence } from '../audit-text';
import { setLocale } from '../../lib/i18n';
import type { AuditEntry } from '../../lib/api/admin';

beforeEach(() => {
  setLocale('es');
});

const entry = (action: string, details: Record<string, unknown>): AuditEntry =>
  ({ id: '1', action, target_type: null, target_id: null, details, admin: null, inserted_at: '2026-10-28T12:00:00Z' });

describe('metric labels', () => {
  it('names what the app sends in words a reader recognises', () => {
    expect(metricLabel('diagrams', 'moment')).toBe('Momento');
    expect(metricLabel('diagrams', 'deformed')).toBe('Deformada');
    expect(metricLabel('modes', 'basic')).toBe('Básico');
    expect(metricLabel('solve_outcomes', 'ok')).toBe('Sin errores');
    expect(metricLabel('solve_dims', 'true')).toBe('3D');
    expect(metricLabel('exports', 'report-pdf')).toBe('Informe PDF');
    expect(metricLabel('locales', 'pt')).not.toBe('pt');
    expect(metricLabel('advanced', 'pdelta')).not.toBe('pdelta');
  });

  it('falls back to a readable form of an unknown value, and keeps versions as sent', () => {
    expect(metricLabel('examples', 'some-new-example')).toBe('Some new example');
    expect(metricLabel('tools', 'brandNewTool')).toBe('Brand new tool');
    expect(metricLabel('versions', '0.3.0')).toBe('0.3.0');
  });
});

describe('audit sentences', () => {
  it('says what an admin did in one sentence', () => {
    expect(auditSentence(entry('account.disable', { email: 'ada@example.com' }))).toBe('Deshabilitó la cuenta ada@example.com');
    expect(auditSentence(entry('allowlist.add', { email: 'bo@lambdaclass.com' }))).toBe('Dio acceso al admin a bo@lambdaclass.com');
    expect(auditSentence(entry('settings.update', { save_requires_account: true, cloud_projects_limit: 3 })))
      .toBe('Prendió «Guardar y exportar con cuenta» · Cambió «Proyectos por cuenta» a 3');
    expect(auditSentence(entry('feedback.status', { status: 'done', excerpt: 'Exportar a IFC' })))
      .toBe('Marcó como «Resuelto» el comentario «Exportar a IFC»');
  });

  it('shows an action it does not know as it was recorded', () => {
    expect(auditSentence(entry('project.purge', { n: 2 }))).toBe('project.purge {"n":2}');
  });
});
