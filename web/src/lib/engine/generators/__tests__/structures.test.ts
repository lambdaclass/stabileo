/**
 * The structure generators: counts that follow from the parameters in closed form, geometry
 * that lands where it should, and, for every kind, a real solve that comes back finite and in
 * equilibrium. A mechanism satisfies every count; only the solver sees it.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STRUCTURE_PARAMS, STRUCTURE_KINDS, generateStructure, validateStructureParams, type StructureKind,
} from '../structures';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../emit';
import { modelFromFixture, assertRealSolver } from '../../design/__tests__/helpers';
import { validateAndSolve3D } from '../../solver-service';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 160'), post: defaultProfileSpec('L 50x50x5'), diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 200'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 240'),
  purlin: defaultProfileSpec('UPN 100'), bracing: defaultProfileSpec('L 50x50x5'),
};

const gen = (kind: StructureKind, over: Record<string, unknown> = {}) =>
  generateStructure(kind, { ...DEFAULT_STRUCTURE_PARAMS[kind], ...over } as never)!;

describe('counts', () => {
  it('a space frame: columns per storey at every intersection, beams both ways per floor', () => {
    const t = gen('spaceFrame', { baysX: '6; 6; 6', baysY: '5; 5', storeys: '3; 3' });
    // 4 × 3 intersections, 3 levels.
    expect(t.nodes).toHaveLength(36);
    expect(t.counts.column).toBe(12 * 2);
    expect(t.counts.beam).toBe(2 * (3 * 3 + 4 * 2));
    expect(t.supports).toHaveLength(12);
    expect(t.supports.every((s) => s.type === 'fixed')).toBe(true);
  });

  it('a plane frame lies in XZ', () => {
    const t = gen('planeFrame', { baysX: '6; 7,5', storeys: '4' });
    expect(t.nodes.every((n) => n.y === 0)).toBe(true);
    expect(t.counts.column).toBe(3);
    expect(t.counts.beam).toBe(2);
  });

  it('a floor grid', () => {
    const t = gen('floorGrid', { baysX: '3x4', baysY: '2x5', supportsAt: 'perimeter' });
    expect(t.nodes).toHaveLength(4 * 3);
    expect(t.counts.beam).toBe(3 * 3 + 4 * 2);
    expect(t.supports).toHaveLength(10);
    expect(gen('floorGrid', { supportsAt: 'corners' }).supports).toHaveLength(4);
  });

  it('a continuous beam: a fork pin and fork rollers', () => {
    const t = gen('continuousBeam', { spans: '5; 6; 5' });
    expect(t.nodes.map((n) => n.x)).toEqual([0, 5, 11, 16]);
    expect(t.supports.map((s) => s.type)).toEqual(['forkPinned', 'forkRollerX', 'forkRollerX', 'forkRollerX']);
  });

  it('a space truss, square on square', () => {
    const t = gen('spaceTruss', { baysX: '3x2', baysY: '2x2', depth: 1.5 });
    // Top 4 × 3, bottom 3 × 2 under the centres.
    expect(t.nodes).toHaveLength(12 + 6);
    expect(t.counts.chord).toBe((3 * 3 + 4 * 2) + (2 * 2 + 3 * 1));
    expect(t.counts.diagonal).toBe(6 * 4);
    expect(t.members.every((m) => m.type === 'truss')).toBe(true);
    expect(Math.min(...t.nodes.map((n) => n.z))).toBe(-1.5);
  });

  it('a lattice girder with X or K bracing', () => {
    const x = gen('latticeGirder', { span: 12, panels: 6, depth: 1, bracing: 'x' });
    expect(x.counts).toMatchObject({ chord: 12, post: 7, diagonal: 12 });
    const k = gen('latticeGirder', { span: 12, panels: 6, depth: 1, bracing: 'k' });
    // Interior posts are split at mid-height; each panel has two diagonals.
    expect(k.nodes).toHaveLength(14 + 5);
    expect(k.counts.post).toBe(2 + 5 * 2);
    expect(k.counts.diagonal).toBe(12);
    expect(validateStructureParams('latticeGirder', { ...DEFAULT_STRUCTURE_PARAMS.latticeGirder, bracing: 'k', panels: 1 })).toHaveLength(1);
  });

  it('a Howe roof is the triangular truss with a Howe web', () => {
    const t = gen('howeRoof', { span: 12, rise: 2, panelsPerHalf: 3 });
    expect(Math.max(...t.nodes.map((n) => n.z))).toBeCloseTo(2, 9);
    expect(t.slopePercent).toBeCloseTo((2 / 6) * 100, 6);
  });

  it('a sawtooth roof: one tall post per tooth, rising slope', () => {
    const t = gen('sawtooth', { teeth: 3, toothSpan: 8, height: 2, panelsPerTooth: 4 });
    const tall = t.members.filter((m) => m.role === 'post' && m.type === 'frame');
    expect(tall).toHaveLength(3);
    expect(Math.max(...t.nodes.map((n) => n.z))).toBe(2);
    expect(t.slopePercent).toBe(25);
  });

  it('a barrel vault springs at z = 0 on both sides', () => {
    const t = gen('cylindricalVault', { radius: 10, angle: 120, arcDivisions: 6, baysY: '2x5', bracing: 'x' });
    const spring = t.nodes.filter((n) => Math.abs(n.z) < 1e-9);
    expect(spring).toHaveLength(2 * 3);
    expect(Math.max(...t.nodes.map((n) => n.z))).toBeCloseTo(10 * (1 - Math.cos(Math.PI / 3)), 9);
    expect(t.counts.rafter).toBe(6 * 3);
    expect(t.counts.purlin).toBe(7 * 2);
    expect(t.counts.bracing).toBe(6 * 2 * 2);
  });

  it('a circular beam keeps its radius, and a full ring closes', () => {
    const t = gen('circularBeam', { radius: 8, angle: 90, segments: 6 });
    for (const n of t.nodes) expect(Math.hypot(n.x, n.y - 8)).toBeCloseTo(8, 6);
    expect(t.members).toHaveLength(6);
    const ring = gen('circularBeam', { radius: 8, angle: 360, segments: 12 });
    expect(ring.nodes).toHaveLength(12);
    expect(ring.members).toHaveLength(12);
  });

  it('a dome reaches its rise at the crown', () => {
    const t = gen('dome', { baseRadius: 10, rise: 4, meridians: 8, rings: 3, diagonals: true });
    expect(t.nodes).toHaveLength(8 * 4 + 1);
    expect(Math.max(...t.nodes.map((n) => n.z))).toBeCloseTo(4, 9);
    expect(t.counts.purlin).toBe(8 * 4);
    expect(t.counts.rafter).toBe(8 * 4);
    expect(t.counts.bracing).toBe(8 * 3);
    expect(validateStructureParams('dome', { ...DEFAULT_STRUCTURE_PARAMS.dome, rise: 12 })).toHaveLength(1);
  });

  it('refuses bays it cannot read', () => {
    expect(generateStructure('spaceFrame', { ...DEFAULT_STRUCTURE_PARAMS.spaceFrame, baysX: '6; x' })).toBeNull();
  });
});

describe('every kind solves', () => {
  it.each([...STRUCTURE_KINDS])('%s', (kind) => {
    assertRealSolver();
    const t = gen(kind);
    const g = emitModel(t, { name: kind, profiles: PROFILES });
    const top = g.json.nodes.reduce((b, n) => (n.z > b.z ? n : b), g.json.nodes[0]!);
    // Load the highest node that is not on a support, straight down.
    const supported = new Set(g.json.supports.map((s) => s.nodeId));
    const loaded = [...g.json.nodes].filter((n) => !supported.has(n.id)).sort((a, b) => b.z - a.z || a.x - b.x)[0] ?? top;
    const fm = modelFromFixture({
      ...g.json,
      loadCases: [{ id: 1, type: 'dead', name: 'D' }],
      loads: [{ type: 'nodal3d', data: { id: 1, nodeId: loaded.id, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 1 } }],
    } as never);
    const res = validateAndSolve3D(fm.model, false, false);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }>; reactions: Array<{ fz?: number }> };
    for (const d of r.displacements) expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
    const fz = r.reactions.reduce((s, x) => s + (x.fz ?? 0), 0);
    expect(fz).toBeCloseTo(10, 3);
  });
});
