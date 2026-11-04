/**
 * Duplication guard: the same building, slab meshed at 1 m, 0,5 m, 2 m and 6 m, designed and
 * detailed, and what must not change with the mesh.
 *
 * The mesh cuts each beam into 6, 12, 3 or 1 pieces per 6 m span (at 6 m there is one quad per
 * bay, the beams are not cut and there are no spans: the control). Detailed piece by piece, a
 * span's whole cage would be laid once per piece, each copy from that piece's own node; detailed
 * per span (`span-detailing.ts`) it is laid once. So what the design and the detailing produce
 * has to be counted the same whatever the mesh: one design member per span, one cage per span,
 * each bar once in the schedule, and each beam's mass the sum of its rows.
 *
 * ── Why the steel differs between meshes, and by how much each cause ──
 *
 * Under the same forces it does not. The second block designs and details the four meshes
 * reading the 0,5 m solve's stations at the same places along every member (`forcesByPlace`,
 * `designAndDocumentUnder`): every member's reinforcement is the same, and every beam's marks,
 * cutting lengths, bar and stirrup counts, stirrup positions and mass, exactly. The per-span
 * design and the detailing add nothing to the spread. At f8fb3883 one thing did move, the place
 * of some longitudinal bars on the 6 m mesh, not their count, length or mass: the repair ladder
 * (`coordinate-floor.ts`) moved the second bar of each clashing pair, the pair ordered by bar id
 * (`collision.ts`), and a bar id carries its element's number (`e13-topI-1`), so which bar moved
 * followed how the mesh numbered the beams against the columns. Numbering the 6 m beams as the
 * 1 m spans (or any numbering with every beam above every column) gave the 1 m bars exactly.
 * Both are asserted below: the same places on every mesh, and the same bars under any numbering.
 *
 * The third block designs the 1 m geometry under each mesh's own forces and gets each mesh's
 * steel back: the steel is a function of the forces alone. So the whole spread is the analysis'
 * forces (`design-span-mesh-convergence.test.ts` tabulates them from 6 m down to 0,25 m), seen
 * through the design's steps: at 6 m no slab load reaches a beam (it has no node between its
 * columns) and nothing twists it, so every beam takes the minimum (Ø6 c/20, 4 Ø10); at 2 m the
 * slab still hands the beams 3 % of its load but twists them, and the torsion alone takes
 * the stirrups to c/12,5; from 1 m down the forces are in their converged range and the steel
 * follows them through the design's discrete choices (a spacing step, 2 Ø16 against 3 Ø12, where
 * a bar is cut off and the cut-off zone's stirrups, §9.7.3.5(c)).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { markMassKg } from '../../engine/detailing/assembly';
import { samplePath } from '../../codes/cirsoc201/bar-geometry';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { DocumentModel } from '../../engine/detailing/document-model';
import { runDetailing } from '../../engine/detailing/run-detailing';
import type { MemberContext } from '../../engine/design/member-context';
import { currentConcreteEdition, resolveAggregate, resolveSpacingMargin } from '../detailing-project-inputs';
import * as wasmSolver from '../../engine/wasm-solver';
import {
  assemblyLabel, building, designAndDocument, designAndDocumentUnder, designPlace, forcesByPlace, physicalBeams, printedSchedule,
  type PrescribedForces,
} from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const r1 = (v: number) => Math.round(v * 10) / 10;

interface BeamTally {
  name: string;
  pieces: number;
  /** Design members along it: its spans, or its elements where the mesh did not cut it. */
  spans: number;
  longitudinal: number;
  stirrups: number;
  /** Rows of the planilla holding a bar of the beam. */
  rows: number;
  /** Σ of the beam's part of each row, kg. */
  mass: number;
  /** The same bars weighed one by one at their exact cutting length, kg. */
  barMass: number;
  /** Its marks as the schedule lists them: letter, Ø, cutting length, shape, use, its bars in it. */
  marks: string[];
  /** Its stirrups and ties: Ø and where each stands along the beam, mm. */
  stirrupsAt: string[];
  /** Its longitudinal bars: Ø, cutting length and every segment's ends, mm. */
  longitudinalAt: string[];
}

