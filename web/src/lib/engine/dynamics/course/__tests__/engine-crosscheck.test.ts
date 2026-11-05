import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { solveModal, solveHarmonic2D, solveTimeHistory2D, guyanReduce2D, isSolverReady } from '../../../wasm-solver';
import { withBasicMass, withPointMasses } from '../../basic-mass';
import { densityRecord } from '../../requests';
import { modelSystem } from '../mdof-system';
import { shearBuilding } from '../shear-building';
import { modalSolve } from '../modal-decomposition';
import { sdofFromModel } from '../sdof-model';
import { condense } from '../mass-model';
import { convergenceTable, exactBeam, frequenciesOf } from '../convergence';
import { subdivideForAnalysis } from '../../../../model/edit/analysis-subdivision';
import { buildSolverInput2D } from '../../../solver-service';
import { sdofProps, harmonic, forcedResponse } from '../sdof';
import { sdofSyntheticInput, engineCheck, MAX_HISTORY_STEPS } from '../sdof-engine';
import { timeWindow } from '../sdof';

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  for (const k of ['log', 'warn', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

const RECT = { a: 0.02, iz: (0.1 * 0.2 ** 3) / 12 };
function build(fn: () => void) {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    fn();
    const id = modelStore.addSection({ name: 'R 10x20', a: RECT.a, iy: RECT.iz, iz: (0.2 * 0.1 ** 3) / 12, b: 0.1, h: 0.2, shape: 'rect' } as never);
    for (const e of [...modelStore.elements.keys()]) modelStore.updateElement(e, { sectionId: id });
  });
}
function cantilever(L = 3) {
  build(() => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(L, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed');
  });
}
const points = () => modelStore.model.massSource?.points ?? [];
function engineFrequencies(n: number): number[] {
  const sub = subdivideForAnalysis(modelStore.model, n);
  const input = buildSolverInput2D(sub.model)!;
  const phys = withBasicMass(input, { ...sub.model, massSource: modelStore.model.massSource }, 'iy');
  return solveModal(phys.input, phys.densities, 12).modes.map((m: { frequency: number }) => m.frequency);
}

describe('cantilever: frequencies against n, mass model and the exact beam', () => {
  it('the exact beam is recognised: 3.516·√(EI/mL⁴) first, then the bending and axial modes in order', () => {
    cantilever();
    const ex = exactBeam(modelStore.model, points())!;
    expect(ex.beamCase).toBe('cantilever');
    const EI = 200e6 * RECT.iz, rhoA = (78.5 / 9.81) * RECT.a;
    expect(ex.EI).toBeCloseTo(EI, 3);
    expect(ex.rhoA).toBeCloseTo(rhoA, 9);
    expect(ex.modes[0].kind).toBe('bending');
    expect(ex.modes[0].f).toBeCloseTo((3.516 * Math.sqrt(EI / (rhoA * 81))) / (2 * Math.PI), 1);
  });

  it('the consistent mass is the engine\'s: same frequencies for every n', () => {
    cantilever();
    for (const n of [1, 2, 4]) {
      const mine = convergenceTable(modelStore.model, points(), [n], 3, true)[0].f.consistent;
      const eng = engineFrequencies(n);
      expect(mine).toHaveLength(3);
      expect(eng.length).toBeGreaterThanOrEqual(3);
      mine.forEach((f, i) => expect(f).toBeCloseTo(eng[i], 6));
    }
  });

  it('lumped converges from below, consistent from above, both towards the exact first frequency', () => {
    cantilever();
    const ex = exactBeam(modelStore.model, points())!;
    const f1 = ex.modes[0].f;
    const rows = convergenceTable(modelStore.model, points(), [1, 2, 4, 8], 2, true);
    const err = (mm: 'lumped' | 'consistent' | 'guyan') => rows.map((r) => Math.abs(r.f[mm][0] - f1) / f1);
    expect(rows[0].f.lumped[0]).toBeCloseTo((Math.sqrt(6) / 3.516) * f1, 2);
    rows.forEach((r) => {
      expect(r.f.lumped[0]).toBeLessThan(f1);
      expect(r.f.consistent[0]).toBeGreaterThan(f1 * (1 - 1e-6));
      expect(r.f.guyan[0]).toBeGreaterThanOrEqual(r.f.consistent[0] * (1 - 1e-9));
    });
    for (const mm of ['lumped', 'consistent', 'guyan'] as const) {
      const e = err(mm);
      for (let i = 1; i < e.length; i++) expect(e[i]).toBeLessThan(e[i - 1] + 1e-12);
    }
    expect(err('lumped')[3]).toBeLessThan(0.01);
    expect(err('consistent')[3]).toBeLessThan(1e-4);
  });
});

