/**
 * Plastic collapse of a plane frame, step by step.
 *
 * ── What it simulates ───────────────────────────────────────────────
 *
 * The loads, in the proportions the model gives them, grow from zero by a
 * common factor λ. The material is elastic–perfectly plastic: a section of a
 * frame member stays elastic until its bending moment reaches the section's
 * plastic moment Mp; there it becomes a plastic hinge — it keeps carrying Mp
 * and turns freely — and the structure carries further load as if a hinge
 * had been put in at that point. A bar whose axial force reaches Np = fy·A
 * yields and keeps that force: a truss bar, and a frame member too — a
 * funicular arch carries no moment, and it is by crushing that it fails. With
 * no interaction assumed, a frame member at Np has nothing left to resist
 * bending either, so it drops out of the structure for what follows; if it
 * still carries a transverse load, it is itself the mechanism. Each hinge takes one degree of indeterminacy away; the
 * structure collapses when it has become a mechanism, and the λ at that
 * moment is the collapse factor λc. An isostatic structure collapses at its
 * first hinge; a simply supported beam, at midspan (or under its load).
 *
 * ── How: the step-by-step (event-to-event) method ─────────────────
 *
 *   1. Solve the current structure — the original with the hinges formed so
 *      far — under the reference loads (λ = 1).
 *   2. Every section not yet a hinge accumulates m(x) per unit of λ. The
 *      increment that brings it to its plastic moment, of the sign it is
 *      moving in, is Δλ = (±Mp − M_acc) / m. The smallest over all sections is
 *      the next event, and the sections that reach it together form together.
 *   3. λ += Δλ; every accumulated quantity grows by Δλ times this solution.
 *   4. A hinge at a member end releases that end; a hinge inside a span
 *      splits the member there and releases one side. Then back to 1, until
 *      the rank check of the stiffness says the structure is a mechanism.
 *
 * Sections are sampled along each member (200 points, the ends and every
 * point load), so a hinge forms where the moment actually peaks: under a
 * point load, or at the maximum of a distributed load's diagram — not only at
 * member ends, which is where the engine's own loop looked.
 *
 * What is not modelled: interaction of M with N or V (a section yields in
 * bending at Mp or axially at Np, each on its own), hinge unloading, and
 * buckling of compressed members. The collapse load this gives is the one
 * the uniqueness theorem names: the largest statically admissible load, which
 * equals the smallest kinematic one.
 */
import type { SolverInput, SolverLoad, SolverElement, AnalysisResults, ElementForces } from './types';
import type { PlasticHinge, PlasticResult, PlasticStep } from './result-types';
import { solve, analyzeKinematics } from './wasm-solver';
import { computeDiagramValueAt } from './diagrams';

export interface PlasticCollapseOptions {
  /** Plastic moment of an original frame member, kN·m. */
  mp: (elementId: number) => number;
  /** Axial yield force of an original member, kN. Infinity: never yields. */
  np: (elementId: number) => number;
  /** Interior samples per member. */
  samples?: number;
  /** Stop after this many events if no mechanism has formed. */
  maxEvents?: number;
}

export interface PlasticCollapseHinge extends PlasticHinge {
  /** 'bending' for a plastic hinge, 'axial' for a bar yielded in tension or compression. */
  kind: 'bending' | 'axial';
  /** Distance from the member's start node, m. */
  x: number;
}

export interface PlasticCollapseResult extends PlasticResult {
  hinges: PlasticCollapseHinge[];
  steps: Array<PlasticStep & { hingesFormed: PlasticCollapseHinge[] }>;
  /** Degree of static indeterminacy of the structure as given. */
  degree: number;
}

interface Piece { id: number; t0: number; t1: number }

const EPS_EVENT = 1e-6;

function cloneInput(input: SolverInput): SolverInput {
  const copy = <T>(m: Map<number, T>) => new Map([...m].map(([k, v]) => [k, { ...(v as object) } as T]));
  return {
    ...input,
    nodes: copy(input.nodes),
    materials: copy(input.materials),
    sections: copy(input.sections),
    elements: copy(input.elements),
    supports: copy(input.supports),
    loads: input.loads.map((l) => ({ type: l.type, data: { ...l.data } }) as SolverLoad),
  };
}