interface Tally {
  mesh: number;
  pieces: number;
  /** Members the design ran on: spans, and beams that are one element. */
  designMembers: number;
  spans: number;
  beams: BeamTally[];
  bars: number;
  /** Bars of one physical beam, of the joints (owned across members), of the columns alone. */
  partition: { beams: number; joints: number; others: number };
  /** Every problem found, as text: the pass is an empty list. */
  problems: string[];
  /** Support ends of beam bars by support and disposition. */
  ends: Record<string, number>;
  /** Bars the repair ladder left outside the section, every one reported. */
  coverReported: number;
  /** Clashes the repair ladder could not separate inside the section, every one reported. */
  clashes: number;
  readiness: string;
  /** Anchorage, cover and stirrup violations not resolved AND not reported: the pass is empty. */
  validity: string[];
  /** Every design member's reinforcement and outcome, by place (`designPlace`). */
  designs: Record<string, string>;
  /** The forces the design read, by place: the solve's, or the ones prescribed. */
  forces: Map<string, PrescribedForces>;
}

/**
 * The frame on 40×40 columns: on 30×30 no span finds a top bar whose hook the column holds
 * (`span-fixture.ts`), and what these tests compare is a design that exists on every mesh.
 */
const FRAME = { columnSide: 0.4 } as const;

/**
 * Design, detail and document the building at a mesh size, and count what came out. With
 * `prescribed`, the design reads those forces instead of the solve's.
 */
