/**
 * The trace of one physical beam, from the analysis' pieces to the bending schedule.
 *
 * V2 is the X beam on axis 1 at level N1 of the span fixture: 12 m from column A to column C,
 * through column B, under a slab meshed at 1 m. The analysis has it as twelve 1 m elements; the
 * design reads two spans of 6 m (`design-spans.ts`) and the detailing lays each span once
 * (`span-detailing.ts`). This test states, for that beam, what each stage holds and asserts it:
 * the spans and their pieces, the governing demands, the designed steel and the verifier's
 * anchorage reading of it, every physical bar with its owners and the anchorage of each end it
 * has in a support (available against required, the disposition adopted, the hook's geometry,
 * the end cover), the stirrups laid against the stirrups designed, the planilla de doblado rows
 * as the sheets print them (`bendingSchedule`) with every bar in exactly one, the beam's steel
 * mass, and that every end the design verified is an end the detailing built.
 *
 * The frame stands on 40×40 columns here (`span-fixture.ts`). On the fixture's 30×30 the design
 * passed V2 with Ø12 top bars at A and C whose hooks the column held only partly (0,201 m against
 * ldh 0,221 m) and the detailing reported them unresolved; the design now checks those ends as
 * the detailing builds them and refuses V2 there (`design-anchorage-coherence.test.ts`).
 *
 * A bar is the beam's when every member owning it is a piece of the beam. The joint ties at its
 * columns are owned by the column and by every beam framing in, so they are the joint's: listed,
 * and kept out of the beam's mass, which would otherwise count them once per member.
 *
 * Positions are along the beam from column A's axis, m; column faces at 0,20 m either side of
 * each axis.
 *
 * `SPAN_TRACE_PRINT=1` prints the trace as the report tables.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { rebarHash } from '../../engine/design/rebar-hash';
import { favourableRowHolds, requiredLd } from '../../engine/station-design-forces';
import { concreteBelowTopBars } from '../../codes/cirsoc201/anchorage';
import { markMassKg } from '../../engine/detailing/assembly';
import type { BarEndAnchorage, BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { SpanRef } from '../../engine/design/design-spans';
import type { DocumentModel } from '../../engine/detailing/document-model';
import * as wasmSolver from '../../engine/wasm-solver';
import { assemblyLabel, beamOnAxis1AtN1, building, designAndDocument, printedSchedule, type PhysicalBeam } from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const PRINT = !!process.env.SPAN_TRACE_PRINT;

interface EndTrace extends BarEndAnchorage {
  /** The hook, when the end has one: bend diameter (mandrel), tail and where the tail stands. */
  hook?: { angle: number; mandrel: number; tail: number; tailFromNearFace: number };
}

interface BarTrace {
  id: string; mark: string; face: 'top' | 'bottom'; dia: number; owners: number[]; cut: number;
  /** Extent of the bar's run along the beam, m from A's axis. */
  from: number; to: number;
  start?: EndTrace; end?: EndTrace;
}

