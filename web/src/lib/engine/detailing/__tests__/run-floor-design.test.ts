/**
 * The adapter that makes PR18 reachable, driven the way production drives it.
 *
 * Every input here is the shape the model and the solver actually produce: nodes with
 * coordinates, shells with a node list and a thickness, and `mx`/`my`/`mxy` per element as
 * `QuadStress` reports them. Nothing is a hand-built `DetailingAssembly`, because an
 * assembly built by hand proves only that the renderer accepts one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  classifyShell, floorDesignReadiness, planExtent, runFloorDesign, shellNormal,
  supportedSideCount, type FloorShell, type FloorNode, type RunFloorDesignInput,
} from '../run-floor-design';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A 5 × 5 m slab panel at +3,00 with a wall standing under one of its edges. */
function model() {
  const nodes = new Map<number, FloorNode>([
    // Slab corners at +3,00.
    [1, { x: 0, y: 0, z: 3 }], [2, { x: 5, y: 0, z: 3 }],
    [3, { x: 5, y: 5, z: 3 }], [4, { x: 0, y: 5, z: 3 }],
    // Wall base at 0,00 and head at +3,00, running along y = 0.
    [5, { x: 0, y: 0, z: 0 }], [6, { x: 5, y: 0, z: 0 }],
  ]);
  const shells: FloorShell[] = [
    { id: 10, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.20 },
    { id: 20, nodes: [5, 6, 2, 1], materialId: 1, thickness: 0.20 },
  ];
  return { nodes, shells };
}

function input(over: Partial<RunFloorDesignInput> = {}): RunFloorDesignInput {
  const { nodes, shells } = model();
  return {
    nodes, shells,
    stresses: [
      { elementId: 10, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 40, my: 30, mxy: 8 },
      { elementId: 20, sigmaXx: -2000, sigmaYy: -3000, tauXy: 400, mx: 0, my: 0, mxy: 0 },
    ],
    factoredAreaLoad: new Map([[10, 12]]),
    fc: 25, fy: 420, cover: 0.025, maxAggregateSizeMm: 20, wallBarDiameterMm: 12,
    edition: '2025', verifierId: 'cirsoc201.provided.v2.2025',
    demandRevision: 5, seismicRequired: false, membersVerified: true,
    // Three distinct stages, so a test that asserts staleness can move one of them alone.
    revisions: { analysis: 6, loads: 4, regulation: 2 },
    regulationIds: ['cirsoc-201'],
    ...over,
  };
}