function tally(mesh: number, prescribed?: ReadonlyMap<string, PrescribedForces>): Tally {
  building(mesh, FRAME);
  const doc: DocumentModel = prescribed ? designAndDocumentUnder(prescribed) : designAndDocument();
  const forces = new Map(prescribed ?? forcesByPlace(false));
  const designs: Record<string, string> = {};
  for (const c of verificationStore.contexts.values()) {
    designs[`${c.elementType} ${designPlace(c)}`] = `${verificationStore.outcomeFor(c.elementId)?.outcome} ${JSON.stringify(modelStore.elements.get(c.elementId)?.reinforcement ?? null)}`;
  }
  const problems: string[] = [];
  const beams = [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam').map((c) => c.elementId);

  // Each piece in exactly one span, and the span it reads is the one that lists it.
  const spans = new Map<string, number[]>();
  const pieceSpan = new Map<number, string>();
  for (const id of beams) {
    const s = verificationStore.contextFor(id)!.span;
    if (!s) continue;
    spans.set(s.key, s.elements);
    pieceSpan.set(id, s.key);
  }
  const listedBy = new Map<number, string>();
  for (const [key, elements] of spans) for (const id of elements) {
    if (listedBy.has(id)) problems.push(`piece ${id} in ${listedBy.get(id)} and ${key}`);
    listedBy.set(id, key);
    if (pieceSpan.get(id) !== key) problems.push(`piece ${id} listed by ${key} but reads ${pieceSpan.get(id)}`);
  }
  const designMembers = spans.size + beams.filter((id) => !pieceSpan.has(id)).length;

  // Each bar once in the document, once in its assembly's marks, laid once.
  const barAt = new Map<string, string>();
  const centrelines = new Set<string>();
  for (const a of doc.assemblies) {
    for (const b of a.bars) {
      if (barAt.has(b.id)) problems.push(`bar ${b.id} in ${barAt.get(b.id)} and ${a.id}`);
      barAt.set(b.id, a.id);
      const k = JSON.stringify(b.segments.map((g) => [g.start, g.end].map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1000)))));
      if (centrelines.has(k)) problems.push(`bar ${b.id} laid twice`);
      centrelines.add(k);
    }
    const inMarks = a.source.marks.flatMap((m) => m.barIds);
    if (inMarks.length !== new Set(inMarks).size) problems.push(`${a.id}: a bar in two marks`);
    if (inMarks.length !== a.bars.length) problems.push(`${a.id}: ${a.bars.length} bars, ${inMarks.length} in marks`);
    if (a.source.marks.reduce((n, m) => n + m.quantity, 0) !== a.bars.length) problems.push(`${a.id}: mark quantities ≠ bars`);
    // One row per bar shape: diameter, cutting length, shape code and purpose make the mark.
    const keys = a.source.marks.map((m) => `${m.diameterMm}|${m.cuttingLength.toFixed(2)}|${m.shape}|${m.purpose ?? ''}`);
    if (keys.length !== new Set(keys).size) problems.push(`${a.id}: two marks for one bar shape`);
    // A row's mass is its bars' mass, nothing counted twice or left out.
    const byBars = a.bars.reduce((s, b) => s + markMassKg(b.diameterMm, a.source.marks.find((m) => m.barIds.includes(b.id))!.cuttingLength, 1), 0);
    const byRows = a.source.marks.reduce((s, m) => s + m.massKg, 0);
    if (Math.abs(byBars - byRows) > 1e-6 * Math.max(1, byRows)) problems.push(`${a.id}: rows ${byRows} kg ≠ bars ${byBars} kg`);
  }
  // The planilla as printed (`bendingSchedule`): one row per mark, each mark printed once, with
  // the mark's count, cutting length and mass.
  const printed = printedSchedule(doc);
  const rowKey = new Set<string>();
  for (const r of printed) {
    const k = `${r.assembly}/${r.mark}`;
    if (rowKey.has(k)) problems.push(`row ${k} printed twice`);
    rowKey.add(k);
  }
  for (const a of doc.assemblies) for (const m of a.source.marks) {
    const r = printed.find((x) => x.assembly === assemblyLabel(a.id) && x.mark === m.mark);
    if (!r) { problems.push(`${a.id}/${m.mark} not printed`); continue; }
    if (r.count !== String(m.quantity) || r.cut !== m.cuttingLength.toFixed(2) || r.mass !== m.massKg.toFixed(1)) problems.push(`${a.id}/${m.mark} printed ${JSON.stringify(r)}`);
  }
  if (printed.length !== doc.assemblies.reduce((n, a) => n + a.source.marks.length, 0)) problems.push('printed rows ≠ marks');

  // Per physical beam: the bars every owner of which is a piece of it. The joint ties are owned by
  // the column and every beam framing in, and are the joint's.
  const physical = physicalBeams();
  const beamOf = new Map<number, string>();
  for (const b of physical) for (const id of b.elements) beamOf.set(id, b.name);
  const ownerBeam = (bar: BarPath) => {
    const names = new Set(bar.ownerElementIds.map((id) => beamOf.get(id)));
    return names.size === 1 && !names.has(undefined) ? [...names][0]! : null;
  };
  const partition = { beams: 0, joints: 0, others: 0 };
  const tallyEnds = new Map<string, number>();
  const validity: string[] = [];
  let coverReported = 0;
  // Every clash between longitudinal bars the repair ladder could have moved and left is an open
  // condition naming the pair, on its assembly and in the document's open issues: it can no
  // longer push a bar out of its section to clear one (`repair-envelope.ts`).
  const clashListed = new Set((doc.openIssues ?? []).filter((i) => i.key === 'detailing.clash.unresolved' && i.params)
    .map((i) => `${i.params!.bar}|${i.params!.barB}`));
  for (const a of doc.assemblies) {
    const open = new Set(a.source.unsupported.filter((u) => u.key === 'detailing.clash.unresolved' && u.params)
      .map((u) => `${u.params!.bar}|${u.params!.barB}`));
    const byId = new Map(a.bars.map((b) => [b.id, b]));
    for (const c of a.conflicts) {
      const x = byId.get(c.barA), y = byId.get(c.barB);
      if (!x || !y || x.role === 'transverse' || y.role === 'transverse' || (x.locked && y.locked)) continue;
      const k = `${c.barA}|${c.barB}`;
      if (!open.has(k) || !clashListed.has(k)) validity.push(`${k}: a clash the repair left, not reported`);
    }
  }
  for (const a of doc.assemblies) for (const b of a.bars) {
    if (ownerBeam(b)) partition.beams++;
    else if (b.ownerElementIds.some((id) => beamOf.has(id))) partition.joints++;
    else partition.others++;
  }
  const tallies: BeamTally[] = physical.map((pb) => {
    const ends = pb.elements.flatMap((id) => { const e = modelStore.elements.get(id)!; return [e.nodeI, e.nodeJ].map((n) => modelStore.nodes.get(n)!); });
    const lo = { x: Math.min(...ends.map((n) => n.x)), y: Math.min(...ends.map((n) => n.y)) };
    const hi = { x: Math.max(...ends.map((n) => n.x)), y: Math.max(...ends.map((n) => n.y)) };
    const own = doc.assemblies.flatMap((a) => a.bars.filter((b) => ownerBeam(b) === pb.name).map((b) => ({ a, b })));
    // ── Validity, bar by bar ──
    const reported = new Set(doc.assemblies.flatMap((a) => a.source.unsupported).filter((u) => u.params)
      .map((u) => `${u.key}|${u.params!.bar}|${u.params!.end ?? ''}`));
    const listed = new Set((doc.openIssues ?? []).filter((i) => i.params).map((i) => `${i.key}|${i.params!.bar}|${i.params!.end ?? ''}`));
    const axis = { x: hi.x - lo.x, y: hi.y - lo.y };
    const len = Math.hypot(axis.x, axis.y) || 1;
    const u = { x: axis.x / len, y: axis.y / len };
    for (const { b } of own) {
      if (b.role !== 'longitudinal') continue;
      // Every end in a support anchored as its rule asks, or unresolved and reported — on the
      // assembly and in the document's open issues. Nothing left pending.
      for (const side of ['start', 'end'] as const) {
        const x = b.anchorage?.[side];
        if (!x) continue;
        tallyEnds.set(`${x.support}/${x.solution}`, (tallyEnds.get(`${x.support}/${x.solution}`) ?? 0) + 1);
        if (x.solution === 'pending') validity.push(`${b.id} ${side}: pending`);
        else if (x.solution === 'unresolved') {
          const k = `detailing.anchorage.unresolved|${b.id}|${side}`;
          if (!reported.has(k) || !listed.has(k)) validity.push(`${b.id} ${side}: unresolved and not reported`);
        } else if (x.available < x.required - 1e-9) validity.push(`${b.id} ${side}: ${x.solution} ${x.available} < ${x.required}`);
      }
      // In the concrete with the cover: no point of the bar (hooks included) past the end
      // columns' outer faces less the cover, 0,15 − 0,025 m past the end axes; the run inside
      // the section, or reported where the repair ladder pushed it out.
      for (const p of samplePath(b, 0.005)) {
        const along = (p.x - lo.x) * u.x + (p.y - lo.y) * u.y;
        if (along < -0.125 - 1e-6 || along > len + 0.125 + 1e-6) { validity.push(`${b.id} of ${pb.name} past the outer face less the cover (${along.toFixed(3)})`); break; }
      }
      const run = b.segments.filter((g) => g.kind === 'straight').sort((p, q) => Math.hypot(q.end.x - q.start.x, q.end.y - q.start.y) - Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y))[0]!;
      const mid = { x: (run.start.x + run.end.x) / 2, y: (run.start.y + run.end.y) / 2 };
      const across = Math.abs((mid.x - lo.x) * -u.y + (mid.y - lo.y) * u.x);
      if (across > 0.1 - 0.025 - 0.006 - b.diameterMm / 2000 + 0.002 + 1e-9) {
        coverReported++;
        if (!reported.has(`detailing.cover.violated|${b.id}|`) || !listed.has(`detailing.cover.violated|${b.id}|`)) validity.push(`${b.id} of ${pb.name} outside the section (${across.toFixed(3)}) and not reported`);
      }
    }
    // The stirrups laid are the designed ones: the designed diameter, never wider apart than
    // the designed spacing (zone by zone; a cut-off zone may only be tighter).
    for (const id of pb.elements) {
      const r = modelStore.elements.get(id)?.reinforcement?.regions;
      if (!r?.stirrupsSupport || !r.stirrupsSpan) continue;
      const mine = own.filter(({ b }) => b.role !== 'longitudinal' && b.ownerElementIds.includes(id));
      for (const { b } of mine) if (b.diameterMm !== r.stirrupsSupport.diameter && b.diameterMm !== r.stirrupsSpan.diameter) validity.push(`${b.id}: Ø${b.diameterMm} laid, Ø${r.stirrupsSupport.diameter} designed`);
    }
    const zones = new Map<string, number[]>();
    for (const { b } of own) {
      if (b.role === 'longitudinal' || !b.zoneId) continue;
      const xs = b.segments.flatMap((g) => [(g.start.x - lo.x) * u.x + (g.start.y - lo.y) * u.y]);
      zones.set(b.zoneId, [...(zones.get(b.zoneId) ?? []), Math.round((Math.min(...xs) + Math.max(...xs)) / 2 * 1000) / 1000]);
    }
    const widest = Math.max(...pb.elements.map((id) => {
      const r = modelStore.elements.get(id)?.reinforcement?.regions;
      return Math.max(r?.stirrupsSupport?.spacing ?? 0, r?.stirrupsSpan?.spacing ?? 0);
    }));
    for (const [z, raw] of zones) {
      const xs = [...new Set(raw)].sort((a, b) => a - b);
      const gap = Math.max(0, ...xs.slice(1).map((v, i) => v - xs[i]!));
      if (gap > widest + 0.002) validity.push(`${z}: stirrups ${gap.toFixed(3)} apart, designed ${widest}`);
    }
    const ids = new Set(own.map((x) => x.b.id));
    const shares = doc.assemblies.flatMap((a) => a.source.marks.filter((m) => m.barIds.some((id) => ids.has(id))).map((m) => m.massKg * m.barIds.filter((id) => ids.has(id)).length / m.quantity));
    const marks = doc.assemblies.flatMap((a) => a.source.marks.filter((m) => m.barIds.some((id) => ids.has(id)))
      .map((m) => `${m.mark} Ø${m.diameterMm} ${m.cuttingLength.toFixed(3)} ${m.shape} ${m.purpose ?? ''} ×${m.barIds.filter((id) => ids.has(id)).length}`)).sort();
    const mm = (v: number) => Math.round(v * 1000);
    const stirrupsAt = own.filter(({ b }) => b.role !== 'longitudinal').map(({ b }) => {
      const xs = b.segments.flatMap((g) => [g.start, g.end].map((p) => (p.x - lo.x) * u.x + (p.y - lo.y) * u.y));
      return `Ø${b.diameterMm} ${mm((Math.min(...xs) + Math.max(...xs)) / 2)}`;
    }).sort();
    const longitudinalAt = own.filter(({ b }) => b.role === 'longitudinal')
      .map(({ b }) => `Ø${b.diameterMm} ${b.cuttingLength.toFixed(3)} ` + b.segments.map((g) => [g.start, g.end].map((p) => [p.x, p.y, p.z].map(mm).join(',')).join('~')).join('|')).sort();
    return {
      name: pb.name, pieces: pb.elements.length,
      spans: new Set(pb.elements.map((id) => pieceSpan.get(id) ?? `e${id}`)).size,
      longitudinal: own.filter((x) => x.b.role === 'longitudinal').length,
      stirrups: own.filter((x) => x.b.role !== 'longitudinal').length,
      rows: shares.length,
      mass: shares.reduce((s, v) => s + v, 0),
      barMass: own.reduce((s, { b }) => s + markMassKg(b.diameterMm, b.cuttingLength, 1), 0),
      marks, stirrupsAt, longitudinalAt,
    };
  });
  const bars = doc.assemblies.reduce((n, a) => n + a.bars.length, 0);
  return { mesh, pieces: beams.length, designMembers, spans: spans.size, beams: tallies, bars, partition, problems, ends: Object.fromEntries([...tallyEnds].sort()), coverReported, clashes: clashListed.size, readiness: doc.readiness, validity, designs, forces };
}

