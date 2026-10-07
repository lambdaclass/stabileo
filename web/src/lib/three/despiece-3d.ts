// Despiece / member free-body view for Basic 3D — parity with the 2D overlay.
//
// Each member is pulled toward its own midpoint (animated by `sep` 0..1), opening
// a gap at every joint. The SOLID separated member is drawn only between its
// shrunken ends; the gap to each original node shows a faint dashed "ghost"
// remnant (the caller hides the real member meshes while this view is active).
//
// Three distinct vector concepts (mirrors the 2D helper):
//   - member action: internal force ON the member, anchored at the shrunken end;
//   - node action: equal/opposite force ON the joint, anchored near the node side
//     of the remnant — distinct per connected member at high-valence nodes;
//   - support reaction: one-sided EXTERNAL action (force and, at a restrained
//     rotation, moment), drawn ONCE (never mirrored).
//
// Every glyph carries the signed world vector it stands for (userData.forceVec /
// momentVec; loads also userData.loadAt), so the drawn free bodies can be checked
// for ΣF = 0 and ΣM = 0 on real solves (despiece-3d-equilibrium.test.ts).
//
// Basis:
//   - 'local'  → N along ex (red), shear resultant in the ey–ez plane (cyan).
//   - 'global' → end force decomposed into world Fx/Fy/Fz (red). Moments are
//     reported as local My/Mz/T in labels for v1 (stated in the legend).
//
// PERFORMANCE: the overlay is built ONCE (geometries, materials, arrows, label
// sprites). The pull-apart is animated by `update(sep)` which only translates
// per-end groups and rewrites line vertices — NO per-frame allocation and no
// per-frame canvas/text-sprite creation. Rebuilt only when results/model/options
// change (the caller compares a signature). Visualization-only; never mutates.

import * as THREE from 'three';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { projectNodeToScene } from '../geometry/coordinate-system';
import { createTextSpriteCached } from './selection-helpers';
import type { ElementForces3D, Reaction3D } from '../engine/types-3d';
import type { Element, Node, Section, Load } from '../store/model.svelte';

export const DESPIECE_COL = {
  axial: '#ff7070',
  shear: '#4ecdc4',
  moment: '#ffd166',
  reaction: '#00e676',
  member: '#9aa7c7',
  remnant: '#5a6478',
  load: '#ffa726',
};

export type DespieceLoadMode = 'off' | 'resultant' | 'all';

/**
 * Point resultants of one trapezoidal/partial distributed component (qI@a..qJ@b),
 * statically EXACT: the same force and the same moment about any point as the
 * load. When qI and qJ share a sign that is one force at the trapezoid centroid
 * (always inside [a, b]). A sign-reversing trapezoid has no single equivalent
 * force on the span (its resultant can even vanish while its couple does not),
 * so it is split into its two triangles: qI·L/2 at a + L/3 and qJ·L/2 at
 * a + 2L/3. (A clamped centroid used to keep the arrow on the member at the
 * price of a wrong moment.)
 */
function distPointResultants(qI: number, qJ: number, a: number, b: number): Array<{ mag: number; at: number }> {
  const L = b - a;
  if (!(L > 1e-12)) return [];
  if (qI * qJ >= 0) {
    const sum = qI + qJ;
    if (Math.abs(sum) < 1e-12) return [];
    return [{ mag: sum / 2 * L, at: a + (L / 3) * (qI + 2 * qJ) / sum }];
  }
  return [{ mag: qI * L / 2, at: a + L / 3 }, { mag: qJ * L / 2, at: a + 2 * L / 3 }];
}

type Vec3 = [number, number, number];

/**
 * The action the joint exerts ON the member at one end, in world axes.
 *
 * Engine convention (checked against real solves in
 * despiece-3d-equilibrium.test.ts): ElementForces3D are section resultants with
 * N positive in tension and V, M, T signed on the member's NEGATIVE face, so
 * that V(x) = V_I + ∫q and M(x) = M_I ∓ V·x along the member (diagrams-3d.ts).
 * At I the joint acts on the member with −N·ex + Vy·ey + Vz·ez and with the
 * moment T·ex + My·ey + Mz·ez; at J with the same expression of the J values
 * times −1 (`axialOut` = +1 at I, −1 at J, the opposite outward normals of the
 * two cuts). A cantilever along +X fixed at I: a tip Fy = +10 gives
 * vy = −10, mzStart = −20, and the fixed end's reaction (−10·ey, −20·ez) is
 * exactly the I action. Unloaded, V and M are the same sign at both ends, so the
 * two end shears are OPPOSITE and form the couple the end moments balance.
 *
 * The local basis is the solver's right-handed one; the left-hand convention
 * only changes how the axes are labelled, never these vectors.
 */