const len = (input: SolverInput, e: SolverElement) => {
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  return Math.hypot(b.x - a.x, b.z - a.z);
};

/**
 * Split element `id` at distance `s` from its start: a new node, the element
 * shortened to it, a new element from it to the old end. Loads follow the
 * part they act on. Returns the new node and element ids.
 */
function splitAt(input: SolverInput, id: number, s: number, ids: { node: number; elem: number }): { node: number; right: number } {
  const e = input.elements.get(id)!;
  const L = len(input, e);
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const f = s / L;
  const nodeId = ids.node++;
  input.nodes.set(nodeId, { id: nodeId, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  const rightId = ids.elem++;
  input.elements.set(rightId, { ...e, id: rightId, nodeI: nodeId, nodeJ: e.nodeJ, hingeStart: false, hingeEnd: e.hingeEnd });
  input.elements.set(id, { ...e, nodeJ: nodeId, hingeEnd: false });

  const out: SolverLoad[] = [];
  for (const l of input.loads) {
    if (l.type === 'distributed' && l.data.elementId === id) {
      const d = l.data;
      const la = d.a ?? 0, lb = d.b ?? L;
      const qAt = (x: number) => (lb - la < 1e-12 ? d.qI : d.qI + ((d.qJ - d.qI) * (x - la)) / (lb - la));
      if (la < s - 1e-12) {
        const e1 = Math.min(lb, s);
        out.push({ type: 'distributed', data: { elementId: id, qI: d.qI, qJ: qAt(e1), a: la, b: e1 } });
      }
      if (lb > s + 1e-12) {
        const s1 = Math.max(la, s);
        out.push({ type: 'distributed', data: { elementId: rightId, qI: qAt(s1), qJ: d.qJ, a: s1 - s, b: lb - s } });
      }
    } else if (l.type === 'pointOnElement' && l.data.elementId === id) {
      out.push(l.data.a <= s + 1e-12
        ? { type: 'pointOnElement', data: { ...l.data, a: Math.min(l.data.a, s) } }
        : { type: 'pointOnElement', data: { ...l.data, elementId: rightId, a: l.data.a - s } });
    } else if (l.type === 'thermal' && l.data.elementId === id) {
      out.push(l, { type: 'thermal', data: { ...l.data, elementId: rightId } });
    } else {
      out.push(l);
    }
  }
  input.loads = out;
  return { node: nodeId, right: rightId };
}

export function plasticCollapse2D(original: SolverInput, opts: PlasticCollapseOptions): PlasticCollapseResult {
  const S = opts.samples ?? 200;
  const maxEvents = opts.maxEvents ?? 60;
  const work = cloneInput(original);

  const kin0 = analyzeKinematics(original);
  if (!kin0.isSolvable) throw new Error(kin0.diagnosis || 'mechanism');
  const template = solve(original);

  const ids = {
    node: Math.max(0, ...original.nodes.keys()) + 1,
    elem: Math.max(0, ...original.elements.keys()) + 1,
  };

  /* Sections along each original member, and what they have accumulated. */
  interface Member {
    id: number; L: number; truss: boolean; mp: number; np: number;
    pieces: Piece[]; t: number[]; acc: number[]; hinged: boolean[];
    accN: number[]; yielded: boolean;
    /** Nodes this member's own splits created: they go with it if it yields. */
    splitNodes: number[];
  }
  const members: Member[] = [];
  for (const e of original.elements.values()) {
    const L = len(original, e);
    const ts = new Set<number>([0, 1]);
    if (e.type !== 'truss') {
      for (let k = 1; k < S; k++) ts.add(k / S);
      for (const l of original.loads) {
        if (l.type === 'pointOnElement' && l.data.elementId === e.id) ts.add(Math.min(1, Math.max(0, l.data.a / L)));
      }
    }
    const t = [...ts].sort((a, b) => a - b);
    members.push({
      id: e.id, L, truss: e.type === 'truss',
      mp: e.type === 'truss' ? Infinity : opts.mp(e.id),
      np: opts.np(e.id),
      pieces: [{ id: e.id, t0: 0, t1: 1 }],
      t, acc: t.map(() => 0),
      /* An end the model already releases carries no moment: never a plastic hinge. */
      hinged: t.map((ti) => (ti === 0 && e.hingeStart) || (ti === 1 && e.hingeEnd)),
      accN: t.map(() => 0), yielded: false, splitNodes: [],
    });
  }

  /* The cumulative state, on the original model, for the step diagrams. */
  const cumDisp = new Map<number, { ux: number; uz: number; ry: number }>();
  const cumReac = new Map<number, { rx: number; rz: number; my: number }>();
  const cumEnd = new Map<number, { nStart: number; nEnd: number; vStart: number; vEnd: number; mStart: number; mEnd: number }>();
  for (const m of members) cumEnd.set(m.id, { nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0 });

  const snapshot = (lambda: number): AnalysisResults => ({
    ...template,
    displacements: template.displacements.map((d) => ({ ...d, ...(cumDisp.get(d.nodeId) ?? { ux: 0, uz: 0, ry: 0 }) })),
    reactions: template.reactions.map((r) => ({ ...r, ...(cumReac.get(r.nodeId) ?? { rx: 0, rz: 0, my: 0 }) })),
    elementForces: template.elementForces.map((ef): ElementForces => ({
      ...ef,
      ...cumEnd.get(ef.elementId)!,
      qI: ef.qI * lambda, qJ: ef.qJ * lambda,
      pointLoads: ef.pointLoads.map((p) => ({ ...p, p: p.p * lambda, px: (p.px ?? 0) * lambda, my: (p.my ?? 0) * lambda })),
      distributedLoads: ef.distributedLoads.map((d) => ({ ...d, qI: d.qI * lambda, qJ: d.qJ * lambda })),
    })),
  });

  let lambda = 0;
  let isMechanism = false;
  const hinges: PlasticCollapseHinge[] = [];
  const steps: PlasticCollapseResult['steps'] = [];

  for (let step = 0; step < maxEvents; step++) {
    let kin;
    try { kin = analyzeKinematics(work); } catch { isMechanism = true; break; }
    if (!kin.isSolvable) { isMechanism = true; break; }
    let r: AnalysisResults;
    try { r = solve(work); } catch { isMechanism = true; break; }
    const efOf = new Map(r.elementForces.map((ef) => [ef.elementId, ef]));

    /*
     * m(x) and n(x) per unit λ at every section, and the increment to the
     * plastic value of each.
     */
    const unit: number[][] = [];
    const unitN: number[][] = [];
    let dMin = Infinity;
    const cand: Array<{ m: Member; k: number; d: number; axial: boolean }> = [];
    const axialCandidate = (mb: Member, k: number, n: number) => {
      if (Math.abs(n) < 1e-10 * Math.max(1, mb.np) || !Number.isFinite(mb.np)) return;
      const d = (Math.sign(n) * mb.np - mb.accN[k]) / n;
      if (d > 1e-12) { cand.push({ m: mb, k, d, axial: true }); dMin = Math.min(dMin, d); }
    };
    for (const mb of members) {
      const u = mb.t.map(() => 0);
      const un = mb.t.map(() => 0);
      unit.push(u);
      unitN.push(un);
      if (mb.yielded) continue;
      if (mb.truss) {
        const ef = efOf.get(mb.pieces[0].id);
        un[0] = ef ? ef.nStart : 0;
        axialCandidate(mb, 0, un[0]);
        continue;
      }
      for (let k = 0; k < mb.t.length; k++) {
        const t = mb.t[k];
        const piece = mb.pieces.find((p) => t >= p.t0 - 1e-12 && t <= p.t1 + 1e-12)!;
        const ef = efOf.get(piece.id);
        if (!ef) continue;
        const tl = Math.min(1, Math.max(0, piece.t1 - piece.t0 < 1e-12 ? 0 : (t - piece.t0) / (piece.t1 - piece.t0)));
        const m = computeDiagramValueAt('moment', tl, ef);
        u[k] = m;
        un[k] = computeDiagramValueAt('axial', tl, ef);
        axialCandidate(mb, k, un[k]);
        if (mb.hinged[k] || Math.abs(m) < 1e-10 * Math.max(1, mb.mp)) continue;
        const d = (Math.sign(m) * mb.mp - mb.acc[k]) / m;
        if (d > 1e-12) { cand.push({ m: mb, k, d, axial: false }); dMin = Math.min(dMin, d); }
      }
    }
    if (!Number.isFinite(dMin)) break; // nothing left that can yield

    /* Advance every accumulated quantity by Δλ times this solution. */
    lambda += dMin;
    members.forEach((mb, i) => {
      for (let k = 0; k < mb.t.length; k++) {
        mb.acc[k] += dMin * unit[i][k];
        mb.accN[k] += dMin * unitN[i][k];
      }
    });
    for (const d of r.displacements) {
      if (!original.nodes.has(d.nodeId)) continue;
      const c = cumDisp.get(d.nodeId) ?? { ux: 0, uz: 0, ry: 0 };
      cumDisp.set(d.nodeId, { ux: c.ux + dMin * d.ux, uz: c.uz + dMin * d.uz, ry: c.ry + dMin * d.ry });
    }
    for (const x of r.reactions) {
      const c = cumReac.get(x.nodeId) ?? { rx: 0, rz: 0, my: 0 };
      cumReac.set(x.nodeId, { rx: c.rx + dMin * x.rx, rz: c.rz + dMin * x.rz, my: c.my + dMin * x.my });
    }
    for (const mb of members) {
      const first = efOf.get(mb.pieces[0].id), last = efOf.get(mb.pieces[mb.pieces.length - 1].id);
      const c = cumEnd.get(mb.id)!;
      if (first) { c.nStart += dMin * first.nStart; c.vStart += dMin * first.vStart; c.mStart += dMin * first.mStart; }
      if (last) { c.nEnd += dMin * last.nEnd; c.vEnd += dMin * last.vEnd; c.mEnd += dMin * last.mEnd; }
    }

    /*
     * The sections that reach it together form together — but one hinge per
     * contiguous run: under a constant moment every section qualifies at
     * once, and one hinge there is the mechanism.
     */
    const events = cand.filter((c) => c.d <= dMin * (1 + EPS_EVENT) + 1e-12);
    const formed: PlasticCollapseHinge[] = [];
    const byMember = new Map<Member, number[]>();
    let crushed = false;
    for (const ev of events) {
      if (ev.axial) {
        if (ev.m.yielded) continue;
        ev.m.yielded = true;
        const pieceIds = new Set(ev.m.pieces.map((p) => p.id));
        const onIt = (l: SolverLoad) => 'elementId' in l.data && pieceIds.has((l.data as { elementId: number }).elementId);
        /* A yielded frame member that still carries a transverse load cannot hold it. */
        if (!ev.m.truss && work.loads.some((l) => l.type !== 'thermal' && onIt(l))) crushed = true;
        for (const id of pieceIds) work.elements.delete(id);
        for (const n of ev.m.splitNodes) work.nodes.delete(n);
        work.loads = work.loads.filter((l) => !onIt(l));
        formed.push({
          elementId: ev.m.id, end: 'start', position: ev.m.truss ? 0.5 : ev.m.t[ev.k], x: (ev.m.truss ? 0.5 : ev.m.t[ev.k]) * ev.m.L, kind: 'axial',
          moment: Math.sign(ev.m.accN[ev.k]) * ev.m.np, loadFactor: lambda, step,
        });
        continue;
      }
      byMember.set(ev.m, [...(byMember.get(ev.m) ?? []), ev.k]);
    }
    /* A member that yielded axially this step takes no hinge as well. */
    for (const mb of [...byMember.keys()]) if (mb.yielded) byMember.delete(mb);
    /*
     * Two members meeting at a joint with nothing else there carry the same
     * moment at their ends, so both reach Mp together — and one hinge, on one
     * side, already frees the joint. The other end is marked, not hinged.
     */
    const endNode = (mb: Member, k: number): number | null => {
      const e = original.elements.get(mb.id)!;
      return mb.t[k] <= 1e-12 ? e.nodeI : mb.t[k] >= 1 - 1e-12 ? e.nodeJ : null;
    };
    const frameEndsAt = (nodeId: number) => [...work.elements.values()]
      .filter((e) => e.type !== 'truss' && (e.nodeI === nodeId || e.nodeJ === nodeId)).length;
    const claimed = new Set<number>();
    for (const [mb, ks] of byMember) {
      const keep: number[] = [];
      for (const k of ks) {
        const node = endNode(mb, k);
        const hasNodalMoment = node !== null && work.loads.some((l) => l.type === 'nodal' && l.data.nodeId === node && Math.abs(l.data.my) > 1e-12);
        if (node !== null && frameEndsAt(node) === 2 && !hasNodalMoment) {
          if (claimed.has(node)) { mb.hinged[k] = true; continue; }
          claimed.add(node);
        }
        keep.push(k);
      }
      byMember.set(mb, keep);
    }
    for (const [mb, ks] of byMember) {
      ks.sort((a, b) => a - b);
      const runs: number[][] = [];
      for (const k of ks) {
        const last = runs[runs.length - 1];
        if (last && k === last[last.length - 1] + 1) last.push(k); else runs.push([k]);
      }
      for (const run of runs) {
        /* The end of the run if it touches a member end; otherwise its middle. */
        const k = run.includes(0) ? 0 : run.includes(mb.t.length - 1) ? mb.t.length - 1 : run[Math.floor(run.length / 2)];
        const t = mb.t[k];
        for (const kk of run) mb.hinged[kk] = true;
        if (t <= 1e-12) {
          work.elements.get(mb.pieces[0].id)!.hingeStart = true;
        } else if (t >= 1 - 1e-12) {
          work.elements.get(mb.pieces[mb.pieces.length - 1].id)!.hingeEnd = true;
        } else {
          const pi = mb.pieces.findIndex((p) => t >= p.t0 - 1e-12 && t <= p.t1 + 1e-12);
          const p = mb.pieces[pi];
          if (Math.abs(t - p.t1) < 1e-9) {
            work.elements.get(p.id)!.hingeEnd = true;
          } else if (Math.abs(t - p.t0) < 1e-9) {
            work.elements.get(mb.pieces[pi - 1].id)!.hingeEnd = true;
          } else {
            const { right, node } = splitAt(work, p.id, (t - p.t0) * mb.L, ids);
            mb.splitNodes.push(node);
            work.elements.get(p.id)!.hingeEnd = true;
            mb.pieces.splice(pi, 1, { id: p.id, t0: p.t0, t1: t }, { id: right, t0: t, t1: p.t1 });
          }
        }
        formed.push({
          elementId: mb.id, end: t < 0.5 ? 'start' : 'end', position: t, x: t * mb.L, kind: 'bending',
          moment: Math.sign(mb.acc[k]) * mb.mp, loadFactor: lambda, step,
        });
      }
    }
    hinges.push(...formed);
    steps.push({ loadFactor: lambda, hingesFormed: formed, results: snapshot(lambda) });
    if (crushed) { isMechanism = true; break; }
  }

  if (!isMechanism) {
    try { isMechanism = !analyzeKinematics(work).isSolvable; } catch { isMechanism = true; }
  }
  return {
    collapseFactor: lambda,
    steps,
    hinges,
    isMechanism,
    redundancy: Math.max(0, kin0.degree),
    degree: kin0.degree,
  };
}