const MESHES = [1, 0.5, 2, 6] as const;
const sum = (xs: readonly BeamTally[], k: 'longitudinal' | 'stirrups' | 'mass') => xs.reduce((s, b) => s + b[k], 0);

describe('the same building designed and detailed under four slab meshes', () => {
  const t = new Map<number, Tally>();
  beforeAll(() => {
    for (const m of MESHES) t.set(m, tally(m));
    if (!PRINT) return;
    for (const x of t.values()) {
      for (const p of x.problems) console.log('PROBLEM', x.mesh, p);
      const kinds = new Map<string, string[]>();
      for (const v of x.validity) { const k = v.replace(/^\S+( of V\d+)?/, '').replace(/[-\d.()]+/g, '#'); kinds.set(k, [...(kinds.get(k) ?? []), v]); }
      for (const [k, vs] of kinds) console.log('VALIDITY', x.mesh, vs.length, k, '| e.g.', vs[0]);
      console.log(`  ends ${JSON.stringify(x.ends)} cover-reported ${x.coverReported} readiness ${x.readiness}`);
      console.log(`MESH ${x.mesh}: pieces ${x.pieces}, design members ${x.designMembers}, spans ${x.spans}, bars ${x.bars} = beams ${x.partition.beams} + joints ${x.partition.joints} + columns ${x.partition.others}, problems ${x.problems.length}`);
      for (const b of x.beams) console.log(`  ${b.name}: pieces ${b.pieces} spans ${b.spans} long ${b.longitudinal} stirrups ${b.stirrups} rows ${b.rows} mass ${r1(b.mass)} (bars ${r1(b.barMass)})`);
      console.log(`  beams: longitudinal ${sum(x.beams, 'longitudinal')}, stirrups ${sum(x.beams, 'stirrups')}, mass ${r1(sum(x.beams, 'mass'))} kg`);
    }
  }, 300_000);

  it('one design member per span, every piece in exactly one span, whatever the mesh', () => {
    expect(MESHES.map((m) => [m, t.get(m)!.pieces, t.get(m)!.spans, t.get(m)!.designMembers])).toEqual([
      [1, 78, 14, 14], [0.5, 156, 14, 14], [2, 42, 14, 14], [6, 14, 0, 14],
    ]);
    // Ten physical beams, each with the same number of design members under every mesh.
    const per = MESHES.map((m) => t.get(m)!.beams.map((b) => `${b.name}:${b.spans}`).join(' '));
    expect(new Set(per).size).toBe(1);
    expect(per[0]).toBe('V1:1 V2:2 V3:2 V4:1 V5:1 V6:1 V7:2 V8:2 V9:1 V10:1');
  });

  it('each bar once: in one assembly, one mark, one printed row, one physical owner', () => {
    for (const m of MESHES) {
      const x = t.get(m)!;
      expect(x.problems, `mesh ${m}`).toEqual([]);
      expect(x.partition.beams + x.partition.joints + x.partition.others).toBe(x.bars);
    }
  });

  it('each beam\'s mass is the sum of its rows, and its bars weighed one by one', () => {
    for (const m of MESHES) for (const b of t.get(m)!.beams) {
      // The rows round the cutting length to the centimetre the planilla prints: 0,5 % covers
      // ±5 mm on the shortest bar a beam has (a 1,35 m stirrup).
      expect(Math.abs(b.mass - b.barMass) / b.barMass, `${b.name} at ${m} m`).toBeLessThan(0.005);
    }
  });

  it('every bar end anchored or reported unresolved, every bar in the concrete or reported, the stirrups the design\'s', () => {
    for (const m of MESHES) {
      const x = t.get(m)!;
      expect(x.validity, `mesh ${m}`).toEqual([]);
      expect(x.ends.pending ?? 0).toBe(0);
      // Where an end or a bar is not resolved, no document holding it reads better than a draft.
      if ((x.ends['end/unresolved'] ?? 0) + (x.ends['interior/unresolved'] ?? 0) + x.coverReported + x.clashes > 0) expect(x.readiness).toBe('REVIEW_DRAFT');
    }
    // What each mesh came to, support ends by disposition, and bars the repair ladder pushed out.
    expect(MESHES.map((m) => [m, t.get(m)!.ends, t.get(m)!.coverReported])).toEqual(EXPECTED_ENDS);
  });

  it('a span\'s cage is laid once: what one design member holds is bounded by its section, not by the mesh', () => {
    // No bound across meshes here: the steel is the forces' (the blocks below), and the forces
    // are the analysis' (`design-span-mesh-convergence.test.ts`). These bounds are per design
    // member and come from the section, so a cage laid once per piece (3 to 12 per span) breaks
    // them whatever the forces.
    for (const m of MESHES) for (const b of t.get(m)!.beams) {
      // Per design member: at most 12 longitudinal bars (a 20 cm web takes 4 a row; bottom,
      // top through and two support groups) and 8 rows (bottom through, bottom cut, top through,
      // the top rows at each support, two each, stirrups). It read 7 with "top at each support
      // and one hooked variant", measured at most 6: a support's second row now hooks where the
      // nesting puts it, a bar and the in-layer clear inside the first (`topRowInboard`, §25.2.1),
      // and the two supports' planes differ where one clears a crossing corner and the other
      // does not, so a 2-row beam has four support rows of four lengths (V4 at 1 m: 1,750,
      // 1,770, 1,810 and 1,830 m). A cage laid per piece would still give 3 to 12 times a span's.
      expect(b.longitudinal / b.spans, `${b.name} at ${m} m`).toBeLessThanOrEqual(12);
      expect(b.rows / b.spans, `${b.name} at ${m} m`).toBeLessThanOrEqual(8);
      // At the tightest spacing the design gives these beams (0,10 m) 57 closed stirrups fit the
      // 5,7 m between faces, and §9.7.3.5(c)'s cut-off zones add at most 12 each at both
      // cut-offs: 81. Measured at most 62; a cage per piece would put 3 to 12 times a span's.
      expect(b.stirrups / b.spans, `${b.name} at ${m} m`).toBeLessThanOrEqual(81);
    }
  });
});

