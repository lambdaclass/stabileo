/**
 * The span a beam is designed as (`design-spans.ts`): the pieces between two columns, in order,
 * whichever way each was drawn, and their stations laid along the span in its own axes.
 */
import { describe, it, expect } from 'vitest';
import { designSpans, mergeSpanStations, spanModelData, type SpanSourceModel } from '../design-spans';
import { computeLocalAxes3D } from '../../local-axes-3d';
import { computeBeamCriticalSections, type ElementStationResult } from '../../station-design-forces';

/** Two columns 3 m apart and a beam between them cut at x = 1 and 2, its middle piece drawn J → I. */
function model(o: { sectionOf3?: number } = {}): SpanSourceModel & { sections: Map<number, { id: number; name: string; b: number; h: number }> } {
  const nodes = new Map([
    [10, { id: 10, x: 0, y: 0, z: 0 }], [13, { id: 13, x: 3, y: 0, z: 0 }],
    [0, { id: 0, x: 0, y: 0, z: 3 }], [1, { id: 1, x: 1, y: 0, z: 3 }], [2, { id: 2, x: 2, y: 0, z: 3 }], [3, { id: 3, x: 3, y: 0, z: 3 }],
  ]);
  const el = (id: number, nodeI: number, nodeJ: number, sectionId = 1) => [id, { id, nodeI, nodeJ, type: 'frame', sectionId, materialId: 1 }] as const;
  return {
    nodes,
    elements: new Map([el(20, 10, 0, 2), el(21, 13, 3, 2), el(1, 0, 1), el(2, 2, 1), el(3, 2, 3, o.sectionOf3 ?? 1)]),
    supports: new Map([[1, { nodeId: 10 }], [2, { nodeId: 13 }]]),
    sections: new Map([[1, { id: 1, name: 'V', b: 0.2, h: 0.5 }], [2, { id: 2, name: 'C', b: 0.3, h: 0.3 }]]),
  };
}
const beams = (id: number) => id < 10;

describe('design spans', () => {
  it('the pieces between two columns are one span, laid from its first end, each drawn its own way', () => {
    const [s, ...rest] = designSpans(model(), beams);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      key: 'span-1', representative: 1, elements: [1, 2, 3], reversed: [false, true, false],
      start: 0, end: 3, offsets: [0, 1, 2], lengths: [1, 1, 1], length: 3,
    });
  });

  it('a change of section or of physical member cuts the span; a lone element is no span', () => {
    expect(designSpans(model({ sectionOf3: 9 }), beams).map((s) => s.elements)).toEqual([[1, 2]]);
    expect(designSpans(model(), beams, (id) => (id === 1 ? 'V1' : 'V2')).map((s) => s.elements)).toEqual([[2, 3]]);
    const m = model();
    m.elements = new Map([...m.elements].filter(([id]) => id !== 2 && id !== 3));
    expect(designSpans(m, beams)).toEqual([]);
  });

  it('the stations of a piece drawn the other way are its forces read from the span\'s side', () => {
    const m = model();
    const [s] = designSpans(m, beams);
    // What the span carries at x: one tuple per station, in the span's axes.
    const span = (x: number) => ({ n: -3 + x, vy: 0.2 * x, vz: 10 - 4 * x, torsion: 0.1, my: 5 * x * (3 - x) - 4, mz: 0.3 - x });
    const ax = (id: number) => { const e = m.elements.get(id)!; const p = (n: number) => ({ ...m.nodes.get(n)!, z: m.nodes.get(n)!.z ?? 0 }); return computeLocalAxes3D(p(e.nodeI), p(e.nodeJ)); };
    const ref = ax(1);
    const stations = (id: number, k: number): ElementStationResult => {
      const a = ax(id), sgn = Math.sign(a.ex[0] * ref.ex[0] + a.ex[1] * ref.ex[1] + a.ex[2] * ref.ex[2]);
      const d = (p: number[], q: number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
      // The piece's own reading: f_piece = s·R_piece·R_spanᵀ·f_span.
      const own = (x: number, y: number, z: number) => [a.ex, a.ey, a.ez].map((r) => sgn * (d(r, ref.ex) * x + d(r, ref.ey) * y + d(r, ref.ez) * z));
      const ts = [0, 0.5, 1];
      return {
        elementId: id, length: 1, stationTs: ts,
        comboResults: [{ comboId: 1, comboName: 'U', stations: ts.map((t) => {
          const x = k + (s!.reversed[k] ? 1 - t : t), f = span(x);
          const [n, vy, vz] = own(f.n, f.vy, f.vz), [torsion, my, mz] = own(f.torsion, f.my, f.mz);
          return { t, x: t, n: n!, vy: vy!, vz: vz!, my: my!, mz: mz!, torsion: torsion! };
        }) }],
      };
    };
    const merged = mergeSpanStations(m, s!, (id) => stations(id, s!.elements.indexOf(id)))!;
    expect(merged.length).toBe(3);
    expect(merged.comboResults[0]!.stations).toHaveLength(9);
    for (const st of merged.comboResults[0]!.stations) {
      const f = span(st.x);
      expect(st.t).toBeCloseTo(st.x / 3, 12);
      for (const k of ['n', 'vy', 'vz', 'torsion', 'my', 'mz'] as const) expect(st[k]).toBeCloseTo(f[k], 9);
    }
  });

  it('every piece reads its support faces at the span\'s columns', () => {
    const m = model();
    const [s] = designSpans(m, beams);
    const md = spanModelData({ ...m, materials: new Map() } as never, s!);
    for (const id of s!.elements) {
      const cs = computeBeamCriticalSections(id, md.nodes, md.elements, md.sections, md.supports, { b: 0.2, h: 0.5, cover: 0.025, stirrupDia: 8 })!;
      expect(cs.L).toBeCloseTo(3, 12);
      expect([cs.start.source, cs.end.source]).toEqual(['column', 'column']);
    }
  });
});
