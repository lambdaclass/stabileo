/**
 * Equilibrium of the 3D free-body view (despiece-3d.ts) on real solves.
 *
 * Every model here is built through the model store, as drawing in Basic 3D
 * builds it, and solved by modelStore.solve3D (the static solve the view reads).
 * The overlay is then built exactly as results-sync.ts builds it, and the test
 * reads back what it DRAWS: every force arrow and moment arc carries the signed
 * world vector it stands for (userData.forceVec / momentVec), loads carry the
 * point they act at (userData.loadAt). From those vectors alone:
 *
 *   - every isolated member balances its end actions and its drawn loads
 *     (ΣF = 0, ΣM = 0 in 3D), and also the loads the solver was given (the
 *     wire), which ties the view's local axes to the solver's;
 *   - every joint balances the node-side actions of the members meeting there,
 *     its drawn nodal loads and its drawn support reaction (forces and moments);
 *   - in the local basis every component arrow and arc lies on one of the
 *     member's local axes (the solver's) with the engine's end-action sign;
 *   - the global basis and the combined (resultant) toggle draw the same action.
 *
 * Members point in every direction (±X, ±Y, ±Z, skew, drawn toward or away from
 * the joint), with roll angles, explicit local y, rotated sections, hinges and
 * torsion releases, trapezoidal/partial/sign-reversing distributed loads, point
 * loads and nodal moments, under both axis conventions; plus the seeded random
 * families of the Basic-3D sweep.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

// createTextSprite needs a canvas: stub the one call it makes, keep anything else.
const canvasStub = {
  width: 0, height: 0,
  getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {}, strokeText: () => {}, measureText: () => ({ width: 10 }), clearRect: () => {}, fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {}, roundRect: () => {}, rect: () => {}, arc: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {} }),
};
const prevDoc = (globalThis as { document?: Document }).document;
Object.defineProperty(globalThis, 'document', {
  value: prevDoc ? new Proxy(prevDoc, { get: (t, k) => (k === 'createElement' ? () => canvasStub : Reflect.get(t, k)) }) : { createElement: () => canvasStub },
  configurable: true,
});

import { modelStore } from '../../store';
import { createDespiece3DGroup, inspectMember3D, type DespieceBasis } from '../despiece-3d';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import type { AnalysisResults3D, SolverInput3D } from '../../engine/types-3d';
import {
  FAMILIES, buildRandom, resetModel3D, addPalette, frame, truss, support,
} from '../../engine/__tests__/helpers/random-models-3d';

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(a[0], a[1], a[2]);
const Z: V = [0, 0, 0];

/** A component the view drops (|x| ≤ FORCE_EPS = 1e-3) may be missing from the sum. */
const DROP = 1e-3;

interface Drawn {
  /** Signed force / moment of each end group, keyed `${elemId}|${end}|${side}`. */
  ends: Map<string, { f: V; m: V; nodeId: number; arrows: THREE.ArrowHelper[]; arcs: THREE.Object3D[] }>;
  memberLoads: Map<number, Array<{ f: V; at: V }>>;
  nodalF: Map<number, V>;
  nodalM: Map<number, V>;
  reactF: Map<number, V>;
  reactM: Map<number, V>;
}

function readDrawn(g: THREE.Group): Drawn {
  const d: Drawn = { ends: new Map(), memberLoads: new Map(), nodalF: new Map(), nodalM: new Map(), reactF: new Map(), reactM: new Map() };
  const acc = (m: Map<number, V>, k: number, v: V) => m.set(k, add(m.get(k) ?? Z, v));
  for (const c of g.children) {
    const u = c.userData;
    if (u?.despieceEnd) {
      const e = { f: Z, m: Z, nodeId: u.nodeId as number, arrows: [] as THREE.ArrowHelper[], arcs: [] as THREE.Object3D[] };
      for (const o of c.children) {
        if (o instanceof THREE.ArrowHelper) { e.f = add(e.f, o.userData.forceVec as V); e.arrows.push(o); }
        else if (o.userData?.despieceMoment) { e.m = add(e.m, o.userData.momentVec as V); e.arcs.push(o); }
      }
      d.ends.set(`${u.elemId}|${u.end}|${u.side}`, e);
    } else if (u?.despieceLoad) {
      if (u.elemId !== undefined) {
        if (!u.forceVec) continue;   // 'all' mode samples are intensities
        const list = d.memberLoads.get(u.elemId) ?? [];
        list.push({ f: u.forceVec as V, at: u.loadAt as V });
        d.memberLoads.set(u.elemId, list);
      } else if (u.despieceMoment) acc(d.nodalM, u.nodeId, u.momentVec as V);
      else acc(d.nodalF, u.nodeId, u.forceVec as V);
    } else if (u?.despieceReaction) {
      if (u.despieceMoment) acc(d.reactM, u.nodeId, u.momentVec as V);
      else acc(d.reactF, u.nodeId, u.forceVec as V);
    }
  }
  return d;
}