describe('point masses in Basic reach the engine', () => {
  it('a tip mass M on a light cantilever: ω ≈ √(3EI/((M + 0.236 m L)·L³)) and it lowers the engine frequency', () => {
    cantilever(2);
    const before = engineFrequencies(1)[0];
    const M = 1.5;
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m: M }] });
    const after = engineFrequencies(4)[0];
    expect(after).toBeLessThan(before);
    const EI = 200e6 * RECT.iz, rhoA = (78.5 / 9.81) * RECT.a;
    const rayleigh = Math.sqrt((3 * EI) / ((M + 0.236 * rhoA * 2) * 8)) / (2 * Math.PI);
    expect(Math.abs(after - rayleigh) / rayleigh).toBeLessThan(0.01);
    const mine = convergenceTable(modelStore.model, points(), [4], 1, true)[0].f.consistent[0];
    expect(mine).toBeCloseTo(after, 6);
  });

  it.each([[1.5, 0.8], [0, 0.8]])('a tip mass %s t with rotary inertia %s t·m²: the engine solves with the inertia, at the course system\'s frequencies', (m, izz) => {
    cantilever(2);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m }] });
    const without = engineFrequencies(4);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m, izz }] });
    const eng = engineFrequencies(4);
    const mine = convergenceTable(modelStore.model, points(), [4], 3, true)[0].f.consistent;
    expect(mine).toHaveLength(3);
    mine.forEach((f, i) => expect(f / eng[i]).toBeCloseTo(1, 6));
    expect(eng.some((f, i) => Math.abs(f / without[i] - 1) > 1e-3)).toBe(true);
  });

  it('a point mass\'s rotary inertia reaches the engine as the plane rotation in 2D and about the vertical in 3D', () => {
    const input: { nodes: Map<number, unknown>; masses?: { nodal?: Array<{ nodeId: number; mass: number }> } } = { nodes: new Map([[2, {}]]) };
    expect(withPointMasses(input, [{ nodeId: 2, m: 1, izz: 0.5 }, { nodeId: 2, m: 0, izz: 0.25, horizontalOnly: true }], 'iy').masses?.nodal)
      .toEqual([{ nodeId: 2, mass: 1, iy: 0.5 }, { nodeId: 2, mass: 0, massZ: 0, iy: 0.25 }]);
    expect(withPointMasses(input, [{ nodeId: 2, m: 0, izz: 0.25 }], 'izz').masses?.nodal).toEqual([{ nodeId: 2, mass: 0, izz: 0.25 }]);
    expect(withPointMasses(input, [{ nodeId: 2, m: 0, izz: 0 }], 'iy')).toBe(input);
  });

  it('a negative or non-finite mass or inertia never reaches the engine, whichever of the two is valid', () => {
    const input: { nodes: Map<number, unknown>; masses?: { nodal?: Array<{ nodeId: number; mass: number }> } } = { nodes: new Map([[2, {}]]) };
    expect(withPointMasses(input, [{ nodeId: 2, m: -1, izz: 0.5 }, { nodeId: 2, m: NaN, izz: 0.25 }, { nodeId: 2, m: 2, izz: -0.5 }, { nodeId: 2, m: 3, izz: Infinity }], 'iy').masses?.nodal)
      .toEqual([{ nodeId: 2, mass: 0, iy: 0.5 }, { nodeId: 2, mass: 0, iy: 0.25 }, { nodeId: 2, mass: 2 }, { nodeId: 2, mass: 3 }]);
    expect(withPointMasses(input, [{ nodeId: 2, m: -1, izz: NaN }, { nodeId: 2, m: Infinity }], 'izz')).toBe(input);
  });

  it('a rotational inertia at the tip is not taken for the bare exact cantilever', () => {
    cantilever(3);
    expect(exactBeam(modelStore.model, [{ nodeId: 2, m: 0, izz: 0.5 }])).toBeNull();
    expect(exactBeam(modelStore.model, [{ nodeId: 2, m: 0, izz: 0 }])).not.toBeNull();
  });

  it('a cantilever propped by a spring is not taken for the exact cantilever', () => {
    cantilever(3);
    modelStore.addSupport(2, 'spring', { ky: 500 });
    expect(exactBeam(modelStore.model, points())).toBeNull();
  });

  it('a cantilever with any other part (connector, constraint, plate, quad) is not taken for the exact cantilever', () => {
    cantilever(3);
    expect(exactBeam(modelStore.model, points())).not.toBeNull();
    const base = modelStore.model;
    const extras = {
      connectors: { connectors: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, kMoment: 1e3 }]]) },
      constraints: { constraints: [{ type: 'equalDof', masterNode: 1, slaveNode: 2, dofs: [0] }] },
      plates: { plates: new Map([[1, { id: 1, nodes: [1, 2, 2] as [number, number, number], materialId: 1, thickness: 0.1 }]]) },
      quads: { quads: new Map([[1, { id: 1, nodes: [1, 2, 2, 1] as [number, number, number, number], materialId: 1, thickness: 0.1 }]]) },
    };
    for (const [part, extra] of Object.entries(extras)) expect(exactBeam({ ...base, ...extra } as never, points()), part).toBeNull();
  });

  it('a horizontal-only mass moves only the horizontal frequency', () => {
    cantilever(2);
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m: 2, horizontalOnly: true }] });
    const s = modelSystem(modelStore.model, points(), { nPerMember: 1, massModel: 'lumped', barMass: true });
    const ix = s.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'ux');
    const iz = s.fullDofs.findIndex((d) => d.nodeId === 2 && d.dir === 'uz');
    const half = ((78.5 / 9.81) * RECT.a * 2) / 2;
    expect(s.fullM[ix][ix]).toBeCloseTo(2 + half, 10);
    expect(s.fullM[iz][iz]).toBeCloseTo(half, 10);
  });

  it('a horizontal-only mass on an inclined roller: the mass goes into the support\'s frame, and the frequencies are the engine\'s', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 0);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, 'pinned');
      modelStore.addSupport(b, 'rollerX', undefined, { angle: 35 });
    });
    modelStore.setMassSource({ kind: 'custom', factors: [], points: [{ nodeId: 2, m: 5, horizontalOnly: true }] });
    const mine = convergenceTable(modelStore.model, points(), [4], 3, true)[0].f.consistent;
    const eng = engineFrequencies(4);
    expect(mine).toHaveLength(3);
    expect(eng.length).toBeGreaterThanOrEqual(3);
    mine.forEach((f, i) => expect(f / eng[i]).toBeCloseTo(1, 6));
  });
});