/**
 * Support ends of the beams' bars per mesh, by support and disposition, and the bars the repair
 * ladder left outside their section (each reported). None, on every mesh: the ladder is bounded
 * by the section and refuses a move that leaves it (`repair-envelope.ts`; at f8fb3883 it pushed
 * 3 bars out on the 0,5 m mesh, the third column read 3 there), and a clash it cannot separate
 * inside is `detailing.clash.unresolved`, checked above. Every end anchors on every mesh: the design
 * checks each bar end in a column as the detailing builds it (`end-support-anchorage.ts`) and
 * only passes bars whose ends it can build, so nothing is left for the detailing to report.
 *
 * On the 30×30 columns this building had until the anchorage was checked in the design, the
 * design passed Ø12 top bars whose hooks the column held only partly (0,20 m against ldh 0,22 m)
 * and the detailing reported them: 36, 22 and 28 unresolved ends on the 1, 0,5 and 2 m meshes.
 * On those columns the design now refuses all 14 spans on the 1 m mesh instead
 * (`design-anchorage-coherence.test.ts`).
 */
const EXPECTED_ENDS: unknown[] = [
  [1, { 'end/hook': 66, 'end/straight': 40 }, 0],
  [0.5, { 'end/hook': 68, 'end/straight': 40 }, 0],
  [2, { 'end/hook': 62, 'end/straight': 40 }, 0],
  [6, { 'end/hook': 80, 'end/straight': 40 }, 0],
];

