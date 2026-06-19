/**
 * Despiece / free-body 3D builder + inspection — parity with 2D.
 * Visualization-only, non-mutating, performant (build-once + animate).
 * Covers: vector-mode filter, member/node anchors, high-valence distinct origins,
 * local/global basis transform, reactions drawn once, fixed-size arrows + size
 * controls, label cap, and the basis-aware inspection helpers.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

// createTextSprite needs a canvas — stub like create-load-arrow.test.ts.
const canvasStub = {
  width: 0, height: 0,
  getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {} }),
};
Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvasStub }, configurable: true });

import { createDespiece3DGroup, inspectMember3D, inspectNode3D, type DespieceVectorMode, type DespieceBasis } from '../despiece-3d';
import type { Element, Node, Section } from '../../store/model.svelte';
import type { ElementForces3D, Reaction3D } from '../../engine/types-3d';

function rel() { return { my: false, mz: false, t: false }; }
function el(id: number, i: number, j: number): Element {
  return { id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, releaseI: rel(), releaseJ: rel() } as Element;
}
function ef(id: number, n = 10): ElementForces3D {
  return { elementId: id, length: 4, nStart: n, nEnd: -n, vyStart: 5, vyEnd: -5, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 8, mzEnd: -8 } as ElementForces3D;
}
const SEC = new Map<number, Section>([[1, { id: 1, a: 0.01, iz: 1e-4 } as Section]]);

function horizModel() {
  const nodes = new Map<number, Node>([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]);
  const elements = new Map<number, Element>([[1, el(1, 1, 2)]]);
  return { nodes, elements };
}
function build(o: {
  nodes: Map<number, Node>; elements: Map<number, Element>; forces: ElementForces3D[];
  sep?: number; reactions?: Reaction3D[]; vectorMode?: DespieceVectorMode; basis?: DespieceBasis;
  vectorSize?: number; labelSize?: number; showReactions?: boolean; resultant?: boolean;
}) {
  return createDespiece3DGroup({
    elements: o.elements, nodes: o.nodes, forces: o.forces, reactions: o.reactions ?? [],
    sep: o.sep ?? 1, sections: SEC, leftHand: false, project2D: false,
    vectorMode: o.vectorMode, basis: o.basis, vectorSize: o.vectorSize, labelSize: o.labelSize,
    showReactions: o.showReactions, resultant: o.resultant,
  });
}
const arrows = (g: THREE.Object3D) => { const out: THREE.ArrowHelper[] = []; g.traverse(o => { if (o instanceof THREE.ArrowHelper) out.push(o); }); return out; };
// Recover an ArrowHelper's pointing direction (ArrowHelper points along local +Y, rotated by its quaternion).
const arrowDir = (a: THREE.ArrowHelper) => new THREE.Vector3(0, 1, 0).applyQuaternion(a.quaternion);
const endGroups = (g: THREE.Group, side?: 'member' | 'node') =>
  g.children.filter(c => c.userData?.despieceEnd && (side === undefined || c.userData.side === side));
const reactionArrows = (g: THREE.Group) => arrows(g).filter(a => a.userData?.despieceReaction === true);

describe('despiece 3D builder', () => {
  it('does not mutate the model', () => {
    const { nodes, elements } = horizModel();
    const before = JSON.stringify([...nodes.values(), ...elements.values()]);
    build({ nodes, elements, forces: [ef(1)] });
    expect(JSON.stringify([...nodes.values(), ...elements.values()])).toBe(before);
  });

  it('requires forces — no force arrows without results', () => {
    const { nodes, elements } = horizModel();
    expect(arrows(build({ nodes, elements, forces: [] }))).toHaveLength(0);
  });

  it('vectorMode changes counts: all = members + nodes, each filtered to its side', () => {
    const { nodes, elements } = horizModel();
    const all = build({ nodes, elements, forces: [ef(1)], vectorMode: 'all' });
    const mem = build({ nodes, elements, forces: [ef(1)], vectorMode: 'members' });
    const nod = build({ nodes, elements, forces: [ef(1)], vectorMode: 'nodes' });
    expect(endGroups(mem).every(e => e.userData.side === 'member')).toBe(true);
    expect(endGroups(nod).every(e => e.userData.side === 'node')).toBe(true);
    expect(endGroups(all).length).toBe(endGroups(mem).length + endGroups(nod).length);
    expect(endGroups(mem).length).toBe(endGroups(nod).length);
  });

  it('member-side anchors at the shrunken end; node-side anchors near the node', () => {
    const { nodes, elements } = horizModel();
    const g = build({ nodes, elements, forces: [ef(1)], vectorMode: 'all', sep: 1 });
    const node = new THREE.Vector3(0, 0, 0);                  // node 1
    const memberSide = endGroups(g, 'member').find(e => e.userData.nodeId === 1)!;
    const nodeSide = endGroups(g, 'node').find(e => e.userData.nodeId === 1)!;
    // member-side is farther from the node than node-side (which hugs the node)
    expect(memberSide.position.distanceTo(node)).toBeGreaterThan(nodeSide.position.distanceTo(node));
    expect(nodeSide.position.distanceTo(node)).toBeLessThan(memberSide.position.distanceTo(node) * 0.6);
    expect(memberSide.position.distanceTo(nodeSide.position)).toBeGreaterThan(1e-3);
  });

  it('tension (N>0): member-side axial points toward the node, body stays in the gap', () => {
    // Member along +x: node 1 at x=0, shrunken end at x>0. Tension → axial toward node (−x).
    const { nodes, elements } = horizModel();
    const g = build({ nodes, elements, forces: [ef(1, 10)], vectorMode: 'members', sep: 1 });
    const memberSide = endGroups(g, 'member').find(e => e.userData.nodeId === 1)! as THREE.Group;
    const anchorX = memberSide.position.x;                 // shrunken end (gap is between 0 and anchorX)
    const ax = arrows(memberSide).find(a => Math.abs(arrowDir(a).x) > 0.9)!;   // axial = arrow along member axis
    const dir = arrowDir(ax);
    expect(dir.x).toBeLessThan(0);                         // points toward the node (out of the member end)
    const len = ax.userData.glyphLen as number;
    const tailX = memberSide.position.x + ax.position.x;
    const tipX = tailX + dir.x * len;
    expect(Math.max(tailX, tipX)).toBeLessThanOrEqual(anchorX + 1e-6);   // never extends over the solid member
  });

  it('compression (N<0): outward-flip keeps the axial arrow in the gap, not over the member', () => {
    const { nodes, elements } = horizModel();
    const g = build({ nodes, elements, forces: [ef(1, -10)], vectorMode: 'members', sep: 1 });
    const memberSide = endGroups(g, 'member').find(e => e.userData.nodeId === 1)! as THREE.Group;
    const anchorX = memberSide.position.x;
    const ax = arrows(memberSide).find(a => Math.abs(arrowDir(a).x) > 0.9)!;
    const dir = arrowDir(ax);
    expect(dir.x).toBeGreaterThan(0);                      // axial points INTO the member (+x)
    expect(ax.position.x).toBeLessThan(0);                 // ...but flipped outward so the body sits in the gap
    const len = ax.userData.glyphLen as number;
    const tailX = memberSide.position.x + ax.position.x;
    const tipX = tailX + dir.x * len;
    expect(Math.max(tailX, tipX)).toBeLessThanOrEqual(anchorX + 1e-6);   // head lands at the anchor, not beyond
  });

  it('3D end-face convention: axial OUT at both ends; shear SAME physical way at both ends', () => {
    // Member along +X (ex=(1,0,0), ey=(0,1,0), ez=(0,0,1)). Constant tension
    // (nStart=nEnd=+10) and a transverse shear with diagram convention vzStart=+5,
    // vzEnd=−5 (opposite-signed at the two ends).
    const { nodes, elements } = horizModel();
    const f: ElementForces3D = { elementId: 1, length: 4, nStart: 10, nEnd: 10, vyStart: 0, vyEnd: 0,
      vzStart: 5, vzEnd: -5, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 } as ElementForces3D;
    const g = build({ nodes, elements, forces: [f], vectorMode: 'members', sep: 1 });
    const mI = endGroups(g, 'member').find(e => e.userData.nodeId === 1)! as THREE.Group;
    const mJ = endGroups(g, 'member').find(e => e.userData.nodeId === 2)! as THREE.Group;
    const axI = arrows(mI).find(a => Math.abs(arrowDir(a).x) > 0.9)!;
    const axJ = arrows(mJ).find(a => Math.abs(arrowDir(a).x) > 0.9)!;
    expect(arrowDir(axI).x).toBeLessThan(0);     // axial out at I (−x, toward node I)
    expect(arrowDir(axJ).x).toBeGreaterThan(0);  // axial out at J (+x, toward node J)
    const shI = arrows(mI).find(a => Math.abs(arrowDir(a).z) > 0.9)!;
    const shJ = arrows(mJ).find(a => Math.abs(arrowDir(a).z) > 0.9)!;
    expect(Math.sign(arrowDir(shI).z)).toBe(Math.sign(arrowDir(shJ).z)); // both same way ⇒ member balances
  });

  it('resultant toggle: separate N/Vy/Vz arrows (OFF) collapse to one force arrow (ON)', () => {
    const { nodes, elements } = horizModel();
    const f: ElementForces3D = { elementId: 1, length: 4, nStart: 10, nEnd: 10, vyStart: 5, vyEnd: -5,
      vzStart: 4, vzEnd: -4, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 } as ElementForces3D;
    const sep = build({ nodes, elements, forces: [f], vectorMode: 'members', basis: 'local' });
    const res = build({ nodes, elements, forces: [f], vectorMode: 'members', basis: 'local', resultant: true });
    const mISep = endGroups(sep, 'member').find(e => e.userData.nodeId === 1)!;
    const mIRes = endGroups(res, 'member').find(e => e.userData.nodeId === 1)!;
    expect(arrows(mISep).length).toBe(3);   // N + Vy + Vz, separate
    expect(arrows(mIRes).length).toBe(1);   // one composed force vector
  });

  it('3D end-face convention: constant moment ⇒ member I and J senses OPPOSITE', () => {
    const { nodes, elements } = horizModel();
    const f: ElementForces3D = { elementId: 1, length: 4, nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0,
      vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 8, mzEnd: 8 } as ElementForces3D;
    const g = build({ nodes, elements, forces: [f], vectorMode: 'members', sep: 1 });
    const mom = (grp: THREE.Object3D) => { let r: THREE.Object3D | null = null; grp.traverse(o => { if (o.userData?.despieceMoment) r = o; }); return r; };
    const gI = mom(endGroups(g, 'member').find(e => e.userData.nodeId === 1)!)! as THREE.Object3D;
    const gJ = mom(endGroups(g, 'member').find(e => e.userData.nodeId === 2)!)! as THREE.Object3D;
    const aI = gI.userData.momentAxis as number[];
    const aJ = gJ.userData.momentAxis as number[];
    expect(aI[0] * aJ[0] + aI[1] * aJ[1] + aI[2] * aJ[2]).toBeCloseTo(-1, 6); // opposite ⇒ balances
  });

  it('moment glyph: present on member end with a moment, member vs node senses opposite', () => {
    // ef() has mzStart = 8 → a real end moment.
    const { nodes, elements } = horizModel();
    const g = build({ nodes, elements, forces: [ef(1)], vectorMode: 'all', sep: 1 });
    const momentGlyphs = (grp: THREE.Object3D) => { const out: THREE.Object3D[] = []; grp.traverse(o => { if (o.userData?.despieceMoment) out.push(o); }); return out; };
    const memberSide = endGroups(g, 'member').find(e => e.userData.nodeId === 1)!;
    const nodeSide = endGroups(g, 'node').find(e => e.userData.nodeId === 1)!;
    const mGlyph = momentGlyphs(memberSide)[0];
    const nGlyph = momentGlyphs(nodeSide)[0];
    expect(mGlyph).toBeTruthy();
    expect(nGlyph).toBeTruthy();
    // The arc circles the resultant moment axis; node side flips it → opposite sense.
    const ma = mGlyph.userData.momentAxis as number[];
    const na = nGlyph.userData.momentAxis as number[];
    const dot = ma[0] * na[0] + ma[1] * na[1] + ma[2] * na[2];
    expect(dot).toBeCloseTo(-1, 6);
  });

  it('moment glyph: absent when the end has no moment', () => {
    const { nodes, elements } = horizModel();
    const noMoment: ElementForces3D = { ...ef(1), mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 };
    const g = build({ nodes, elements, forces: [noMoment], vectorMode: 'members', sep: 1 });
    let count = 0; g.traverse(o => { if (o.userData?.despieceMoment) count++; });
    expect(count).toBe(0);
  });

  it('moment glyphs are capped (suppressed) on large models, like labels', () => {
    const nodes = new Map<number, Node>();
    const elements = new Map<number, Element>();
    const forces: ElementForces3D[] = [];
    for (let i = 0; i < 70; i++) {
      nodes.set(i + 1, { id: i + 1, x: i, y: 0, z: 0 });
      nodes.set(i + 101, { id: i + 101, x: i, y: 1, z: 0 });
      elements.set(i + 1, el(i + 1, i + 1, i + 101));
      forces.push(ef(i + 1));
    }
    const g = build({ nodes, elements, forces });
    let count = 0; g.traverse(o => { if (o.userData?.despieceMoment) count++; });
    expect(count).toBe(0);
  });

  it('high-valence node: 4 members yield 4 DISTINCT node-side origins', () => {
    const nodes = new Map<number, Node>([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 4, y: 0, z: 0 }], [3, { id: 3, x: 0, y: 4, z: 0 }],
      [4, { id: 4, x: 0, y: 0, z: 4 }], [5, { id: 5, x: 4, y: 4, z: 0 }],
    ]);
    const elements = new Map<number, Element>([[1, el(1, 1, 2)], [2, el(2, 1, 3)], [3, el(3, 1, 4)], [4, el(4, 1, 5)]]);
    const g = build({ nodes, elements, forces: [ef(1), ef(2), ef(3), ef(4)], vectorMode: 'nodes', sep: 1 });
    const nodeSides = endGroups(g, 'node').filter(e => e.userData.nodeId === 1);
    expect(nodeSides).toHaveLength(4);
    const keys = new Set(nodeSides.map(e => `${e.position.x.toFixed(3)},${e.position.y.toFixed(3)},${e.position.z.toFixed(3)}`));
    expect(keys.size).toBe(4);
  });

  it('local basis labels N/V; global basis transforms into Fx/Fy/Fz (norm preserved)', () => {
    // inclined 45° member in the XY plane
    const nodes = new Map<number, Node>([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 4, z: 0 }]]);
    const elements = new Map<number, Element>([[1, el(1, 1, 2)]]);
    const args = { elements: [{ id: 1, nodeI: 1, nodeJ: 2 }], getNode: (id: number) => nodes.get(id) && { x: nodes.get(id)!.x, y: nodes.get(id)!.y, z: nodes.get(id)!.z ?? 0 }, getForces: () => ef(1), leftHand: false };
    void elements;
    const local = inspectMember3D({ ...args, basis: 'local' }, 1)!.ends[0];
    const global = inspectMember3D({ ...args, basis: 'global' }, 1)!.ends[0];
    expect(local.components.map(c => c.label)).toEqual(['N', 'Vy', 'Vz', 'My', 'Mz', 'T']);
    expect(global.components.map(c => c.label)).toEqual(['Fx', 'Fy', 'Fz', 'My', 'Mz', 'T']);
    const lf = local.components; const gf = global.components;
    const localMag = Math.hypot(lf[0].value, lf[1].value, lf[2].value);          // |N,Vy,Vz|
    const globalMag = Math.hypot(gf[0].value, gf[1].value, gf[2].value);          // |Fx,Fy,Fz|
    expect(globalMag).toBeCloseTo(localMag, 6);                                    // norm preserved by the transform
    expect(Math.abs(gf[0].value)).toBeGreaterThan(1e-6);                           // inclined → real X and Y
    expect(Math.abs(gf[1].value)).toBeGreaterThan(1e-6);
  });

  it('support reactions drawn ONCE and respect showReactions (never mirrored)', () => {
    const { nodes, elements } = horizModel();
    const reactions: Reaction3D[] = [{ nodeId: 1, fx: 3, fy: 0, fz: 25, mx: 0, my: 0, mz: 0 }] as Reaction3D[];
    const off = build({ nodes, elements, forces: [ef(1)], reactions, showReactions: false });
    const on = build({ nodes, elements, forces: [ef(1)], reactions, showReactions: true });
    expect(reactionArrows(off)).toHaveLength(0);
    expect(reactionArrows(on)).toHaveLength(1); // one resultant arrow, not a mirrored pair
  });

  it('vector size scales arrow length; label size scales sprite', () => {
    const { nodes, elements } = horizModel();
    const s1 = build({ nodes, elements, forces: [ef(1)], vectorSize: 1, labelSize: 1 });
    const s2 = build({ nodes, elements, forces: [ef(1)], vectorSize: 2, labelSize: 2 });
    expect(s2.userData.arrowLen).toBeCloseTo(s1.userData.arrowLen * 2, 6);
    const spriteScale = (g: THREE.Group) => { let s = 0; g.traverse(o => { if (o instanceof THREE.Sprite) s = Math.max(s, o.scale.x); }); return s; };
    expect(spriteScale(s2)).toBeGreaterThan(spriteScale(s1));
  });

  it('build-once + animate: update(sep) moves ends without adding/removing objects', () => {
    const { nodes, elements } = horizModel();
    const g = build({ nodes, elements, forces: [ef(1)], sep: 0 });
    const childCount = g.children.length;
    const arrowCount = arrows(g).length;
    const before = endGroups(g, 'member').find(e => e.userData.nodeId === 1)!.position.clone();
    g.userData.despieceUpdate(1);
    const after = endGroups(g, 'member').find(e => e.userData.nodeId === 1)!.position.clone();
    expect(g.children.length).toBe(childCount);
    expect(arrows(g).length).toBe(arrowCount);
    expect(before.distanceTo(after)).toBeGreaterThan(0.05);
    expect(nodes.get(1)!.x).toBe(0);
  });

  it('labels are suppressed on large models but force arrows remain', () => {
    const nodes = new Map<number, Node>();
    const elements = new Map<number, Element>();
    const forces: ElementForces3D[] = [];
    for (let i = 0; i < 70; i++) {
      nodes.set(i + 1, { id: i + 1, x: i, y: 0, z: 0 });
      nodes.set(i + 101, { id: i + 101, x: i, y: 1, z: 0 });
      elements.set(i + 1, el(i + 1, i + 1, i + 101));
      forces.push(ef(i + 1));
    }
    const g = build({ nodes, elements, forces });
    let sprites = 0; g.traverse(o => { if (o instanceof THREE.Sprite) sprites++; });
    expect(sprites).toBe(0);
    expect(arrows(g).length).toBeGreaterThan(0);
  });
});

describe('despiece 3D inspection helpers', () => {
  const nodes = new Map<number, Node>([
    [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }], [3, { id: 3, x: 0, y: 0, z: 4 }],
  ]);
  const inspectArgs = {
    elements: [{ id: 1, nodeI: 1, nodeJ: 2 }, { id: 2, nodeI: 1, nodeJ: 3 }],
    getNode: (id: number) => { const n = nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : undefined; },
    getForces: (id: number) => ef(id),
    basis: 'local' as DespieceBasis,
    leftHand: false,
  };

  it('inspectMember3D returns both ends', () => {
    const r = inspectMember3D(inspectArgs, 1)!;
    expect(r.ends.map(e => e.end)).toEqual(['I', 'J']);
    expect(r.ends[0].components.length).toBeGreaterThan(0);
  });

  it('inspectNode3D returns every connected member-end action', () => {
    const r = inspectNode3D(inspectArgs, 1);
    expect(r.actions.length).toBe(2); // E1·I and E2·I converge at node 1
    expect(new Set(r.actions.map(a => `${a.elementId}${a.end}`))).toEqual(new Set(['1I', '2I']));
  });
});
