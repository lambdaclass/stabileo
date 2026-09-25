/**
 * The structure generators beyond the truss, the latticed column and the shed.
 *
 * Each is a topology, in the same shape `truss-topology.ts` produces (nodes, members with a role
 * and a type, supports), so the same emitter gives them profiles per role and a material, the
 * same preview draws them, and the same insertion places them into a model. Plane structures are
 * generated in the XZ plane with the span along +X; plan structures (grids, floors, domes) sit on
 * z = 0 with their origin at the first support.
 *
 * Bays are typed as lists ("6; 7,5; 6", "3x5"), read by the same function as every other list of
 * spacings, so a building's bays and a repeat's spacings are the same thing to type.
 *
 * Pure: no store, no runes, no i18n.
 */
import { parseSpacings } from '../../model/edit/affine';
import { axesFromBays, frameBetweenAxes, levelsFromHeights, type StructuralGrid } from '../../model/grid';
import { tallyRoles, type MemberRole } from './member-roles';
import { generateTruss, type GenMember, type GenNode, type GenSupport, type Topology } from './truss-topology';

export const STRUCTURE_KINDS = [
  'spaceFrame', 'planeFrame', 'floorGrid', 'continuousBeam',
  'spaceTruss', 'latticeGirder', 'howeRoof', 'sawtooth',
  'cylindricalVault', 'circularBeam', 'dome',
] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export type ParamValue = number | string | boolean;
export type StructureParams = Record<string, ParamValue>;

