/**
 * A beam the slab mesh cut into pieces is designed and detailed as the span it is.
 *
 * `placeSlabs` meshes each bay at the size asked and cuts the beams at the mesh's edge nodes, so a
 * 6 m beam under a 1 m mesh reaches the design as six 1 m elements. Designed one by one, every
 * piece read its two mesh nodes as supports, took a 0,15 m support region at each and asked its
 * bottom bars to anchor in it: 37 cm of ld into 15 cm, refused on every candidate, and the whole
 * floor came back «change the section». The building here is the one that showed it: two bays of
 * 6 m by one of 5 m, two storeys of 3 m, H-30, columns 30×30, beams 20×50, a 0,15 m slab meshed at
 * 1 m on both floors — 78 beam pieces in 14 spans.
 *
 * The columns are 40×40 here: on 30×30 the design now finds no top bar whose hook the column holds
 * at any of the 14 spans (`span-fixture.ts`, `design-anchorage-coherence.test.ts`), and what this
 * file reads is how the mesh's pieces become spans, which needs spans that design.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { flipMembers } from '../../model/edit/flip-members';
import { computeBeamCriticalSections } from '../../engine/station-design-forces';
import { rebarHash } from '../../engine/design/rebar-hash';
import { modelBeamLines } from '../frame-equalize';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 }, { id: 'C', name: 'C', axis: 'x', at: 12 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

/** The building, solved: slabs meshed at `mesh` m (none: no slab, beams loaded along their length). */
function building(mesh: number | null, o: { flip?: (ids: number[]) => number[] } = {}) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  uiStore.analysisMode = 'pro';
  // The reading of the beams' role in the lateral system this suite was written under (`suite-lateral.ts`).
  stateSuiteLateral();
  const mat = modelStore.addMaterial({ name: 'H-30', e: 27500, nu: 0.2, rho: 25, fy: 30, fc: 30 } as never);
  const col = modelStore.addSection({ name: 'Rect 40x40 cm', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: 'Rect 20x50 cm', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const S = (s: number) => ({ sectionId: s, materialId: mat });
  placeFrame(grid, { x: ['A', 'C'], y: ['1', '2'], levels: ['N0', 'N2'], columns: S(col), beamsX: S(bm), beamsY: S(bm) }, { fixBase: true });
  if (mesh !== null) {
    placeSlabs(grid, { levels: ['N1', 'N2'], thickness: 0.15, materialId: mat, meshSize: mesh, typology: 'solid' });
    // Dead 1,5 kN/m² over the slab's own weight, live 2 kN/m².
    for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 1.5, 1); modelStore.addSurfaceLoad3D(q.id, 2, 2); }
  } else {
    // The slab's load on its beams, 2,5 m of it a side: 1,5 + 3,75 kN/m² dead, 2 kN/m² live.
    for (const e of modelStore.elements.values()) {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      if (Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-6) continue;
      const interior = Math.abs(a.x - 6) < 1e-6 && Math.abs(b.x - 6) < 1e-6;
      const w = interior ? 5 : 2.5;
      modelStore.addDistributedLoad3D(e.id, 0, 0, -5.25 * w, -5.25 * w, undefined, undefined, 1, { frame: 'global' });
      modelStore.addDistributedLoad3D(e.id, 0, 0, -2 * w, -2 * w, undefined, undefined, 2, { frame: 'global' });
    }
  }
  const flipped = o.flip ? o.flip([...modelStore.elements.keys()]) : [];
  if (flipped.length) expect(flipMembers(flipped).flipped).toEqual(flipped);
  const combo = modelStore.solveCombinations3D(true, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  return { flipped };
}

const beamIds = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'beam').map((c) => c.elementId);
const columnIds = () => [...verificationStore.contexts.values()].filter((c) => c.elementType === 'column').map((c) => c.elementId);

/** An X beam's piece on axis 1 at the first floor, between x = 2 and 3: inside the first span. */
const interiorPiece = (ids: number[]) => ids.filter((id) => {
  const e = modelStore.elements.get(id)!; const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
  return Math.abs(a.y) < 1e-6 && Math.abs(b.y) < 1e-6 && Math.abs((a.z ?? 0) - 3) < 1e-6 && Math.abs((b.z ?? 0) - 3) < 1e-6
    && Math.abs(Math.min(a.x, b.x) - 2) < 1e-6 && Math.abs(Math.max(a.x, b.x) - 3) < 1e-6;
});

