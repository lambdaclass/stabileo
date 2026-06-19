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
//   - support reaction: one-sided EXTERNAL action, drawn ONCE (never mirrored).
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
import { createTextSprite } from './selection-helpers';
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

/** Equivalent resultant of a trapezoidal/partial distributed component (qI@a..qJ@b). */
function distResultant(qI: number, qJ: number, a: number, b: number): { mag: number; centroid: number } {
  const L = b - a, sum = qI + qJ;
  const raw = Math.abs(sum) < 1e-9 ? a + L / 2 : a + (L / 3) * (qI + 2 * qJ) / sum;
  // Clamp to [a, b]: a sign-reversing trapezoid can otherwise place the
  // resultant centroid far off the member (mirror of draw-despiece.ts).
  return { mag: sum / 2 * L, centroid: Math.min(b, Math.max(a, raw)) };
}

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

interface ForceArrow { dir: THREE.Vector3; len: number; color: number; }

/** Member-side force arrows in the requested basis (sign baked into direction). */
function memberForceArrows(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, basis: DespieceBasis, arrowLen: number,
  colAxial: number, colShear: number, resultant: boolean,
): ForceArrow[] {
  const out: ForceArrow[] = [];
  // FREE-BODY END-FACE CONVENTION (mirrors 2D): the member-side end ACTION is the
  // local force vector assembled from diagram values, multiplied by `axialOut`
  // (+1 at I, −1 at J) which encodes the opposite outward face normals at the two
  // cuts. ElementForces3D are diagram values: axial same-sign at both ends, shear
  // opposite-sign — so the single axialOut factor makes axial point OUT at both
  // ends for tension and makes shear point the SAME physical way at both ends
  // (the separated member is then in equilibrium under its end actions + loads).
  const fVec = ex.clone().multiplyScalar(-n).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz)).multiplyScalar(axialOut);
  // Resultant mode: ONE composed force arrow (the true member-side force vector).
  if (resultant) {
    if (fVec.length() > FORCE_EPS) out.push({ dir: fVec, len: arrowLen, color: colAxial });
    return out;
  }
  if (basis === 'global') {
    if (Math.abs(fVec.x) > FORCE_EPS) out.push({ dir: new THREE.Vector3(Math.sign(fVec.x), 0, 0), len: arrowLen, color: colAxial });
    if (Math.abs(fVec.y) > FORCE_EPS) out.push({ dir: new THREE.Vector3(0, Math.sign(fVec.y), 0), len: arrowLen, color: colAxial });
    if (Math.abs(fVec.z) > FORCE_EPS) out.push({ dir: new THREE.Vector3(0, 0, Math.sign(fVec.z)), len: arrowLen, color: colAxial });
    return out;
  }
  // Local, separate components: axial N + the two shears Vy, Vz (each ×axialOut).
  if (Math.abs(n) > FORCE_EPS) out.push({ dir: ex.clone().multiplyScalar(-Math.sign(n) * axialOut), len: arrowLen, color: colAxial });
  if (Math.abs(vy) > FORCE_EPS) out.push({ dir: ey.clone().multiplyScalar(Math.sign(vy) * axialOut), len: arrowLen * 0.85, color: colShear });
  if (Math.abs(vz) > FORCE_EPS) out.push({ dir: ez.clone().multiplyScalar(Math.sign(vz) * axialOut), len: arrowLen * 0.85, color: colShear });
  return out;
}

