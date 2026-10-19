/**
 * How the model joins a slab to its columns, and what that leaves unestablished: a model-adequacy
 * indicator, not a code check and not a validation of the analysis.
 *
 * Three questions about the load path of a slab on beams are kept apart, each with its evidence:
 *
 * ── (a) Equilibrium: exact on every mesh, and says nothing about adequacy ──
 *
 * The supports return what is applied, and each floor's columns take the slab and the beams'
 * weight, on every mesh, the coarsest included (`design-span-load-path.test.ts`: 1 546,8 kN to the
 * solve's arithmetic at 6, 2, 1, 0,5 and 0,25 m). A mesh that sends every kN of the slab past the
 * beams is in equilibrium too. This module uses equilibrium only to check its own reading: the
 * floor's slab load it reads off the members is the slab load applied (to 1e-6 kN).
 *
 * ── (b) Mesh convergence of the split between beams and columns ──
 *
 * The model holds the slab at each column by ONE shell node. What reaches the columns without
 * passing through the beams (J − B below) is then the load of the shells around that node: a
 * discretisation quantity that vanishes as the mesh is refined, because the beams run through the
 * same node and hold the slab along their lines right up to it. On the span building (two bays of
 * 6 × 5 m on 40 × 40 columns, 570 kN of slab a floor, 1,2D + 1,6L), measured:
 *
 *   mesh                 6 m    2 m    1 m    0,5 m   0,25 m   0,2 m   0,125 m   0,1 m
 *   share at the node   100 %  96,7 % 54,8 %  14,0 %   3,1 %    2,0 %    0,9 %    0,6 %
 *
 * ×4,0 to ×4,6 less per halving from 1 m down (p ≈ 2, `design-span-mesh-convergence.test.ts`).
 * Converged, the one-node joint sends nothing straight into the columns. That limit is the
 * one-node joint's, not the building's.
 *
 * ── (c) Adequacy of the idealisation: a node against a column of finite section ──
 *
 * A column holds the slab over its whole section. The reference for that, built for the tests
 * only (`slab-column-footprint-reference.test.ts`), is the same building with every shell node
 * inside each column's 40 × 40 section tied to the column's node as a rigid body (all six DOFs).
 * There the share the slab hands the columns straight, read at the column faces, is
 *
 *   mesh                  0,2 m         0,1 m         0,05 m        limit (Richardson, p ≈ 2,2)
 *   P1 / P2           46,5 / 42,4   40,9 / 37,3   39,7 / 36,2    39,4 / 35,9 %
 *
 * converging to about 39 % on P1, not to zero: with 20 × 50 beams and a 15 cm slab (beam-to-slab
 * stiffness ratio αf ≈ 1,2 to 2,5) the slab spans to the column faces as well as to the beams.
 * The beams' end shears follow: the interior beam V4 takes 96,8 / 101,3 kN at its face with the
 * one-node joint (0,2 / 0,1 m) and 68,9 / 75,5 / 77,4 kN with the section represented (0,2 / 0,1 /
 * 0,05 m). The direct share is set by the stiffness of beams and slab: 46,5 / 9,7 / 2,8 % with the
 * beams 1 / 10 / 100 times stiffer (0,2 m), towards the 2,6 % of the slab nearer the columns than
 * any beam, and 100 % with no beams at all (a flat plate). No geometric band around the column
 * bounds it: not the slab within t/2 of the column faces (1,0 % here, below even the stiffest
 * beams' share), nor the two-way shear critical section at d/2. That section is where the shear
 * stress around the column is checked (CIRSOC 201 §22.6.4.1); how much of the floor's load
 * crosses it is the analysis', all of it in a flat plate.
 *
 * ── What this module claims ─────────────────────────────────────────
 *
 * On a floor where a slab on beams is joined to a column at one node (`pointJoint`), the split of
 * the slab's load between beams and columns is not established at any mesh: refined, it tends to
 * the one-node joint's limit (no direct share), which is not a column's. So the beams' and the
 * columns' design forces are not stated as the structure's: the members are not presented as
 * verified, their assemblies are not CONSTRUCTIBLE and the document is a review draft, and every
 * surface says why, with the share measured at the mesh used. A floor where every column's
 * section is tied to the slab as a rigid body (`sectionRepresented`) has the reference
 * idealisation; this module says nothing about its mesh convergence, which is a separate
 * question. A floor without beams (a flat plate: every kN reaches the columns, by statics), a
 * floor not measured and a model without shells are `notApplicable`: nothing is claimed either
 * way. The column moments a one-node joint gives a flat plate are not covered here.
 *
 * ── How the share is measured ───────────────────────────────────────
 *
 * From the stations the design reads, per floor (the shells at one elevation) and combination:
 *   - into the columns, J: at every column node on the floor, the compression the column below
 *     takes at its top less the one the column above gives at its foot;
 *   - the beams' whole load, B: each beam's V(0) − V(L) between its end nodes;
 *   - the slab's load on the beams, S: the shear jumps at the nodes a beam shares with the slab
 *     (`ΔV` between two pieces), the beam's own distributed load being what is left of B;
 *   - straight into the columns: direct = J − B, and the floor's slab load is direct + S.
 * The reported share is the largest over the combinations. A floor with a shell node on a
 * support, or on a vertical member the design does not read, is not measured (the share would
 * miss what goes there); walls are not read.
 *
 * Pure: no store access.
 */