/** What a beam's schedule is, mesh-free: everything but where its longitudinal bars lie. */
const schedule = (x: Tally) => x.beams.map((b) => ({
  name: b.name, longitudinal: b.longitudinal, stirrups: b.stirrups, rows: b.rows,
  mass: Math.round(b.mass * 1e6) / 1e6, marks: b.marks,
}));

describe('the same forces under the four meshes: the same design, the same schedule', () => {
  // The 0,5 m solve's stations, at the same places along every member, read by the design of
  // each mesh (`designAndDocumentUnder`). Whatever still differs is the per-span design's or
  // the detailing's, not the analysis'.
  const t = new Map<number, Tally>();
  beforeAll(() => {
    building(0.5, FRAME);
    const forces = forcesByPlace();
    for (const m of MESHES) t.set(m, tally(m, forces));
    if (!PRINT) return;
    for (const x of t.values()) {
      console.log(`PRESCRIBED ${x.mesh}: ` + x.beams.map((b) => `${b.name} ${b.stirrups}/${b.longitudinal}/${r1(b.mass)}`).join(' '));
      for (const v of x.validity) console.log('  VALIDITY', v);
    }
  }, 300_000);

  it('every member, beams and columns, gets the same reinforcement', () => {
    const at1 = t.get(1)!.designs;
    expect(Object.keys(at1)).toHaveLength(26);
    // Every member designed: equal and absent would say nothing.
    for (const [k, v] of Object.entries(at1)) expect(v, k).not.toMatch(/ null$/);
    for (const m of MESHES) expect(t.get(m)!.designs, `mesh ${m}`).toEqual(at1);
  });

  it('every beam gets the same marks, cutting lengths, bar and stirrup counts and mass', () => {
    // Every beam has its cage: equal and empty would say nothing.
    for (const b of t.get(1)!.beams) {
      expect(b.longitudinal, b.name).toBeGreaterThan(0);
      expect(b.stirrups, b.name).toBeGreaterThan(0);
    }
    for (const m of MESHES) expect(schedule(t.get(m)!), `mesh ${m}`).toEqual(schedule(t.get(1)!));
  });

  it('every stirrup stands at the same place along its beam', () => {
    for (const m of MESHES) {
      for (const [k, b] of t.get(m)!.beams.entries()) expect(b.stirrupsAt, `${b.name} at ${m} m`).toEqual(t.get(1)!.beams[k]!.stirrupsAt);
    }
  });

  it('every longitudinal bar lies at the same place on the meshes that cut the beams', () => {
    for (const m of [0.5, 2]) {
      for (const [k, b] of t.get(m)!.beams.entries()) expect(b.longitudinalAt, `${b.name} at ${m} m`).toEqual(t.get(1)!.beams[k]!.longitudinalAt);
    }
  });

  /**
   * On the 6 m mesh too. At f8fb3883 this failed: on the 6 m mesh the bottom bars of V2 and V3
   * and the support bars of V4 and V5 lay elsewhere, with the same counts, lengths and mass (V2's
   * two through Ø16 0,20 m above the soffit and 0,15 m off its axis, outside the section, against
   * 0,05 m and 0,09 m on the cut meshes). The repair ladder (`coordinate-floor.ts`) moved the
   * second bar of each clashing pair, the pair ordered by bar id (`collision.ts`), and a bar id
   * carries its element's number as text: at 6 m `e13-topI-1` sorts before `e5-bot-cont-1` and
   * V2's bottom layer was moved, at 1 m `e32-…` sorts before `e61-…` and V5's top layer was. The
   * test below is the same defect with the mesh taken out.
   */
  it('every longitudinal bar lies at the same place on every mesh, the uncut one included', () => {
    for (const m of MESHES) {
      for (const [k, b] of t.get(m)!.beams.entries()) expect(b.longitudinalAt, `${b.name} at ${m} m`).toEqual(t.get(1)!.beams[k]!.longitudinalAt);
    }
  });

  it('the bars do not depend on how the elements are numbered', () => {
    // The 6 m model under the same forces, detailed as it is numbered, with every beam
    // numbered above every column (the order the cut meshes give: their spans are new pieces),
    // and with every column above every beam. The bars, read back under the model's own ids,
    // are the same three times.
    building(6, FRAME);
    designAndDocumentUnder(t.get(6)!.forces);
    const kinds = new Map([...verificationStore.contexts.values()].map((c) => [c.elementId, c.elementType]));
    const asIs = detailNumbered(() => 0);
    // Every beam has longitudinal bars: equal and empty would say nothing.
    for (const [id, k] of kinds) {
      if (k === 'beam') expect(asIs.some((l) => l.startsWith('longitudinal') && new RegExp(`[[,]${id}[\\],]`).test(l)), `beam ${id}`).toBe(true);
    }
    expect(detailNumbered((id) => (kinds.get(id) === 'beam' ? 1000 : 0))).toEqual(asIs);
    expect(detailNumbered((id) => (kinds.get(id) === 'beam' ? 0 : 1000))).toEqual(asIs);
  });

  it('every bar end and every bar the ladder moved is resolved or reported, on every mesh', () => {
    for (const m of MESHES) expect(t.get(m)!.validity, `mesh ${m}`).toEqual([]);
  });
});