function buildView(res: AnalysisResults3D, o: { leftHand: boolean; basis: DespieceBasis; resultant: boolean }) {
  return createDespiece3DGroup({
    elements: modelStore.elements, nodes: modelStore.nodes, forces: res.elementForces, reactions: res.reactions ?? [],
    sep: 1, sections: modelStore.sections, leftHand: o.leftHand, project2D: false,
    vectorMode: 'all', basis: o.basis, showReactions: true, resultant: o.resultant,
    loads: modelStore.loads, loadMode: 'resultant',
  });
}

const pos = (id: number): V => { const n = modelStore.nodes.get(id)!; return [n.x, n.y, n.z ?? 0]; };

/** The solver's local axes of an element, from the wire the engine gets. */
function wireAxes(input: SolverInput3D, elemId: number) {
  const e = input.elements.get(elemId)!;
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const ly = e.localYx !== undefined ? { x: e.localYx!, y: e.localYy!, z: e.localYz! } : undefined;
  return computeLocalAxes3D(a, b, ly, e.rollAngle, false);
}

/** Member loads on the wire as point forces (2-point Gauss, exact for linear loads). */
function wireMemberLoads(input: SolverInput3D, elemId: number): Array<{ f: V; at: V }> {
  const out: Array<{ f: V; at: V }> = [];
  const e = input.elements.get(elemId)!;
  const a = input.nodes.get(e.nodeI)!;
  const ax = wireAxes(input, elemId);
  const p0: V = [a.x, a.y, a.z];
  for (const l of input.loads) {
    if (l.type === 'distributed' && l.data.elementId === elemId) {
      const d = l.data, x0 = d.a ?? 0, x1 = d.b ?? ax.L, span = x1 - x0;
      if (span <= 0) continue;
      for (const g of [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]) {
        const s = (g + 1) / 2, x = x0 + s * span;
        const qy = d.qYI + (d.qYJ - d.qYI) * s, qz = d.qZI + (d.qZJ - d.qZI) * s;
        out.push({ f: scale(add(scale(ax.ey, qy), scale(ax.ez, qz)), span / 2), at: add(p0, scale(ax.ex, x)) });
      }
    } else if (l.type === 'pointOnElement' && l.data.elementId === elemId) {
      out.push({ f: add(scale(ax.ey, l.data.py), scale(ax.ez, l.data.pz)), at: add(p0, scale(ax.ex, l.data.a)) });
    }
  }
  return out;
}

interface Report { members: string[]; wire: string[]; joints: string[]; local: string[]; bases: string[]; inspect: string[]; checkedMembers: number; checkedJoints: number }
const newReport = (): Report => ({ members: [], wire: [], joints: [], local: [], bases: [], inspect: [], checkedMembers: 0, checkedJoints: 0 });

