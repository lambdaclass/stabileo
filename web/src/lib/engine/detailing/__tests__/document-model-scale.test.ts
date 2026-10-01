/**
 * `buildDocumentModel` must scale with the steel, not with the steel squared.
 *
 * ── The click this protects ────────────────────────────────────────
 *
 * "3-D" builds a fresh document inside its own click handler, synchronously, before Svelte
 * gets a frame. So every millisecond in here is a millisecond the button spends looking
 * broken — and on the 7-storey building it was spending 1 900 of them.
 *
 * The cause was a pair of `a.bars.filter((b) => r.barIds.includes(b.id))` calls, one per
 * hash, inside the per-family-record loop. `includes` is a linear scan, so the pair cost
 * 2·|bars|·|barIds| string comparisons for every record. A beam line or a column stack has
 * no family records at all, which is exactly why the whole thing was invisible until the
 * FLOOR design ran and handed the assembly slab and wall families owning thousands of bars.
 *
 * ── Why a ratio and not a millisecond budget ───────────────────────
 *
 * A wall-clock ceiling on a shared runner is a flake generator, and one tuned loose enough
 * never to flake is also loose enough to let a quadratic back in. Doubling the input and
 * asserting on the RATIO is immune to how fast the machine is: linear work doubles, quadratic
 * work quadruples, and the gap between 2 and 4 is wide enough to call without a stopwatch.
 *
 * ── Immune to speed is not immune to CONTENTION (2026-08-27) ───────
 *
 * The ratio cancels a uniformly slower machine. It does not cancel a machine that is slow
 * for only part of the measurement, and that is what a shared 2-core runner does: this
 * failed CI at `small=13.0ms large=52.7ms ratio=3.85` while the same commit measured
 * 1.83–2.34 locally across repeated runs, on code the branch did not touch. Only the large
 * run had to lose the CPU for the ratio to read as quadratic.
 *
 * `Math.min` over repeats is the defence, so it takes more of them: five per size rather
 * than two. Contention now has to hit EVERY sample of the large size and MISS every sample
 * of the small one, instead of winning a single coin flip. The threshold stays at 3 —
 * raising it is the move that would let a real quadratic back in, which is the failure this
 * file exists to prevent.
 *
 * ── Counted, not timed (2026-10-01) ────────────────────────────────
 *
 * It flaked again, at `ratio=3.04` and `3.29` on 4–26 ms measurements, on branches that did
 * not touch this module. So the stopwatch is gone, as the note above said it should go. The
 * defect was never time; it was scans — an `includes` over `barIds` for every bar. The test
 * hands `buildDocumentModel` its `bars` and `barIds` behind a Proxy that counts index reads.
 * Every way of walking an array — `includes`, `find`, `filter`, a spread, `new Set(…)` —
 * reads its elements through that Proxy, so the count is the scanning work itself, with no
 * counter in production code and nothing a busy runner can perturb. Linear: the count
 * doubles with the bars. The old pair of `includes` scans: it quadruples.
 */

import { describe, expect, it } from 'vitest';
import { buildDocumentModel, type DocumentRevision } from '../document-model';
import type { DetailingAssembly } from '../assembly';
import { straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import type { FloorFamilyDesignRecord } from '../family-record';

const REVISION: DocumentRevision = {
  number: 1, at: '2026-08-09T00:00:00Z', author: 'scale',
  detailingRevision: 1, demandRevision: 1,
};

function bar(id: string): BarPath {
  return {
    id, diameterMm: 12, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 4, ownerElementIds: [1], source: 'generated', locked: false,
    layerId: 'e1:bottom:0', refs: [],
  } as unknown as BarPath;
}

/** A slab-shaped assembly: `n` bars, and one family record owning half of them. */
function slabAssembly(n: number): DetailingAssembly {
  const bars = Array.from({ length: n }, (_, i) => bar(`b${i}`));
  const record = {
    family: 'slab',
    ownerId: 'slab-1',
    ownerElementIds: [1],
    barIds: bars.slice(0, Math.floor(n / 2)).map((b) => b.id),
    geometryHash: 'g', inputHash: 'i',
    certificate: {
      verifierId: 'v1',
      revisions: { analysis: 1, demand: 1, provided: 1, entity: 1 },
      geometryHash: 'g', inputHash: 'i',
      reinforcementHash: 'r', finalGeometryHash: 'f',
    },
  } as unknown as FloorFamilyDesignRecord;
  return {
    id: 'slab-level-1', labelKey: 'detailing.assembly.level', labelParams: { level: '1' },
    kind: 'floor', elementIds: [1],
    bars, joints: [], conflicts: [], unsupported: [], marks: [],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 1,
    maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v1', trace: [], assumptions: [] },
    families: [record],
  } as unknown as DetailingAssembly;
}

/** An array whose element reads are counted, however the code walks it. */
function counted<T>(items: T[], tally: { reads: number }): T[] {
  return new Proxy(items, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) tally.reads++;
      return Reflect.get(target, key, receiver);
    },
  });
}

/** Element reads of `bars` and every record's `barIds` while building the document. */
function readsToBuild(n: number): number {
  const tally = { reads: 0 };
  const a = slabAssembly(n) as unknown as { bars: BarPath[]; families: Array<{ barIds: string[] }> };
  a.bars = counted(a.bars, tally);
  for (const r of a.families) r.barIds = counted(r.barIds, tally);
  buildDocumentModel({
    seriesId: 'S', revision: REVISION,
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: [a as unknown as DetailingAssembly], laps: [], certificates: [],
  });
  return tally.reads;
}

describe('buildDocumentModel scales linearly in the number of bars', () => {
  it('doubling the bars does not quadruple the work', () => {
    const small = readsToBuild(2_000);
    const large = readsToBuild(4_000);
    // Linear ⇒ exactly 2, up to a constant. The old `includes` pair ⇒ ≈4. Counted, so the
    // 3 between them is a line no machine's load can move.
    const ratio = large / small;
    expect(small, 'the bars were read at all').toBeGreaterThan(0);
    expect(ratio, `reads: small=${small} large=${large} ratio=${ratio.toFixed(2)}`).toBeLessThan(3);
  });

  it('produces the same certificate freshness the slow form did', () => {
    // The optimisation must not change the ANSWER: the record's certificate hashes are stale
    // against the bars built here, and the document has to keep saying so.
    const doc = buildDocumentModel({
      seriesId: 'S', revision: REVISION,
      regulations: [{ id: 'cirsoc-201', edition: '2025' }],
      assemblies: [slabAssembly(20)], laps: [], certificates: [],
    });
    const entries = doc.assemblies[0].familyCertificates;
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe('slab');
    expect(entries[0].freshness).not.toBe('fresh');
    expect(entries[0].applies).toBe(false);
  });
});
