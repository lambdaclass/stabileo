import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import frame from '../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../engine/design/__tests__/helpers';
import { buildStructuralBundle } from '../../engine/structural-bundle';
import { decisionsOf, statusOfRatio, worstStatus, governingCheck, type CheckRow } from '../index';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('the structural bundle', () => {
  const s = solveFixture(frame);
  const b = buildStructuralBundle({
    nodes: s.model.nodes.values(), elements: s.model.elements.values(),
    sections: s.model.sections.values(), materials: s.model.materials.values(),
    combinations: s.model.combinations, perCombo: s.perCombo, analysisRevision: 3,
  });

  it('carries every member, every combination, its units and its version', () => {
    expect(b.version).toBe(2);
    expect(b.units.force).toBe('kN');
    expect(b.members).toHaveLength(s.model.elements.size);
    expect(b.combinations.length).toBe(s.perCombo.size);
    for (const m of b.members) expect(Object.keys(m.stations).length).toBe(s.perCombo.size);
  });

  it('reads the solver\'s own end forces at the stations, without recomputing them', () => {
    const c = b.combinations[0]!;
    const m = b.members[0]!;
    const ef = s.perCombo.get(c.id)!.elementForces.find((f) => f.elementId === m.id)!;
    const st = m.stations[c.id]!;
    expect(st[0]!.t).toBe(0);
    expect(st[0]!.n).toBeCloseTo(ef.nStart, 9);
    expect(st[st.length - 1]!.my).toBeCloseTo(ef.myEnd, 6);
  });

  it('survives JSON as it is', () => {
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });

  /*
   * A consumer that has nothing but the serialised bundle: it reads `units`, converts what it
   * reads to kN and m, and computes. The fixture's material is the legacy `{"name":"H30",
   * "e":30000,"fy":30}` (MPa, f'c kept in fy); its columns are 0,40 × 0,40 (A = 0,16 m²) and
   * member 1 runs from (0, 0, 0) to (0, 0, 3,2).
   *   EA/L = 30 000 MPa · 1000 · 0,16 m² / 3,2 m = 1 500 000 kN/m.
   *   A·f'c = 0,16 m² · 30 MPa · 1000 = 4 800 kN.
   */
  it('lets a consumer that reads only the JSON and its units compute in kN and m', () => {
    const wire = JSON.parse(JSON.stringify(b)) as {
      units: Record<string, string>;
      nodes: Array<{ id: number; x: number; y: number; z: number }>;
      sections: Array<{ id: number; a: number }>;
      materials: Array<{ id: number; e: number; fc?: number }>;
      combinations: Array<{ id: number }>;
      members: Array<{ id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; stations: Record<string, Array<{ n: number }>> }>;
    };
    const toKNm2: Record<string, number> = { kPa: 1, 'kN/m²': 1, MPa: 1000 };
    const toM2: Record<string, number> = { 'm²': 1, 'cm²': 1e-4 };
    const toM: Record<string, number> = { m: 1, mm: 1e-3 };
    const stress = toKNm2[wire.units.stress]!, area = toM2[wire.units.area]!, len = toM[wire.units.length]!;
    expect(stress && area && len).toBeTruthy();

    const m = wire.members.find((x) => x.id === 1)!;
    const ni = wire.nodes.find((n) => n.id === m.nodeI)!, nj = wire.nodes.find((n) => n.id === m.nodeJ)!;
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z) * len;
    const sec = wire.sections.find((s) => s.id === m.sectionId)!;
    const mat = wire.materials.find((x) => x.id === m.materialId)!;
    expect(mat.e * stress * sec.a * area / L).toBeCloseTo(1_500_000, 3);

    const N = m.stations[String(wire.combinations[0]!.id)]![0]!.n;
    expect(mat.fc).toBeDefined();
    const squash = sec.a * area * mat.fc! * stress;
    expect(squash).toBeCloseTo(4_800, 6);
    expect(Math.abs(N) / squash).toBeCloseTo(Math.abs(N) / 4_800, 9);
  });
});