describe('ground excitation with a support in a turned frame', () => {
  for (const angle of [0, 35, 60]) {
    it(`a horizontal-only point mass on a roller at ${angle}°: it all moves with an X ground motion, none with Z; the SDOF has the MDOF's frequency`, () => {
      build(() => {
        const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 0);
        modelStore.addElement(a, b);
        modelStore.addSupport(a, 'pinned');
        modelStore.addSupport(b, 'rollerX', undefined, { angle });
      });
      const pts = [{ nodeId: 2, m: 5, horizontalOnly: true }, { nodeId: 2, m: 2 }];
      const s = modelSystem(modelStore.model, pts, { nPerMember: 1, massModel: 'lumped', barMass: false });
      const sol = modalSolve(s.K, s.M, s.dofs, s.ground);
      expect(s.dofs).toHaveLength(1);
      const d = s.dofs[0], a = d.angle ?? 0;
      const [tx, tz] = d.dir === 'ux' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
      if (angle !== 0) expect(Math.abs(tz)).toBeGreaterThan(0.3);
      const mt = 7 * tx * tx + 2 * tz * tz;
      const along = (gx: number, gz: number) => (7 * tx * gx + 2 * tz * gz) ** 2 / mt;
      expect(sol.totalMassX).toBeCloseTo(along(1, 0), 9);
      expect(sol.totalMassZ).toBeCloseTo(along(0, 1), 9);
      const sx = sdofFromModel(modelStore.model, pts, 2, 'ux');
      if (typeof sx === 'string') throw new Error(sx);
      expect(sx.m / (mt / (tx * tx))).toBeCloseTo(1, 12);
      expect(sx.k / sx.m / sol.modes[0].omega ** 2).toBeCloseTo(1, 9);
    });
  }
});

