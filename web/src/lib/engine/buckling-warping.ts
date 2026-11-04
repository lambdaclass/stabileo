/**
 * buckling-warping.ts — the warping constant in 3D buckling, and the torsional data the
 * geometric stiffness cannot do without (#439).
 *
 * # Why buckling needs Cw, and only buckling
 *
 * The 3D geometric stiffness carries the Wagner term (#434), so every compressed member has a
 * torsional buckling load. With a warping constant it is the classical
 *
 *     P_T = (G·J + π²·E·Cw/L²) / r0²,
 *
 * and without one it is G·J/r0². For an open I or H the Cw term dominates at ordinary storey
 * heights: an IPE 300 between fork supports 2 m apart has G·J ≈ 16 kN·m² against
 * π²·E·Cw/L² ≈ 65 kN·m². Leaving Cw out is conservative but makes torsion govern columns whose
 * real mode is flexural.
 *
 * The engine takes Cw as the section's `cw`, and any section with one makes it number a warping
 * DOF at every node of the model (Vlasov torsion, 14-DOF members). Two consequences decide where
 * it may be sent:
 *
 *   1. It changes the static solve and modal analysis too — the torsional stiffness of every
 *      member with Cw. Those results are not to move because buckling learned about warping, so
 *      `buildSolverInput3D` never sends `cw`: it carries the value as the web-only `bucklingCw`,
 *      and only this module, for the buckling analysis, turns it into `cw`.
 *   2. The warping DOF is one per node, shared by every member with Cw that meets there. Along a
 *      straight member split by nodes that is right: the flanges are continuous. At a joint
 *      between members in different directions it is not — a beam's flange warping is not a
 *      column's — and the shared DOF would let the beam restrain the column's warping, which
 *      raises the column's P_T towards the warping-fixed value (up to about twice the Cw term).
 *      That is the unconservative direction.
 *
 * So Cw is given, for the buckling solve, to the compressed members it can be given to without
 * (2): straight runs of compressed members, the most compressed first, such that no node joins
 * two warping members that are not collinear. Every other member keeps Saint-Venant torsion,
 * whose P_T = G·J/r0² is a lower bound for any warping restraint. Supports leave warping free
 * (the model records no warping restraint), so a run's ends are free to warp: the effective
 * torsional length factor is 1, the value the design codes take for a member whose ends prevent
 * twist and let it warp. A member with any end release keeps Saint-Venant torsion too: a hinge
 * is no evidence the flanges are continuous through it.
 *
 * What this cannot do is converge the member: the twist inside one element is a cubic, as the
 * deflection is, so a single element between twist restraints overestimates the Cw term as it
 * overestimates the Euler load (by up to 21.6 % for fork ends), and two elements bring that under
 * 1 %. That is the discretisation the user chose, read the same way for flexure and for torsion.
 */
import type { SolverInput3D, SolverSection3D, SolverElement3D } from './types-3d';

/** A section whose torsional terms cannot be formed, and the frame members that use it. */
export interface TorsionGap {
  kind: 'j' | 'shearCentre';
  sectionId: number;
  sectionName?: string;
  elements: number[];
}

/**
 * The frame members whose torsion data is missing (`SolverSection3D.torsionGap`), by section.
 *
 * Buckling, P-Δ and the geometrically nonlinear analyses read the Wagner term of every
 * compressed member: with no J the member's torsional buckling cannot be formed (the static
 * solve refuses it too, `jRefusal3D`), and with no shear centre a tee, channel
 * or angle loses its flexural-torsional coupling, which governs those sections. Both are refused
 * rather than computed without the term.
 */