describe('the bundle\'s materials, in the units it declares', () => {
  const bundleOf = (materials: Parameters<typeof buildStructuralBundle>[0]['materials']) => buildStructuralBundle({
    nodes: [], elements: [], sections: [], materials, combinations: [], perCombo: new Map(), analysisRevision: 0,
  });

  it('declares every quantity it carries', () => {
    expect(bundleOf([]).units).toEqual({
      length: 'm', force: 'kN', moment: 'kN·m', stress: 'kPa',
      density: 'kN/m³', thermalExpansion: '1/°C', area: 'm²', inertia: 'm⁴', angle: 'deg',
    });
  });

  /*
   * Hand values: MPa · 1000 = kPa.
   *   H-30 (CIRSOC 201): E = 4700·√30 = 25 743 MPa → 25 743 000 kPa; f'c = 30 MPa → 30 000 kPa.
   *   A36: E = 200 000 MPa → 200 000 000 kPa; fy = 250 MPa → 250 000 kPa; fu = 400 MPa → 400 000 kPa.
   *   Legacy H30, f'c kept in fy: {"e":30000,"fy":30} → E = 30 000 000 kPa, fc = 30 000 kPa, no fy.
   *   Timber reference values fb 24, fc 21, fv 4, E 11 000 MPa → 24 000, 21 000, 4 000, 11 000 000 kPa.
   */
  it('gives every stress in kPa, and a concrete its f\'c as fc rather than fy', () => {
    const [h30, a36, legacy, wood] = bundleOf([
      { id: 1, name: 'H-30', e: 25743, nu: 0.2, rho: 24, fy: 30, fc: 30, gradeId: 'cirsoc-h30' },
      { id: 2, name: 'A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400, gradeId: 'astm-a36', alpha: 12e-6 },
      { id: 3, name: 'H30', e: 30000, nu: 0.2, rho: 25, fy: 30 },
      { id: 4, name: 'Pino', e: 11000, nu: 0.3, rho: 5, fy: 24, timber: { fb: 24, ft: 14, fc: 21, fv: 4, e: 11000, kind: 'sawn' } },
    ]).materials;
    expect(h30).toMatchObject({ family: 'concrete', e: 25_743_000, fc: 30_000, rho: 24, nu: 0.2 });
    expect(h30!.fy).toBeUndefined();
    expect(a36).toMatchObject({ family: 'steel', e: 200_000_000, fy: 250_000, fu: 400_000, rho: 78.5, alpha: 12e-6 });
    expect(a36!.fc).toBeUndefined();
    expect(legacy).toMatchObject({ family: 'concrete', e: 30_000_000, fc: 30_000 });
    expect(legacy!.fy).toBeUndefined();
    expect(wood).toMatchObject({ family: 'timber', e: 11_000_000, fy: 24_000, timber: { fb: 24_000, ft: 14_000, fc: 21_000, fv: 4_000, e: 11_000_000, kind: 'sawn' } });
  });
});

describe('the decisions a project stores', () => {
  it('reads bars, bracing and their state from where they are today', () => {
    const d = decisionsOf({
      elements: new Map<number, { reinforcement?: never; unbracedLength?: number; kStrong?: number }>([
        [1, { reinforcement: { stirrups: { diameter: 8, legs: 2, spacing: 0.15 } } as never }],
        [2, { unbracedLength: 2.5, kStrong: 1.2 }],
        [3, {}],
      ]),
      manual: new Set([1]),
    });
    expect(d.version).toBe(1);
    expect(d.byElement[1]!.state).toBe('edited');
    expect(d.byElement[2]!.bracing).toEqual({ Lb: 2.5, Kx: 1.2 });
    expect(d.byElement[3]).toBeUndefined();
  });
});

describe('one status vocabulary', () => {
  it('uses the approved thresholds', () => {
    expect(statusOfRatio(0.9)).toBe('ok');
    expect(statusOfRatio(0.97)).toBe('nearLimit');
    expect(statusOfRatio(1.03)).toBe('fail');
    expect(statusOfRatio(Number.NaN)).toBe('fail');
    expect(worstStatus(['ok', 'nearLimit', 'unsupported'])).toBe('unsupported');
  });
  it('names the governing check: a failure first, then the highest ratio', () => {
    const row = (title: string, ratio: number): CheckRow => ({ code: 'x', title, inputs: [], ratio, status: statusOfRatio(ratio) });
    expect(governingCheck([row('a', 0.9), row('b', 0.97), row('c', 0.5)])!.title).toBe('b');
    expect(governingCheck([row('a', 0.99), row('b', 1.2)])!.title).toBe('b');
  });
});

describe('the contract imports nothing outside itself', () => {
  it('every import in design-contract is relative to design-contract', () => {
    const dir = resolve(HERE, '..');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        expect(m[1]!.startsWith('./'), `${f} imports ${m[1]}`).toBe(true);
      }
    }
  });

  it('reads a version-1 bundle as version 2, takes version 2 as it is, and refuses any other', async () => {
    const { readStructuralBundle } = await import('../../engine/structural-bundle');
    // A v1 bundle as the old builder wrote it: "kPa" declared, MPa carried, a concrete's f'c in fy.
    const v1 = { version: 1, units: { length: 'm', force: 'kN', moment: 'kN·m', stress: 'kPa' }, analysisRevision: 0, nodes: [], sections: [],
      materials: [{ id: 1, name: 'H30', e: 30000, fy: 30 }, { id: 2, name: 'A36', e: 200000, fy: 250, fu: 400 }], combinations: [], members: [], reactions: {} };
    const r1 = readStructuralBundle(JSON.parse(JSON.stringify(v1)));
    expect(r1.ok && r1.upgradedFrom).toBe(1);
    if (!r1.ok) throw new Error('refused');
    expect(r1.bundle.version).toBe(2);
    expect(r1.bundle.units.stress).toBe('kPa');
    expect(r1.bundle.materials[0]).toMatchObject({ family: 'concrete', e: 30_000_000, fc: 30_000 });
    expect(r1.bundle.materials[0]!.fy).toBeUndefined();
    expect(r1.bundle.materials[1]).toMatchObject({ family: 'steel', e: 200_000_000, fy: 250_000, fu: 400_000 });
    const v2 = { ...r1.bundle };
    const r2 = readStructuralBundle(JSON.parse(JSON.stringify(v2)));
    expect(r2.ok && r2.upgradedFrom).toBe(undefined);
    expect(r2.ok && r2.bundle.materials[0]!.fc).toBe(30_000);
    expect(readStructuralBundle({ ...v2, version: 3 })).toEqual({ ok: false, reason: 'unknownVersion', version: 3 });
    expect(readStructuralBundle({ nodes: [] })).toEqual({ ok: false, reason: 'notABundle' });
  });
});