describe('the steel is the forces\': each mesh\'s forces give its steel on another mesh', () => {
  // Each mesh designed and detailed under its own solve, and the 1 m model designed and
  // detailed under that mesh's forces. Equal means the steel depends on the forces alone: what
  // differs between meshes is what their analyses deliver.
  const own = new Map<number, Tally>();
  const on1 = new Map<number, Tally>();
  beforeAll(() => {
    for (const m of MESHES) {
      own.set(m, tally(m));
      on1.set(m, tally(1, own.get(m)!.forces));
    }
  }, 300_000);

  it('the same reinforcement on every member and the same schedule on every beam', () => {
    for (const m of MESHES) {
      for (const [k, v] of Object.entries(own.get(m)!.designs)) expect(v, `${k} at ${m} m`).not.toMatch(/ null$/);
      expect(on1.get(m)!.designs, `forces of ${m} m on the 1 m model`).toEqual(own.get(m)!.designs);
      expect(schedule(on1.get(m)!), `forces of ${m} m on the 1 m model`).toEqual(schedule(own.get(m)!));
    }
  });
});

/**
 * The bars `runDetailing` lays for the model in the stores, every element id offset by
 * `shift(id)`, read back under the model's own ids: role, Ø, cutting length, owners and every
 * segment's ends (mm), sorted.
 */