import type { ElementStationResult } from '../station-design-forces';


export type SlabColumnJointVerdict = 'sectionRepresented' | 'pointJoint' | 'notApplicable';

/** One member's verdict, with the reason as an i18n key and its parameters. */
export interface SlabColumnJoint {
  verdict: SlabColumnJointVerdict;
  /** Set when `pointJoint`: `slabColumnJoint.point`. */
  reasonKey?: string;
  /** share (% of the floor's slab load straight into the column nodes, at this mesh), level (m), ref (%). */
  params?: Record<string, number>;
}

/** The model's verdict: a point joint when any member has one, not applicable when none is read. */
export interface ModelSlabColumnJoint {
  verdict: SlabColumnJointVerdict;
  /** Every member on a floor with a point joint, by element id, with its reason. */
  pointJoints: Array<{ elementId: number } & SlabColumnJoint>;
}

interface P3 { x: number; y: number; z?: number }

export interface JointModel {
  nodes: ReadonlyMap<number, P3>;
  quads: ReadonlyMap<number, { nodes: readonly number[]; thickness: number }>;
  /** Nodes held by a support. */
  supportNodes?: ReadonlySet<number>;
  /** Every vertical member's end nodes, read by the design or not. */
  verticalNodes?: ReadonlySet<number>;
  /** Slave node → master node, for every rigid tie on all six DOFs. */
  rigidTies?: ReadonlyMap<number, number>;
}

/** A design member as the indicator reads it: from its start node to its end node, with its stations. */
export interface JointMember {
  elementId: number;
  type: 'beam' | 'column' | 'wall';
  start: number;
  end: number;
  stations?: ElementStationResult;
  /** The beam's shear component in the plane of its bending (`DesignAxes.shear`). */
  shear?: 'vy' | 'vz';
  /** The column's half extent in plan along global X and Y, m (its section as placed). */
  halfX?: number;
  halfY?: number;
}

/** One floor's load path in its worst combination, and how its slab is joined to its columns. */
export interface FloorPath {
  z: number;
  slabArea: number;
  /** direct / slab, the worst combination's. */
  share: number;
  combo: string;
  slab: number;
  direct: number;
  measured: boolean;
  /** The floor has beams that share nodes with the slab. */
  beams: boolean;
  /** Every column on the floor holds the slab over its section (rigid ties), not at one node. */
  sectionsRepresented: boolean;
}

