/**
 * The coordinated schedule is the assembly, counted — not a second estimate of it.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * There are two quantity paths in this codebase and only one of them is right for a detailed
 * model. `estimateQuantitiesFromVerification` reads an `AsProv` and a stirrup spacing and adds
 * a flat allowance for hooks; it cannot see a crosstie, a joint tie or a real bend, and it is
 * the only thing available for a model that has been checked and never detailed. The
 * coordinated path reads the `BarPath`s: `assignMarks(assembly.bars)` → `buildSchedule(marks)`.
 *
 * Two estimators over one cage disagree by construction, so this asserts the coordinated one
 * is derived rather than estimated — every row traceable to paths, every number recomputable
 * from their geometry.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { buildSchedule, scheduleToAoa } from '../drawings';
import { developedLength } from '../../../codes/cirsoc201/bar-geometry';

let cached: RunDetailingResult | null = null;
function run(): RunDetailingResult {
  if (cached) return cached;
  const solved = solveFixture(qa8 as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  cached = runDetailing({
    contexts: solved.contexts, outcomes: summary.outcomes,
    nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    edition: '2025', maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 1,
  } as never);
  return cached;
}

const STEEL_DENSITY = 7850;

describe('every scheduled row resolves to physical paths', () => {
  it('marks cover the bar list exactly, with nothing invented and nothing dropped', () => {
    for (const a of run().assemblies) {
      const ids = new Set(a.bars.map((b) => b.id));
      const scheduled = a.marks.flatMap((m) => m.barIds);
      expect(new Set(scheduled).size, 'a bar scheduled twice').toBe(scheduled.length);
      for (const id of scheduled) expect(ids.has(id), `${id} is not in the assembly`).toBe(true);
      expect(scheduled.length, 'a bar left off the schedule').toBe(a.bars.length);
    }
  });

  it('quantity is the number of matching fabricated paths', () => {
    for (const a of run().assemblies) {
      for (const m of a.marks) expect(m.quantity, m.mark).toBe(m.barIds.length);
    }
  });

  it('cutting length is developedLength of the actual segments', () => {
    for (const a of run().assemblies) {
      const byId = new Map(a.bars.map((b) => [b.id, b]));
      for (const m of a.marks) {
        for (const id of m.barIds) {
          const bar = byId.get(id)!;
          expect(bar.cuttingLength, id).toBeCloseTo(developedLength(bar.segments), 9);
          // The mark rounds to the ordering precision; it must not drift from the path.
          expect(Math.abs(m.cuttingLength - bar.cuttingLength), `${m.mark}/${id}`)
            .toBeLessThan(0.005 + 1e-9);
        }
      }
    }
  });

  it('total length is quantity × cutting length, and mass follows from diameter', () => {
    for (const a of run().assemblies) {
      const s = buildSchedule(a.marks);
      for (const r of s.rows) {
        expect(r.totalLengthM, r.mark).toBeCloseTo(r.quantity * r.cuttingLengthM, 9);
        const area = Math.PI * (r.diameterMm / 2000) ** 2;
        expect(r.massKg, r.mark).toBeCloseTo(area * r.totalLengthM * STEEL_DENSITY, 6);
      }
      // And the totals are the rows, not a separately accumulated number.
      expect(s.totals.quantity).toBe(s.rows.reduce((n, r) => n + r.quantity, 0));
      expect(s.totals.massKg).toBeCloseTo(s.rows.reduce((n, r) => n + r.massKg, 0), 9);
    }
  });

  it('the transverse cage is IN the schedule, with its role and owners', () => {
    for (const a of run().assemblies) {
      const s = buildSchedule(a.marks);
      const transverse = s.rows.filter((r) => r.role === 'transverse');
      expect(transverse.length, 'no transverse rows').toBeGreaterThan(0);
      const scheduledTransverse = transverse.reduce((n, r) => n + r.quantity, 0);
      const actual = a.bars.filter((b) => b.role === 'transverse').length;
      // The count a fabricator would order equals the count of pieces that exist.
      expect(scheduledTransverse).toBe(actual);
      for (const r of transverse) {
        expect(r.ownerElementIds.length, r.mark).toBeGreaterThan(0);
        expect(r.zoneIds.length, r.mark).toBeGreaterThan(0);
      }
    }
  });

  it('the workbook carries the same numbers, in both languages', () => {
    const a = run().assemblies[0];
    const s = buildSchedule(a.marks);
    const title = {
      title: 'T', codeEdition: 'CIRSOC 201 2025', revision: 1, reviewState: 'COORDINATED',
    } as never as Parameters<typeof scheduleToAoa>[1];
    for (const locale of ['es', 'en']) {
      const aoa = scheduleToAoa(s, title, locale);
      const flat = aoa.map((r) => r.join('|')).join('\n');
      // No exporter recreates the numbers: the mark and its quantity appear as the schedule
      // computed them.
      for (const r of s.rows) {
        expect(flat, `${locale} ${r.mark}`).toContain(`${r.mark}|`);
      }
      const totalRow = aoa.find((r) => String(r[0]).toUpperCase() === 'TOTAL')!;
      expect(totalRow).toBeDefined();
      expect(totalRow).toContain(s.totals.quantity);
    }
  });

  it('no exporter rebuilds stirrup quantities from StirrupZone records', () => {
    // A structural guarantee rather than a counter that happens to agree: the schedule
    // builder takes marks and nothing else, and the marks come from paths.
    const src = buildSchedule.toString() + scheduleToAoa.toString();
    expect(src).not.toMatch(/stirrupZone|StirrupZone|spacing\s*\)/);
  });
});

describe('changing the cage changes the numbers', () => {
  it('dropping one transverse path changes quantity, length and mass', () => {
    const a = run().assemblies[0];
    const before = buildSchedule(a.marks).totals;
    // Remove one piece the way a regeneration would, and re-mark from the paths.
    const victim = a.bars.find((b) => b.role === 'transverse')!;
    const trimmed = a.marks
      .map((m) => ({ ...m, barIds: m.barIds.filter((id) => id !== victim.id) }))
      .map((m) => ({
        ...m, quantity: m.barIds.length,
        massKg: Math.PI * (m.diameterMm / 2000) ** 2 * m.cuttingLength * STEEL_DENSITY
          * m.barIds.length,
      }))
      .filter((m) => m.quantity > 0);
    const after = buildSchedule(trimmed).totals;
    expect(after.quantity).toBe(before.quantity - 1);
    expect(after.totalLengthM).toBeLessThan(before.totalLengthM);
    expect(after.massKg).toBeLessThan(before.massKg);
  });
});