function checkModel(tag: string, leftHand: boolean, rep: Report): boolean {
  const input = modelStore.buildSolverInput3D(false, leftHand, { expandMemberOffsets: false });
  const res = modelStore.solve3D(false, leftHand, false);
  if (!input || !res || typeof res === 'string') return false;

  const views = {
    local: readDrawn(buildView(res, { leftHand, basis: 'local', resultant: false })),
    global: readDrawn(buildView(res, { leftHand, basis: 'global', resultant: false })),
    combined: readDrawn(buildView(res, { leftHand, basis: 'local', resultant: true })),
  };
  const v = views.local;
  const efMap = new Map(res.elementForces.map((f) => [f.elementId, f]));
  let Fscale = 1;
  for (const f of res.elementForces) Fscale = Math.max(Fscale, Math.abs(f.nStart), Math.abs(f.nEnd), Math.abs(f.vyStart), Math.abs(f.vyEnd), Math.abs(f.vzStart), Math.abs(f.vzEnd), Math.abs(f.mxStart), Math.abs(f.myStart), Math.abs(f.mzStart), Math.abs(f.myEnd), Math.abs(f.mzEnd));

  // ── members ──
  for (const elem of modelStore.elements.values()) {
    const ef = efMap.get(elem.id);
    if (!ef) continue;
    const I = v.ends.get(`${elem.id}|I|member`), J = v.ends.get(`${elem.id}|J|member`);
    if (!I || !J) { rep.members.push(`${tag} e${elem.id}: end groups missing`); continue; }
    const pI = pos(elem.nodeI), pJ = pos(elem.nodeJ), L = norm(sub(pJ, pI));
    const tolF = 6 * DROP + 1e-7 * Fscale, tolM = 6 * DROP * (1 + L) + 1e-7 * Fscale * (1 + L);
    const balance = (loads: Array<{ f: V; at: V }>) => {
      let F = add(I.f, J.f), M = add(add(I.m, J.m), cross(sub(pJ, pI), J.f));
      for (const l of loads) { F = add(F, l.f); M = add(M, cross(sub(l.at, pI), l.f)); }
      return { F: norm(F), M: norm(M) };
    };
    const drawnB = balance(v.memberLoads.get(elem.id) ?? []);
    if (drawnB.F > tolF || drawnB.M > tolM) rep.members.push(`${tag} e${elem.id} (${elem.nodeI}→${elem.nodeJ}): |ΣF|=${drawnB.F.toExponential(2)} |ΣM|=${drawnB.M.toExponential(2)}`);
    const wireB = balance(wireMemberLoads(input, elem.id));
    if (wireB.F > tolF || wireB.M > tolM) rep.wire.push(`${tag} e${elem.id}: with the solver's loads |ΣF|=${wireB.F.toExponential(2)} |ΣM|=${wireB.M.toExponential(2)}`);
    rep.checkedMembers++;

    // ── local basis: each glyph on one of the solver's local axes, engine sign ──
    const ax = wireAxes(input, elem.id);
    const want = {
      I: { f: [-ef.nStart, ef.vyStart, ef.vzStart], m: [ef.mxStart, ef.myStart, ef.mzStart] },
      J: { f: [ef.nEnd, -ef.vyEnd, -ef.vzEnd], m: [-ef.mxEnd, -ef.myEnd, -ef.mzEnd] },
    };
    const basisOf = [ax.ex, ax.ey, ax.ez] as V[];
    for (const end of ['I', 'J'] as const) {
      const grp = v.ends.get(`${elem.id}|${end}|member`)!;
      const seen = [0, 0, 0], seenM = [0, 0, 0];
      for (const a of grp.arrows) {
        const vec = a.userData.forceVec as V;
        const k = basisOf.findIndex((e) => Math.abs(Math.abs(dot(e, vec)) - norm(vec)) < 1e-9 * (1 + norm(vec)));
        if (k < 0) { rep.local.push(`${tag} e${elem.id}${end}: arrow off the local axes`); continue; }
        seen[k] += dot(basisOf[k], vec);
        const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(a.quaternion);
        if (dot([dir.x, dir.y, dir.z], vec) <= 0) rep.local.push(`${tag} e${elem.id}${end}: arrow points against its value`);
      }
      for (const arc of grp.arcs) {
        const vec = arc.userData.momentVec as V;
        const k = basisOf.findIndex((e) => Math.abs(Math.abs(dot(e, vec)) - norm(vec)) < 1e-9 * (1 + norm(vec)));
        if (k < 0) { rep.local.push(`${tag} e${elem.id}${end}: arc off the local axes`); continue; }
        seenM[k] += dot(basisOf[k], vec);
        const axis = arc.userData.momentAxis as V;
        if (dot(axis, vec) <= 0) rep.local.push(`${tag} e${elem.id}${end}: arc sense against its value`);
      }
      for (let k = 0; k < 3; k++) {
        if (Math.abs(seen[k] - want[end].f[k]) > DROP + 1e-9 * Fscale) rep.local.push(`${tag} e${elem.id}${end} force ${'xyz'[k]}: drawn ${seen[k].toFixed(4)} engine ${want[end].f[k].toFixed(4)}`);
        if (Math.abs(seenM[k] - want[end].m[k]) > DROP + 1e-9 * Fscale) rep.local.push(`${tag} e${elem.id}${end} moment ${'xyz'[k]}: drawn ${seenM[k].toFixed(4)} engine ${want[end].m[k].toFixed(4)}`);
      }
      // ── global basis and the combined toggle draw the same action ──
      for (const [name, other] of [['global', views.global], ['combined', views.combined]] as const) {
        for (const side of ['member', 'node'] as const) {
          const a = v.ends.get(`${elem.id}|${end}|${side}`)!, b = other.ends.get(`${elem.id}|${end}|${side}`)!;
          if (norm(sub(a.f, b.f)) > 3 * DROP + 1e-9 * Fscale || norm(sub(a.m, b.m)) > 3 * DROP + 1e-9 * Fscale) rep.bases.push(`${tag} e${elem.id}${end} ${side}: ${name} differs from local`);
        }
        if (name === 'global') for (const a of other.ends.get(`${elem.id}|${end}|member`)!.arrows) {
          const vec = a.userData.forceVec as V;
          if ([0, 1, 2].filter((k) => Math.abs(vec[k]) > 1e-12).length !== 1) rep.bases.push(`${tag} e${elem.id}${end}: global arrow not along a world axis`);
        }
        if (name === 'combined' && other.ends.get(`${elem.id}|${end}|member`)!.arrows.length > 1) rep.bases.push(`${tag} e${elem.id}${end}: combined draws more than one force arrow`);
      }
    }

    // ── the click inspector reports the drawn action ──
    const sec = modelStore.sections.get(elem.sectionId);
    const insp = inspectMember3D({
      elements: [{ id: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, localYx: elem.localYx, localYy: elem.localYy, localYz: elem.localYz, rollAngle: elem.rollAngle, sectionRotation: sec?.rotation }],
      getNode: (id) => { const p = pos(id); return { x: p[0], y: p[1], z: p[2] }; },
      getForces: (id) => efMap.get(id), basis: 'global', leftHand,
    }, elem.id)!;
    for (const e of insp.ends) {
      const f: V = [e.components[0].value, e.components[1].value, e.components[2].value];
      const drawn = v.ends.get(`${elem.id}|${e.end}|member`)!.f;
      if (norm(sub(f, drawn)) > 3 * DROP + 1e-9 * Fscale) rep.inspect.push(`${tag} e${elem.id}${e.end}: inspector F=${f.map((x) => x.toFixed(3))} drawn ${drawn.map((x) => x.toFixed(3))}`);
    }
  }

  // ── joints ──
  const atNode = new Map<number, { f: V; m: V; count: number }>();
  for (const [key, e] of v.ends) {
    if (!key.endsWith('|node')) continue;
    const j = atNode.get(e.nodeId) ?? { f: Z, m: Z, count: 0 };
    atNode.set(e.nodeId, { f: add(j.f, e.f), m: add(j.m, e.m), count: j.count + 1 });
  }
  for (const [nodeId, j] of atNode) {
    const F = add(add(j.f, v.nodalF.get(nodeId) ?? Z), v.reactF.get(nodeId) ?? Z);
    const M = add(add(j.m, v.nodalM.get(nodeId) ?? Z), v.reactM.get(nodeId) ?? Z);
    const tol = 6 * DROP * (j.count + 1) + 1e-7 * Fscale;
    if (norm(F) > tol || norm(M) > tol) rep.joints.push(`${tag} n${nodeId} (${j.count} members): |ΣF|=${norm(F).toExponential(2)} |ΣM|=${norm(M).toExponential(2)}`);
    rep.checkedJoints++;
  }
  return true;
}