export function memberEndAction3D(
  ex: Vec3, ey: Vec3, ez: Vec3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number,
): { force: Vec3; moment: Vec3 } {
  const f = (k: number) => (-n * ex[k] + vy * ey[k] + vz * ez[k]) * axialOut;
  const m = (k: number) => (mx * ex[k] + my * ey[k] + mz * ez[k]) * axialOut;
  return { force: [f(0), f(1), f(2)], moment: [m(0), m(1), m(2)] };
}

const v3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
const tv = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

export type DespieceVectorMode = 'all' | 'members' | 'nodes';
export type DespieceBasis = 'local' | 'global';

const MAX_GAP_FRAC = 0.32;   // member shrink per end at full separation (a bit > 2D's 0.28 — 3D perspective shrinks the apparent gap)
const NODE_FRAC = 0.18;      // node action anchor: fraction from node toward shrunken end
const REMNANT_START_FRAC = 0.35; // dotted remnant starts past the node-side vector
const LABEL_ELEM_CAP = 60;   // suppress per-end labels above this many elements (arrows stay)
const FORCE_EPS = 1e-3;      // kN / kN·m below which a component is treated as zero

type V3 = { x: number; y: number; z: number };

interface MemberAnim {
  pI: V3; pJ: V3; mid: V3;
  line: THREE.Line;
  ends: Array<{ group: THREE.Group; node: V3; isNodeSide: boolean }>;
  remnants: Array<{ line: THREE.Line; node: V3; toEnd: 'I' | 'J' }>;
  // Applied-load glyphs tied to this member: positioned at frac∈[0,1] from the I
  // shrunken end to the J shrunken end, so they ride the member during the pull-apart.
  loads: Array<{ obj: THREE.Object3D; frac: number }>;
}

export interface DespieceGroup extends THREE.Group {
  userData: {
    despieceUpdate: (sep: number) => void;
    arrowLen: number;
    [k: string]: unknown;
  };
}

function characteristicLength(forces: ElementForces3D[]): number {
  let sum = 0, n = 0;
  for (const f of forces) if (f.length > 1e-6) { sum += f.length; n++; }
  return n > 0 ? sum / n : 1;
}

function fixedArrow(dir: THREE.Vector3, len: number, colorHex: number): THREE.ArrowHelper | null {
  if (dir.lengthSq() < 1e-12 || len < 1e-9) return null;
  const a = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(0, 0, 0), len, colorHex, len * 0.34, len * 0.2);
  a.userData.glyphLen = len;
  // The signed world force the glyph stands for (arrows are fixed-size symbols;
  // the value lives here and in the label). Callers overwrite it when `dir` is
  // only a direction.
  a.userData.forceVec = [dir.x, dir.y, dir.z];
  return a;
}

/**
 * Curved moment/torsion glyph: a ~270° arc in the plane perpendicular to the
 * resultant moment vector, with a cone arrowhead at the open end giving the
 * right-hand rotation sense. Built once and parented to the end group, so the
 * pull-apart animation only translates it (no per-frame cost). The caller flips
 * the moment vector for the node side so member/node senses stay opposite.
 */
function momentArc(momentVec: THREE.Vector3, radius: number, colorHex: number): THREE.Group | null {
  if (momentVec.length() < FORCE_EPS || radius < 1e-9) return null;
  const axis = momentVec.clone().normalize();
  // Two orthonormal vectors spanning the plane of the arc.
  let u = Math.abs(axis.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  u = u.sub(axis.clone().multiplyScalar(axis.dot(u))).normalize();
  const v = axis.clone().cross(u).normalize();   // right-hand: sweep u→v curls around +axis

  const grp = new THREE.Group();
  grp.userData.despieceMoment = true;
  grp.userData.momentAxis = [axis.x, axis.y, axis.z];
  grp.userData.momentVec = [momentVec.x, momentVec.y, momentVec.z];   // the signed moment the glyph stands for

  const SEG = 28, sweep = Math.PI * 1.5;
  const pts: number[] = [];
  const at = (a: number) => u.clone().multiplyScalar(Math.cos(a) * radius).add(v.clone().multiplyScalar(Math.sin(a) * radius));
  for (let i = 0; i <= SEG; i++) { const p = at((i / SEG) * sweep); pts.push(p.x, p.y, p.z); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colorHex }));
  arc.frustumCulled = false;
  grp.add(arc);

  // Arrowhead at the arc end, pointing along the tangent (direction of increasing angle).
  const endPt = at(sweep);
  const tangent = u.clone().multiplyScalar(-Math.sin(sweep)).add(v.clone().multiplyScalar(Math.cos(sweep))).normalize();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.22, radius * 0.5, 10), new THREE.MeshBasicMaterial({ color: colorHex }));
  cone.position.copy(endPt);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  cone.frustumCulled = false;
  grp.add(cone);
  return grp;
}