const TOL = 1e-6;
const zOf = (p: P3) => p.z ?? 0;
const zKey = (z: number) => Math.round(z * 1000);

/**
 * Whether the column at node `n` holds the floor's slab over its section: there are shell nodes
 * of the floor inside the section besides `n`, and every one of them is tied to `n` as a rigid body.
 */
function sectionTied(model: JointModel, floorNodes: ReadonlySet<number>, n: number, col: JointMember): boolean {
  const p = model.nodes.get(n)!;
  const hx = col.halfX ?? 0, hy = col.halfY ?? 0;
  if (!(hx > 0 && hy > 0)) return false;
  let inside = 0;
  for (const id of floorNodes) {
    if (id === n) continue;
    const q = model.nodes.get(id);
    if (!q || Math.abs(q.x - p.x) > hx + TOL || Math.abs(q.y - p.y) > hy + TOL) continue;
    if (model.rigidTies?.get(id) !== n) return false;
    inside++;
  }
  return inside > 0;
}

/** Each floor's load path, by elevation. */
export function floorPaths(model: JointModel, members: readonly JointMember[]): FloorPath[] {
  const floors = new Map<number, { z: number; quads: Array<{ poly: P3[]; t: number }>; nodes: Set<number> }>();
  for (const q of model.quads.values()) {
    const poly = q.nodes.map((id) => model.nodes.get(id)).filter((p): p is P3 => !!p);
    if (poly.length < 3) continue;
    const k = zKey(zOf(poly[0]!));
    if (poly.some((p) => zKey(zOf(p)) !== k)) continue; // a sloped or vertical shell is not a floor
    const f = floors.get(k) ?? { z: zOf(poly[0]!), quads: [], nodes: new Set<number>() };
    f.quads.push({ poly, t: q.thickness });
    for (const id of q.nodes) f.nodes.add(id);
    floors.set(k, f);
  }
  const out: FloorPath[] = [];
  for (const f of floors.values()) {
    const slabArea = f.quads.reduce((s, q) => {
      let a = 0;
      for (let i = 0; i < q.poly.length; i++) { const p = q.poly[i]!, r = q.poly[(i + 1) % q.poly.length]!; a += p.x * r.y - r.x * p.y; }
      return s + Math.abs(a) / 2;
    }, 0);
    const columns = members.filter((m) => m.type === 'column' && m.stations && (f.nodes.has(m.start) || f.nodes.has(m.end)));
    const columnNodes = new Set(columns.flatMap((m) => [m.start, m.end].filter((n) => f.nodes.has(n))));
    // What goes to a support or to a vertical member the design does not read is not measured.
    const measured = ![...f.nodes].some((n) => model.supportNodes?.has(n) || (model.verticalNodes?.has(n) && !columnNodes.has(n)));
    const sectionsRepresented = columnNodes.size > 0
      && [...columnNodes].every((n) => sectionTied(model, f.nodes, n, columns.find((m) => m.start === n || m.end === n)!));
    const beams = members.filter((m) => m.type === 'beam' && m.stations && m.shear && [m.start, m.end].every((n) => { const p = model.nodes.get(n); return !!p && zKey(zOf(p)) === zKey(f.z); }));
    const combos = new Map<number, { name: string; J: number; B: number; S: number }>();
    const at = (id: number, name: string) => combos.get(id) ?? (combos.set(id, { name, J: 0, B: 0, S: 0 }), combos.get(id)!);
    for (const m of columns) {
      const pI = model.nodes.get(m.start)!, pJ = model.nodes.get(m.end)!;
      for (const cr of m.stations!.comboResults) {
        const s = cr.stations, c = at(cr.comboId, cr.comboName);
        // Compression at node I (t = 0) and node J (t = 1). A column takes from a floor at its top
        // and gives to it at its foot.
        const ends = [{ n: m.start, z: zOf(pI), N: -s[0]!.n }, { n: m.end, z: zOf(pJ), N: -s[s.length - 1]!.n }];
        const top = ends[0]!.z > ends[1]!.z ? ends[0]! : ends[1]!, foot = top === ends[0] ? ends[1]! : ends[0]!;
        if (columnNodes.has(top.n)) c.J += top.N;
        if (columnNodes.has(foot.n)) c.J -= foot.N;
      }
    }
    for (const m of beams) {
      for (const cr of m.stations!.comboResults) {
        const s = cr.stations, c = at(cr.comboId, cr.comboName), V = m.shear!;
        const whole = s[0]![V] - s[s.length - 1]![V];
        let jumps = 0;
        for (let k = 1; k < s.length; k++) if (Math.abs(s[k]!.t - s[k - 1]!.t) < 1e-9) jumps += s[k - 1]![V] - s[k]![V];
        // Read in the sense the beam's whole load points: down, under gravity.
        const sense = Math.sign(whole) || 1;
        c.B += whole * sense;
        c.S += jumps * sense;
      }
    }
    let worst: FloorPath = { z: f.z, slabArea, share: 0, combo: '', slab: 0, direct: 0, measured, beams: beams.length > 0, sectionsRepresented };
    for (const c of combos.values()) {
      const direct = c.J - c.B, slab = direct + c.S;
      if (!(slab > TOL)) continue;
      const share = direct / slab;
      if (share > worst.share || worst.combo === '') worst = { ...worst, share, combo: c.name, slab, direct };
    }
    out.push(worst);
  }
  return out.sort((a, b) => a.z - b.z);
}