export interface FieldSpec {
  key: string;
  type: 'number' | 'int' | 'bays' | 'bool' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export const STRUCTURE_FIELDS: Record<StructureKind, FieldSpec[]> = {
  spaceFrame: [
    { key: 'baysX', type: 'bays' }, { key: 'baysY', type: 'bays' }, { key: 'storeys', type: 'bays' },
    { key: 'fixedBase', type: 'bool' },
  ],
  planeFrame: [{ key: 'baysX', type: 'bays' }, { key: 'storeys', type: 'bays' }, { key: 'fixedBase', type: 'bool' }],
  floorGrid: [
    { key: 'baysX', type: 'bays' }, { key: 'baysY', type: 'bays' },
    { key: 'supportsAt', type: 'select', options: ['perimeter', 'corners'] },
  ],
  continuousBeam: [{ key: 'spans', type: 'bays' }],
  spaceTruss: [{ key: 'baysX', type: 'bays' }, { key: 'baysY', type: 'bays' }, { key: 'depth', type: 'number', min: 0.1, step: 0.1 }],
  latticeGirder: [
    { key: 'span', type: 'number', min: 0.5, step: 0.5 }, { key: 'panels', type: 'int', min: 1, max: 200 },
    { key: 'depth', type: 'number', min: 0.1, step: 0.1 }, { key: 'bracing', type: 'select', options: ['x', 'k'] },
  ],
  howeRoof: [
    { key: 'span', type: 'number', min: 0.5, step: 0.5 }, { key: 'rise', type: 'number', min: 0.1, step: 0.1 },
    { key: 'panelsPerHalf', type: 'int', min: 1, max: 100 },
  ],
  sawtooth: [
    { key: 'teeth', type: 'int', min: 1, max: 50 }, { key: 'toothSpan', type: 'number', min: 0.5, step: 0.5 },
    { key: 'height', type: 'number', min: 0.1, step: 0.1 }, { key: 'panelsPerTooth', type: 'int', min: 1, max: 20 },
  ],
  cylindricalVault: [
    { key: 'radius', type: 'number', min: 0.5, step: 0.5 }, { key: 'angle', type: 'number', min: 10, max: 180, step: 5 },
    { key: 'arcDivisions', type: 'int', min: 2, max: 100 }, { key: 'baysY', type: 'bays' },
    { key: 'bracing', type: 'select', options: ['none', 'single', 'x'] },
  ],
  circularBeam: [
    { key: 'radius', type: 'number', min: 0.5, step: 0.5 }, { key: 'angle', type: 'number', min: 5, max: 360, step: 5 },
    { key: 'segments', type: 'int', min: 2, max: 360 },
  ],
  dome: [
    { key: 'baseRadius', type: 'number', min: 0.5, step: 0.5 }, { key: 'rise', type: 'number', min: 0.1, step: 0.1 },
    { key: 'meridians', type: 'int', min: 3, max: 120 }, { key: 'rings', type: 'int', min: 1, max: 60 },
    { key: 'diagonals', type: 'bool' },
  ],
};

export const DEFAULT_STRUCTURE_PARAMS: Record<StructureKind, StructureParams> = {
  spaceFrame: { baysX: '6; 6; 6', baysY: '5; 5', storeys: '3,5; 3; 3', fixedBase: true },
  planeFrame: { baysX: '6; 6', storeys: '3,5; 3', fixedBase: true },
  floorGrid: { baysX: '3x4', baysY: '3x4', supportsAt: 'perimeter' },
  continuousBeam: { spans: '5; 6; 5' },
  spaceTruss: { baysX: '6x2', baysY: '4x2', depth: 1.4 },
  latticeGirder: { span: 12, panels: 8, depth: 1.2, bracing: 'x' },
  howeRoof: { span: 12, rise: 2, panelsPerHalf: 4 },
  sawtooth: { teeth: 4, toothSpan: 8, height: 2.5, panelsPerTooth: 4 },
  cylindricalVault: { radius: 10, angle: 120, arcDivisions: 12, baysY: '5x6', bracing: 'single' },
  circularBeam: { radius: 8, angle: 90, segments: 12 },
  dome: { baseRadius: 10, rise: 4, meridians: 16, rings: 5, diagonals: false },
};

export const MAX_STRUCTURE_MEMBERS = 20000;

export interface StructureProblem { field: string; key: string }

const num = (p: StructureParams, k: string) => Number(p[k]);
const bays = (p: StructureParams, k: string) => parseSpacings(String(p[k] ?? ''));

export function validateStructureParams(kind: StructureKind, p: StructureParams): StructureProblem[] {
  const out: StructureProblem[] = [];
  for (const f of STRUCTURE_FIELDS[kind]) {
    const v = p[f.key];
    if (f.type === 'bays') { if (!bays(p, f.key)) out.push({ field: f.key, key: 'generator.problem.bays' }); continue; }
    if (f.type === 'number' || f.type === 'int') {
      const n = Number(v);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max) || (f.type === 'int' && !Number.isInteger(n))) {
        out.push({ field: f.key, key: 'generator.problem.range' });
      }
    }
    if (f.type === 'select' && !f.options!.includes(String(v))) out.push({ field: f.key, key: 'generator.problem.range' });
  }
  if (kind === 'dome' && out.length === 0 && num(p, 'rise') > num(p, 'baseRadius')) out.push({ field: 'rise', key: 'generator.problem.domeRise' });
  if (kind === 'latticeGirder' && out.length === 0 && p.bracing === 'k' && num(p, 'panels') < 2) out.push({ field: 'panels', key: 'generator.problem.kPanels' });
  return out;
}

/** The topology, or null while the parameters are invalid or it would be too large. */
export function generateStructure(kind: StructureKind, p: StructureParams): Topology | null {
  if (validateStructureParams(kind, p).length > 0) return null;
  const t = BUILDERS[kind](p);
  return t && t.members.length <= MAX_STRUCTURE_MEMBERS ? t : null;
}

// ─── Building blocks ───────────────────────────────────────────────

class Builder {
  nodes: GenNode[] = [];
  members: GenMember[] = [];
  supports: GenSupport[] = [];
  assumptions: string[] = [];
  private at = new Map<string, number>();
  node(x: number, y: number, z: number): number {
    const k = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    const hit = this.at.get(k);
    if (hit !== undefined) return hit;
    const i = this.nodes.length;
    this.nodes.push({ i, x: clean(x), y: clean(y), z: clean(z) });
    this.at.set(k, i);
    return i;
  }
  member(a: number, b: number, role: MemberRole, type: 'frame' | 'truss' = 'frame'): void {
    if (a !== b) this.members.push({ a, b, role, type });
  }
  support(node: number, type: GenSupport['type']): void {
    if (!this.supports.some((s) => s.node === node)) this.supports.push({ node, type });
  }
  done(slopePercent: number | null = null): Topology {
    let total = 0;
    for (const m of this.members) {
      const a = this.nodes[m.a]!, b = this.nodes[m.b]!;
      total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    return {
      nodes: this.nodes, members: this.members, supports: this.supports,
      counts: tallyRoles(this.members), totalLengthM: total, slopePercent, assumptions: [...new Set(this.assumptions)],
    };
  }
}

const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9);
const stations = (list: number[]) => { const s = [0]; for (const b of list) s.push(s[s.length - 1]! + b); return s; };