/** What the beam's design and detailing say, read off the stores and the document. */
function traceOf(beam: PhysicalBeam, doc: DocumentModel) {
  const pieces = new Set(beam.elements);
  const spans: SpanRef[] = [];
  for (const id of beam.elements) {
    const s = verificationStore.contextFor(id)!.span!;
    if (!spans.some((x) => x.key === s.key)) spans.push(s);
  }
  spans.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));

  const perSpan = spans.map((s) => {
    const ctx = verificationStore.contextFor(s.representative)!;
    const d = (cat: string) => ctx.demands!.demands.find((x) => x.category === cat)!;
    const cs = ctx.criticalSections!;
    return {
      span: s, ctx, cs,
      reinf: modelStore.elements.get(s.representative)!.reinforcement!,
      x0: modelStore.nodes.get(s.start)!.x,
      demands: { 'M+': d(ctx.axes.sagCategory), 'M-': d(ctx.axes.hogCategory), V: d(ctx.axes.shear) },
      regions: { start: cs.start.tCritShear * ctx.L, span: (1 - cs.start.tCritShear - cs.end.tCritShear) * ctx.L, end: cs.end.tCritShear * ctx.L },
    };
  });

  const touching = doc.assemblies.flatMap((a) => a.bars.filter((b) => b.ownerElementIds.some((id) => pieces.has(id))).map((b) => ({ a, b })));
  const own = touching.filter(({ b }) => b.ownerElementIds.every((id) => pieces.has(id)));
  const joint = touching.filter(({ b }) => !b.ownerElementIds.every((id) => pieces.has(id)));
  const markOf = (a: DocumentModel['assemblies'][number], id: string) => a.source.marks.find((m) => m.barIds.includes(id))!;
  const runOf = (b: BarPath) => b.segments.filter((g) => g.kind === 'straight')
    .sort((p, q) => Math.abs(q.end.x - q.start.x) - Math.abs(p.end.x - p.start.x))[0]!;
  const zAxis = modelStore.nodes.get(perSpan[0]!.span.start)!.z ?? 0;
  /** The column face a bar end sits beyond, m from A: 0,20 m from the nearest axis, inboard. */
  const nearFace = (x: number, toward: 1 | -1) => {
    const axis = [0, 6, 12].reduce((p, q) => (Math.abs(q - x) < Math.abs(p - x) ? q : p));
    return axis - toward * FACE;
  };

  const longitudinal: BarTrace[] = own.filter(({ b }) => b.role === 'longitudinal').map(({ a, b }) => {
    const run = runOf(b);
    const from = Math.min(run.start.x, run.end.x), to = Math.max(run.start.x, run.end.x);
    const end = (side: 'start' | 'end'): EndTrace | undefined => {
      const rec = b.anchorage?.[side];
      if (!rec) return undefined;
      const t = side === 'start' ? b.startTreatment : b.endTreatment;
      if (t.kind !== 'hook') return { ...rec };
      // The tail is the straight beyond the bend: the first segment at the start, the last at the end.
      const tail = side === 'start' ? b.segments[0]! : b.segments[b.segments.length - 1]!;
      const xTail = tail.start.x;
      const toward = side === 'start' ? -1 : 1;
      return {
        ...rec,
        hook: { angle: t.hook.angle, mandrel: t.hook.mandrelDiameter, tail: t.hook.extension, tailFromNearFace: Math.abs(xTail - nearFace(xTail, toward as 1 | -1)) },
      };
    };
    return {
      id: b.id, mark: markOf(a, b.id).mark, face: run.start.z > zAxis ? 'top' : 'bottom', dia: b.diameterMm,
      owners: [...b.ownerElementIds].sort((x, y) => x - y), cut: b.cuttingLength, from, to,
      ...(end('start') ? { start: end('start') } : {}), ...(end('end') ? { end: end('end') } : {}),
    };
  });
  const stirrups = own.filter(({ b }) => b.role !== 'longitudinal').map(({ a, b }) => ({ b, mark: markOf(a, b.id) }));

  // The planilla: every printed row that holds a bar of the beam, and the beam's part of it.
  const printed = printedSchedule(doc);
  const ownIds = new Set(own.map((x) => x.b.id));
  const rows = doc.assemblies.flatMap((a) => a.source.marks.filter((m) => m.barIds.some((id) => ownIds.has(id))).map((m) => {
    const mine = m.barIds.filter((id) => ownIds.has(id)).length;
    return { a, m, row: printed.find((r) => r.assembly === assemblyLabel(a.id) && r.mark === m.mark)!, mine, share: m.massKg * mine / m.quantity };
  }));
  return { spans: perSpan, own, joint, longitudinal, stirrups, rows, printed };
}