/** `vec` is the signed world force the glyph stands for (its share of the end action). */
interface ForceArrow { dir: THREE.Vector3; vec: THREE.Vector3; len: number; color: number; }

/** Member-side force arrows in the requested basis (sign baked into direction). */
function memberForceArrows(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, force: THREE.Vector3,
  basis: DespieceBasis, arrowLen: number, colAxial: number, colShear: number, resultant: boolean,
): ForceArrow[] {
  const out: ForceArrow[] = [];
  // `force` is the end action ON the member (memberEndAction3D): tension points
  // OUT of both ends; an unloaded member's two end shears are opposite.
  const push = (axis: THREE.Vector3, comp: number, len: number, color: number) => {
    if (Math.abs(comp) > FORCE_EPS) out.push({ dir: axis.clone().multiplyScalar(Math.sign(comp)), vec: axis.clone().multiplyScalar(comp), len, color });
  };
  // Resultant mode: ONE composed force arrow (the true member-side force vector).
  if (resultant) {
    if (force.length() > FORCE_EPS) out.push({ dir: force.clone(), vec: force.clone(), len: arrowLen, color: colAxial });
    return out;
  }
  if (basis === 'global') {
    push(new THREE.Vector3(1, 0, 0), force.x, arrowLen, colAxial);
    push(new THREE.Vector3(0, 1, 0), force.y, arrowLen, colAxial);
    push(new THREE.Vector3(0, 0, 1), force.z, arrowLen, colAxial);
    return out;
  }
  // Local, separate components along the member's own axes: axial + the two shears.
  push(ex, force.dot(ex), arrowLen, colAxial);
  push(ey, force.dot(ey), arrowLen * 0.85, colShear);
  push(ez, force.dot(ez), arrowLen * 0.85, colShear);
  return out;
}

/**
 * How the labels write a force and a moment. The caller passes the project's units
 * (`forceMomentFormat`, what the inspector beside the drawing writes); without one, the model's
 * kN and kN·m to one decimal.
 */
export interface DespieceFormat { force: (v: number) => string; moment: (v: number) => string }
const MODEL_NUMBERS: DespieceFormat = { force: (v) => v.toFixed(1), moment: (v) => v.toFixed(1) };

/** Compact end label in the requested basis. */
export function endLabel(
  force: THREE.Vector3, n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
  fmt: DespieceFormat = MODEL_NUMBERS,
): string {
  const parts: string[] = [];
  if (basis === 'global') {
    const f = force;
    if (Math.abs(f.x) > FORCE_EPS) parts.push(`Fx ${fmt.force(f.x)}`);
    if (Math.abs(f.y) > FORCE_EPS) parts.push(`Fy ${fmt.force(f.y)}`);
    if (Math.abs(f.z) > FORCE_EPS) parts.push(`Fz ${fmt.force(f.z)}`);
  } else {
    if (Math.abs(n) > FORCE_EPS) parts.push(`N ${fmt.force(n)}`);
    const sh = Math.hypot(vy, vz);
    if (sh > FORCE_EPS) parts.push(`V ${fmt.force(sh)}`);
  }
  const m = Math.hypot(my, mz);
  if (m > FORCE_EPS || Math.abs(mx) > FORCE_EPS) parts.push(`M ${fmt.moment(m)}${Math.abs(mx) > FORCE_EPS ? ` T ${fmt.moment(mx)}` : ''}`);
  return parts.join('  ');
}

/** A support reaction's label: its force and moment magnitudes. */
export function reactionLabel(fv: THREE.Vector3, mv: THREE.Vector3, fmt: DespieceFormat = MODEL_NUMBERS): string {
  const hasF = fv.length() > FORCE_EPS, hasM = mv.length() > FORCE_EPS;
  return [hasF ? `R ${fmt.force(fv.length())}` : '', hasM ? `M ${fmt.moment(mv.length())}` : ''].filter(Boolean).join('  ');
}

/**
 * Build the despiece overlay ONCE. `userData.despieceUpdate(sep)` animates cheaply.
 */