describe('the SDOF from an inclined cantilever', () => {
  for (const dir of ['ux', 'uz'] as const) {
    it(`a tip mass read along ${dir}: two coupled massive translations, refused for the MDOF analysis`, () => {
      build(() => {
        const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 4);
        modelStore.addElement(a, b);
        modelStore.addSupport(a, 'fixed');
      });
      const pts = [{ nodeId: 2, m: 5 }];
      const s = modelSystem(modelStore.model, pts, { nPerMember: 1, massModel: 'lumped', barMass: false });
      const sol = modalSolve(s.K, s.M, s.dofs, s.ground);
      expect(sol.modes.length).toBeGreaterThan(0);
      expect(sdofFromModel(modelStore.model, pts, 2, dir)).toBe('coupled');
    });
  }
});

describe('the shear building needs each floor joined', () => {
  for (const beam of [true, false]) {
    it(`two columns ${beam ? 'joined by a floor beam: one floor' : 'with nothing between their tops: refused'}`, () => {
      build(() => {
        const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
        modelStore.addElement(a, b); modelStore.addElement(d, c);
        if (beam) modelStore.addElement(b, c);
        modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
      });
      const r = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 7 }], false);
      if (beam) {
        if (typeof r === 'string') throw new Error(r);
        expect(r.floors).toHaveLength(1);
        expect(r.floors[0].m).toBe(12);
      } else expect(r).toBe('floorSplit');
    });
  }
});

describe('the shear building needs every foot on a support', () => {
  it('a portal with one fixed foot and one free foot is refused', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed');
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('unsupportedBase');
  });
});

describe('a column end turns freely where every floor beam end is released', () => {
  const portal = (releaseI: boolean, releaseJ: boolean, base: 'fixed' | 'pinned' = 'fixed') => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b); modelStore.addElement(d, c);
      const beam = modelStore.addElement(b, c);
      modelStore.addSupport(a, base); modelStore.addSupport(d, base);
      const rel = (on: boolean) => ({ my: false, mz: on, t: false });
      modelStore.updateElement(beam, { releaseI: rel(releaseI), releaseJ: rel(releaseJ) } as never);
    });
    return shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 5 }], false);
  };
  const EI = 200e6 * RECT.iz;
  for (const [ri, rj, factors] of [[false, false, [12, 12]], [true, false, [3, 12]], [true, true, [3, 3]]] as const) {
    it(`floor beam released at ${ri && rj ? 'both ends' : ri ? 'one end' : 'neither end'}: column factors ${factors.join(', ')}`, () => {
      const r = portal(ri, rj);
      if (typeof r === 'string') throw new Error(r);
      expect(r.floors[0].columns.map((c) => c.factor).sort((x, y) => x - y)).toEqual([...factors].sort((x, y) => x - y));
      expect(r.floors[0].k).toBeCloseTo(((factors[0] + factors[1]) * EI) / 27, 3);
    });
  }
  it('pinned feet and a floor beam released at both ends: no storey stiffness, refused', () => {
    expect(portal(true, true, 'pinned')).toBe('noColumns');
  });
});

