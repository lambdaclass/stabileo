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
import type { Element, Node, Section } from '../store/model.svelte';

export const DESPIECE_COL = {
  axial: '#ff7070',
  shear: '#4ecdc4',
  moment: '#ffd166',
  reaction: '#00e676',
  member: '#9aa7c7',
  remnant: '#5a6478',
};

export type DespieceVectorMode = 'all' | 'members' | 'nodes';
export type DespieceBasis = 'local' | 'global';

const MAX_GAP_FRAC = 0.18;   // member shrink per end at full separation
const NODE_FRAC = 0.32;      // node action anchor: fraction from node toward shrunken end
const LABEL_ELEM_CAP = 60;   // suppress per-end labels above this many elements (arrows stay)
const FORCE_EPS = 1e-3;      // kN / kN·m below which a component is treated as zero

type V3 = { x: number; y: number; z: number };

interface MemberAnim {
  pI: V3; pJ: V3; mid: V3;
  line: THREE.Line;
  ends: Array<{ group: THREE.Group; node: V3; isNodeSide: boolean }>;
  remnants: Array<{ line: THREE.Line; node: V3; toEnd: 'I' | 'J' }>;
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

interface ForceArrow { dir: THREE.Vector3; len: number; color: number; }

/** Member-side force arrows in the requested basis (sign baked into direction). */
function memberForceArrows(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, basis: DespieceBasis, arrowLen: number,
  colAxial: number, colShear: number,
): ForceArrow[] {
  const out: ForceArrow[] = [];
  if (basis === 'global') {
    // Member-end force vector in world coords (N along ex with the display sign,
    // plus the two shear components), then split into world Fx/Fy/Fz.
    const f = ex.clone().multiplyScalar(n * axialOut).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz));
    if (Math.abs(f.x) > FORCE_EPS) out.push({ dir: new THREE.Vector3(Math.sign(f.x), 0, 0), len: arrowLen, color: colAxial });
    if (Math.abs(f.y) > FORCE_EPS) out.push({ dir: new THREE.Vector3(0, Math.sign(f.y), 0), len: arrowLen, color: colAxial });
    if (Math.abs(f.z) > FORCE_EPS) out.push({ dir: new THREE.Vector3(0, 0, Math.sign(f.z)), len: arrowLen, color: colAxial });
    return out;
  }
  if (Math.abs(n) > FORCE_EPS) out.push({ dir: ex.clone().multiplyScalar(Math.sign(n) * axialOut), len: arrowLen, color: colAxial });
  const shear = ey.clone().multiplyScalar(vy).add(ez.clone().multiplyScalar(vz));
  if (shear.length() > FORCE_EPS) out.push({ dir: shear, len: arrowLen * 0.85, color: colShear });
  return out;
}

/** Compact end label in the requested basis. */
function endLabel(
  ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
  n: number, vy: number, vz: number, mx: number, my: number, mz: number, basis: DespieceBasis,
): string {
  const parts: string[] = [];
  if (basis === 'global') {
    const f = ex.clone().multiplyScalar(n * axialOut).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz));
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
}): DespieceGroup {
  const { elements, nodes, forces, reactions, sep, sections, leftHand, project2D } = opts;
  const vectorMode = opts.vectorMode ?? 'all';
  const basis = opts.basis ?? 'local';
  const vSize = Math.max(0.5, Math.min(2, opts.vectorSize ?? 1));
  const lSize = Math.max(0.6, Math.min(2, opts.labelSize ?? 1));
  const showReactions = opts.showReactions ?? false;
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
  const colReaction = new THREE.Color(DESPIECE_COL.reaction).getHex();
  const memberMat = new THREE.LineBasicMaterial({ color: DESPIECE_COL.member });
  const remnantMat = new THREE.LineDashedMaterial({ color: DESPIECE_COL.remnant, dashSize: 0.12 * charLen, gapSize: 0.1 * charLen, transparent: true, opacity: 0.55 });

  const members: MemberAnim[] = [];

  function buildEnd(
    elemId: number, nodeId: number, side: 'member' | 'node',
    ex: THREE.Vector3, ey: THREE.Vector3, ez: THREE.Vector3, axialOut: 1 | -1,
    n: number, vy: number, vz: number, mx: number, my: number, mz: number,
  ): THREE.Group {
    const eg = new THREE.Group();
    eg.userData = { despieceEnd: true, side, elemId, nodeId };
    const sign = side === 'member' ? 1 : -1;  // node action is opposite
    for (const fa of memberForceArrows(ex, ey, ez, axialOut, n, vy, vz, basis, ARROW_LEN, colAxial, colShear)) {
      const a = fixedArrow(fa.dir.clone().multiplyScalar(sign), fa.len, fa.color);
      if (a) eg.add(a);
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

    const anim: MemberAnim = { pI, pJ, mid: { x: (pI.x + pJ.x) / 2, y: (pI.y + pJ.y) / 2, z: (pI.z + pJ.z) / 2 }, line, ends: [], remnants: [] };

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
          rp.setXYZ(0, rm.node.x, rm.node.y, rm.node.z);
          rp.setXYZ(1, shrunk.x, shrunk.y, shrunk.z);
          rp.needsUpdate = true;
          rm.line.geometry.computeBoundingSphere();
          rm.line.computeLineDistances();
          rm.line.visible = show;
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
    const f = ex.clone().multiplyScalar(n * axialOut).add(ey.clone().multiplyScalar(vy)).add(ez.clone().multiplyScalar(vz));
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