const report = (xs: string[]) => xs.slice(0, 12).join('\n');
function expectClean(rep: Report) {
  expect(report(rep.members)).toBe('');
  expect(report(rep.wire)).toBe('');
  expect(report(rep.joints)).toBe('');
  expect(report(rep.local)).toBe('');
  expect(report(rep.bases)).toBe('');
  expect(report(rep.inspect)).toBe('');
}

// ─── Hand-built: a joint met by members from every direction ─────────

/**
 * A central joint C met by eleven members: along ±X, ±Y, ±Z (vertical up and
 * down), plan and space diagonals; half drawn from C outward, half drawn toward
 * C (reversed). The far ends are fixed. Loads: forces and moments at C, and
 * member loads of every kind; orientation overrides on several members.
 */
function starModel(opts: { hinges: boolean }) {
  resetModel3D();
  modelStore.bulkMutate(() => {
    const P = addPalette();
    const C = modelStore.addNode(0.3, -0.2, 3);
    const dirs: Array<[V, number]> = [
      [[1, 0, 0], 4], [[-1, 0, 0], 3.5], [[0, 1, 0], 3], [[0, -1, 0], 4.2],
      [[0, 0, 1], 3], [[0, 0, -1], 3],
      [[1, 1, 0], 3.2], [[-1, 1, 0.4], 3.6], [[1, -1, -0.6], 3.1], [[-0.3, -1, 1], 2.8], [[0.05, 0.02, -1], 2.5],
    ];
    const secs = [P.ipn, P.stiff, P.rect, P.rhs, P.tube, P.flex];
    const ids: number[] = [];
    dirs.forEach(([d, L], i) => {
      const n = norm(d);
      const c = pos(C);
      const p = modelStore.addNode(c[0] + d[0] / n * L, c[1] + d[1] / n * L, c[2] + d[2] / n * L);
      const outward = i % 2 === 0;
      const e = outward ? frame(C, p, secs[i % secs.length]) : frame(p, C, secs[i % secs.length]);
      ids.push(e);
      support(p, 'fixed3d');
    });
    // Orientation overrides: roll angles, explicit local y, a rotated section.
    modelStore.updateElement(ids[0], { rollAngle: 30 });
    modelStore.updateElement(ids[3], { rollAngle: 90 });
    modelStore.updateElement(ids[5], { rollAngle: 200 });
    modelStore.updateElement(ids[7], { localYx: 0.2, localYy: 0.3, localYz: 0.93 });
    modelStore.updateElement(ids[4], { localYx: 0, localYy: 1, localYz: 0 });
    modelStore.updateSection(P.rhs, { rotation: 35 });  // e[3] and e[9] use it
    if (opts.hinges) {
      modelStore.updateElement(ids[1], { releaseJ: { my: true, mz: true, t: false } });   // reversed member, hinge at C
      modelStore.updateElement(ids[2], { releaseI: { my: false, mz: true, t: false } });  // one-axis pin at C
      modelStore.updateElement(ids[6], { releaseI: { my: true, mz: false, t: true } });   // bending + torsion release
      modelStore.updateElement(ids[9], { releaseJ: { my: true, mz: true, t: false } });
    }
    // Loads.
    modelStore.addNodalLoad3D(C, 12, -7, -20, 8, -5, 11);
    modelStore.addDistributedLoad3D(ids[0], -3, -5, 2, 1);                // trapezoid, y and z
    modelStore.addDistributedLoad3D(ids[1], 0, 0, -6, -6, 0.5, 2.5);     // partial, z only
    modelStore.addDistributedLoad3D(ids[2], -4, 6, 0, 0);                // sign-reversing trapezoid
    modelStore.addDistributedLoad3D(ids[3], 2, 2, -4, -1, 0.4, 2.9);     // partial, y and z, different centroids
    modelStore.addDistributedLoad3D(ids[4], 3, 1, 0, 0);                 // vertical member, local y
    modelStore.addDistributedLoad3D(ids[5], 0, 0, -2, 5);                // column drawn downward, reversing z
    modelStore.addPointLoadOnElement3D(ids[6], 1.1, 4, -9);
    modelStore.addPointLoadOnElement3D(ids[7], 2.0, -6, 3);
    modelStore.addPointLoadOnElement3D(ids[8], 0.7, 0, -12);
    modelStore.addDistributedLoad3D(ids[9], 1.5, -1.5, -2, -3);
    modelStore.addPointLoadOnElement3D(ids[10], 1.2, 5, 5);
    modelStore.addDistributedLoad3D(ids[10], -2, -2, 0, 0);
  });
}