describe('shell classification', () => {
  it('separates slabs from walls by their plane, not by a name', () => {
    const { nodes, shells } = model();
    const pts = (s: FloorShell) => s.nodes.map((n) => nodes.get(n)!);
    expect(classifyShell(10, pts(shells[0])).family).toBe('slab');
    expect(classifyShell(20, pts(shells[1])).family).toBe('wall');
  });

  it('refuses to guess for a shell that is neither', () => {
    const pts: FloorNode[] = [
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 4, y: 3, z: 3 }, { x: 0, y: 3, z: 3 },
    ];
    // 45°: designing it as a slab applies Ch. 7/8, as a wall Ch. 11. Both would be wrong.
    expect(classifyShell(99, pts).family).toBe('inclined');
  });

  it('reports a degenerate shell rather than dividing by its zero-length normal', () => {
    const pts: FloorNode[] = [
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
    ];
    expect(classifyShell(98, pts).family).toBe('degenerate');
    expect(shellNormal(pts)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('gives a horizontal shell a unit normal regardless of node winding', () => {
    const cw: FloorNode[] = [
      { x: 0, y: 0, z: 3 }, { x: 0, y: 5, z: 3 }, { x: 5, y: 5, z: 3 }, { x: 5, y: 0, z: 3 },
    ];
    expect(Math.abs(shellNormal(cw).z)).toBeCloseTo(1, 9);
  });
});

describe('plan extent', () => {
  it('accepts an axis-aligned rectangle and measures it', () => {
    const e = planExtent([
      { x: 1, y: 2, z: 3 }, { x: 6, y: 2, z: 3 }, { x: 6, y: 7, z: 3 }, { x: 1, y: 7, z: 3 },
    ]);
    expect(e).toMatchObject({ x0: 1, y0: 2, lx: 5, ly: 5, axisAligned: true });
  });

  it('rejects a panel whose corners are not on the bounding box', () => {
    // A trapezoid has the same bounding box as the rectangle it is inscribed in, so a
    // bbox-only test would design it as that rectangle and lay bars over concrete that is
    // not there.
    const e = planExtent([
      { x: 0, y: 0, z: 3 }, { x: 5, y: 0, z: 3 }, { x: 4, y: 5, z: 3 }, { x: 1, y: 5, z: 3 },
    ]);
    expect(e.axisAligned).toBe(false);
  });
});

describe('supported sides', () => {
  it('counts only edges genuinely shared with another shell', () => {
    const { shells } = model();
    // The slab and the wall share the edge 1–2.
    expect(supportedSideCount(shells[0], shells)).toBe(1);
  });
});

describe('runFloorDesign — the production path', () => {
  it('designs a slab from the solver moments the model actually produced', () => {
    const r = runFloorDesign(input());
    expect(r.slabs).toHaveLength(1);
    // mxy is folded in by Wood-Armer, not discarded: the bottom design moment in x is
    // mx + |mxy| = 48, strictly greater than the 40 the solver reported.
    expect(r.slabs[0].design.bottomX).toBeCloseTo(48, 6);
    expect(r.slabs[0].design.bottomY).toBeCloseTo(38, 6);
    expect(r.slabs[0].layers.length).toBeGreaterThan(0);
  });

  it('designs a wall from the same run', () => {
    const r = runFloorDesign(input());
    expect(r.walls).toHaveLength(1);
    expect(r.walls[0].wallId).toBe('W20');
    expect(r.walls[0].shear.vu).toBeGreaterThan(0);
  });

  it('produces real assemblies with real bars, one per level', () => {
    const r = runFloorDesign(input());
    expect(r.assemblies.length).toBeGreaterThan(0);
    const bars = r.assemblies.flatMap((a) => a.bars);
    expect(bars.length).toBeGreaterThan(0);
    // Slab bars and wall bars both reached the assembly.
    expect(bars.some((b) => b.id.startsWith('P10-'))).toBe(true);
    expect(bars.some((b) => b.id.startsWith('W20-'))).toBe(true);
    // And every bar carries the element it belongs to, so a conflict is attributable.
    expect(bars.every((b) => b.ownerElementIds.length > 0)).toBe(true);
  });

  it('marks and weighs what it produced', () => {
    const r = runFloorDesign(input());
    const marks = r.assemblies.flatMap((a) => a.marks);
    expect(marks.length).toBeGreaterThan(0);
    const scheduled = new Set(marks.flatMap((m) => m.barIds));
    const produced = new Set(r.assemblies.flatMap((a) => a.bars).map((b) => b.id));
    // Reconciled against the PATHS: nothing scheduled that does not exist, nothing missed.
    expect([...scheduled].every((id) => produced.has(id))).toBe(true);
    expect(scheduled.size).toBe(produced.size);
  });

  it('is deterministic under input reordering', () => {
    const a = runFloorDesign(input());
    const base = input();
    const b = runFloorDesign({ ...base, shells: [...base.shells].reverse() });
    expect(b.assemblies.map((x) => x.id)).toEqual(a.assemblies.map((x) => x.id));
    expect(b.assemblies.flatMap((x) => x.bars.map((y) => y.id)).sort())
      .toEqual(a.assemblies.flatMap((x) => x.bars.map((y) => y.id)).sort());
  });
});

describe('runFloorDesign — what it refuses to invent', () => {
  it('does not design a shell the solver has no result for', () => {
    const r = runFloorDesign(input({ stresses: [] }));
    expect(r.slabs).toEqual([]);
    expect(r.unsupported.map((u) => u.message.key))
      .toContain('detailing.floorRun.noSolverResult');
  });

  it('does not check one-way shear against a load that was never applied', () => {
    const r = runFloorDesign(input({ factoredAreaLoad: new Map() }));
    expect(r.slabs).toEqual([]);
    expect(r.unsupported.map((u) => u.message.key))
      .toContain('detailing.floorRun.noAreaLoad');
  });

  it('does not design a non-rectangular panel as the rectangle around it', () => {
    const { nodes, shells } = model();
    nodes.set(3, { x: 4, y: 5, z: 3 });
    const r = runFloorDesign(input({ nodes, shells }));
    expect(r.unsupported.map((u) => u.message.key))
      .toContain('detailing.floorRun.nonRectangularPanel');
  });

  it('says so when a wall moment came from membrane stress rather than a derivation', () => {
    const r = runFloorDesign(input());
    expect(r.unsupported.map((u) => u.message.key))
      .toContain('detailing.floorRun.wallMomentFromMembraneOnly');
    // And stops saying so once the caller supplies the real demands.
    const supplied = runFloorDesign(input({
      wallDemands: new Map([[20, { pu: 800, muInPlane: 300, vuInPlane: 200 }]]),
    }));
    expect(supplied.unsupported.map((u) => u.message.key))
      .not.toContain('detailing.floorRun.wallMomentFromMembraneOnly');
    expect(supplied.walls[0].axialFlexure.mu).toBeGreaterThan(0);
  });

  it('produces no footings, and the reason is data rather than engineering', () => {
    const r = runFloorDesign(input());
    // `checkFooting` is complete and tested. The model carries no foundation entity — no
    // B, no L, no thickness, no allowable bearing — so there is nothing to read. Inventing
    // one under every support would be numbers with the appearance of a design.
    expect(r.assemblies.every((a) => a.bars.every((b) => !b.id.includes('dowel')))).toBe(true);
    const src = readFileSync(resolve(HERE, '../run-floor-design.ts'), 'utf8');
    expect(src).toMatch(/model carries no foundation entity/);
  });
});

describe('readiness explains a disabled command', () => {
  it('is not ready with no shells', () => {
    const r = floorDesignReadiness({ shells: [], stresses: [] });
    expect(r.ready).toBe(false);
    expect(r.reasons.map((m) => m.key)).toEqual(['detailing.floorRun.noShells']);
  });

  it('is not ready with shells but no results', () => {
    const r = floorDesignReadiness({ shells: [{ id: 10 }], stresses: [] });
    expect(r.ready).toBe(false);
    expect(r.reasons.map((m) => m.key)).toEqual(['detailing.floorRun.notSolved']);
  });

  it('is ready once the model is solved', () => {
    const r = floorDesignReadiness({ shells: [{ id: 10 }], stresses: [{ elementId: 10 }] });
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });
});

describe('CALL-GRAPH gate — the modules PR18 left orphaned now have a caller', () => {
  const sourceFiles = (root: string): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'wasm') continue;
        const full = resolve(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|svelte)$/.test(e.name)) out.push(full);
      }
    };
    walk(root);
    return out;
  };

  it.each([
    ['designSlabPanel'],
    ['designWall'],
    ['buildFloorAssembly'],
  ])('%s is called from production code, not only from a test', (fn) => {
    // This is the gate the forensic audit needed and did not have. Each of these had zero
    // callers outside its own unit test, which is how ~1 550 lines of correct engine came
    // to be described as delivered.
    const callers = sourceFiles(resolve(HERE, '../../..'))
      .filter((f) => !f.endsWith(`${fn}.ts`))
      .filter((f) => new RegExp(`\\b${fn}\\s*\\(`).test(readFileSync(f, 'utf8')));
    expect(callers.map((f) => f.split('/').pop())).not.toEqual([]);
  });
});