/** A floor's verdict: what its beams and columns are stated as. */
function floorVerdict(f: FloorPath): SlabColumnJoint {
  if (!f.measured || f.combo === '' || !f.beams) return { verdict: 'notApplicable' };
  if (f.sectionsRepresented) return { verdict: 'sectionRepresented' };
  const pct = (v: number) => Math.round(v * 1000) / 10;
  return {
    verdict: 'pointJoint', reasonKey: 'slabColumnJoint.point',
    params: { share: pct(f.share), level: Math.round(f.z * 100) / 100 },
  };
}

/** Each member's verdict, by element id. */
export function slabColumnJoints(model: JointModel, members: readonly JointMember[]): Map<number, SlabColumnJoint> {
  const out = new Map<number, SlabColumnJoint>();
  const byZ = new Map(floorPaths(model, members).map((f) => [zKey(f.z), floorVerdict(f)]));
  for (const m of members) {
    const a = model.nodes.get(m.start), b = model.nodes.get(m.end);
    if (!a || !b || m.type === 'wall') { out.set(m.elementId, { verdict: 'notApplicable' }); continue; }
    const fs = m.type === 'beam'
      ? (zKey(zOf(a)) === zKey(zOf(b)) ? [byZ.get(zKey(zOf(a)))] : [])
      : [byZ.get(zKey(zOf(a))), byZ.get(zKey(zOf(b)))];
    const vs = fs.filter((v): v is SlabColumnJoint => !!v && v.verdict !== 'notApplicable');
    out.set(m.elementId, vs.find((v) => v.verdict === 'pointJoint') ?? vs[0] ?? { verdict: 'notApplicable' });
  }
  return out;
}

/** The model's verdict from its members'. */
export function modelSlabColumnJoint(per: ReadonlyMap<number, SlabColumnJoint>): ModelSlabColumnJoint {
  const pointJoints = [...per].filter(([, v]) => v.verdict === 'pointJoint').map(([elementId, v]) => ({ elementId, ...v }))
    .sort((a, b) => a.elementId - b.elementId);
  const verdict: SlabColumnJointVerdict = pointJoints.length > 0 ? 'pointJoint'
    : [...per.values()].some((v) => v.verdict === 'sectionRepresented') ? 'sectionRepresented' : 'notApplicable';
  return { verdict, pointJoints };
}