describe('a floor beam holds a column top only when its far end is held up', () => {
  const EI = 200e6 * RECT.iz;
  it('a fixed column with an overhang to a free node: 3EI/h³, the overhang turning with the top', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(2, 3);
      modelStore.addElement(a, b); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed');
    });
    const r = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    if (typeof r === 'string') throw new Error(r);
    expect(r.floors[0].columns.map((c) => c.factor)).toEqual([3]);
    expect(r.floors[0].k).toBeCloseTo((3 * EI) / 27, 3);
  });
  it('refuses, rather than drops, what turns that top: a load on the overhang, a couple, a vertical mass off the column, rotary inertia, the overhang\'s own mass', () => {
    const overhang = (extra: (beam: number, tip: number) => void) => build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(2, 3);
      modelStore.addElement(a, b);
      const beam = modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed');
      extra(beam, c);
    });
    overhang(() => {});
    expect(typeof shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('object');
    for (const extra of [
      (beam: number) => { modelStore.addPointLoadOnElement(beam, 2, -10); },
      (beam: number) => { modelStore.addDistributedLoad(beam, -10, -10); },
      (_: number, tip: number) => { modelStore.addNodalLoad(tip, 0, -10); },
      () => { modelStore.addNodalLoad(2, 0, 0, 5); },
    ]) {
      overhang(extra);
      expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('turningFloor');
    }
    overhang(() => {});
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 1 }], false)).toBe('turningFloor');
    expect(typeof shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 1, horizontalOnly: true }], false)).toBe('object');
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5, izz: 1 }], false)).toBe('turningFloor');
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], true)).toBe('turningFloor');
  });
  it('an overhang hung from a column top released to it turns all the same: its loads and vertical masses are refused', () => {
    const rel = { my: false, mz: true, t: false };
    const hung = (extra: (beam: number, tip: number) => void) => build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(2, 3);
      modelStore.updateElement(modelStore.addElement(a, b), { releaseJ: rel } as never);
      const beam = modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed');
      extra(beam, c);
    });
    hung(() => {});
    expect(typeof shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('object');
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], true)).toBe('turningFloor');
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 1 }], false)).toBe('turningFloor');
    hung((beam) => { modelStore.addDistributedLoad(beam, -10, -10); });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('turningFloor');
  });
  it('a pinned foot turns with the sway: rotary inertia or a couple there is refused', () => {
    const pinnedPortal = (couple: boolean) => build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(d, 'pinned');
      if (couple) modelStore.addNodalLoad(a, 0, 0, 5);
    });
    pinnedPortal(false);
    expect(typeof shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('object');
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 1, m: 0, izz: 3 }], false)).toBe('turningFloor');
    pinnedPortal(true);
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('turningFloor');
  });
  it('rotary inertia at a fixed base cannot move, and is not refused', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, 'fixed');
    });
    expect(typeof shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 1, m: 0, izz: 3 }], false)).toBe('object');
  });
  it('a free-standing column takes no couple or rotary inertia at its top', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, 'fixed');
      modelStore.addNodalLoad(b, 0, 0, 5);
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('turningFloor');
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3);
      modelStore.addElement(a, b);
      modelStore.addSupport(a, 'fixed');
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5, izz: 2 }], false)).toBe('turningFloor');
  });
  it('a floor beam that reaches the other column only through a pin-ended link is refused, not taken as holding the column top', () => {
    const rel = { my: false, mz: true, t: false };
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), m = modelStore.addNode(2, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, m);
      modelStore.updateElement(modelStore.addElement(m, c), { releaseI: rel, releaseJ: rel } as never);
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('floorHinge');
  });
  it('two overhangs between the same nodes are not an anchor for the column they hang from: 3EI/h³', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(2, 3);
      modelStore.addElement(a, b); modelStore.addElement(b, c); modelStore.addElement(c, b);
      modelStore.addSupport(a, 'fixed');
    });
    expect(modelStore.elements.size).toBe(3);
    const r = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    if (typeof r === 'string') throw new Error(r);
    expect(r.floors[0].columns.map((c) => c.factor)).toEqual([3]);
  });
  it('a floor beam split at a free node between two fixed columns still holds both tops: 12EI/h³ each', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), m = modelStore.addNode(2, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, m); modelStore.addElement(m, c);
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
    });
    const r = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    if (typeof r === 'string') throw new Error(r);
    expect(r.floors[0].columns.map((c) => c.factor)).toEqual([12, 12]);
  });
});

