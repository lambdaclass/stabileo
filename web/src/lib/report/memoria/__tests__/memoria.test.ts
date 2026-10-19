/**
 * The memoria de cálculo: every check row carries its clause and the inequality it checks, from
 * every producer; a ficha prints what must hold, the ratio, the values and the working; the
 * summary numbers what does not apply; chapters are numbered as printed; steel is never stated as
 * satisfying a code; and every text the document asks for exists in the three languages.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { concreteCheckRows, steelCheckRows } from '../../../engine/design/check-rows';
import { footingCheckRows, jointShearCheckRows, seismicJointCheckRows, seismicMemberCheckRows, slabCheckRows, wallCheckRows } from '../../../engine/design/check-rows-families';
import { familySummary, renderFicha, renderMemoriaHtml, type RenderContext } from '../render';
import { quantitiesBy, memberFormwork } from '../quantities';
import { ALL_CHAPTERS, CHAPTERS, MEMBER_FAMILIES, type ChapterId, type MemoriaInput } from '../types';
import type { CheckRow } from '../../../design-contract';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

const LIMITING = ['flexure', 'shear', 'axialFlexure', 'biaxial', 'torsion', 'barFit', 'barSpacing', 'anchorage', 'minSteel', 'maxSteel', 'tieSpacing', 'congestion', 'cover'] as const;
const check = (limiting: string, extra = {}) => ({ category: `c-${limiting}`, demandCategory: null, demand: 80, capacity: 100, ratio: 0.8, status: 'ok', unit: 'kN·m', method: 'capacity', tuplesChecked: 1, description: '4 Ø16 → φMn = 100 kN·m', comboName: 'U1', stationX: 2.4, limiting, ...extra });

function everyRow(): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const el of ['beam', 'column', 'wall'] as const) {
    rows.push(...concreteCheckRows({ elementId: 1, elementType: el, hasProvided: true, overallStatus: 'ok', worstUtilization: 0.8, checkedAxes: [], strengthCheckCount: 1,
      checks: [...LIMITING.map((l) => check(l)), check('unsupportedCheck', { description: 'Table 9.7.6.2.2 not evaluated — prestressing', ratio: Infinity })] } as never));
  }
  const step = (x: object) => ({ steps: ['a = 1'], status: 'ok', ratio: 0.5, ...x });
  rows.push(...steelCheckRows({
    tension: step({ Pu: 10, phiPn: 100 }), compression: step({ Pu: -20, phiPn: 90 }), flexureZ: step({ Mu: 30, phiMn: 60 }), flexureY: step({ Mu: 5, phiMn: 20 }),
    shear: step({ Vu: 10, phiVn: 80 }), shearWeak: step({ Vu: 2, phiVn: 50 }), interaction: step({ equation: 'H1-1a' }), governingCombos: undefined,
  } as never));
  const shear = { vu: 10, phiVc: 40, utilization: 0.25, ok: true, memo: 'Vc', refs: [] };
  rows.push(...slabCheckRows({ panelId: 'L1', behaviour: 'twoWay', aspect: 1.2, layers: [{ face: 'bottom', direction: 'x', diameterMm: 8, spacing: 0.2, asProvided: 2.5e-4, asRequired: 2e-4, minimumGoverns: false, refs: [] }], shear, memo: [], refs: [], unsupported: [],
    panel: { check: { strips: [{ dir: 'x', face: 'bottom', kind: 'middle', lo: 0, hi: 2, need: 2e-4, given: 2.5e-4, utilization: 0.8, at: 1 }] } } } as never));
  rows.push(...wallCheckRows({ wallId: 'T1', shear: { acv: 0.4, vu: 100, phiVn: 300, vnLimit: 900, utilization: 0.33, ok: true, memo: 'm', refs: [] },
    axialFlexure: { pu: 500, mu: 200, pn0: 4000, mn: 600, phiMn: 540, utilization: 0.37, ok: true, memo: 'm', refs: [] }, minThickness: 0.15, thicknessOk: true,
    checks: [{ category: 'out of plane', utilization: 0.5, description: 'd', ok: true }] } as never));
  rows.push(...footingCheckRows({ footingId: 1, name: 'Z1', governingCombination: 'U2', unsupported: [], assumptions: [],
    check: { status: 'OK', bearing: { status: 'OK', qMax: 150, qMin: 90, eB: 0.1, eL: 0, utilization: 0.75, memo: [], refs: [] },
      oneWayShear: { status: 'OK', Vu: 100, phiVc: 300, utilization: 0.33, cantilever: 0.6, memo: [], refs: [] },
      punching: { status: 'OK', vu: 0.5, phiVc: 1.1, utilization: 0.45, memo: [], refs: [] }, Mu: 60 },
    mat: { x: { Mu: 60, d: 0.42, diameterMm: 12, asGoverning: 8e-4, asProvided: 9e-4, barCount: 8, governingClause: '13.3.3.1' }, y: { Mu: 55, d: 0.41, diameterMm: 12, asGoverning: 7e-4, asProvided: 9e-4, barCount: 8, governingClause: '' } } } as never));
  rows.push(...jointShearCheckRows({ nodeId: 3, columnId: 2, direction: 'X', combo: 'U1', check: { status: 'OK', Vu: 200, phiVn: 500, utilization: 0.4, refs: [] } } as never));
  rows.push(...seismicMemberCheckRows({ id: 1, kind: 'beam', role: 'primary', shear: { ve: 100, phiVn: 150, utilization: 0.67, vcZero: true }, ok: true, issues: [] } as never));
  rows.push(...seismicMemberCheckRows({ id: 2, kind: 'column', role: 'primary', ok: false, issues: ['seisDes.issue.x'] } as never));
  rows.push(...seismicJointCheckRows({ nodeId: 3, direction: 'X', columns: [], beams: [], ok: true,
    strongColumn: { sumColumns: 300, sumBeams: 200, required: 240, utilization: 0.8, ok: true, roof: false }, shear: { T: 500, vj: 400, phiVn: 900, utilization: 0.44, confinement: 'interior' } } as never));
  return rows;
}

const tr = (dict: Record<string, string>) => (k: string, p?: Record<string, string | number>) => (dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? `{${n}}`));
const ctx = (dict: Record<string, string> = en): RenderContext => ({ tr: tr(dict), msg: (m) => m.key, fmt: (v, d) => v.toFixed(d) });

describe('check rows', () => {
  const rows = everyRow();

  it('every row names its clause and the inequality it checks', () => {
    expect(rows.length).toBeGreaterThan(60);
    const missing = rows.filter((r) => !r.clause || !r.formula).map((r) => `${r.code} ${r.title}`);
    expect(missing).toEqual([]);
  });

  it('concrete rows read their clause from the class of the check, by element', () => {
    const beam = concreteCheckRows({ elementId: 1, elementType: 'beam', checks: [check('minSteel'), check('maxSteel')] } as never);
    const col = concreteCheckRows({ elementId: 1, elementType: 'column', checks: [check('minSteel')] } as never);
    expect(beam.map((r) => r.clause)).toEqual(['9.6.1.2', '9.3.3.1']);
    expect(col[0]!.clause).toBe('10.6.1.1');
    // The two sides of the inequality are among the values that went in.
    const flex = concreteCheckRows({ elementId: 1, elementType: 'beam', checks: [check('flexure')] } as never)[0]!;
    expect(flex.formula).toBe('Mu ≤ φ·Mn');
    expect(flex.inputs.map((i) => i.symbol)).toEqual(['Mu', 'φMn']);
    expect(flex.location).toBe('x = 2.40 m');
  });

  it('a provision this app does not evaluate cites it and is unsupported, never a pass', () => {
    const r = concreteCheckRows({ elementId: 1, elementType: 'beam', checks: [check('unsupportedCheck', { description: 'Table 9.7.6.2.2 not evaluated — prestressing' })] } as never)[0]!;
    expect(r.clause).toBe('Table 9.7.6.2.2');
    expect(r.status).toBe('unsupported');
  });

  it('every row title has its words in es, en and pt', () => {
    for (const dict of [es, en, pt] as Array<Record<string, string>>) {
      const missing = [...new Set(rows.map((r) => r.titleKey).filter((k): k is string => !!k && !(k in dict)))];
      expect(missing).toEqual([]);
    }
  });
});

const input = (): MemoriaInput => ({
  project: { name: 'Edificio <A>', date: '2026-10-11', revision: 'B' },
  codes: ['CIRSOC 201 2025'],
  scope: [{ code: 'cirsoc-201', feature: 'capability.beamFlexure', offered: true, clauses: ['22.3'] }, { code: 'cirsoc-301', feature: 'capability.steelFlexure', offered: false, clauses: ['F.2'], limitation: 'experimental' }],
  hypotheses: { analysis: ['linear'], stiffness: [{ label: 'Columna', a: 1, iy: 0.7, iz: 0.7, j: 1, count: 4 }], diaphragms: [], shells: [], supports: [{ kind: 'fixed3d', count: 4 }] },
  actions: { cases: [{ name: 'D', type: 'D', loads: 3 }], combinations: [{ name: 'U1', expression: '1.2·D + 1.6·L' }] },
  global: { modal: [{ mode: 1, period: 0.5, mx: 0.8, my: 0, cumX: 0.8, cumY: 0 }] },
  elements: [
    { id: 'e1', family: 'beam', name: 'V1', data: [], notes: [], rows: concreteCheckRows({ elementId: 1, elementType: 'beam', checks: [check('flexure'), check('shear', { ratio: 1.2, status: 'fail' })] } as never) },
    { id: 'e2', family: 'beam', name: 'V2', data: [], notes: [], rows: concreteCheckRows({ elementId: 2, elementType: 'beam', checks: [check('flexure')] } as never) },
    { id: 's3', family: 'steel', name: 'P3', data: [], notes: [], rows: [{ code: 'cirsoc-301', edition: '2018', clause: 'F.2', title: 'Flexure', titleKey: 'check.steel.F.2', formula: 'Mu ≤ φb·Mn', inputs: [], ratio: 0.5, status: 'ok' }] },
  ],
  notices: { automatic: [], manual: ['V2 by hand'] },
  quantities: { byLevel: [], byType: [], rebar: [{ diameter: 12, length: 100, mass: 88.8 }], steel: [], connections: [] },
});

describe('the document', () => {
  it('a ficha: title with its clause, what must hold, η with its state, the values and where it governs', () => {
    const r = concreteCheckRows({ elementId: 1, elementType: 'beam', checks: [check('flexure')] } as never)[0]!;
    const h = renderFicha(r, ctx());
    expect(h).toContain('Flexural strength');
    expect(h).toContain('(CIRSOC 201-2025, 22.3)');
    expect(h).toContain('It must satisfy:');
    expect(h).toContain('Mu ≤ φ·Mn');
    expect(h).toContain('η = <b>0.800</b> ✓');
    expect(h).toContain('x = 2.40 m');
    expect(h).toContain('U1');
  });

  it('the summary puts N.P. where a check does not apply and numbers why', () => {
    const els = input().elements.filter((e) => e.family === 'beam');
    const h = familySummary(els, ctx(), 'beam');
    expect(h).toContain('N.P.<sup>1</sup>');
    expect(h).toMatch(/<ol class="np"><li>Shear strength: does not apply/);
    expect(h).toContain('Does not satisfy');
  });

  it('steel is within the limit or over it, never satisfying', () => {
    const h = familySummary(input().elements.filter((e) => e.family === 'steel'), ctx(), 'steel');
    expect(h).toContain('Within the limit');
    expect(h).not.toMatch(/Satisfies|verified|verificad/i);
  });

  it('chapters are numbered as printed and leaving one out renumbers the rest', () => {
    const all = renderMemoriaHtml(input(), new Set(ALL_CHAPTERS), ctx());
    const titles = [...all.matchAll(/<h2>(\d+)\. ([^<]+)<\/h2>/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(titles[0]).toBe('1 Scope and exclusions');
    const less = new Set<ChapterId>(ALL_CHAPTERS.filter((c) => c !== 'scope'));
    const h2 = renderMemoriaHtml(input(), less, ctx());
    expect(h2).toMatch(/<h2>1\. Modeling assumptions<\/h2>/);
    // Escaped, not injected.
    expect(all).toContain('Edificio &lt;A&gt;');
    expect(all).not.toContain('Edificio <A>');
  });

  it('a part of a chapter can be left out on its own', () => {
    const chosen = new Set<ChapterId>(ALL_CHAPTERS.filter((c) => c !== 'members.steel'));
    const h = renderMemoriaHtml(input(), chosen, ctx());
    expect(h).toContain('<h4>V1');
    expect(h).not.toContain('<h4>P3');
  });

  it('the actions say so when no plan justifies the loads', () => {
    expect(renderMemoriaHtml(input(), new Set(ALL_CHAPTERS), ctx())).toContain(en['memo.act.noBasis']!);
  });

  it('every text the document and the catalog use exists in es, en and pt', () => {
    const src = readFileSync(new URL('../render.ts', import.meta.url), 'utf8') + readFileSync(new URL('../../../store/memoria-inputs.ts', import.meta.url), 'utf8')
      + readFileSync(new URL('../../../../components/pro/design/MemoriaDialog.svelte', import.meta.url), 'utf8');
    const keys = new Set([...src.matchAll(/\bt?r?\('((?:memo|check|sheet)\.[\w.]+)'/g)].map((m) => m[1]!));
    for (const k of Object.keys(CHAPTERS)) keys.add(`memo.ch.${k}`);
    for (const [k, parts] of Object.entries(CHAPTERS)) if (k !== 'members') for (const p of parts) keys.add(`memo.part.${k}.${p}`);
    for (const f of MEMBER_FAMILIES) keys.add(`memo.fam.${f}`);
    for (const s of ['ok', 'fail', 'none', 'steelOk', 'steelFail']) keys.add(`memo.state.${s}`);
    for (const o of ['project', 'code', 'derived', 'assumed', 'override']) keys.add(`memo.act.origin.${o}`);
    for (const k of ['beam', 'column', 'wall', 'slab', 'footing', 'steel-beam', 'steel-column']) keys.add(`memo.kind.${k}`);
    for (const [name, dict] of [['es', es], ['en', en], ['pt', pt]] as const) {
      expect([...keys].filter((k) => !(k in (dict as Record<string, string>))), name).toEqual([]);
    }
  });
});

describe('quantities', () => {
  it('add up by level in level order and by type, measured by the stated rules', () => {
    const q = quantitiesBy([
      { kind: 'beam', level: 'N2', concrete: 1, formwork: 5, steel: 0 },
      { kind: 'beam', level: 'N1', concrete: 2, formwork: 6, steel: 0 },
      { kind: 'rebar', level: 'N1', concrete: 0, formwork: 0, steel: 120 },
    ], ['N1', 'N2']);
    expect(q.byLevel).toEqual([{ level: 'N1', concrete: 2, formwork: 6, steel: 120 }, { level: 'N2', concrete: 1, formwork: 5, steel: 0 }]);
    expect(q.byType.find((r) => r.kind === 'beam')).toEqual({ kind: 'beam', concrete: 3, formwork: 11, steel: 0, count: 2 });
    // A 20 × 50 beam 4 m long: soffit and two sides, 1.2 × 4.
    expect(memberFormwork('beam', 0.2, 0.5, 4)).toBeCloseTo(4.8, 12);
    expect(memberFormwork('column', 0.3, 0.3, 3)).toBeCloseTo(3.6, 12);
  });
});