/** Compact end label in the requested basis. */
function endLabel(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
): string {
  const parts: string[] = [];
  if (basis === 'global') {
    const f = ex.clone().multiplyScalar(-n).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz)).multiplyScalar(axialOut);
    if (Math.abs(f.x) > FORCE_EPS) parts.push(`Fx ${f.x.toFixed(1)}`);
    if (Math.abs(f.y) > FORCE_EPS) parts.push(`Fy ${f.y.toFixed(1)}`);
    if (Math.abs(f.z) > FORCE_EPS) parts.push(`Fz ${f.z.toFixed(1)}`);
  } else {
    if (Math.abs(n) > FORCE_EPS) parts.push(`N ${n.toFixed(1)}`);
    const sh = Math.hypot(vy, vz);
    if (sh > FORCE_EPS) parts.push(`V ${sh.toFixed(1)}`);
  }
  const m = Math.hypot(my, mz);
  if (m > FORCE_EPS || Math.abs(mx) > FORCE_EPS) parts.push(`M ${m.toFixed(1)}${Math.abs(mx) > FORCE_EPS ? ` T ${mx.toFixed(1)}` : ''}`);
  return parts.join('  ');
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
    elemId: number, nodeId: number, side: 'member' | 'node',
    ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
    n: number, vy: number, vz: number, mx: number, my: number, mz: number,
  ): THREE.Group {
    const eg = new THREE.Group();
    eg.userData = { despieceEnd: true, side, elemId, nodeId };
    const sign = side === 'member' ? 1 : -1;  // node action is opposite
    // Outward = from the end toward the node/gap (−ex·axialOut). Used to keep the
    // arrow BODY in the gap: if a force points into the member, draw it with the
    // head at the anchor and the tail extending outward, so it never lies on the
    // solid member (parity with the 2D outward-flip).
    const outward = ex.clone().multiplyScalar(-axialOut);
    for (const fa of memberForceArrows(ex, ey, ez, axialOut, n, vy, vz, basis, ARROW_LEN, colAxial, colShear, resultant)) {
      const d = fa.dir.clone().multiplyScalar(sign);
      const a = fixedArrow(d, fa.len, fa.color);
      if (!a) continue;
      if (d.dot(outward) < 0) {
        // points into the member → shift tail outward so the head lands on the anchor
        const u = d.clone().normalize().multiplyScalar(-fa.len);
        a.position.set(u.x, u.y, u.z);
      }
      eg.add(a);
    }
    // Curved moment/torsion glyphs. Capped like labels to limit clutter. Per-end
    // face flip (axialOut) so I/J senses are opposite for the same stored moment,
    // plus the node-side flip (sign) for the action/reaction pair. Resultant mode
    // → ONE composed moment arc; otherwise separate arcs per local axis (T,My,Mz).
    if (showLabels) {
      const k = sign * axialOut;
      if (resultant) {
        const mVec = ex.clone().multiplyScalar(mx).add(ey.clone().multiplyScalar(my)).add(ez.clone().multiplyScalar(mz)).multiplyScalar(k);
        const mg = momentArc(mVec, ARROW_LEN * 0.5, colMoment);
        if (mg) eg.add(mg);
      } else {
        // Separate per-axis arcs (radii staggered so co-incident axes don't overlap).
        const comps: Array<[THREE.Vector3, number]> = [
          [ex.clone().multiplyScalar(mx * k), 0.50],
          [ey.clone().multiplyScalar(my * k), 0.62],
          [ez.clone().multiplyScalar(mz * k), 0.74],
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
      const txt = endLabel(ex, ey, ez, axialOut, n, vy, vz, mx, my, mz, basis);
      if (txt) {
        const lbl = createTextSprite(txt, basis === 'global' ? DESPIECE_COL.axial : DESPIECE_COL.moment, 20);
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
      axes = computeLocalAxes3D({ id: 0, ...pI }, { id: 0, ...pJ }, localY, roll, leftHand);
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
        const eg = buildEnd(elem.id, nodeId, 'member', exV, eyV, ezV, axialOut, n, vy, vz, mx, my, mz);
        group.add(eg); anim.ends.push({ group: eg, node, isNodeSide: false });
      }
      if (wantNode) {
        const eg = buildEnd(elem.id, nodeId, 'node', exV, eyV, ezV, axialOut, n, vy, vz, mx, my, mz);
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
      const addLoad = (dir: THREE.Vector3, len: number, frac: number) => {
        const a = fixedArrow(dir, len, colLoad);
        if (a) { a.userData.despieceLoad = true; group.add(a); anim.loads.push({ obj: a, frac: Math.max(0, Math.min(1, frac)) }); }
      };
      for (const ld of loads) {
        if (ld.type === 'distributed3d' && ld.data.elementId === elem.id) {
          const d = ld.data; const a0 = d.a ?? 0, b0 = d.b ?? Llen;
          if (loadMode === 'resultant') {
            const RY = distResultant(d.qYI, d.qYJ, a0, b0), RZ = distResultant(d.qZI, d.qZJ, a0, b0);
            const dir = eyV.clone().multiplyScalar(RY.mag).add(ezV.clone().multiplyScalar(RZ.mag));
            const wsum = Math.abs(RY.mag) + Math.abs(RZ.mag);
            const centroid = wsum < 1e-9 ? (a0 + b0) / 2 : (Math.abs(RY.mag) * RY.centroid + Math.abs(RZ.mag) * RZ.centroid) / wsum;
            if (dir.length() > FORCE_EPS) addLoad(dir, ARROW_LEN, centroid / Llen);
          } else {
            const SAMPLES = 5;
            for (let i = 0; i <= SAMPLES; i++) {
              const t = i / SAMPLES, pos = a0 + (b0 - a0) * t;
              const qY = d.qYI + (d.qYJ - d.qYI) * t, qZ = d.qZI + (d.qZJ - d.qZI) * t;
              const dir = eyV.clone().multiplyScalar(qY).add(ezV.clone().multiplyScalar(qZ));
              if (dir.length() > FORCE_EPS) addLoad(dir, ARROW_LEN * 0.7, pos / Llen);
            }
          }
        } else if (ld.type === 'pointOnElement3d' && ld.data.elementId === elem.id) {
          const d = ld.data;
          const dir = eyV.clone().multiplyScalar(d.py).add(ezV.clone().multiplyScalar(d.pz));
          if (dir.length() > FORCE_EPS) addLoad(dir, ARROW_LEN, (d.a ?? 0) / Llen);
        }
      }
    }

    members.push(anim);
  }

  // Support reactions: one-sided EXTERNAL action arrows (drawn once, never mirrored).
  if (showReactions) {
    for (const r of reactions) {
      const node = nodes.get(r.nodeId);
      if (!node) continue;
      const pos = projectNodeToScene(node, project2D);
      const fv = new THREE.Vector3(r.fx, r.fy, r.fz);
      if (fv.length() <= FORCE_EPS) continue;
      const a = fixedArrow(fv, ARROW_LEN, colReaction);
      if (!a) continue;
      a.position.set(pos.x, pos.y, pos.z);
      a.userData.despieceReaction = true;
      group.add(a);
      if (showLabels) {
        const lbl = createTextSprite(`R ${fv.length().toFixed(1)}`, DESPIECE_COL.reaction, 20);
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
        if (a) { a.position.set(pos.x, pos.y, pos.z); a.userData.despieceLoad = true; group.add(a); }
      }
      const mv = new THREE.Vector3(ld.data.mx, ld.data.my, ld.data.mz);
      if (mv.length() > FORCE_EPS) {
        const mg = momentArc(mv, ARROW_LEN * 0.5, colLoad);
        if (mg) { mg.position.set(pos.x, pos.y, pos.z); mg.userData.despieceLoad = true; group.add(mg); }
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
export interface DespieceElement3D { id: number; nodeI: number; nodeJ: number; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number; }

function end3DComponents(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
): Array<{ label: string; value: number }> {
  if (basis === 'global') {
    const f = ex.clone().multiplyScalar(-n).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz)).multiplyScalar(axialOut);
    return [{ label: 'Fx', value: f.x }, { label: 'Fy', value: f.y }, { label: 'Fz', value: f.z }, { label: 'My', value: my }, { label: 'Mz', value: mz }, { label: 'T', value: mx }];
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
    axes = computeLocalAxes3D({ id: 0, ...nI }, { id: 0, ...nJ }, localY, el.rollAngle, args.leftHand ?? false);
  } catch { return null; }
  const ex = new THREE.Vector3(...axes.ex), ey = new THREE.Vector3(...axes.ey), ez = new THREE.Vector3(...axes.ez);
  const [axialOut, n, vy, vz, mx, my, mz, nodeId]: [1 | -1, number, number, number, number, number, number, number] =
    end === 'I' ? [1, ef.nStart, ef.vyStart, ef.vzStart, ef.mxStart, ef.myStart, ef.mzStart, el.nodeI]
                : [-1, ef.nEnd, ef.vyEnd, ef.vzEnd, ef.mxEnd, ef.myEnd, ef.mzEnd, el.nodeJ];
  return { elementId: el.id, end, nodeId, components: end3DComponents(ex, ey, ez, axialOut, n, vy, vz, mx, my, mz, args.basis) };
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