export function createDespiece3DGroup(opts: {
  elements: Map<number, Element>;
  nodes: Map<number, Node>;
  forces: ElementForces3D[];
  reactions: Reaction3D[];
  sep: number;
  sections?: Map<number, Section>;
  leftHand: boolean;
  project2D: boolean;
  vectorMode?: DespieceVectorMode;
  basis?: DespieceBasis;
  vectorSize?: number;
  labelSize?: number;
  showReactions?: boolean;
  resultant?: boolean;
  loads?: Load[];
  loadMode?: DespieceLoadMode;
  /** How the labels write forces and moments: the project's units (`forceMomentFormat`). */
  format?: DespieceFormat;
}): DespieceGroup {
  const { elements, nodes, forces, reactions, sep, sections, leftHand, project2D } = opts;
  const vectorMode = opts.vectorMode ?? 'all';
  const basis = opts.basis ?? 'local';
  const vSize = Math.max(0.5, Math.min(2, opts.vectorSize ?? 1));
  const lSize = Math.max(0.6, Math.min(2, opts.labelSize ?? 1));
  const showReactions = opts.showReactions ?? false;
  const resultant = opts.resultant ?? false;
  const loadMode: DespieceLoadMode = opts.loadMode ?? 'off';
  const loads = opts.loads ?? [];
  const wantMember = vectorMode !== 'nodes';
  const wantNode = vectorMode !== 'members';
  const labelNode = vectorMode === 'nodes';

  const group = new THREE.Group() as DespieceGroup;
  group.name = 'despiece';

  const forceMap = new Map<number, ElementForces3D>();
  for (const f of forces) forceMap.set(f.elementId, f);

  const charLen = characteristicLength(forces);
  const ARROW_LEN = 0.32 * charLen * vSize;
  const labelOffset = 0.16 * charLen;
  const showLabels = elements.size <= LABEL_ELEM_CAP;
  const colAxial = new THREE.Color(DESPIECE_COL.axial).getHex();
  const colShear = new THREE.Color(DESPIECE_COL.shear).getHex();
  const colMoment = new THREE.Color(DESPIECE_COL.moment).getHex();
  const colReaction = new THREE.Color(DESPIECE_COL.reaction).getHex();
  const colLoad = new THREE.Color(DESPIECE_COL.load).getHex();
  const memberMat = new THREE.LineBasicMaterial({ color: DESPIECE_COL.member });
  // Dash sized for the SHORT remnant (≈0.1·charLen at full separation) so the
  // ghost always reads as a dotted line rather than one long dash (prev 0.12·charLen
  // exceeded the remnant length → looked solid / invisible).
  const remnantMat = new THREE.LineDashedMaterial({ color: DESPIECE_COL.remnant, dashSize: 0.022 * charLen, gapSize: 0.018 * charLen, transparent: true, opacity: 0.7 });

  const members: MemberAnim[] = [];

  function buildEnd(
    elemId: number, nodeId: number, end: 'I' | 'J', side: 'member' | 'node',
    ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
    n: number, vy: number, vz: number, mx: number, my: number, mz: number,
  ): THREE.Group {
    const eg = new THREE.Group();
    eg.userData = { despieceEnd: true, side, elemId, nodeId, end };
    const sign = side === 'member' ? 1 : -1;  // node action is opposite
    const act = memberEndAction3D(v3(ex), v3(ey), v3(ez), axialOut, n, vy, vz, mx, my, mz);
    const force = tv(act.force), moment = tv(act.moment);
    // Outward = from the end toward the node/gap (−ex·axialOut). Used to keep the
    // arrow BODY in the gap: if a force points into the member, draw it with the
    // head at the anchor and the tail extending outward, so it never lies on the
    // solid member (parity with the 2D outward-flip).
    const outward = ex.clone().multiplyScalar(-axialOut);
    for (const fa of memberForceArrows(ex, ey, ez, force, basis, ARROW_LEN, colAxial, colShear, resultant)) {
      const d = fa.dir.clone().multiplyScalar(sign);
      const a = fixedArrow(d, fa.len, fa.color);
      if (!a) continue;
      a.userData.forceVec = v3(fa.vec.clone().multiplyScalar(sign));
      if (d.dot(outward) < 0) {
        // points into the member → shift tail outward so the head lands on the anchor
        const u = d.clone().normalize().multiplyScalar(-fa.len);
        a.position.set(u.x, u.y, u.z);
      }
      eg.add(a);
    }
    // Curved moment/torsion glyphs, right-hand sense about the end moment ON the
    // member (memberEndAction3D), flipped for the node side (action/reaction
    // pair). Capped like labels to limit clutter. Resultant mode → ONE composed
    // moment arc; otherwise separate arcs per local axis (T, My, Mz).
    if (showLabels) {
      const mv = moment.clone().multiplyScalar(sign);
      if (resultant) {
        const mg = momentArc(mv, ARROW_LEN * 0.5, colMoment);
        if (mg) eg.add(mg);
      } else {
        // Separate per-axis arcs (radii staggered so co-incident axes don't overlap).
        const comps: Array<[THREE.Vector3, number]> = [
          [ex.clone().multiplyScalar(mv.dot(ex)), 0.50],
          [ey.clone().multiplyScalar(mv.dot(ey)), 0.62],
          [ez.clone().multiplyScalar(mv.dot(ez)), 0.74],
        ];
        for (const [cv, r] of comps) {
          const mg = momentArc(cv, ARROW_LEN * r, colMoment);
          if (mg) eg.add(mg);
        }
      }
    }
    // Exactly one side carries the label: member-side by default, node-side only
    // in 'nodes' mode (where node vectors are all that's shown).
    const showThis = side === 'member' ? !labelNode : labelNode;
    if (showLabels && showThis) {
      const txt = endLabel(force, n, vy, vz, mx, my, mz, basis, opts.format);
      if (txt) {
        const lbl = createTextSpriteCached(txt, basis === 'global' ? DESPIECE_COL.axial : DESPIECE_COL.moment, 20);
        lbl.scale.set(0.6 * lSize, 0.6 * lSize, 1);
        lbl.position.set(ey.x * labelOffset, ey.y * labelOffset, ey.z * labelOffset);
        eg.add(lbl);
      }
    }
    return eg;
  }

  for (const [, elem] of elements) {
    const ef = forceMap.get(elem.id);
    const nI = nodes.get(elem.nodeI), nJ = nodes.get(elem.nodeJ);
    if (!ef || !nI || !nJ) continue;
    const pI = projectNodeToScene(nI, project2D);
    const pJ = projectNodeToScene(nJ, project2D);

    let axes;
    try {
      const localY = (!project2D && elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const roll = project2D ? undefined : ((elem.rollAngle ?? 0) + (sections?.get(elem.sectionId)?.rotation ?? 0));
      axes = computeLocalAxes3D({ id: 0, ...pI }, { id: 0, ...pJ }, localY, roll, false); // forces are in the solver's right-handed frame
    } catch { continue; }
    const exV = new THREE.Vector3(...axes.ex), eyV = new THREE.Vector3(...axes.ey), ezV = new THREE.Vector3(...axes.ez);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([pI.x, pI.y, pI.z, pJ.x, pJ.y, pJ.z]), 3));
    const line = new THREE.Line(lineGeo, memberMat);
    line.frustumCulled = false;
    group.add(line);

    const anim: MemberAnim = { pI, pJ, mid: { x: (pI.x + pJ.x) / 2, y: (pI.y + pJ.y) / 2, z: (pI.z + pJ.z) / 2 }, line, ends: [], remnants: [], loads: [] };

    const endSpecs: Array<['I' | 'J', number, V3, 1 | -1, number, number, number, number, number, number]> = [
      ['I', elem.nodeI, pI, 1, ef.nStart, ef.vyStart, ef.vzStart, ef.mxStart, ef.myStart, ef.mzStart],
      ['J', elem.nodeJ, pJ, -1, ef.nEnd, ef.vyEnd, ef.vzEnd, ef.mxEnd, ef.myEnd, ef.mzEnd],
    ];
    for (const [end, nodeId, node, axialOut, n, vy, vz, mx, my, mz] of endSpecs) {
      if (wantMember) {
        const eg = buildEnd(elem.id, nodeId, end, 'member', exV, eyV, ezV, axialOut, n, vy, vz, mx, my, mz);
        group.add(eg); anim.ends.push({ group: eg, node, isNodeSide: false });
      }
      if (wantNode) {
        const eg = buildEnd(elem.id, nodeId, end, 'node', exV, eyV, ezV, axialOut, n, vy, vz, mx, my, mz);
        group.add(eg); anim.ends.push({ group: eg, node, isNodeSide: true });
      }
      // Dashed remnant: node → shrunken end (updated in despieceUpdate).
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([node.x, node.y, node.z, node.x, node.y, node.z]), 3));
      const rline = new THREE.Line(rgeo, remnantMat);
      rline.frustumCulled = false;
      group.add(rline);
      anim.remnants.push({ line: rline, node, toEnd: end });
    }

    // Applied MEMBER loads as external actions (amber), tied to the shrunken member
    // via a frac∈[0,1] so they ride the member during the pull-apart animation.
    // 'all' = sampled arrows along the span; 'resultant' = one equivalent arrow at
    // the load centroid. Capped on large models (same gate as labels).
    if (loadMode !== 'off' && showLabels) {
      const Llen = Math.hypot(pJ.x - pI.x, pJ.y - pI.y, pJ.z - pI.z) || 1;
      /* Member loads are typed along the y the user sees: negated under the left-hand convention. */
      const eyUser = leftHand ? eyV.clone().negate() : eyV;
      // `at` = metres from I on the real member: where the load acts (userData.loadAt,
      // world) — the glyph itself rides the shrunken span at the same fraction.
      const addLoad = (dir: THREE.Vector3, len: number, at: number, force?: THREE.Vector3) => {
        const a = fixedArrow(dir, len, colLoad);
        if (!a) return;
        a.userData.despieceLoad = true;
        a.userData.elemId = elem.id;
        if (force) {
          a.userData.forceVec = v3(force);
          a.userData.loadAt = [pI.x + exV.x * at, pI.y + exV.y * at, pI.z + exV.z * at];
        } else {
          delete a.userData.forceVec;      // a sampled intensity (kN/m), not a force
        }
        group.add(a); anim.loads.push({ obj: a, frac: Math.max(0, Math.min(1, at / Llen)) });
      };
      for (const ld of loads) {
        if (ld.type === 'distributed3d' && ld.data.elementId === elem.id) {
          const d = ld.data; const a0 = d.a ?? 0, b0 = d.b ?? Llen;
          if (loadMode === 'resultant') {
            // Statically exact point resultants (distPointResultants). One arrow when
            // the y and z parts share a single line of action, one per part otherwise:
            // two forces at different stations are not one force.
            const RY = distPointResultants(d.qYI, d.qYJ, a0, b0), RZ = distPointResultants(d.qZI, d.qZJ, a0, b0);
            const parts: Array<{ f: THREE.Vector3; at: number }> = [];
            if (RY.length === 1 && RZ.length === 1 && Math.abs(RY[0].at - RZ[0].at) <= 1e-9 * Llen) {
              parts.push({ f: eyUser.clone().multiplyScalar(RY[0].mag).add(ezV.clone().multiplyScalar(RZ[0].mag)), at: RY[0].at });
            } else {
              for (const r of RY) parts.push({ f: eyUser.clone().multiplyScalar(r.mag), at: r.at });
              for (const r of RZ) parts.push({ f: ezV.clone().multiplyScalar(r.mag), at: r.at });
            }
            for (const p of parts) if (p.f.length() > FORCE_EPS) addLoad(p.f, ARROW_LEN, p.at, p.f);
          } else {
            const SAMPLES = 5;
            for (let i = 0; i <= SAMPLES; i++) {
              const t = i / SAMPLES, pos = a0 + (b0 - a0) * t;
              const qY = d.qYI + (d.qYJ - d.qYI) * t, qZ = d.qZI + (d.qZJ - d.qZI) * t;
              const dir = eyUser.clone().multiplyScalar(qY).add(ezV.clone().multiplyScalar(qZ));
              if (dir.length() > FORCE_EPS) addLoad(dir, ARROW_LEN * 0.7, pos);
            }
          }
        } else if (ld.type === 'pointOnElement3d' && ld.data.elementId === elem.id) {
          const d = ld.data;
          // Its force, local (with the axial part) or global.
          const dir = (d.frame ?? 'local') === 'global'
            ? new THREE.Vector3(d.px ?? 0, d.py, d.pz)
            : exV.clone().multiplyScalar(d.px ?? 0).add(eyUser.clone().multiplyScalar(d.py)).add(ezV.clone().multiplyScalar(d.pz));
          if (dir.length() > FORCE_EPS) addLoad(dir, ARROW_LEN, d.a ?? 0, dir);
        }
      }
    }

    members.push(anim);
  }

  // Support reactions: one-sided EXTERNAL actions (drawn once, never mirrored):
  // the force arrow and, where the support restrains a rotation, the reaction
  // moment (without it a fixed joint's free body could not balance; the 2D view
  // draws its reaction moment too).
  if (showReactions) {
    for (const r of reactions) {
      const node = nodes.get(r.nodeId);
      if (!node) continue;
      const pos = projectNodeToScene(node, project2D);
      const fv = new THREE.Vector3(r.fx, r.fy, r.fz);
      const mv = new THREE.Vector3(r.mx ?? 0, r.my ?? 0, r.mz ?? 0);
      const hasF = fv.length() > FORCE_EPS, hasM = mv.length() > FORCE_EPS;
      if (!hasF && !hasM) continue;
      const a = hasF ? fixedArrow(fv, ARROW_LEN, colReaction) : null;
      if (a) {
        a.position.set(pos.x, pos.y, pos.z);
        a.userData.despieceReaction = true;
        a.userData.nodeId = r.nodeId;
        group.add(a);
      }
      const mg = hasM ? momentArc(mv, ARROW_LEN * 0.5, colReaction) : null;
      if (mg) {
        mg.position.set(pos.x, pos.y, pos.z);
        mg.userData.despieceReaction = true;
        mg.userData.nodeId = r.nodeId;
        group.add(mg);
      }
      if (showLabels) {
        const txt = reactionLabel(fv, mv, opts.format);
        const lbl = createTextSpriteCached(txt, DESPIECE_COL.reaction, 20);
        lbl.scale.set(0.6 * lSize, 0.6 * lSize, 1);
        lbl.position.set(pos.x, pos.y - labelOffset, pos.z);
        group.add(lbl);
      }
    }
  }

  // Applied NODAL loads (global) as external actions — at the node, drawn once.
  // Combined force arrow + moment glyph in both modes (3D nodal as separate world
  // components is cluttered; the combined glyph reads cleanly). Capped on big models.
  if (loadMode !== 'off' && showLabels) {
    for (const ld of loads) {
      if (ld.type !== 'nodal3d') continue;
      const node = nodes.get(ld.data.nodeId);
      if (!node) continue;
      const pos = projectNodeToScene(node, project2D);
      const fv = new THREE.Vector3(ld.data.fx, ld.data.fy, ld.data.fz);
      if (fv.length() > FORCE_EPS) {
        const a = fixedArrow(fv, ARROW_LEN, colLoad);
        if (a) { a.position.set(pos.x, pos.y, pos.z); a.userData.despieceLoad = true; a.userData.loadAt = [pos.x, pos.y, pos.z]; a.userData.nodeId = ld.data.nodeId; group.add(a); }
      }
      const mv = new THREE.Vector3(ld.data.mx, ld.data.my, ld.data.mz);
      if (mv.length() > FORCE_EPS) {
        const mg = momentArc(mv, ARROW_LEN * 0.5, colLoad);
        if (mg) { mg.position.set(pos.x, pos.y, pos.z); mg.userData.despieceLoad = true; mg.userData.loadAt = [pos.x, pos.y, pos.z]; mg.userData.nodeId = ld.data.nodeId; group.add(mg); }
      }
    }
  }

  group.userData = {
    arrowLen: ARROW_LEN,
    despieceUpdate(s: number) {
      const g = Math.max(0, Math.min(1, s)) * MAX_GAP_FRAC;
      const show = s > 0.04;
      for (const m of members) {
        const aIx = m.pI.x + (m.mid.x - m.pI.x) * g, aIy = m.pI.y + (m.mid.y - m.pI.y) * g, aIz = m.pI.z + (m.mid.z - m.pI.z) * g;
        const aJx = m.pJ.x + (m.mid.x - m.pJ.x) * g, aJy = m.pJ.y + (m.mid.y - m.pJ.y) * g, aJz = m.pJ.z + (m.mid.z - m.pJ.z) * g;
        const end: Record<'I' | 'J', V3> = { I: { x: aIx, y: aIy, z: aIz }, J: { x: aJx, y: aJy, z: aJz } };
        const lp = m.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        lp.setXYZ(0, aIx, aIy, aIz); lp.setXYZ(1, aJx, aJy, aJz); lp.needsUpdate = true;
        for (const e of m.ends) {
          // Which shrunken end does this group belong to? match by closest node.
          const shrunk = Math.hypot(e.node.x - m.pI.x, e.node.y - m.pI.y, e.node.z - m.pI.z) <
            Math.hypot(e.node.x - m.pJ.x, e.node.y - m.pJ.y, e.node.z - m.pJ.z) ? end.I : end.J;
          if (e.isNodeSide) {
            e.group.position.set(
              e.node.x + (shrunk.x - e.node.x) * NODE_FRAC,
              e.node.y + (shrunk.y - e.node.y) * NODE_FRAC,
              e.node.z + (shrunk.z - e.node.z) * NODE_FRAC,
            );
          } else {
            e.group.position.set(shrunk.x, shrunk.y, shrunk.z);
          }
          e.group.visible = show;
        }
        for (const rm of m.remnants) {
          const shrunk = rm.toEnd === 'I' ? end.I : end.J;
          const rp = rm.line.geometry.getAttribute('position') as THREE.BufferAttribute;
          // Remnant starts AFTER the node-side vector (REMNANT_START_FRAC toward the
          // shrunken end) so the dotted ghost never runs under the node-side arrow.
          const sx = rm.node.x + (shrunk.x - rm.node.x) * REMNANT_START_FRAC;
          const sy = rm.node.y + (shrunk.y - rm.node.y) * REMNANT_START_FRAC;
          const sz = rm.node.z + (shrunk.z - rm.node.z) * REMNANT_START_FRAC;
          rp.setXYZ(0, sx, sy, sz);
          rp.setXYZ(1, shrunk.x, shrunk.y, shrunk.z);
          rp.needsUpdate = true;
          rm.line.geometry.computeBoundingSphere();
          rm.line.computeLineDistances();
          rm.line.visible = show;
        }
        // Member load glyphs ride the shrunken span: position at frac from I→J end.
        for (const ld of m.loads) {
          ld.obj.position.set(
            end.I.x + (end.J.x - end.I.x) * ld.frac,
            end.I.y + (end.J.y - end.I.y) * ld.frac,
            end.I.z + (end.J.z - end.I.z) * ld.frac,
          );
          ld.obj.visible = show;
        }
      }
    },
  };
  group.userData.despieceUpdate(sep);
  return group;
}