describe('a pin-ended column adds mass but no storey stiffness', () => {
  const rel = { my: false, mz: true, t: false };
  const portal = (base: 'fixed' | 'pinned', pinEnded: boolean) => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      modelStore.addElement(a, b);
      const pin = modelStore.addElement(d, c);
      modelStore.addElement(b, c);
      modelStore.addSupport(a, base); modelStore.addSupport(d, 'pinned');
      if (pinEnded) modelStore.updateElement(pin, { releaseI: rel, releaseJ: rel } as never);
    });
    const r = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], true);
    if (typeof r === 'string') throw new Error(r);
    return r;
  };
  for (const [base, factor] of [['fixed', 12], ['pinned', 3]] as const) {
    it(`a ${base} column beside a pin-ended one: k = ${factor}EI/h³ of the first only, the mass of both`, () => {
      const r = portal(base, true);
      const EI = 200e6 * RECT.iz;
      expect(r.floors[0].columns.map((c) => c.factor).sort((x, y) => x - y)).toEqual([0, factor]);
      expect(r.floors[0].k).toBeCloseTo((factor * EI) / 27, 3);
      expect(r.floors[0].mBars).toBeGreaterThan(0);
      expect(r.floors[0].mBars).toBe(portal(base, false).floors[0].mBars);
    });
  }
});

describe('a column held at a floor only by the column above couples the storeys', () => {
  it('two storeys, continuous columns, floor beams released at both ends: refused', () => {
    const rel = { my: false, mz: true, t: false };
    build(() => {
      const n = [[0, 0], [0, 3], [0, 6], [4, 0], [4, 3], [4, 6]].map(([x, y]) => modelStore.addNode(x, y));
      modelStore.addElement(n[0], n[1]); modelStore.addElement(n[1], n[2]);
      modelStore.addElement(n[3], n[4]); modelStore.addElement(n[4], n[5]);
      for (const [i, j] of [[1, 4], [2, 5]]) modelStore.updateElement(modelStore.addElement(n[i], n[j]), { releaseI: rel, releaseJ: rel } as never);
      modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'fixed');
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: 5 }], false)).toBe('continuousColumn');
  });
});

describe('the shear building takes columns of one section only', () => {
  it('a tapered column is refused: one EI cannot give its storey stiffness', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      const col = modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
      const el = modelStore.elements.get(col)!;
      const other = modelStore.addSection({ ...modelStore.sections.get(el.sectionId)!, name: 'big', iz: 2 * modelStore.sections.get(el.sectionId)!.iz } as never);
      modelStore.updateElement(col, { variableSection: { sectionJ: other } } as never);
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('variableSection');
  });
});

describe('the shear building takes its loads at the floors only', () => {
  it('a horizontal distributed load on a column is refused, not dropped from F', () => {
    build(() => {
      const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
      const col = modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, c);
      modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
      modelStore.addDistributedLoad(col, 5, 5);
    });
    expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('memberLoad');
  });
});