function gridOf(baysX: number[], baysY: number[], storeys: number[]): StructuralGrid {
  return {
    axes: [...axesFromBays(baysX, 'x', 0, 'numbers', '1'), ...axesFromBays(baysY, 'y', 0, 'letters', 'A')],
    levels: levelsFromHeights(storeys, 0),
  };
}

/** Columns and beams on a grid: the same layout "columns and beams between axes" lays. */
function frameOnGrid(g: StructuralGrid, fixedBase: boolean): Topology {
  const xs = g.axes.filter((a) => a.axis === 'x'), ys = g.axes.filter((a) => a.axis === 'y');
  const L = frameBetweenAxes(g, {
    x: [xs[0]!.id, xs[xs.length - 1]!.id], y: [ys[0]!.id, ys[ys.length - 1]!.id],
    levels: [g.levels[0]!.id, g.levels[g.levels.length - 1]!.id],
    columns: { sectionId: 0, materialId: 0 }, beamsX: { sectionId: 0, materialId: 0 },
    beamsY: ys.length > 1 ? { sectionId: 0, materialId: 0 } : null,
  })!;
  const b = new Builder();
  const idx = new Map<number, number>();
  for (const n of L.nodes) idx.set(n.id, b.node(n.x, n.y, n.z));
  for (const m of L.members) b.member(idx.get(m.nodeI)!, idx.get(m.nodeJ)!, m.role === 'column' ? 'column' : 'beam');
  for (const n of L.nodes) if (Math.abs(n.z) < 1e-9) b.support(idx.get(n.id)!, fixedBase ? 'fixed' : 'pinned');
  return b.done();
}

// ─── The generators ────────────────────────────────────────────────