describe('trace of one physical beam: the X beam on axis 1 at N1, slab mesh 1 m', () => {
  let t: ReturnType<typeof traceOf>;
  let beam: PhysicalBeam;
  let doc: DocumentModel;

  beforeAll(() => {
    building(1, { columnSide: 0.4 });
    doc = designAndDocument();
    beam = beamOnAxis1AtN1();
    t = traceOf(beam, doc);
    if (!PRINT) return;
    console.log(`BEAM ${beam.name} (group ${beam.id}) pieces ${beam.elements.join(',')}`);
    for (const p of t.spans) {
      console.log(`SPAN ${p.span.label} ${p.span.key} L=${p.ctx.L} pieces ${p.span.elements.map((id, k) => `${id}[L=${p.span.lengths[k]} off=${p.span.offsets[k]} rev=${p.span.reversed[k]}]`).join(' ')}`);
      for (const [k, d] of Object.entries(p.demands)) console.log(`  ${k} ${d.category} ${r3(d.value)} ${d.comboName} x=${r3(d.stationX)}`);
      console.log(`  steel ${JSON.stringify(p.reinf.regions)} regions ${r3(p.regions.start)}/${r3(p.regions.span)}/${r3(p.regions.end)}`);
    }
    const e = (x?: EndTrace) => x ? `${x.support}/${x.solution} ${r3(x.available)} vs ${x.rule} ${r3(x.required)}${x.endCover !== undefined ? ` cover ${r3(x.endCover)}` : ''}${x.hook ? ` hook ${x.hook.angle}° D=${r3(x.hook.mandrel)} tail ${r3(x.hook.tail)} at ${r3(x.hook.tailFromNearFace)} past face` : ''}` : '—';
    for (const b of t.longitudinal) console.log(`BAR ${b.id} ${b.mark} ${b.face} Ø${b.dia} owners ${b.owners.join(',')} cut ${r3(b.cut)} [${r3(b.from)}, ${r3(b.to)}] | start ${e(b.start)} | end ${e(b.end)}`);
    for (const r of t.rows) console.log(`ROW ${JSON.stringify(r.row)} beam ${r.mine}/${r.m.quantity} share ${r3(r.share)} kg`);
    console.log(`MASS ${r3(t.rows.reduce((s, r) => s + r.share, 0))} kg; joint ties ${t.joint.length}`);
    const zones = new Map<string, number[]>();
    for (const s of t.stirrups) { const z = String(s.b.zoneId ?? '?'); const xs = s.b.segments.flatMap((g) => [g.start.x, g.end.x]); zones.set(z, [...(zones.get(z) ?? []), (Math.min(...xs) + Math.max(...xs)) / 2]); }
    for (const [z, xs] of zones) { const u = [...xs].sort((a, b) => a - b); const gaps = u.slice(1).map((v, i) => v - u[i]!); console.log(`ZONE ${z} n=${u.length} [${r3(u[0]!)}, ${r3(u[u.length - 1]!)}] gap ${r3(Math.min(...gaps))}..${r3(Math.max(...gaps))} Ø${[...new Set(t.stirrups.filter((s) => s.b.zoneId === z).map((s) => s.b.diameterMm))]}`); }
    console.log('OPEN', JSON.stringify((doc.openIssues ?? []).filter((i) => i.elementIds.some((id) => beam.elements.includes(id))).map((i) => [i.key, i.params?.bar, i.params?.end, i.params?.available, i.params?.required])));
  }, 120_000);

  it('the physical member and its two spans, each with its six 1 m pieces', () => {
    expect(beam.name).toBe('V2');
    expect([...beam.elements].sort((a, b) => a - b)).toEqual([32, 33, 34, 35, 36, 37, 49, 50, 51, 52, 53, 54]);
    expect(t.spans.map((p) => [p.span.key, p.span.label, p.ctx.L])).toEqual([['span-32', 'V2-1', 6], ['span-49', 'V2-2', 6]]);
    for (const p of t.spans) {
      expect(p.span.elements).toEqual(p.span.key === 'span-32' ? [32, 33, 34, 35, 36, 37] : [49, 50, 51, 52, 53, 54]);
      expect(p.span.lengths.map(r3)).toEqual([1, 1, 1, 1, 1, 1]);
      expect(p.span.offsets.map(r3)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(p.span.reversed).toEqual([false, false, false, false, false, false]);
      for (const id of p.span.elements) {
        expect(verificationStore.contextFor(id)!.span!.key).toBe(p.span.key);
        expect(verificationStore.outcomeFor(id)!.outcome).toBe('VERIFIED');
        expect(rebarHash(modelStore.elements.get(id)!.reinforcement!)).toBe(rebarHash(p.reinf));
      }
    }
    expect(t.spans.flatMap((p) => p.span.elements).sort((a, b) => a - b)).toEqual([...beam.elements].sort((a, b) => a - b));
  });

  it('the governing combination and station of M+, M− and V on each span', () => {
    const got = t.spans.map((p) => Object.entries(p.demands).map(([k, d]) => [p.span.label, k, d.category, +d.value.toFixed(2), d.comboName, r3(d.stationX)]));
    expect(got).toEqual([
      [['V2-1', 'M+', 'My+', 29.09, '1.2D + 1.6L', 3], ['V2-1', 'M-', 'My-', -41.65, '1.2D + 1.6L', 6], ['V2-1', 'V', 'Vz', 26.41, '1.2D + 1.6L', 0]],
      [['V2-2', 'M+', 'My+', 29.09, '1.2D + 1.6L', 3], ['V2-2', 'M-', 'My-', -41.65, '1.2D + 1.6L', 0], ['V2-2', 'V', 'Vz', -26.41, '1.2D + 1.6L', 6]],
    ]);
  });

  it('the designed steel, its regions, and the verifier reading the anchorage along the span', () => {
    const steel = t.spans.map((p) => {
      const g = p.reinf.regions!;
      return [p.span.label, g.bottomSpan, g.topStart, g.topEnd, g.stirrupsSupport, g.stirrupsSpan, [p.regions.start, p.regions.span, p.regions.end].map(r3)];
    });
    const st = { diameter: 6, legs: 2, spacing: STIRRUP_SPACING };
    expect(steel).toEqual([
      ['V2-1', { count: 3, diameter: 16 }, { count: 3, diameter: 16 }, { count: 3, diameter: 16 }, st, st, [0.659, 4.682, 0.659]],
      ['V2-2', { count: 3, diameter: 16 }, { count: 3, diameter: 16 }, { count: 3, diameter: 16 }, st, st, [0.659, 4.682, 0.659]],
    ]);
    for (const p of t.spans) {
      expect([p.cs.start.source, p.cs.end.source, p.cs.start.halfDepth, p.cs.end.halfDepth]).toEqual(['column', 'column', FACE, FACE]);
      const g = p.reinf.regions!, { fc, fy, cover, stirrupDia } = p.ctx.material, b = p.ctx.section.b, d = p.cs.d;
      const layers = (x: { count: number; diameter: number }) => [{ ...x, row: 0 }];
      const fav = (x: { count: number; diameter: number }) => favourableRowHolds(layers(x), { b, cover, stirrupDia, fc, fy }, [g.stirrupsSupport, g.stirrupsSpan], d);
      const ldBottom = requiredLd(g.bottomSpan!.diameter, fc, fy, { favourableSpacing: fav(g.bottomSpan!) });
      const ldTop = requiredLd(g.topStart!.diameter, fc, fy, { favourableSpacing: fav(g.topStart!), concreteBelowM: concreteBelowTopBars(p.ctx.section.h, cover, stirrupDia, g.topStart!.diameter) });
      expect(p.regions.start).toBeGreaterThanOrEqual(ldBottom);
      expect(p.regions.end).toBeGreaterThanOrEqual(ldBottom);
      expect(p.regions.span / 2).toBeGreaterThanOrEqual(ldTop);
      const pv = verificationStore.providedFor(p.span.representative)!;
      expect(pv.checks.filter((c) => c.limiting === 'anchorage' && c.status === 'fail')).toEqual([]);
    }
  });

  it('every bar end in a support: available against required, the disposition, the hook, the cover', () => {
    const e = (x?: EndTrace) => x ? [x.support, x.solution, r3(x.available), x.rule, r3(x.required), x.endCover === undefined ? null : r3(x.endCover),
      x.hook ? [x.hook.angle, r3(x.hook.mandrel), r3(x.hook.tail), r3(x.hook.tailFromNearFace)] : null] : null;
    const got = t.longitudinal.map((b) => [b.id, b.mark, b.face, b.dia, r3(b.cut), r3(b.from), r3(b.to), e(b.start), e(b.end)]);
    if (PRINT) console.log('GOT', JSON.stringify(got));
    // By bar id: which member's list a bar fused through a joint sits in is not part of the trace.
    const byId = (xs: unknown[]) => [...xs].sort((p, q) => String((p as unknown[])[0]).localeCompare(String((q as unknown[])[0])));
    expect(byId(got)).toEqual(byId(EXPECTED_BARS));
    // Every end has a record; none is left pending; the ones that hold, hold.
    for (const b of t.longitudinal) for (const x of [b.start, b.end]) {
      if (!x) continue;
      expect(x.solution).not.toBe('pending');
      if (x.solution !== 'unresolved') expect(x.available).toBeGreaterThanOrEqual(x.required - 1e-9);
      else expect(x.available).toBeLessThan(x.required);
      // In the concrete: a straight end or a hook's outer surface at least the cover from the
      // support's outer face.
      if (x.endCover !== undefined) expect(x.endCover).toBeGreaterThanOrEqual(0.025 - 1e-9);
    }
    // At column B the bars run through or lap: an end at B is a lap, and no bar stops inside the
    // joint. (On this design every bar crossing B runs through it.)
    const atB = t.longitudinal.flatMap((b) => [b.start, b.end].filter((x) => x?.support === 'interior'));
    expect(atB.every((x) => x!.solution === 'lap')).toBe(true);
    for (const b of t.longitudinal) {
      for (const [x, rec] of [[b.from, b.start], [b.to, b.end]] as const) {
        if (Math.abs(x - 6) < FACE + 1e-6) expect(rec?.solution, `${b.id} ends in joint B`).toBe('lap');
      }
    }
    // No bar runs past column A's or C's outer face less the cover.
    for (const b of t.longitudinal) {
      expect(b.from).toBeGreaterThanOrEqual(-(FACE - 0.025) - 1e-6);
      expect(b.to).toBeLessThanOrEqual(12 + FACE - 0.025 + 1e-6);
    }
  });

  it('the stirrups laid are the stirrups designed: Ø6 c/10 over every region, face to face', () => {
    // Zone by zone: the design's support region (face to d past it) and span, at the designed
    // diameter and no wider than the designed spacing; and, where a top bar is cut off in a
    // tension zone, §9.7.3.5(c)'s extra stirrups at the tighter spacing it asks.
    const zones = new Map<string, { dia: number; xs: number[] }>();
    for (const s of t.stirrups) {
      const z = String(s.b.zoneId);
      const xs = s.b.segments.flatMap((g) => [g.start.x, g.end.x]);
      const e = zones.get(z) ?? { dia: s.b.diameterMm, xs: [] };
      e.xs.push(r3((Math.min(...xs) + Math.max(...xs)) / 2));
      zones.set(z, e);
    }
    const layout = [...zones].map(([z, e]) => {
      const xs = [...new Set(e.xs)].sort((a, b) => a - b);
      const gaps = xs.slice(1).map((v, i) => v - xs[i]!);
      return [z, e.dia, xs.length, xs[0], xs[xs.length - 1], r3(Math.max(...gaps))];
    });
    if (PRINT) console.log('LAYOUT', JSON.stringify(layout));
    expect(layout).toEqual(EXPECTED_STIRRUPS);
    const pieces = t.stirrups.map((s) => s.b);
    expect(new Set(pieces.map((p) => p.diameterMm))).toEqual(new Set([6]));
    const stations = (lo: number, hi: number) => [...new Set(pieces.map((p) => {
      const xs = p.segments.flatMap((g) => [g.start.x, g.end.x]);
      return r3((Math.min(...xs) + Math.max(...xs)) / 2);
    }))].filter((x) => x > lo && x < hi).sort((a, b) => a - b);
    for (const [lo, hi] of [[0, 6], [6, 12]] as const) {
      const xs = stations(lo, hi);
      const gaps = xs.slice(1).map((v, i) => r3(v - xs[i]!));
      expect(xs[0]).toBeCloseTo(lo + FACE + FIRST_STIRRUP_INSET, 3);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(STIRRUP_SPACING + 1e-9);
      expect(xs[xs.length - 1]).toBeLessThanOrEqual(hi - FACE);
      if (PRINT) console.log('STIRRUPS', lo, hi, xs.length, xs[0], xs[xs.length - 1], Math.min(...gaps), Math.max(...gaps));
    }
  });

  it('every bar of the beam in exactly one printed row of the planilla, and the beam\'s mass', () => {
    // Each bar to its row: the printed mark, its Ø and its cutting length to the centimetre.
    for (const { a, b } of t.own) {
      const rows = t.rows.filter((r) => r.a === a && r.m.barIds.includes(b.id));
      expect(rows, b.id).toHaveLength(1);
      const r = rows[0]!;
      expect([r.row.dia, r.row.cut]).toEqual([`Ø${b.diameterMm}`, (Math.round(b.cuttingLength * 100) / 100).toFixed(2)]);
    }
    for (const r of t.rows) {
      expect([r.row.count, r.row.cut, r.row.mass]).toEqual([String(r.m.quantity), r.m.cuttingLength.toFixed(2), r.m.massKg.toFixed(1)]);
    }
    expect(t.rows.reduce((n, r) => n + r.mine, 0)).toBe(t.own.length);
    const mass = t.rows.reduce((s, r) => s + r.share, 0);
    const exact = t.own.reduce((s, { b }) => s + markMassKg(b.diameterMm, b.cuttingLength, 1), 0);
    expect(Math.abs(mass - exact) / exact).toBeLessThan(0.005);
    if (PRINT) console.log('MASSCHECK', r3(mass), r3(exact));
    expect(r3(mass)).toBe(EXPECTED_MASS);
  });

  it('every end the detailing built is an end the design verified: same length, same rule, same disposition', () => {
    // Each bar end in a support against the verifier's reading of that support
    // (`supportAnchorage`): the row of the same face and diameter the bar lies in. At A and C the
    // length available and required and the disposition are the design's; at B the design left
    // the end to the line's laps (`pending`) and the detailing lapped it or ran it through.
    const verdictsAt = (x: number) => t.spans.flatMap((p) => {
      // The support the end is at: the nearest column axis (a lap runs past it).
      const axis = [0, 6, 12].reduce((u, v) => (Math.abs(v - x) < Math.abs(u - x) ? v : u));
      const at = (n: number) => modelStore.nodes.get(n)!.x;
      const end = Math.abs(at(p.span.start) - axis) < 1e-6 ? 'start' : Math.abs(at(p.span.end) - axis) < 1e-6 ? 'end' : null;
      return end ? verificationStore.providedFor(p.span.representative)!.supportAnchorage!.filter((v) => v.end === end) : [];
    });
    let compared = 0;
    for (const { b } of t.own.filter(({ b }) => b.role === 'longitudinal')) {
      const lb = t.longitudinal.find((x) => x.id === b.id)!;
      const row = Number(b.layerId?.split(':').pop() ?? 0);
      for (const s of ['start', 'end'] as const) {
        const rec = lb[s];
        if (!rec) continue;
        const x = s === 'start' ? lb.from : lb.to;
        const rows = verdictsAt(x).filter((v) => v.position === lb.face && v.row === row);
        const same = rows.filter((v) => v.diameterMm === lb.dia);
        // A bar of the other span the line carried on past B (`lap-materialize.ts`) ends at the
        // far support beside that span's own bars: it is read against their row, a bar at least
        // as large, under the same rule.
        const vs = same.length ? same : rows.filter((v) => v.diameterMm >= lb.dia);
        expect(vs.length, `${b.id}:${s} row ${row}`).toBeGreaterThan(0);
        for (const v of vs) {
          if (rec.support === 'interior') {
            expect([v.solution, v.support], `${b.id}:${s}`).toEqual(['pending', 'interior']);
            expect(['lap', 'straight']).toContain(rec.solution);
          } else if (same.length) {
            expect([rec.solution, r3(rec.available), rec.rule, r3(rec.required)], `${b.id}:${s}`).toEqual([v.solution, r3(v.available), v.rule, r3(v.required)]);
          } else {
            expect([rec.solution, rec.rule], `${b.id}:${s}`).toEqual([v.solution, v.rule]);
            expect(rec.available).toBeGreaterThanOrEqual(rec.required - 1e-9);
          }
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
    // Nothing of the beam is open for its anchorage.
    expect((doc.openIssues ?? []).filter((i) => i.key === 'detailing.anchorage.unresolved' && i.elementIds.some((id) => beam.elements.includes(id)))).toEqual([]);
  });
});

/**
 * The bars as traced on the span fixture, mesh 1 m (positions from column A's axis).
 *
 * The marks moved three on (B13–B19 → B16–B22): the schedule numbers the level's rows in order,
 * and three more rows come ahead of the beam's since the columns' lifts are laid about the nodes
 * as the beams are (`generate-column` `jointBand`) and their ties stop clear of the beams' mats.
 * The beam's longitudinal bars are the same bars, at the same lengths.
 */
const EXPECTED_BARS: unknown[] = [
  // id, mark, face, Ø, cut, run from, run to; then each end in a support:
  // [support, solution, available, rule, required, end cover, hook [°, bend Ø, tail, tail past the near face]]
  ['e32-bot-cont-0+e49-bot-cont-0', 'B21', 'bottom', 16, 11.9, 0.05, 11.95, ['end', 'straight', 0.15, '9.7.3.8.2', 0.15, 0.25, null], ['end', 'straight', 0.15, '9.7.3.8.2', 0.15, 0.25, null]],
  ['e32-bot-cont-1+e49-bot-cont-1', 'B21', 'bottom', 16, 11.9, 0.05, 11.95, ['end', 'straight', 0.15, '9.7.3.8.2', 0.15, 0.25, null], ['end', 'straight', 0.15, '9.7.3.8.2', 0.15, 0.25, null]],
  ['e32-bot-cut-0', 'B17', 'bottom', 16, 3.006, 1.467, 4.473, null, null],
  ['e32-topI-1', 'B16', 'top', 16, 1.89, -0.047, 1.563, ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]], null],
  ['e32-topJ-1+e49-topI-1', 'B18', 'top', 16, 3.726, 4.137, 7.863, null, null],
  ['e32-topRun-0+e49-topRun-0', 'B22', 'top', 16, 12.654, -0.047, 12.047, ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]], ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]]],
  ['e32-topRun-1+e49-topRun-1', 'B22', 'top', 16, 12.654, -0.047, 12.047, ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]], ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]]],
  ['e49-bot-cut-0', 'B17', 'bottom', 16, 3.006, 7.527, 10.533, null, null],
  ['e49-topJ-1', 'B16', 'top', 16, 1.89, 10.437, 12.047, null, ['end', 'hook', 0.311, 'ldh', 0.294, 0.089, [90, 0.096, 0.192, 0.303]]],
];
// 133,609 kg before: the stirrups are now laid between the mats as the joint ranks lower and
// raise them (1,347 → 1,290 m each), so their bends hold the bars they enclose.
const EXPECTED_MASS = 132.064;
/** Zone, Ø, stations, first and last station (m from A), widest spacing. */
// The first stirrup at each support stands 13 mm inside the face (`stirrupInsetI`): its legs keep
// the column's 40 mm from the 40×40 column's Ø16 face bars (§25.2.3); at the face they came 29,7
// mm. Before: 0,2 / 5,8 / 6,2 / 11,8 and 0,092 between; after: 0,213 / 5,787 / 6,213 / 11,787, 0,09.
const EXPECTED_STIRRUPS: unknown[] = [
  ['e32:shear:0', 6, 5, 0.213, 0.57, 0.09],
  ['e32:minimum:1', 6, 47, 0.659, 5.242, 0.1],
  ['e32:shear:2', 6, 6, 5.341, 5.787, 0.09],
  ['e49:shear:0', 6, 5, 6.213, 6.57, 0.09],
  ['e49:minimum:1', 6, 47, 6.659, 11.242, 0.1],
  ['e49:shear:2', 6, 6, 11.341, 11.787, 0.09],
];
/** Half the 40×40 column's side: the face either side of each axis, m. */
const FACE = 0.2;
/** The first stirrup inside the face: Ø6 + 40 mm − 25 mm cover − the column's Ø8 tie, m. */
const FIRST_STIRRUP_INSET = 0.013;
/** The design's stirrup spacing on V2, support and span alike, m. */
const STIRRUP_SPACING = 0.1;
