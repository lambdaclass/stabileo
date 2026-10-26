/**
 * The construction detail catalogue: every family there, every detail drawn with the project's
 * values and its own code, title and note in the three languages, the numbers on a detail the
 * ones the code gives for that project, and the characteristics tables filled without blanks.
 */
import { describe, it, expect } from 'vitest';
import { DETAILS, DETAIL_FAMILIES, defaultChoices, detailPreviewSvg, drawDetails, familyDetails, placeDetails } from '../catalog';
import { barLengths, beamHoopSpacing, columnConfinement, TYPICAL, type DetailValues } from '../values';
import { teAt } from '../../../i18n/engine-text';
import type { Primitive } from '../../primitives';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

const tr = (locale: string) => (key: string, params?: Record<string, string | number>) => teAt({ key, ...(params ? { params } : {}) }, locale);
const fmt = (v: number, d: number) => v.toFixed(d);
const texts = (ps: readonly Primitive[]) => ps.flatMap((p) => (p.kind === 'text' ? [p.text] : p.kind === 'dimension' && p.text ? [p.text] : []));
const finite = (p: Primitive) => JSON.stringify(p).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/g)!.every((n) => Number.isFinite(Number(n))) && !/null|NaN|Infinity/.test(JSON.stringify(p));

/** A project unlike the typical one: seismic, H-30, larger members and other diameters. */
const project: DetailValues = {
  ...TYPICAL, fc: 30, fy: 420, concrete: 'H-30', seismic: true,
  cover: { slab: 20, beam: 30, column: 35, wall: 25, footing: 60, stair: 20 },
  exposure: { slab: 'interior', beam: 'interior', column: 'exterior', wall: 'exterior', footing: 'ground', stair: 'interior' },
  bars: { slab: [10, 8], beam: [20, 16], column: [20, 25], wall: [12, 10], footing: [16], stair: [12, 8] },
  ties: { slab: 8, beam: 10, column: 10, wall: 8, footing: 10, stair: 8 },
  size: { beam: { b: 300, h: 650 }, column: { b: 500, h: 500 }, slab: 180, wall: 250, footing: 700, stair: 160, riser: 170, tread: 290 },
  typical: ['stair'],
};