const BUILDERS: Record<StructureKind, (p: StructureParams) => Topology | null> = {
  spaceFrame: (p) => frameOnGrid(gridOf(bays(p, 'baysX')!, bays(p, 'baysY')!, bays(p, 'storeys')!), !!p.fixedBase),

  planeFrame: (p) => frameOnGrid(gridOf(bays(p, 'baysX')!, [], bays(p, 'storeys')!), !!p.fixedBase),

  floorGrid: (p) => {
    const xs = stations(bays(p, 'baysX')!), ys = stations(bays(p, 'baysY')!);
    const b = new Builder();
    const id = (i: number, j: number) => b.node(xs[i]!, ys[j]!, 0);
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
      if (i > 0) b.member(id(i - 1, j), id(i, j), 'beam');
      if (j > 0) b.member(id(i, j - 1), id(i, j), 'beam');
    }
    const lastI = xs.length - 1, lastJ = ys.length - 1;
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
      const edge = i === 0 || j === 0 || i === lastI || j === lastJ;
      const corner = (i === 0 || i === lastI) && (j === 0 || j === lastJ);
      if (p.supportsAt === 'corners' ? corner : edge) b.support(id(i, j), 'pinned');
    }
    return b.done();
  },

  continuousBeam: (p) => {
    const xs = stations(bays(p, 'spans')!);
    const b = new Builder();
    const ids = xs.map((x) => b.node(x, 0, 0));
    for (let i = 1; i < ids.length; i++) b.member(ids[i - 1]!, ids[i]!, 'beam');
    // Every node is on one line, so a pin does not stop the beam spinning about it: the bearings
    // are forks, holding the twist and leaving bending free.
    ids.forEach((n, i) => b.support(n, i === 0 ? 'forkPinned' : 'forkRollerX'));
    b.assumptions.push('generator.assume.forkSupports');
    return b.done();
  },

  spaceTruss: (p) => {
    // Square on square, offset: a top grid, a bottom grid under the centres of its squares, and
    // each bottom node tied to the four top nodes around it.
    const xs = stations(bays(p, 'baysX')!), ys = stations(bays(p, 'baysY')!);
    const d = num(p, 'depth');
    const b = new Builder();
    b.assumptions.push('generator.assume.spaceTrussPinned');
    const top = (i: number, j: number) => b.node(xs[i]!, ys[j]!, 0);
    const mid = (a: number[], i: number) => (a[i]! + a[i + 1]!) / 2;
    const bot = (i: number, j: number) => b.node(mid(xs, i), mid(ys, j), -d);
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) {
      if (i > 0) b.member(top(i - 1, j), top(i, j), 'chord', 'truss');
      if (j > 0) b.member(top(i, j - 1), top(i, j), 'chord', 'truss');
    }
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      if (i > 0) b.member(bot(i - 1, j), bot(i, j), 'chord', 'truss');
      if (j > 0) b.member(bot(i, j - 1), bot(i, j), 'chord', 'truss');
      for (const [a, c] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]] as const) b.member(bot(i, j), top(a, c), 'diagonal', 'truss');
    }
    const li = xs.length - 1, lj = ys.length - 1;
    for (const [i, j] of [[0, 0], [li, 0], [0, lj], [li, lj]] as const) b.support(top(i, j), 'pinned');
    return b.done();
  },

  latticeGirder: (p) => {
    const L = num(p, 'span'), n = num(p, 'panels'), d = num(p, 'depth');
    const b = new Builder();
    const x = (i: number) => (i * L) / n;
    const bot = (i: number) => b.node(x(i), 0, 0), top = (i: number) => b.node(x(i), 0, d);
    for (let i = 1; i <= n; i++) { b.member(bot(i - 1), bot(i), 'chord'); b.member(top(i - 1), top(i), 'chord'); }
    if (p.bracing === 'k') {
      // K: every post has a node at mid-height, and each panel's two diagonals leave it for the
      // top and bottom of the next post.
      const midNode = (i: number) => b.node(x(i), 0, d / 2);
      for (let i = 0; i <= n; i++) {
        if (i === 0 || i === n) { b.member(bot(i), top(i), 'post', 'truss'); continue; }
        b.member(bot(i), midNode(i), 'post', 'truss');
        b.member(midNode(i), top(i), 'post', 'truss');
      }
      for (let i = 0; i < n; i++) {
        const half = i < n / 2;
        // Toward midspan the K opens: from the post nearer the support to the one nearer midspan.
        const [from, to] = half ? [i + 1, i] : [i, i + 1];
        if (from === 0 || from === n) { b.member(bot(to), top(from), 'diagonal', 'truss'); continue; }
        b.member(midNode(from), top(to), 'diagonal', 'truss');
        b.member(midNode(from), bot(to), 'diagonal', 'truss');
      }
    } else {
      for (let i = 0; i <= n; i++) b.member(bot(i), top(i), 'post', 'truss');
      for (let i = 0; i < n; i++) { b.member(bot(i), top(i + 1), 'diagonal', 'truss'); b.member(top(i), bot(i + 1), 'diagonal', 'truss'); }
      b.assumptions.push('generator.assume.xBracingUnconnected');
    }
    b.support(bot(0), 'pinned');
    b.support(bot(n), 'rollerX');
    return b.done();
  },

  howeRoof: (p) => generateTruss({
    kind: 'trapezoidal', spanM: num(p, 'span'), riseM: num(p, 'rise'), endDepthM: 0, plateauM: 0,
    panelsPerHalf: num(p, 'panelsPerHalf'), webPattern: 'howe', halfTruss: false,
  }),

  sawtooth: (p) => {
    const n = num(p, 'teeth'), s = num(p, 'toothSpan'), h = num(p, 'height'), k = num(p, 'panelsPerTooth');
    const b = new Builder();
    for (let t = 0; t < n; t++) {
      const x0 = t * s;
      const bot = (i: number) => b.node(x0 + (i * s) / k, 0, 0);
      const top = (i: number) => (i === 0 ? bot(0) : b.node(x0 + (i * s) / k, 0, (h * i) / k));
      for (let i = 1; i <= k; i++) {
        b.member(bot(i - 1), bot(i), 'chord');
        b.member(top(i - 1), top(i), 'chord');
        if (i < k) b.member(bot(i), top(i), 'post', 'truss');
        // The first panel is already a triangle. After it, diagonals descend toward the glazed
        // face, top(i − 1) to bot(i).
        if (i > 1) b.member(top(i - 1), bot(i), 'diagonal', 'truss');
      }
      // The glazed face: the tall post at the end of the tooth.
      b.member(bot(k), top(k), 'post');
    }
    b.support(b.node(0, 0, 0), 'pinned');
    b.support(b.node(n * s, 0, 0), 'rollerX');
    return b.done(Math.round((h / s) * 1000) / 10);
  },

  cylindricalVault: (p) => {
    const R = num(p, 'radius'), th = (num(p, 'angle') * Math.PI) / 180, n = num(p, 'arcDivisions');
    const ys = stations(bays(p, 'baysY')!);
    const b = new Builder();
    // Springing at x = 0, z = 0; the arc rises to R(1 − cos θ/2) at midspan.
    const cx = R * Math.sin(th / 2), cz = -R * Math.cos(th / 2);
    const at = (i: number, j: number) => {
      const a = -th / 2 + (i * th) / n;
      return b.node(cx + R * Math.sin(a), ys[j]!, cz + R * Math.cos(a));
    };
    for (let j = 0; j < ys.length; j++) for (let i = 0; i <= n; i++) {
      if (i > 0) b.member(at(i - 1, j), at(i, j), 'rafter');
      if (j > 0) {
        b.member(at(i, j - 1), at(i, j), 'purlin');
        if (i > 0 && p.bracing !== 'none') b.member(at(i - 1, j - 1), at(i, j), 'bracing', 'truss');
        if (i > 0 && p.bracing === 'x') b.member(at(i, j - 1), at(i - 1, j), 'bracing', 'truss');
      }
    }
    for (let j = 0; j < ys.length; j++) { b.support(at(0, j), 'pinned'); b.support(at(n, j), 'pinned'); }
    return b.done();
  },

  circularBeam: (p) => {
    const R = num(p, 'radius'), th = (num(p, 'angle') * Math.PI) / 180, n = num(p, 'segments');
    const b = new Builder();
    const closed = Math.abs(num(p, 'angle') - 360) < 1e-9;
    const at = (i: number) => { const a = (i * th) / n; return b.node(R * Math.sin(a), R - R * Math.cos(a), 0); };
    for (let i = 1; i <= n; i++) b.member(at(i - 1), closed && i === n ? at(0) : at(i), 'beam');
    if (closed) { for (let i = 0; i < n; i += Math.max(1, Math.round(n / 4))) b.support(at(i), 'fixed'); }
    else { b.support(at(0), 'fixed'); b.support(at(n), 'fixed'); }
    return b.done();
  },

  dome: (p) => {
    // A ribbed dome: meridians from the base ring to a crown node, rings between, optionally a
    // diagonal in every quadrilateral (Schwedler). The sphere through the base and the crown.
    const a = num(p, 'baseRadius'), h = num(p, 'rise'), m = num(p, 'meridians'), r = num(p, 'rings');
    const Rs = (a * a + h * h) / (2 * h);
    const phi0 = Math.asin(Math.min(1, a / Rs));
    const b = new Builder();
    const zc = h - Rs; // sphere centre height
    const ring = (k: number, j: number) => {
      // k = 0 base ... r top ring; the crown is separate.
      const phi = phi0 * (1 - k / (r + 1));
      const rr = Rs * Math.sin(phi), z = zc + Rs * Math.cos(phi);
      const ang = (2 * Math.PI * (j % m)) / m;
      return b.node(rr * Math.cos(ang), rr * Math.sin(ang), z);
    };
    const crown = b.node(0, 0, h);
    for (let k = 0; k <= r; k++) for (let j = 0; j < m; j++) {
      b.member(ring(k, j), ring(k, j + 1), 'purlin');
      b.member(ring(k, j), k < r ? ring(k + 1, j) : crown, 'rafter');
      if (p.diagonals && k < r) b.member(ring(k, j), ring(k + 1, j + 1), 'bracing', 'truss');
    }
    for (let j = 0; j < m; j++) b.support(ring(0, j), 'pinned');
    return b.done();
  },
};