/** A portal-and-truss model: a pinned-base frame, a truss bar, hinged beam ends, nodal moments. */
function mixedModel() {
  resetModel3D();
  modelStore.bulkMutate(() => {
    const P = addPalette();
    const a0 = modelStore.addNode(0, 0, 0), b0 = modelStore.addNode(6, 0, 0), c0 = modelStore.addNode(6, 5, 0);
    const a1 = modelStore.addNode(0, 0, 4), b1 = modelStore.addNode(6, 0, 4.5), c1 = modelStore.addNode(6, 5, 4);
    const colA = frame(a1, a0, P.ipn);              // column drawn downward
    const colB = frame(b0, b1, P.stiff);
    const colC = frame(c1, c0, P.rect);
    const beam1 = frame(b1, a1, P.ipn);             // beam drawn along −X, sloped
    const beam2 = frame(b1, c1, P.rhs);
    truss(a0, b1, P.bar);                           // brace
    support(a0, 'pinned3d'); support(b0, 'fixed3d'); support(c0, 'fixed3d');
    modelStore.updateElement(beam1, { releaseI: { my: true, mz: false, t: false }, rollAngle: 15 });
    modelStore.updateElement(beam2, { releaseJ: { my: true, mz: true, t: false } });
    modelStore.updateElement(colC, { rollAngle: 90 });
    modelStore.addNodalLoad3D(a1, 5, 3, -10, 0, 7, -4);
    modelStore.addNodalLoad3D(b1, 0, -4, -15, -6, 0, 3);
    modelStore.addDistributedLoad3D(beam1, 0.5, 0.5, -8, -4);
    modelStore.addPointLoadOnElement3D(beam2, 2.5, 3, -10);
    modelStore.addDistributedLoad3D(colA, 2, 4, -1, 1, 1, 3.5);
    modelStore.addDistributedLoad3D(colB, 0, 0, 3, 3);
  });
}