export function torsionGaps3D(input: SolverInput3D): TorsionGap[] {
  const out = new Map<number, TorsionGap>();
  for (const e of input.elements.values()) {
    // A member released in torsion has no torsional terms to form (#434 drops them with the
    // release), so nothing is missing for it.
    if (e.type !== 'frame' || e.releaseTStart || e.releaseTEnd) continue;
    const s = input.sections.get(e.sectionId);
    if (!s?.torsionGap) continue;
    let g = out.get(s.id);
    if (!g) {
      g = { kind: s.torsionGap, sectionId: s.id, ...(s.name ? { sectionName: s.name } : {}), elements: [] };
      out.set(s.id, g);
    }
    g.elements.push(e.id);
  }
  return [...out.values()].map((g) => ({ ...g, elements: g.elements.sort((a, b) => a - b) }));
}

/** True when some section carries a warping constant the buckling analysis could use. */
export function hasBucklingWarping(input: SolverInput3D): boolean {
  for (const s of input.sections.values()) if ((s.bucklingCw ?? 0) > 0) return true;
  return false;
}

const anyRelease = (e: SolverElement3D) =>
  !!(e.releaseMyStart || e.releaseMyEnd || e.releaseMzStart || e.releaseMzEnd || e.releaseTStart || e.releaseTEnd);

/** Two unit vectors on one line, either sense. */
const COLLINEAR = 1 - 1e-9;

/**
 * The buckling input with Cw on the members that can take it (see the header).
 *
 * `axial` is each element's mean axial force from the linear solve of the same input, tension
 * positive (the engine's sign). Returns the input unchanged when no member gets Cw, and
 * otherwise a copy whose warping members point at a clone of their section with `cw` set. The
 * ids of those members are returned too, for tests and for saying so.
 */
export function bucklingWarpingInput(
  input: SolverInput3D,
  axial: ReadonlyMap<number, number>,
): { input: SolverInput3D; warped: number[] } {
  if (!hasBucklingWarping(input)) return { input, warped: [] };

  type Candidate = { e: SolverElement3D; dir: [number, number, number]; n: number };
  const candidates: Candidate[] = [];
  for (const e of input.elements.values()) {
    if (e.type !== 'frame' || anyRelease(e)) continue;
    const s = input.sections.get(e.sectionId);
    const cw = s?.bucklingCw ?? 0;
    if (!(cw > 0) || !(s!.j > 0)) continue;
    const n = axial.get(e.id);
    if (n === undefined || !(n < -1e-6)) continue;
    const a = input.nodes.get(e.nodeI), b = input.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const d: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > 0)) continue;
    candidates.push({ e, dir: [d[0] / len, d[1] / len, d[2] / len], n });
  }
  // Most compressed first, so where two runs meet at an angle the one that buckles keeps Cw.
  candidates.sort((p, q) => p.n - q.n || p.e.id - q.e.id);

  const atNode = new Map<number, Array<[number, number, number]>>();
  const fits = (node: number, dir: [number, number, number]) =>
    (atNode.get(node) ?? []).every((o) => Math.abs(o[0] * dir[0] + o[1] * dir[1] + o[2] * dir[2]) > COLLINEAR);
  const warped: SolverElement3D[] = [];
  for (const c of candidates) {
    if (!fits(c.e.nodeI, c.dir) || !fits(c.e.nodeJ, c.dir)) continue;
    for (const node of [c.e.nodeI, c.e.nodeJ]) {
      const list = atNode.get(node) ?? [];
      list.push(c.dir);
      atNode.set(node, list);
    }
    warped.push(c.e);
  }
  if (warped.length === 0) return { input, warped: [] };

  const sections = new Map(input.sections);
  const elements = new Map(input.elements);
  let next = Math.max(0, ...input.sections.keys()) + 1;
  const clone = new Map<number, number>();
  for (const e of warped) {
    let sid = clone.get(e.sectionId);
    if (sid === undefined) {
      const base = input.sections.get(e.sectionId)!;
      sid = next++;
      const withCw: SolverSection3D = { ...base, id: sid, cw: base.bucklingCw };
      sections.set(sid, withCw);
      clone.set(e.sectionId, sid);
    }
    elements.set(e.id, { ...e, sectionId: sid });
  }
  return { input: { ...input, sections, elements }, warped: warped.map((e) => e.id).sort((a, b) => a - b) };
}