// ─── Inspection (pure aggregation, basis-aware) ─────────────────────

export interface Despiece3DEndAction {
  elementId: number; end: 'I' | 'J'; nodeId: number;
  components: Array<{ label: string; value: number }>;
}

interface Inspect3DArgs {
  elements: Iterable<DespieceElement3D>;
  getNode: (id: number) => V3 | undefined;
  getForces: (id: number) => ElementForces3D | undefined;
  basis: DespieceBasis;
  leftHand?: boolean;
}
/**
 * `sectionRotation` is the section's own rotation (Section.rotation, degrees): the
 * solver folds it into the roll angle, so the basis here has to as well, or the
 * inspected Fx/Fy/Fz of a member with a rotated section disagree with the arrows.
 */
export interface DespieceElement3D { id: number; nodeI: number; nodeJ: number; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number; sectionRotation?: number; }

function end3DComponents(
  ex: Vec3, ey: Vec3, ez: Vec3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
): Array<{ label: string; value: number }> {
  if (basis === 'global') {
    // The same end action the arrows draw (memberEndAction3D).
    const f = memberEndAction3D(ex, ey, ez, axialOut, n, vy, vz, mx, my, mz).force;
    return [{ label: 'Fx', value: f[0] }, { label: 'Fy', value: f[1] }, { label: 'Fz', value: f[2] }, { label: 'My', value: my }, { label: 'Mz', value: mz }, { label: 'T', value: mx }];
  }
  return [{ label: 'N', value: n }, { label: 'Vy', value: vy }, { label: 'Vz', value: vz }, { label: 'My', value: my }, { label: 'Mz', value: mz }, { label: 'T', value: mx }];
}