function detailNumbered(shift: (id: number) => number): string[] {
  const to = (id: number) => id + shift(id);
  const back = new Map([...modelStore.elements.keys()].map((id) => [to(id), id]));
  const from = (id: number) => back.get(id) ?? id;
  const renumber = <V>(m: ReadonlyMap<number, V>, f: (v: V) => V) => new Map([...m].map(([k, v]) => [to(k), f(v)]));
  const element = <E extends { id: number }>(e: E): E => ({ ...e, id: to(e.id) });
  const contexts = renumber(verificationStore.contexts, (c): MemberContext => ({
    ...c, elementId: to(c.elementId),
    stations: c.stations && { ...c.stations, elementId: to(c.stations.elementId) },
    demands: c.demands && { ...c.demands, elementId: to(c.demands.elementId) },
    modelData: { ...c.modelData, elements: renumber(c.modelData.elements, element) as typeof c.modelData.elements },
  }));
  const outcomes = renumber(verificationStore.runSummary!.outcomes, (o) => ({ ...o, elementId: to(o.elementId) }));
  const run = runDetailing({
    contexts, outcomes, nodes: modelStore.nodes, elements: renumber(modelStore.elements, element),
    edition: currentConcreteEdition(), verifierId: 'test', demandRevision: verificationStore.demandRevision,
    maxAggregateSizeMm: resolveAggregate(), spacingMargin: resolveSpacingMargin(),
    reverify: (id, loss) => verificationStore.reverifyAtFinalDepth(from(id), loss, verificationStore.runSummary!.outcomes.get(from(id))?.accepted),
    checksTorsion: true,
  });
  const mm = (v: number) => Math.round(v * 1000);
  return run.assemblies.flatMap((a) => a.bars.map((b) => `${b.role} Ø${b.diameterMm} ${b.cuttingLength.toFixed(3)} [${b.ownerElementIds.map(from).sort((x, y) => x - y)}] `
    + b.segments.map((g) => [g.start, g.end].map((p) => [p.x, p.y, p.z].map(mm).join(',')).join('~')).join('|'))).sort();
}
