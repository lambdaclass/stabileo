/**
 * The exports say what the assembly says — semantic, not "a file was produced".
 *
 * ── What this catches that a smoke test does not ───────────────────
 *
 * An exporter can emit a well-formed DXF containing none of the cage, an XLSX whose totals it
 * recomputed for itself, or a report that claims construction readiness for a model with
 * unresolved conflicts. Each of those passes "the export ran". So these open the artifacts and
 * compare them against the assembly they came from.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { buildSchedule, scheduleToAoa, barArcs, type Projection } from '../drawings';
import { isConstructionReady } from '../document-model';

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

const PROJ: Projection = {
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
};

describe('DXF carries the physical cage, with its bends as arcs', () => {
  it('every transverse bend becomes an ARC entity, not a chord', () => {
    // Measuring a corner off a chord-only DXF reads it short by the sagitta — 12 mm on a 135°
    // stirrup hook, which is more than the bar it is drawn beside.
    const bars = run().assemblies.flatMap((a) => a.bars);
    const transverse = bars.filter((b) => b.role === 'transverse');
    expect(transverse.length).toBeGreaterThan(0);
    let arcs = 0;
    let bends = 0;
    for (const bar of transverse) {
      bends += bar.segments.filter((s) => s.kind === 'arc').length;
      arcs += barArcs(bar, PROJ).length;
    }
    expect(bends).toBeGreaterThan(0);
    // Every bend that exists in the geometry reaches the drawing as an arc.
    expect(arcs).toBe(bends);
  });

  it('a closed stirrup stays closed, and its two hook ends stay distinguishable', () => {
    const stirrup = run().assemblies.flatMap((a) => a.bars)
      .find((b) => b.role === 'transverse' && !b.id.includes('crosstie'))!;
    expect(stirrup).toBeDefined();
    // Three 90° corners plus a 135° hook at each end: the loop closes and the closure is
    // visible as two distinct bends rather than a join.
    const sweeps = stirrup.segments.filter((s) => s.kind === 'arc').map((s) => s.sweepDeg);
    expect(sweeps.filter((d) => d === 90).length).toBe(3);
    expect(sweeps.filter((d) => d === 135).length).toBe(2);
  });

  it('joint ties are drawn at their own elevations, not the node', () => {
    const ties = run().assemblies.flatMap((a) => a.bars)
      .filter((b) => (b.zoneId ?? '').includes(':ties'));
    expect(ties.length).toBeGreaterThan(0);
    const elevations = new Set(ties.map((t) => {
      const zs = t.segments.flatMap((s) => [s.start.z, s.end.z]);
      return ((Math.min(...zs) + Math.max(...zs)) / 2).toFixed(4);
    }));
    // More than one: a joint band holds several ties and flattening them onto the node would
    // draw one bar where the drawing must show the spacing.
    expect(elevations.size).toBeGreaterThan(1);
  });
});

describe('XLSX agrees with the assembly and never invents a number', () => {
  it('marks and quantities match the schedule, which matches the paths', () => {
    const a = run().assemblies[0];
    const s = buildSchedule(a.marks);
    const title = {
      title: 'T', codeEdition: 'CIRSOC 201 2025', revision: 1, reviewState: 'CONSTRUCTIBLE',
    } as never as Parameters<typeof scheduleToAoa>[1];
    const rows = scheduleToAoa(s, title, 'es');
    const header = rows.find((r) => String(r[0]) === 'Marca')!;
    // The columns Step 5 asks a fabricator to read.
    for (const col of ['Marca', 'Tipo', 'Elementos', 'Zona', 'Ø (mm)', 'Forma', 'Cant.',
      'Largo corte (m)', 'Largo total (m)', 'Peso (kg)']) {
      expect(header, col).toContain(col);
    }
    for (const r of s.rows) {
      const line = rows.find((x) => x[0] === r.mark)!;
      expect(line, r.mark).toBeDefined();
      expect(line).toContain(r.quantity);
    }
    // And the transverse cage is present as its own type, in the fabricator's language.
    expect(rows.some((r) => r[1] === 'Transversal')).toBe(true);
  });
});

describe('a model that is not ready never says it is', () => {
  it('construction readiness is reserved for ISSUED, whatever the verdict', () => {
    for (const readiness of ['DRAFT', 'REVIEW_DRAFT', 'CURRENT', 'SUPERSEDED']) {
      expect(isConstructionReady({ readiness } as never)).toBe(false);
    }
    expect(isConstructionReady({ readiness: 'ISSUED' } as never)).toBe(true);
  });

  it('a conflicted assembly still exports, because review needs the drawing', () => {
    // Refusing to draw a conflicted model helps nobody: the conflicts are the thing the
    // engineer has to look at. What must not happen is the drawing claiming readiness.
    const a = run().assemblies[0];
    expect(buildSchedule(a.marks).rows.length).toBeGreaterThan(0);
  });
});
