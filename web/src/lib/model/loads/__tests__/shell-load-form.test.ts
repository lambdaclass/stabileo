/**
 * The write card's slab form: its values come in SI (null for a blank field), a blank value is 0,
 * and the list by corner, the one field typed as text, refuses an entry that does not read and
 * has exactly one value per corner. It used to drop the unreadable entry of a list (the values
 * shifting corners) and fall back to its own point inside the fluid. What comes back is i18n
 * keys, as every refusal of the card.
 */
import { describe, it, expect } from 'vitest';
import { buildShellLoads, type ShellLoadFields, type ShellLoadKind } from '../shell-load-form';
import type { ShellRef } from '../shell-load-tools';
import type { WriteOutcome, WriteRefusal } from '../write-load';
import type { SurfaceLoad3D } from '../../../store/model.svelte';

const P = (x: number, y: number, z = 0) => ({ x, y, z });
const quad: ShellRef = { id: 1, pts: [P(0, 0), P(4, 0), P(4, 4), P(0, 4)], nodes: [1, 2, 3, 4] };
const tri: ShellRef = { id: 1, on: 'plate', pts: [P(0, 0), P(4, 0), P(0, 4)], nodes: [1, 2, 4] };

function form(edit: (f: ShellLoadFields) => void = () => {}): ShellLoadFields {
  const f: ShellLoadFields = {
    dirMode: 'down', dirAxis: 'Z', field: 'uniform', q: null, qc: '',
    va: { axis: 'Z', c1: null, q1: null, c2: null, q2: null }, partial: false,
    rect: { plane: 'XY', u1: null, v1: null, u2: null, v2: null },
    gamma: 10, level: null, inside: { x: null, y: null, z: null },
    at: { x: null, y: null, z: null }, pf: { fx: null, fy: null, fz: null },
  };
  edit(f);
  return f;
}
const build = (kind: ShellLoadKind, f: ShellLoadFields, shells: ShellRef[] = [quad]) => buildShellLoads(kind, f, shells, 1);
const errorOf = (r: WriteOutcome | WriteRefusal) => ('error' in r ? r.error : null);
const loadsOf = (r: WriteOutcome | WriteRefusal) => { if ('error' in r) throw new Error(r.error); return r.loads; };

describe('the list by corner is text: an entry that does not read refuses the add', () => {
  it('and the corner values are turned to SI', () => {
    expect(errorOf(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6O; 7'; }), [tri]))).toBe('pro.loadUnreadable');
    const kPa = buildShellLoads('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6; 7'; }), [tri], 1, (v) => v * 9.80665);
    expect((loadsOf(kPa)[0]!.data as SurfaceLoad3D).qNodes![0]).toBeCloseTo(49.03325, 9);
  });
});

describe('blank values', () => {
  it('a blank force component or coordinate is 0', () => {
    const l = loadsOf(build('shellPoint', form((f) => { f.at.x = 1; f.at.y = 1; f.pf.fz = -10; })));
    expect(l.reduce((s, x) => s + (x.data as { fz: number }).fz, 0)).toBeCloseTo(-10, 12);
    expect(errorOf(build('shellPoint', form()))).toBe('writeLoad.zero');
  });

  it('a list by corner: exactly one value per corner, a blank one 0', () => {
    const one = (r: WriteOutcome | WriteRefusal) => loadsOf(r)[0]!.data as SurfaceLoad3D;
    expect(one(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; ; 7'; }), [tri])).qNodes).toEqual([5, 0, 7]);
    expect(one(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6; 7;'; }), [tri])).qNodes).toEqual([5, 6, 7]);
    expect(errorOf(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6; 7; 9'; }), [tri]))).toBe('writeLoad.shell.cornersIncomplete');
    expect(errorOf(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6; 7'; }), [quad]))).toBe('writeLoad.shell.cornersIncomplete');
    expect(errorOf(build('surface', form((f) => { f.field = 'corners'; f.qc = '5; 6; 7; 8'; }), [quad, tri]))).toBe('writeLoad.shell.cornersMixed');
  });

  it('a variation: its two coordinates asked for, a blank pressure 0', () => {
    const v = loadsOf(build('surface', form((f) => { f.field = 'axis'; f.va = { axis: 'Z', c1: 3, q1: null, c2: 0, q2: 30 }; })))[0]!.data as SurfaceLoad3D;
    expect(v.vary).toEqual({ dir: [0, 0, 1], c1: 3, q1: 0, c2: 0, q2: 30 });
    expect(errorOf(build('surface', form((f) => { f.field = 'axis'; f.va = { axis: 'Z', c1: null, q1: 1, c2: 0, q2: 30 }; })))).toBe('writeLoad.shell.varyIncomplete');
  });

  it('the point inside a fluid: all three coordinates or none', () => {
    const wall: ShellRef = { id: 3, pts: [P(0, 0, 0), P(2, 0, 0), P(2, 0, 3), P(0, 0, 3)], nodes: [1, 2, 3, 4] };
    expect(errorOf(build('hydro', form((f) => { f.level = 3; f.inside = { x: 1, y: 1, z: null }; }), [wall]))).toBe('writeLoad.shell.insideIncomplete');
    // A lone wall without a point has no side: refused, the wall named.
    expect(build('hydro', form((f) => { f.level = 3; }), [wall])).toEqual({ error: 'writeLoad.shell.hydroSideUnknown', params: { list: 'q3' } });
    expect(loadsOf(build('hydro', form((f) => { f.level = 3; f.inside = { x: 1, y: 1, z: 1 }; }), [wall]))).toHaveLength(1);
  });
});

it('every key the form returns is said in en, es and pt', async () => {
  const keys = ['writeLoad.noTarget', 'writeLoad.zero', 'pro.loadUnreadable', 'writeLoad.shell.pointOutside', 'writeLoad.shell.hydroIncomplete',
    'writeLoad.shell.insideIncomplete', 'writeLoad.shell.hydroSideUnknown', 'writeLoad.shell.hydroNothing', 'writeLoad.shell.cornersIncomplete',
    'writeLoad.shell.cornersMixed', 'writeLoad.shell.varyIncomplete', 'writeLoad.shell.rectIncomplete'];
  for (const lang of ['en', 'es', 'pt']) {
    const dict = (await import(`../../../i18n/locales/${lang}.ts`)).default as Record<string, string>;
    for (const k of keys) expect(dict[k], `${lang}: ${k}`).toBeTruthy();
  }
});
