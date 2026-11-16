import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import OutdatedNotice from '../pro/design/OutdatedNotice.svelte';
import RebarWorkspaceHeader from '../pro/design/RebarWorkspaceHeader.svelte';

const registry = import.meta.glob('../../lib/provenance/under-audit.ts');
async function audit() {
  const load = Object.values(registry)[0];
  expect(load).toBeTypeOf('function');
  return await load() as Record<string, any>;
}
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('known wrong result: #2199 every audited result has the permanent linked notice', async () => {
  const { AUDIT_FEATURES, UNDER_AUDIT_URL } = await audit();
  for (const [feature, covered] of Object.entries(AUDIT_FEATURES)) {
    const html = render(OutdatedNotice, { props: { audit: [feature] } as never }).body;
    expect(html.includes('data-testid="under-audit-notice"'), feature).toBe(covered);
    if (covered) {
      expect(html).toContain('Under audit: an internal review found errors in automatic load generation and concrete design, and fixes are still in progress. Check these results independently before using them in a design.');
      expect(html).toContain(`href="${UNDER_AUDIT_URL}"`);
      expect(html).not.toMatch(/<button|<details|dismiss|aria-expanded/);
    }
  }
  expect(render(OutdatedNotice, { props: { audit: [] } as never }).body).not.toContain('under-audit-notice');
});

it('known wrong result: #2199 generated loads retain notice eligibility after applying and reopening', async () => {
  const { modelAuditFeatures, LOAD_AUDIT_FEATURES } = await audit();
  for (const [type, feature] of Object.entries(LOAD_AUDIT_FEATURES)) {
    const model = { loads: [{ data: { generatedBy: 'cirsoc', caseId: 7 } }], loadCases: [{ id: 7, type }], groups: new Map() };
    expect(modelAuditFeatures(model)).toEqual([feature]);
    expect(modelAuditFeatures({ ...model, loads: [{ data: { caseId: 7 } }] })).toEqual([]);
    expect(modelAuditFeatures(JSON.parse(JSON.stringify({ ...model, groups: undefined })))).toEqual([feature]);
  }
  expect(modelAuditFeatures({ loads: [], designData: { loadBasis: {} }, loadCases: [{ id: 7, type: 'W' }] })).toEqual(['wind']);
  expect(modelAuditFeatures({ loads: [{ data: { generatedBy: 'stair:1', caseId: 7 } }], loadCases: [{ id: 7, type: 'D' }] })).toEqual([]);
  expect(modelAuditFeatures({ loads: [], groups: new Map([[4, { kind: 'floorLoad' }]]) })).toEqual(['floor-regions']);
  expect(modelAuditFeatures({ loads: [{ data: { fromDef: 4 } }], groups: new Map([[4, { kind: 'curveLoad' }]]) })).toEqual([]);
});

it('known wrong result: #2199 every generator and design view requires a registry decision', async () => {
  const { LOAD_AUDIT_FEATURES, AUTO_LOAD_AUDIT_FEATURES, DESIGN_AUDIT_FEATURES, MEMBER_AUDIT_FEATURES } = await audit();
  const literals = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const planned = source('../../lib/engine/loads/load-plan.ts').match(/export interface PlannedCase\s*\{[\s\S]*?\btype:\s*([^;]+);/)![1];
  const focus = source('../pro/auto-loads-sections.ts').match(/export type AutoLoadFocus\s*=\s*([^;]+);/)![1];
  const desk = source('../../lib/store/design-desk-ui.svelte.ts').match(/export type DeskTab\s*=\s*([^;]+);/)![1];
  expect(Object.keys(LOAD_AUDIT_FEATURES).sort()).toEqual(literals(planned));
  expect(Object.keys(AUTO_LOAD_AUDIT_FEATURES).sort()).toEqual(literals(focus));
  expect(Object.keys(DESIGN_AUDIT_FEATURES).sort()).toEqual(literals(desk));
  const member = source('../../lib/report/memoria/types.ts').match(/export type MemberFamily\s*=\s*([^;]+);/)![1];
  expect(Object.keys(MEMBER_AUDIT_FEATURES).sort()).toEqual(literals(member));
  for (const key of ['wind', 'snow', 'dead', 'live', 'roof', 'seismic']) expect(AUTO_LOAD_AUDIT_FEATURES[key]).toBeTruthy();
  for (const key of ['list', 'frame', 'column', 'wall', 'slab', 'seismic', 'detailing', 'sheets']) expect(DESIGN_AUDIT_FEATURES[key]).toBeTruthy();
  for (const key of ['steel', 'connections', 'budget', 'collab', 'arch', 'site']) expect(DESIGN_AUDIT_FEATURES[key]).toBeNull();
});

it('known wrong result: #2199 the shared notice reaches generated loads and independent RC result surfaces', () => {
  for (const path of [
    '../../App.svelte', '../pro/ProAutoLoadsDialog.svelte', '../pro/ProFloorLoadSection.svelte',
    '../pro/ProDesignTab.svelte', '../pro/desk/DesignDesk.svelte', '../pro/desk/DeskInspector.svelte', '../pro/design/RebarWorkspace.svelte',
    '../pro/design/SheetsPanel.svelte', '../pro/design/MemoriaDialog.svelte', '../pro/ProOtherCodesPanel.svelte', '../pro/desk/codes/ForeignCodesEditor.svelte',
  ]) expect(/<OutdatedNotice[^>]*\baudit=/.test(source(path)), path).toBe(true);
});

it('known wrong result: #2199 the audit notice is translated in every shipped locale including Hungarian', async () => {
  const dictionaries = import.meta.glob('../../lib/i18n/locales/{en,es,pt,de,fr,tr,hu}.ts');
  expect(Object.keys(dictionaries)).toHaveLength(7);
  const texts = new Set<string>();
  for (const load of Object.values(dictionaries)) {
    const { default: dictionary } = await load() as { default: Record<string, string> };
    expect(dictionary['underAudit.text']?.length).toBeGreaterThan(100);
    expect(dictionary['underAudit.details']?.length).toBeGreaterThan(3);
    texts.add(dictionary['underAudit.text']);
  }
  expect(texts.size).toBe(7);
});


it.skip('known wrong result: #2228 the cage header owns the audit notice within the component ceiling', () => {
  const html = render(RebarWorkspaceHeader, { props: {
    readiness: null, revision: null, summary: null, fmt: String, railOpen: false,
    canGoBack: false, onBack: () => {}, onFitView: () => {}, onClose: () => {},
  } }).body;
  expect(html).toContain('data-testid="under-audit-notice"');
  expect(html).toContain('Check these results independently');
  const workspace = source('../pro/design/RebarWorkspace.svelte');
  expect(workspace).toContain('<RebarWorkspaceHeader');
  expect(workspace).not.toContain('<OutdatedNotice');
  expect(workspace.split('\n').length).toBeLessThan(600);
});
