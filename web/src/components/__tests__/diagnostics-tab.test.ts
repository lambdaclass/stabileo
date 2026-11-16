import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { SolverDiagnostic } from '../../lib/engine/types';

const loose = (plate: string, nodes: string): SolverDiagnostic => ({
  source: 'model', severity: 'warning', code: 'PLATE_LOOSE_CORNER', message: 'plates.diag.looseCorner', objects: [{ kind: 'plate', id: 1 }], details: { plate, nodes },
});

vi.mock('../../lib/store/diagnostics-list', async (original) => ({
  ...(await original<typeof import('../../lib/store/diagnostics-list')>()),
  collectDiagnostics: () => [loose('M2', '118'), loose('M3', '119'), loose('L4', '17, 27')],
}));

const { default: ProDiagnosticsTab } = await import('../pro/ProDiagnosticsTab.svelte');
const { resultsStore, uiStore } = await import('../../lib/store');
const { setLocale } = await import('../../lib/i18n');
const { ensureLocale } = await import('../../lib/i18n/store.svelte');

const visible = (html: string) => html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ');

describe('PRO Diagnostics', () => {
  afterEach(() => { resultsStore.clear3D(); uiStore.analysisMode = '2d'; setLocale('en'); });

  it('says one message once with how many it covers, in the reader\'s language, without engine issue numbers', async () => {
    await ensureLocale('es');
    setLocale('es');
    uiStore.analysisMode = 'pro';
    resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [],
      structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'ENGINE' }] } as never);
    const html = render(ProDiagnosticsTab).body;
    expect(html.match(/data-testid="diag-group"/g)).toHaveLength(1);
    expect(html).toContain('data-count="3"');
    expect(html.match(/data-testid="diag-group-item"/g)).toHaveLength(3);
    expect(visible(html)).toContain('×3');
    expect(visible(html)).toContain('nodos: 17, 27');
    expect(visible(html)).not.toMatch(/\bnodes:/);
    expect(visible(html)).not.toContain('#762');
    expect(html).toContain('data-testid="diag-review-count" data-count="2"');
    expect(visible(html)).toContain('2 avisos para revisar (1 del modelo, 1 de los resultados)');
  });
});