describe('a beam cut by the slab mesh is designed as its span', () => {
  it('the IFC has one beam per span, not one per mesh piece', async () => {
    building(1);
    designRunStore.designFamilies(['column', 'beam']);
    const { exportProjectIfc } = await import('../ifc-export');
    const ifc = exportProjectIfc((k) => k, 'en', 'spans');
    expect((ifc.match(/IFCBEAM\(/g) ?? []).length).toBe(14);
    expect((ifc.match(/IFCCOLUMN\(/g) ?? []).length).toBe(12);
  });

  it('78 pieces in 14 spans, every one verified, and the detailing covers 12 columns and 78 pieces', () => {
    building(1);
    designRunStore.designFamilies(['column', 'beam']);
    const beams = beamIds();
    expect(beams).toHaveLength(78);
    const refused = beams.filter((id) => verificationStore.outcomeFor(id)?.outcome !== 'VERIFIED');
    expect(refused.length).toBe(0);
    expect(columnIds().filter((id) => verificationStore.outcomeFor(id)?.outcome === 'VERIFIED')).toHaveLength(12);
    const s = verificationStore.runSummary!;
    expect({ total: s.total, verified: s.verified, sectionInadequate: s.sectionInadequate, searchExhausted: s.searchExhausted, provisionalRetained: s.provisionalRetained })
      .toEqual({ total: 90, verified: 90, sectionInadequate: 0, searchExhausted: 0, provisionalRetained: 0 });

    // Each piece knows its span: 14 of them, 5 and 6 m, from column to column.
    const spans = new Map<string, number[]>();
    for (const id of beams) {
      const sp = verificationStore.contextFor(id)!.span;
      expect(sp, `piece ${id} has a span`).toBeTruthy();
      spans.set(sp!.key, [...(spans.get(sp!.key) ?? []), id]);
    }
    expect(spans.size).toBe(14);
    expect([...spans.values()].reduce((n, ids) => n + ids.length, 0)).toBe(78);
    for (const ids of spans.values()) {
      const c = verificationStore.contextFor(ids[0]!)!;
      expect([5, 6]).toContain(Math.round(c.L * 1000) / 1000);
      expect(c.span!.elements).toHaveLength(ids.length);
      expect(c.span!.label).toMatch(/^.+-\d+$/);
      expect([c.criticalSections!.start.source, c.criticalSections!.end.source]).toEqual(['column', 'column']);
      // One arrangement for the whole span, held by every piece of it.
      const hashes = new Set(ids.map((id) => rebarHash(modelStore.elements.get(id)!.reinforcement!)));
      expect(hashes.size).toBe(1);
      for (const id of ids) {
        expect(verificationStore.outcomeFor(id)!.limiting).not.toContain('anchorage');
        // The section's checks pass; the display holds a piece short of that while the detailing
        // left a bar of it unanchored or outside the section, or a clash of it the repair ladder
        // could not separate inside the section (`detailing.clash.unresolved`, which replaced the
        // bars the ladder used to push out), and only then.
        const own = verificationStore.providedFor(id)!.overallStatus;
        expect(['ok', 'warn']).toContain(own);
        const held = (modelStore.model.detailing?.assemblies ?? []).some((a) => a.unsupported.some((u) =>
          (u.key === 'detailing.anchorage.unresolved' || u.key === 'detailing.cover.violated' || u.key === 'detailing.clash.unresolved')
          && u.scope.elementIds?.includes(id)));
        // The section's own reading is the LOCAL status; the display is the member's verdict
        // (`member-verdict.ts`), which the 1 m mesh's analysis also holds: the slab sends 58 % of its
        // load straight into the columns (`analysis-validity.ts`), so a piece nothing else holds
        // reads not verified, never ok.
        expect(verificationStore.localStatus(id), `piece ${id}`).toBe(own);
        const notValidated = verificationStore.contextFor(id)?.slabColumnJoint?.verdict === 'pointJoint';
        expect(verificationStore.getDisplayStatus(id), `piece ${id}`).toBe(held ? 'fail' : notValidated ? 'unavailable' : own);
        expect(verificationStore.designMap.get(id)?.utilization).toBeCloseTo(verificationStore.designMap.get(ids[0]!)!.utilization, 9);
      }
    }

    // The frame editor's lines read a span as one member: its representative, its length.
    const lines = modelBeamLines();
    expect(lines.flatMap((l) => l.members).sort((a, b) => a - b)).toEqual([...new Set([...spans.values()].map((ids) => verificationStore.contextFor(ids[0]!)!.span!.representative))].sort((a, b) => a - b));
    expect(new Set(lines.flatMap((l) => l.signature.map((x) => x.split(':')[0])))).toEqual(new Set(['5000', '6000']));

    // The detailing: every column and every piece in an assembly, every piece owning a bar.
    const asm = modelStore.model.detailing?.assemblies ?? [];
    const covered = new Set(asm.flatMap((a) => a.elementIds));
    for (const id of [...columnIds(), ...beams]) expect(covered.has(id), `member ${id} detailed`).toBe(true);
    const owners = new Set(asm.flatMap((a) => a.bars.flatMap((b) => b.ownerElementIds)));
    expect(beams.filter((id) => !owners.has(id))).toEqual([]);
    expect(detailingStore.lastRun!.readiness.prerequisites.map((p) => p.kind)).not.toContain('unverifiedMembers');
    // Each span detailed once, along itself: a bar of one span stays between its columns (and
    // what anchors into them), and no bar is laid twice.
    const spanOf = new Map(beams.map((id) => [id, verificationStore.contextFor(id)!.span!]));
    const seen = new Set<string>();
    for (const bar of asm.flatMap((a) => a.bars)) {
      const key = JSON.stringify(bar.segments.map((g) => [g.start, g.end].map((p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1000)))));
      expect(seen.has(key), `bar ${bar.id} laid twice`).toBe(false);
      seen.add(key);
      const owned = new Set(bar.ownerElementIds.map((id) => spanOf.get(id)).filter((x) => x !== undefined));
      if (owned.size !== 1 || bar.ownerElementIds.some((id) => !spanOf.has(id))) continue;
      const sp = [...owned][0]!;
      const a = modelStore.nodes.get(sp.start)!, b = modelStore.nodes.get(sp.end)!;
      const u = [(b.x - a.x) / sp.length, (b.y - a.y) / sp.length, ((b.z ?? 0) - (a.z ?? 0)) / sp.length];
      for (const g of bar.segments) for (const p of [g.start, g.end]) {
        const x = (p.x - a.x) * u[0]! + (p.y - a.y) * u[1]! + (p.z - (a.z ?? 0)) * u[2]!;
        expect(x, `bar ${bar.id} along span ${sp.label}`).toBeGreaterThan(-0.6);
        expect(x).toBeLessThan(sp.length + 0.6);
      }
    }
  }, 120_000);

  it('a piece drawn the other way reads as the span it belongs to', () => {
    building(1);
    designRunStore.computeDemands();
    const piece = interiorPiece(beamIds())[0]!;
    const forward = verificationStore.contextFor(piece)!;
    const ref = forward.stations!.comboResults.map((c) => c.stations.map((s) => [s.t, s.n, s.vy, s.vz, s.my, s.mz, s.torsion]));

    building(1, { flip: interiorPiece });
    designRunStore.computeDemands();
    const turned = verificationStore.contextFor(piece)!;
    expect(turned.span!.reversed[turned.span!.index]).toBe(true);
    expect(turned.span!.key).toBe(forward.span!.key);
    expect(turned.L).toBeCloseTo(forward.L, 9);
    const got = turned.stations!.comboResults.map((c) => c.stations.map((s) => [s.t, s.n, s.vy, s.vz, s.my, s.mz, s.torsion]));
    expect(got.length).toBe(ref.length);
    got.forEach((combo, k) => combo.forEach((st, i) => st.forEach((v, j) => expect(v).toBeCloseTo(ref[k]![i]![j]!, 6))));
    designRunStore.designFamilies(['column', 'beam']);
    expect(beamIds().filter((id) => verificationStore.outcomeFor(id)?.outcome !== 'VERIFIED')).toEqual([]);
  }, 120_000);

  it('a beam that is one element keeps its own context, exactly as before', () => {
    building(null);
    designRunStore.computeDemands();
    const beams = beamIds();
    expect(beams).toHaveLength(14);
    for (const id of beams) {
      const c = verificationStore.contextFor(id)!;
      expect(c.span).toBeUndefined();
      const e = modelStore.elements.get(id)!; const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      expect(c.L).toBeCloseTo(Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)), 12);
      expect(c.stations!.elementId).toBe(id);
      expect(c.modelData.elements).toBe(modelStore.elements);
      expect(c.criticalSections).toEqual(computeBeamCriticalSections(id, modelStore.nodes as never, modelStore.elements as never, modelStore.sections as never, modelStore.supports as never,
        { b: 0.2, h: 0.5, cover: c.material.cover, stirrupDia: c.material.stirrupDia }));
    }
    designRunStore.designFamilies(['column', 'beam']);
    expect(beams.filter((id) => verificationStore.outcomeFor(id)?.outcome !== 'VERIFIED')).toEqual([]);
  }, 120_000);
});