describe('the detail catalogue', () => {
  it('holds every family asked for, joints with and without earthquake, each detail with its own code', () => {
    for (const f of DETAIL_FAMILIES) expect(familyDetails(f).length, f).toBeGreaterThan(0);
    expect(new Set(DETAILS.map((d) => d.id)).size).toBe(DETAILS.length);
    expect(new Set(DETAILS.map((d) => d.code)).size).toBe(DETAILS.length);
    const joints = familyDetails('joints');
    expect(joints.some((d) => d.seismic)).toBe(true);
    expect(joints.some((d) => !d.seismic)).toBe(true);
    // A seismic variant for beams, columns and walls too.
    for (const f of ['beams', 'columns', 'walls'] as const) expect(familyDetails(f).some((d) => d.seismic), f).toBe(true);
    // One characteristics table per kind of element, besides the general ones.
    for (const k of ['slab', 'beam', 'column', 'wall', 'footing', 'stair']) expect(DETAILS.some((d) => d.id === `chars-${k}`), k).toBe(true);
    expect(DETAILS.length).toBeGreaterThanOrEqual(60);
  });

  it('draws every detail, with the typical values and with a project, in the three languages', () => {
    for (const locale of ['es', 'en', 'pt']) for (const v of [TYPICAL, project]) {
      const t = tr(locale);
      for (const d of DETAILS) {
        const r = d.render(v, t, fmt), dr = r.drawing;
        expect(dr.primitives.length, `${d.id} ${locale}`).toBeGreaterThan(3);
        expect(dr.width > 0 && dr.height > 0, `${d.id} size`).toBe(true);
        expect(dr.primitives.every(finite), `${d.id} finite`).toBe(true);
        expect(dr.title.startsWith(`${d.code} · `), d.id).toBe(true);
        // Every text resolved: no key left on the sheet, and every placeholder filled.
        const all = [dr.title, r.note, ...texts(dr.primitives)];
        expect(all.filter((s) => /plan\.det\.|plan\.detail\.|\{[a-zA-Z]+\}/.test(s)), `${d.id} ${locale}`).toEqual([]);
        expect(detailPreviewSvg(dr)).toMatch(/^<svg /);
      }
    }
  });

  it('keeps es, en and pt in step for every catalogue key', () => {
    const keys = (o: Record<string, string>) => Object.keys(o).filter((k) => k.startsWith('plan.det.') || k.startsWith('sheet.ui.det.')).sort();
    expect(keys(en)).toEqual(keys(es));
    expect(keys(pt)).toEqual(keys(es));
    for (const d of DETAILS) for (const s of ['t', 'n']) expect(es[`plan.det.${d.id}.${s}`], `${d.id}.${s}`).toBeTruthy();
  });

  it('writes on each detail the lengths the code gives for this project', () => {
    const t = tr('es'), get = (id: string, v = project) => drawDetails([{ id, target: 'details' }], v, t, fmt)[0]!;
    const L20 = barLengths(project, 20);
    expect(texts(get('lap').primitives)).toContain(`lst = ${L20.lap}`);
    expect(texts(get('lap').primitives)).toContain(`lst,sup = ${L20.lapTop}`);
    expect(texts(get('joint-exterior-seismic').primitives)).toContain(`≥ ldh = ${L20.ldhSeismic}`);
    expect(texts(get('joint-exterior').primitives)).toContain(`≥ ldh = ${L20.ldh}`);
    const cf = columnConfinement(project, 2800);
    expect(texts(get('column-seismic').primitives)).toContain(`lo = ${cf.lo}`);
    expect(texts(get('beam-seismic').primitives)).toContain(`s = ${beamHoopSpacing(project)}`);
    // Another bar, other numbers: Ø16 in the typical project laps shorter than Ø20 at H-30.
    expect(texts(get('lap', TYPICAL).primitives)).toContain(`lst = ${barLengths(TYPICAL, 16).lap}`);
    expect(barLengths(TYPICAL, 16).lap).not.toBe(L20.lap);
    // The seismic hook of §18.8.5.1 for Ø20 at f'c = 30: fy·db / (5,4·√f'c) = 284, floored by 8 db = 160 → 290 rounded up.
    expect(L20.ldhSeismic).toBe(290);
    // §18.7.5.1: lo = max(500, 2800/6, 450) = 500; so = min(500/4, 6·20, 100 + (350 − 350)/3) = 100.
    expect(cf).toEqual({ lo: 500, so: 100 });
  });

  it('fills the characteristics tables from the project, a kind with nothing designed saying so', () => {
    const t = tr('es');
    const anchor = texts(drawDetails([{ id: 'chars-anchorage', target: 'notes' }], project, t, fmt)[0]!.primitives);
    for (const d of [8, 10, 12, 16, 20, 25]) expect(anchor, `Ø${d}`).toContain(String(d));
    expect(anchor).toContain(String(barLengths(project, 25).lap));
    expect(anchor).toContain(t('plan.det.c.ldhSeismic'));
    const mats = texts(drawDetails([{ id: 'chars-materials', target: 'notes' }], project, t, fmt)[0]!.primitives);
    expect(mats).toContain("H-30 (f'c = 30 MPa)");
    expect(mats).toContain(t('plan.det.exp.ground'));
    const stair = texts(drawDetails([{ id: 'chars-stair', target: 'stairs' }], project, t, fmt)[0]!.primitives);
    expect(stair).toContain(t('plan.det.c.typical'));
    const beam = texts(drawDetails([{ id: 'chars-beam', target: 'beams' }], project, t, fmt)[0]!.primitives);
    expect(beam).not.toContain(t('plan.det.c.typical'));
    expect(beam.some((s) => s.includes('30 mm'))).toBe(true);
    // No empty cell in a characteristics table: every row of every table has its values.
    const v = { ...project, exposure: undefined };
    const covers = texts(drawDetails([{ id: 'chars-covers', target: 'notes' }], v, t, fmt)[0]!.primitives);
    expect(covers.filter((s) => s === t('plan.det.c.notStated')).length).toBe(6);
  });

  it('places each detail on its kind’s first entry, else on the details sheet, and lists the ones with no sheet', () => {
    const choices = [{ id: 'beam-seismic', target: 'beams' }, { id: 'raft', target: 'foundations' }, { id: 'hooks', target: 'details' }, { id: 'gone', target: 'details' }];
    const a = placeDetails(choices, [{ id: 'b1', kind: 'beams' }, { id: 'b2', kind: 'beams' }, { id: 'det', kind: 'details' }]);
    expect(a.byEntry.get('b1')!.map((c) => c.id)).toEqual(['beam-seismic']);
    expect(a.byEntry.get('b2')).toBeUndefined();
    expect(a.byEntry.get('det')!.map((c) => c.id)).toEqual(['raft', 'hooks']);
    const b = placeDetails(choices, [{ id: 'b1', kind: 'beams' }]);
    expect(b.unplaced.map((c) => c.id)).toEqual(['raft', 'hooks']);
    // The defaults: the basic details and the anchorage table; the seismic variants for a seismic project.
    expect(defaultChoices(false).map((c) => c.id)).toContain('joint');
    expect(defaultChoices(true).map((c) => c.id)).toEqual(expect.arrayContaining(['joint-interior-seismic', 'beam-seismic', 'column-seismic']));
  });
});