describe('3D free-body view — equilibrium on real solves', () => {
  for (const leftHand of [false, true]) {
    const conv = leftHand ? 'left-hand axes' : 'right-hand axes';
    it(`joint met from every direction, fixed ends (${conv})`, () => {
      starModel({ hinges: false });
      const rep = newReport();
      expect(checkModel('star', leftHand, rep)).toBe(true);
      expect(rep.checkedMembers).toBe(11);
      expect(rep.checkedJoints).toBe(12);
      expectClean(rep);
    });

    it(`joint met from every direction, hinges and torsion releases (${conv})`, () => {
      starModel({ hinges: true });
      const rep = newReport();
      expect(checkModel('star-hinged', leftHand, rep)).toBe(true);
      expectClean(rep);
    });

    it(`portal with truss brace, hinged beam ends, nodal moments (${conv})`, () => {
      mixedModel();
      const rep = newReport();
      expect(checkModel('mixed', leftHand, rep)).toBe(true);
      expect(rep.checkedMembers).toBe(6);
      expectClean(rep);
    });
  }

  it('the hand-built models draw reaction moments, split sign-reversing loads, and keep y/z resultants apart', () => {
    starModel({ hinges: false });
    const res = modelStore.solve3D(false, false, false) as AnalysisResults3D;
    const g = buildView(res, { leftHand: false, basis: 'local', resultant: false });
    const d = readDrawn(g);
    // Fixed far ends carry reaction moments; the view draws them.
    expect(d.reactM.size).toBeGreaterThan(0);
    // Element 3 carries qY −4 → +6 (reversing): two triangle resultants.
    const e3 = [...modelStore.elements.values()][2].id;
    expect(d.memberLoads.get(e3)!.length).toBe(2);
    // Element 4 carries y and z parts with different centroids: two arrows.
    const e4 = [...modelStore.elements.values()][3].id;
    expect(d.memberLoads.get(e4)!.length).toBe(2);
  });

  describe('seeded random models of the Basic-3D sweep', () => {
    const SEEDS = 8;
    for (const family of Object.keys(FAMILIES)) {
      it(`${family}: every drawn member and joint balances`, () => {
        const rep = newReport();
        let solved = 0, skippedBig = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
          buildRandom(family, seed);
          // Moment glyphs and loads are suppressed above 60 members (clutter cap):
          // the drawn free body is incomplete there by design.
          if (modelStore.elements.size > 60) { skippedBig++; continue; }
          if (checkModel(`${family}#${seed}`, seed % 3 === 0, rep)) solved++;
        }
        expect(solved).toBeGreaterThan(0);
        expectClean(rep);
      }, 60_000);
    }
  });
});