describe('the shear building ignores gravity on its beams and negative point masses', () => {
  const frame = (loads: (beam: number) => void) => build(() => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
    modelStore.addElement(a, b); modelStore.addElement(d, c);
    const beam = modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
    loads(beam);
  });
  it('a vertical load on a beam leaves the model as without it; an angled, axial or couple load is still refused', () => {
    frame(() => {});
    const bare = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    expect(typeof bare).toBe('object');
    frame((beam) => { modelStore.addDistributedLoad(beam, -10, -10); modelStore.addPointLoadOnElement(beam, 2, -5); });
    const loaded = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    expect(loaded).toEqual(bare);
    for (const add of [
      (beam: number) => modelStore.addDistributedLoad(beam, -10, -10, 30),
      (beam: number) => modelStore.addDistributedLoad(beam, -10, -10, 0, true),
      (beam: number) => modelStore.addPointLoadOnElement(beam, 2, -5, { px: 3 }),
      (beam: number) => modelStore.addPointLoadOnElement(beam, 2, 0, { my: 3 }),
    ]) {
      frame(add);
      expect(shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false)).toBe('memberLoad');
    }
  });
  it('a negative point mass is not subtracted from the floor', () => {
    frame(() => {});
    const one = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }], false);
    const neg = shearBuilding(modelStore.model, [{ nodeId: 2, m: 5 }, { nodeId: 3, m: -2 }], false);
    expect(neg).toEqual(one);
  });
});

describe('truss mass at a support in a turned frame', () => {
  for (const angle of [0, 35]) {
    it(`a triangle truss on a roller at ${angle}°: consistent-mass frequencies equal the engine's`, () => {
      build(() => {
        const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0), c = modelStore.addNode(2, 3);
        modelStore.addElement(a, b, 'truss'); modelStore.addElement(b, c, 'truss'); modelStore.addElement(a, c, 'truss');
        modelStore.addSupport(a, 'pinned');
        modelStore.addSupport(b, 'rollerX', undefined, { angle });
      });
      const mine = frequenciesOf(modelStore.model, [], { nPerMember: 1, massModel: 'consistent', barMass: true }, 3).f;
      const eng = engineFrequencies(1);
      expect(mine).toHaveLength(3);
      expect(eng.length).toBeGreaterThanOrEqual(3);
      mine.forEach((f, i) => expect(f / eng[i]).toBeCloseTo(1, 6));
    });
  }
});

describe('static condensation against the engine', () => {
  it('a three-element cantilever condensed onto its tip: the engine\'s Guyan reduction and the exact tip stiffness', () => {
    cantilever(3);
    const s = modelSystem(modelStore.model, [], { nPerMember: 3, massModel: 'consistent', barMass: true });
    const tip = s.fullDofs.map((d, i) => (d.nodeId === 2 ? i : -1)).filter((i) => i >= 0);
    const c = condense(s.fullK, s.fullM, s.fullF, tip);
    const sub = subdivideForAnalysis(modelStore.model, 3);
    const g = guyanReduce2D({ solver: buildSolverInput2D(sub.model)!, boundaryNodes: [2] });
    expect(g.nBoundary).toBe(3);
    expect(g.nInterior).toBe(6);
    const kc: number[] = g.kCondensed;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(c.K[i][j]).toBeCloseTo(kc[i * 3 + j], 3);
    const EI = 200e6 * RECT.iz, L = 3;
    expect(c.K[1][1]).toBeCloseTo((12 * EI) / L ** 3, 3);
    expect(c.K[1][2]).toBeCloseTo((-6 * EI) / L ** 2, 3);
    expect(c.K[2][2]).toBeCloseTo((4 * EI) / L, 3);
  });
});