function endAction3D(args: Inspect3DArgs, el: DespieceElement3D, end: 'I' | 'J'): Despiece3DEndAction | null {
  const nI = args.getNode(el.nodeI), nJ = args.getNode(el.nodeJ);
  const ef = args.getForces(el.id);
  if (!nI || !nJ || !ef) return null;
  let axes;
  try {
    const localY = (el.localYx !== undefined && el.localYy !== undefined && el.localYz !== undefined) ? { x: el.localYx, y: el.localYy, z: el.localYz } : undefined;
    const roll = (el.rollAngle ?? 0) + (el.sectionRotation ?? 0);
    axes = computeLocalAxes3D({ id: 0, ...nI }, { id: 0, ...nJ }, localY, roll, false); // the solver's right-handed frame
  } catch { return null; }
  const [axialOut, n, vy, vz, mx, my, mz, nodeId]: [1 | -1, number, number, number, number, number, number, number] =
    end === 'I' ? [1, ef.nStart, ef.vyStart, ef.vzStart, ef.mxStart, ef.myStart, ef.mzStart, el.nodeI]
                : [-1, ef.nEnd, ef.vyEnd, ef.vzEnd, ef.mxEnd, ef.myEnd, ef.mzEnd, el.nodeJ];
  return { elementId: el.id, end, nodeId, components: end3DComponents(axes.ex, axes.ey, axes.ez, axialOut, n, vy, vz, mx, my, mz, args.basis) };
}

/** Both end actions (I and J) of one member. */
export function inspectMember3D(args: Inspect3DArgs, elementId: number): { elementId: number; ends: Despiece3DEndAction[] } | null {
  let target: DespieceElement3D | undefined;
  for (const el of args.elements) if (el.id === elementId) { target = el; break; }
  if (!target) return null;
  const ends = (['I', 'J'] as const).map(e => endAction3D(args, target!, e)).filter((x): x is Despiece3DEndAction => !!x);
  return { elementId, ends };
}

/** Every connected member-end action converging at a node. */
export function inspectNode3D(args: Inspect3DArgs, nodeId: number): { nodeId: number; actions: Despiece3DEndAction[] } {
  const actions: Despiece3DEndAction[] = [];
  for (const el of args.elements) {
    if (el.nodeI === nodeId) { const a = endAction3D(args, el, 'I'); if (a) actions.push(a); }
    if (el.nodeJ === nodeId) { const a = endAction3D(args, el, 'J'); if (a) actions.push(a); }
  }
  return { nodeId, actions };
}
