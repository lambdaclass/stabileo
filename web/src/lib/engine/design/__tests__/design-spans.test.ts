/**
 * The span a beam is designed as (`design-spans.ts`): the pieces between two columns, in order,
 * whichever way each was drawn, and their stations laid along the span in its own axes.
 */
import { describe, it, expect } from 'vitest';
import { designSpans, mergeSpanStations, spanModelData, type SpanSourceModel } from '../design-spans';
import { evaluateDiagramAt } from '../../diagrams-3d';
import { solve3D } from '../../wasm-solver';
import type { SolverInput3D } from '../../types-3d';
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

it('#2238 reversing every piece keeps the physical hogging and sagging faces', () => {
  const L = 6;
  const q = 60;
  const moment = (x: number) => q * (x * (L - x) / 2 - L ** 2 / 12);
  for (const reversed of [false, true]) {
    const structure = model();
    for (const node of structure.nodes.values()) node.x *= 2;
    for (const id of [1, 2, 3]) {
      const member = structure.elements.get(id)!;
      member.nodeI = reversed ? id : id - 1;
      member.nodeJ = reversed ? id - 1 : id;
    }
    const [span] = designSpans(structure, beams);
    expect(span?.reversed).toEqual([reversed, reversed, reversed]);
    const stationTs = [0, 0.5, 1];
    const merged = mergeSpanStations(structure, span!, id => {
      const member = structure.elements.get(id)!;
      const start = structure.nodes.get(member.nodeI)!.x;
      const end = structure.nodes.get(member.nodeJ)!.x;
      const length = Math.abs(end - start);
      return {
        elementId: id, length, stationTs,
        comboResults: [{ comboId: 1, comboName: 'U', stations: stationTs.map(t => {
          const globalX = start + (end - start) * t;
          return { t, x: t * length, n: 0, my: moment(globalX), mz: 0, vy: 0, vz: q * (L / 2 - globalX), torsion: 0 };
        }) }],
      };
    });
    const stations = merged!.comboResults[0]!.stations;
    for (const x of [0, L / 2, L]) {
      expect.soft(stations.find(s => s.x === x)?.my, `x = ${x} m, reversed = ${reversed}`).toBeCloseTo(moment(x), 12);
    }
  }
});

it('#2238 a solved fixed beam keeps its governing faces when mesh pieces are reversed', () => {
  const length = 6;
  const q = 60;
  const ts = [0, 0.5, 1];
  for (const directions of [[false, false, false], [false, true, false], [true, true, true]]) {
    const structure = model();
    for (const node of structure.nodes.values()) node.x *= 2;
    for (const [k, reversed] of directions.entries()) {
      const member = structure.elements.get(k + 1)!;
      member.nodeI = reversed ? k + 1 : k;
      member.nodeJ = reversed ? k : k + 1;
    }
    const [span] = designSpans(structure, beams);
    const input: SolverInput3D = {
      nodes: new Map([...structure.nodes].filter(([id]) => id <= 3).map(([id, n]) => [id, { ...n, z: n.z ?? 0 }])),
      elements: new Map([...structure.elements].filter(([id]) => beams(id)).map(([id, e]) => [id, {
        ...e, type: 'frame', releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false,
        releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
      }])),
      materials: new Map([[1, { id: 1, e: 30000, nu: 0.2 }]]),
      sections: new Map([[1, { id: 1, a: 0.3 * 0.5, iy: 0.3 * 0.5 ** 3 / 12, iz: 0.5 * 0.3 ** 3 / 12, j: 0.002 }]]),
      supports: new Map([0, 3].map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
      loads: [1, 2, 3].map(elementId => ({ type: 'distributed', data: { elementId, qYI: 0, qYJ: 0, qZI: -q, qZJ: -q } })),
    };
    const result = solve3D(input);
    if (typeof result === 'string') throw new Error(result);
    const merged = mergeSpanStations(structure, span!, elementId => {
      const ef = result.elementForces.find(f => f.elementId === elementId)!;
      return {
        elementId, length: ef.length, stationTs: ts,
        comboResults: [{ comboId: 1, comboName: 'U', stations: ts.map(t => ({
          t, x: t * ef.length, n: evaluateDiagramAt(ef, 'axial', t), vy: evaluateDiagramAt(ef, 'shearY', t),
          vz: evaluateDiagramAt(ef, 'shearZ', t), my: evaluateDiagramAt(ef, 'momentY', t),
          mz: evaluateDiagramAt(ef, 'momentZ', t), torsion: evaluateDiagramAt(ef, 'torsion', t),
        })) }],
      };
    });
    const moments = merged!.comboResults[0]!.stations.map(s => s.my);
    expect.soft(Math.min(...moments), directions.join(',')).toBeCloseTo(-q * length ** 2 / 12, 12);
    expect.soft(Math.max(...moments), directions.join(',')).toBeCloseTo(q * length ** 2 / 24, 12);
  }
});

it('#2238 rolled and explicitly oriented pieces keep the same demands in the span frame', () => {
  const angle = Math.PI / 6;
  const refY = { localYx: 0, localYy: Math.cos(angle), localYz: Math.sin(angle) };
  for (const reversed of [false, true]) {
    const structure = model();
    for (const [k, id] of [1, 2, 3].entries()) {
      Object.assign(structure.elements.get(id)!, refY, {
        nodeI: reversed ? k + 1 : k, nodeJ: reversed ? k : k + 1,
      });
    }
    const [span] = designSpans(structure, beams);
    expect(span).toBeDefined();
    const stations = (elementId: number): ElementStationResult => ({
      elementId, length: 1, stationTs: [0, 1],
      comboResults: [{ comboId: 1, comboName: 'U', stations: [0, 1].map(t => ({
        t, x: t, n: -4, my: reversed ? -3 : 3, mz: 5, vy: reversed ? -2 : 2, vz: 7, torsion: 1,
      })) }],
    });
    for (const station of mergeSpanStations(structure, span!, stations)!.comboResults[0]!.stations) {
      for (const [key, value] of Object.entries({ n: -4, my: 3, mz: 5, vy: 2, vz: 7, torsion: 1 })) {
        expect(station[key as keyof typeof station]).toBeCloseTo(value, 12);
      }
    }
    Object.assign(structure.elements.get(2)!, { localYx: 0, localYy: 0, localYz: 1 });
    expect(mergeSpanStations(structure, span!, stations)).toBeNull();
  }
});

it('#2238 splits a run at a half turn of the physical section', () => {
  const structure = model();
  Object.assign(structure.sections.get(1)!, { shape: 'T' });
  const third = structure.elements.get(3)!;
  Object.assign(third, { rollAngle: 180 });
  expect(designSpans(structure, beams).map(s => s.elements)).toEqual([[1, 2]]);
  Object.assign(third, { rollAngle: 360 });
  expect(designSpans(structure, beams).map(s => s.elements)).toEqual([[1, 2, 3]]);
});