describe('the single degree of freedom against the engine', () => {
  const m = 2, k = 800, xi = 0.05;

  it('the synthetic one-degree system has ω = √(k/m) in the engine', () => {
    const syn = sdofSyntheticInput(m, k);
    const r = solveModal(syn.input, syn.densities, 1);
    expect(r.modes[0].omega).toBeCloseTo(Math.sqrt(k / m), 6);
  });

  it('the engine\'s harmonic amplitude is D·F0/k', () => {
    const syn = sdofSyntheticInput(m, k);
    const p = sdofProps(m, k, xi);
    for (const beta of [0.5, 1, 2]) {
      const W = beta * p.omega;
      const r = solveHarmonic2D({ solver: syn.forced(10), densities: densityRecord(syn.densities), frequencies: [W / (2 * Math.PI)], dampingRatio: xi, responseNodeId: syn.node, responseDof: 'x' });
      expect(r.responsePoints[0].amplitude).toBeCloseTo(harmonic(p, 10, W).X, 6);
    }
  });

  it('the engine\'s time history from rest follows transient + steady state', () => {
    const syn = sdofSyntheticInput(m, k);
    const p = sdofProps(m, k, 0);
    const W = 0.6 * p.omega, F0 = 10;
    const dt = p.T / 200, nSteps = 800;
    const forceHistory = Array.from({ length: nSteps + 1 }, (_, i) => ({ time: i * dt, loads: [{ nodeId: syn.node, fx: F0 * Math.sin(W * i * dt), fz: 0, my: 0 }] }));
    const r = solveTimeHistory2D({ solver: syn.input, densities: syn.densities, timeStep: dt, nSteps, forceHistory });
    const ux: number[] = r.nodeHistories.find((h: { nodeId: number }) => h.nodeId === syn.node).ux;
    const exact = forcedResponse(p, harmonic(p, F0, W), 0, 0).total;
    const peak = Math.max(...ux.map(Math.abs));
    for (const i of [100, 250, 400, 650, 800]) expect(Math.abs(ux[i] - exact(i * dt))).toBeLessThan(0.01 * peak);
  });
});

describe('the shear building is the frame alone', () => {
  const parts: Array<[string, object]> = [
    ['a plate', { plates: new Map([[1, { id: 1, nodes: [1, 2, 3], materialId: 1, thickness: 0.1 }]]) }],
    ['a quad', { quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.1 }]]) }],
    ['a constraint', { constraints: [{ type: 'rigidLink', master: 2, slave: 3 }] }],
    ['a connector', { connectors: new Map([[1, { id: 1, nodeI: 2, nodeJ: 3 }]]) }],
  ];
  for (const [name, extra] of parts) {
    it(`a portal with ${name} is refused: its stiffness would not enter the storeys`, () => {
      build(() => {
        const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 3), c = modelStore.addNode(4, 3), d = modelStore.addNode(4, 0);
        modelStore.addElement(a, b); modelStore.addElement(d, c); modelStore.addElement(b, c);
        modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, 'fixed');
      });
      const plain = { ...modelStore.model, plates: new Map(), quads: new Map(), constraints: [], connectors: new Map() };
      expect(typeof shearBuilding(plain, [{ nodeId: 2, m: 5 }], false)).toBe('object');
      expect(shearBuilding({ ...plain, ...extra } as never, [{ nodeId: 2, m: 5 }], false)).toBe('otherParts');
    });
  }
});

describe('the engine time history has a step budget', () => {
  for (const ratio of [1e-4, 1e4]) {
    it(`Ω/ω = ${ratio}: refused before any step is built, with the reason`, () => {
      const p = sdofProps(1, 1, 0.05);
      const h = harmonic(p, 1, ratio * p.omega);
      const t0 = Date.now();
      const r = engineCheck(p, h, timeWindow(p, h.Omega), 8);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(r.history).toBeNull();
      expect(r.historyTooLong).toBe(true);
      expect(r.omega).toBeCloseTo(1, 9);
    });
  }

  it('Ω/ω = 2: run, within the budget, matching the closed form', () => {
    const p = sdofProps(1, 1, 0.05);
    const h = harmonic(p, 1, 2 * p.omega);
    const tEnd = timeWindow(p, h.Omega);
    const r = engineCheck(p, h, tEnd, 8);
    expect(r.historyTooLong).toBe(false);
    expect(r.history).not.toBeNull();
    const fr = forcedResponse(p, h, 0, 0);
    const amp = Math.abs(h.X);
    for (const [t, u] of r.history!.slice(1)) expect(Math.abs(u - fr.total(t))).toBeLessThan(0.02 * amp);
    expect(MAX_HISTORY_STEPS).toBeGreaterThan(0);
  });
});
