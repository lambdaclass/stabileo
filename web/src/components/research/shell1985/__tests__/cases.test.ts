import { describe, expect, it } from 'vitest';
import { cases, compare, finest, inputFor, refusalFor, runCases, responseRatio, signedReference, viewerData } from '../cases';
import { editorSnapshot, editorURL } from '../editor';
import { prepareSharedSnapshot } from '../../../../lib/utils/share-snapshot';
import { buildSolverInput3D, type ModelData } from '../../../../lib/engine/solver-service';
import { initSolver, solve3D } from '../../../../lib/engine/wasm-solver';
import LZString from 'lz-string';

describe('shell obstacle course evidence', () => {
  it('keeps three finest-mesh verdicts and the hemisphere load convention explicit', () => {
    expect(finest.map(c => c.id)).toEqual(['roof-16', 'cylinder-16', 'hemisphere-16']);
    const c = cases.find(c => c.id === 'hemisphere-16')!;
    expect(c.reference).toBe(.185);
    expect(c.input.loads.map(l => [l.data.fx, l.data.fy])).toEqual([[2, 0], [0, -2]]);
    expect(Math.max(...Object.values(c.input.nodes).map(n => n.z))).toBeCloseTo(10 * Math.sin(72 * Math.PI / 180));
  });
  it('fails invalid measurements and does not mistake a regression floor for accuracy', () => {
    for (const c of cases) {
      expect(() => compare(c, [])).toThrow();
      expect(() => compare(c, [{ nodeId: c.measurement.node, [c.measurement.component]: NaN }])).toThrow();
      const direction = c.id.startsWith('hemisphere') ? 1 : -1;
      expect(compare(c, [{ nodeId: c.measurement.node, [c.measurement.component]: direction * c.reference }]).pass).toBe(true);
      expect(responseRatio(c, signedReference(c))).toBe(1);
      expect(responseRatio(c, -signedReference(c))).toBe(-1);
      // A response of the right size in the wrong direction fails.
      expect(compare(c, [{ nodeId: c.measurement.node, [c.measurement.component]: -direction * c.reference }]).pass).toBe(false);
      expect(compare(c, [{ nodeId: c.measurement.node, [c.measurement.component]: .85 * direction * c.reference }]).pass).toBe(false);
    }
  });
  it('recognizes only the expected containment refusal', () => {
    const c = cases.find(c => c.id === 'hemisphere-4')!;
    const message = 'Results withheld: unsafe (known issue #798, SH-MITC4-DISTORTION)';
    expect(refusalFor(c, message).refused).toBe(true);
    for (const failure of ['unavailable', message.replace('#798', '#799'), message.replace('SH-MITC4-DISTORTION', 'OTHER')]) {
      expect(refusalFor(c, failure).refused).not.toBe(true);
    }
    expect(refusalFor(cases[0], message).refused).not.toBe(true);
  });
  it('preserves connectivity and projects all three displacement components', () => {
    const c = cases[0];
    const displacement = Object.values(c.input.nodes).map(n => ({ nodeId: n.id, ux: 1, uy: 2, uz: 3 }));
    const view = viewerData(c, compare(c, displacement));
    expect(view.cells).toHaveLength(c.mesh * c.mesh * 4);
    expect(view.values.every(v => Math.abs(v - Math.sqrt(14)) < 1e-12)).toBe(true);
    expect(view.displacement?.[0]).toBeCloseTo(-1 / Math.sqrt(2));
    expect(viewerData(c).values.every(v => v === 0)).toBe(true);
  });
  it('hands off partial restraints and solves the same model through editor builders', async () => {
    await initSolver();
    for (const c of finest) {
      const snap = editorSnapshot(c);
      const decoded = JSON.parse(LZString.decompressFromEncodedURIComponent(editorURL(c, '/app').split('#data=')[1]));
      expect(prepareSharedSnapshot(decoded)).not.toBeNull();
      expect(decoded).toEqual(snap);
      expect(snap.supports.every(([, s]) => typeof s === 'object' && s !== null && 'type' in s && s.type === 'custom3d')).toBe(true);
      const model = { ...snap, connectors: new Map() } as unknown as ModelData;
      for (const key of ['nodes', 'materials', 'sections', 'elements', 'supports', 'quads', 'plates'] as const) {
        (model as unknown as Record<string, unknown>)[key] = new Map(snap[key] as [number, unknown][]);
      }
      const input = buildSolverInput3D(model, false);
      expect(input).not.toBeNull();
      if (c.group === 'hemisphere') {
        for (const source of [inputFor(c), input!]) {
          expect(() => solve3D(source)).toThrow(/Results withheld:.*known issue #798, SH-MITC4-DISTORTION/);
        }
        continue;
      }
      const direct = compare(c, solve3D(inputFor(c)).displacements as unknown as Record<string, number>[]);
      const editor = compare(c, solve3D(input!).displacements as unknown as Record<string, number>[]);
      expect(editor.value! / direct.value!).toBeCloseTo(1, 8);
    }
  }, 120_000);
  it('passes corrected roofs and keeps coarse cylinder failures in the denominator', async () => {
    const rows = await runCases();
    expect(rows).toHaveLength(cases.length);
    expect(rows.filter(r => r.refused).map(r => r.id)).toEqual(['hemisphere-4', 'hemisphere-8', 'hemisphere-16']);
    for (const c of cases) {
      const row = rows.find(r => r.id === c.id)!;
      if (c.group === 'hemisphere') {
        expect(row).toMatchObject({ refused: true, knownIssue: 'SH-MITC4-DISTORTION', issue: 798, value: null, error: null, pass: false });
        expect(row.failure).toMatch(/Results withheld:.*known issue #798, SH-MITC4-DISTORTION/);
        expect(viewerData(c, row).displacement).toBeNull();
      } else {
        expect(row.value).not.toBeNull();
        expect(Number.isFinite(row.value)).toBe(true);
        expect(row.failure).toBeUndefined();
      }
    }
    const roof = rows.find(r => r.id === 'roof-16')!;
    expect(roof.value).toBeCloseTo(-.3024255392, 8);
    expect(rows.filter(r => r.id.startsWith('roof')).every(r => r.pass)).toBe(true);
    const cylinders = rows.filter(r => r.id.startsWith('cylinder'));
    expect(cylinders.every(r => !r.pass)).toBe(true);
    expect(cylinders.at(-1)!.value).toBeCloseTo(-1.701161680e-5, 12);
    for (let i = 1; i < cylinders.length; i++) {
      expect(cylinders[i].error!).toBeLessThan(cylinders[i - 1].error!);
    }
    expect(finest.filter(c => rows.find(r => r.id === c.id)!.pass).map(c => c.id)).toEqual(['roof-16']);
  }, 120_000);
});
