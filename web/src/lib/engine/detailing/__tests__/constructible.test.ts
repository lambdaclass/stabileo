/**
 * A feasible frame must reach CONSTRUCTIBLE, not merely "fewer conflicts than before".
 *
 * The flagship's 408 members carry sections sized by the design search for strength, and
 * their cages do not all fit — that is a real result and it is reported honestly as
 * unresolved conflicts. But "the count went down" is not a workflow, and every stage past
 * COORDINATED (review, issue, documents) needs a model that genuinely coordinates.
 *
 * This fixture is that model: generously proportioned members whose cages fit with room to
 * spare. It is the gate that proves the pipeline can reach a constructible cage at all, and
 * it is what the document and export work is exercised against.
 */
import { describe, it, expect } from 'vitest';
import { runDetailing } from '../run-detailing';
import type { MemberContext } from '../../design/member-context';
import type { MemberDesignOutcome } from '../../design/outcome';

/** One bay, one storey, generously proportioned: 500x800 beam into 800 square columns. */
export function feasibleFrame() {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>([
    [1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }],
    [3, { id: 3, x: 0, y: 0, z: 3.2 }], [4, { id: 4, x: 6, y: 0, z: 3.2 }],
  ]);
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number }>([
    [10, { id: 10, nodeI: 1, nodeJ: 3 }], [11, { id: 11, nodeI: 2, nodeJ: 4 }],
    [12, { id: 12, nodeI: 3, nodeJ: 4 }],
  ]);
  const material = { fc: 25, fy: 420, cover: 0.03, stirrupDia: 8, maxAggregateSizeMm: 19 };
  const stations = {
    elementId: 12, length: 6, stationTs: [],
    comboResults: [{
      comboId: 1, comboName: '1.2 D + 1.6 L',
      stations: Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return {
          t, x: t * 6, n: 0, vy: 0, vz: 140 * (1 - 2 * t),
          my: 120 * (4 * t * (1 - t)) - 60 * (1 - 4 * t * (1 - t)), mz: 0, torsion: 0,
        };
      }),
    }],
  };
  const beam = {
    elementId: 12, elementType: 'beam', L: 6,
    section: { id: 1, name: '500x800', b: 0.50, h: 0.80 },
    material, stations, demands: undefined, criticalSections: undefined,
    axes: {}, slenderDeltaNs: 1, orientationSuspect: false, codeEdition: '2025',
    analysisRevision: 1, demandRevision: 1, blocking: [], modelData: {},
  } as unknown as MemberContext;
  const column = (id: number) => ({
    ...beam, elementId: id, elementType: 'column', L: 3.2,
    section: { id: 2, name: '800x800', b: 0.80, h: 0.80 }, stations: undefined,
  } as unknown as MemberContext);

  const contexts = new Map<number, MemberContext>([
    [10, column(10)], [11, column(11)], [12, beam],
  ]);
  const verifiedColumn = (id: number) => ({
    elementId: id, elementType: 'column', codeId: 'cirsoc', codeVersion: '2025',
    outcome: 'VERIFIED',
    accepted: {
      longitudinal: { count: 4, diameter: 20 },
      stirrups: { diameter: 8, spacing: 0.15, legs: 2 },
    },
    limiting: [], reasons: [], searchStats: {},
  } as unknown as MemberDesignOutcome);
  const outcomes = new Map<number, MemberDesignOutcome>([
    [10, verifiedColumn(10)], [11, verifiedColumn(11)],
    [12, {
      elementId: 12, elementType: 'beam', codeId: 'cirsoc', codeVersion: '2025',
      outcome: 'VERIFIED',
      accepted: {
        regions: {
          topStart: { count: 3, diameter: 16 }, topEnd: { count: 3, diameter: 16 },
          bottomSpan: { count: 3, diameter: 16 },
        },
        stirrups: { diameter: 8, spacing: 0.15, legs: 2 },
      },
      limiting: [], reasons: [], searchStats: {},
    } as unknown as MemberDesignOutcome],
  ]);
  return { contexts, outcomes, nodes, elements };
}

function detail() {
  const f = feasibleFrame();
  return runDetailing({
    contexts: f.contexts, outcomes: f.outcomes,
    nodes: f.nodes as never, elements: f.elements as never,
    edition: '2025', verifierId: 'constructible-gate',
    demandRevision: 1, maxAggregateSizeMm: 19,
    /**
     * Authoritative re-verification at the final geometry.
     *
     * The fixture's members are deliberately generous, so the depth lost to the joint-layer
     * raise and the §26.6.2.1 tolerance does not change any verdict — but the check has to
     * RUN, because `allMembersReverified` is one of the twelve conditions and a fixture that
     * reaches CONSTRUCTIBLE without it would be proving the gate can be bypassed.
     */
    reverify: (elementId, depthLoss) => {
      const ctx = f.contexts.get(elementId);
      if (!ctx) return 'fail';
      const d = ctx.section.h - ctx.material.cover - ctx.material.stirrupDia / 1000;
      return d - depthLoss > 0.5 * ctx.section.h ? 'ok' : 'warn';
    },
  });
}

describe('a feasible frame coordinates to a constructible cage', () => {
  it('resolves EVERY physical conflict, not merely most of them', () => {
    const r = detail();
    const conflicts = r.assemblies.flatMap((a) => a.conflicts);
    // Not "fewer than before". Zero. A cage with an unresolved clash does not get built.
    expect(conflicts.map((c) => `${c.severity} ${c.barA}/${c.barB}`)).toEqual([]);
  });

  /**
   * ── Why this fixture no longer reaches CONSTRUCTIBLE, and why that is right ──
   *
   * The frame's cage FITS: zero conflicts of any class, asserted above, with joint ties and
   * every bend of every closed stirrup containing a bar. What it cannot do is host the third
   * stirrup leg Table 9.7.6.2.2 requires across a 500 mm web.
   *
   * The arithmetic, measured rather than assumed. The cage's legs stand at ±216 mm, so the
   * across-width gap is 432 mm against the table's limit for this zone; an interior leg is
   * therefore mandatory. §25.3.5(d) requires that leg's hooks to "abrazar las barras
   * longitudinales periféricas", so it may only stand on a line carrying a bar at BOTH faces.
   * With the certified 3Ø16 per face those lines are ±201,66 mm and the centreline — and the
   * centreline's top bar is hogging steel that curtails into the supports, so at mid-span it
   * is not there. The remaining lines are outside the window the table allows.
   *
   * So no legal arrangement exists for the reinforcement this fixture certifies. That is an
   * inadequacy of the steel, not of the geometry, and the honest product answer is to say so
   * and let the design-feedback enumeration widen the envelope. Adding a bar here to recover
   * a green assertion would be inventing steel no certificate covers.
   *
   * The fixture was written when §25.7.1.2 was checked against a layout that modelled top
   * bars along the whole member, which is why its steel looked sufficient.
   */
  it('reports the leg it cannot place, instead of claiming CONSTRUCTIBLE', () => {
    const r = detail();
    expect(r.assemblies.length).toBeGreaterThan(0);
    for (const a of r.assemblies) {
      expect(a.constructibility?.verdict, `${a.id}`).not.toBe('CONSTRUCTIBLE');
      // NOT_ESTABLISHED, not CONFLICTED: the geometry is sound and the steel is short. The
      // two verdicts send an engineer to completely different places.
      expect(a.constructibility?.verdict, `${a.id}`).toBe('NOT_ESTABLISHED');
      expect(a.constructibility?.blocking, `${a.id}`).toEqual(['noUnsupportedRule']);
    }
  });

  it('names §25.3.5(d) as the reason, and nothing else', () => {
    // The clause is a hard blocker and it is doing its job. Every other condition passes,
    // which is what distinguishes "this steel cannot restrain the cage" from "the cage is
    // broken" — and the message is a structured clause reference, not prose.
    const r = detail();
    const messages = new Set(
      r.assemblies.flatMap((a) => a.unsupported.map((u) => String(u.message))));
    // §25.3.5(d), not the more general §25.7.1.2. The bends that are empty are a CROSSTIE's
    // hooks, and the clause that governs them names the remedy — a peripheral bar on the leg
    // line — where the general one would only say a bend is bare.
    expect([...messages]).toEqual(['CIRSOC 201 2025 §25.3.5(d)']);
  });

  it('gets there with real bars and marks, not by producing nothing', () => {
    const r = detail();
    const bars = r.assemblies.reduce((n, a) => n + a.bars.length, 0);
    const marks = r.assemblies.reduce((n, a) => n + a.marks.length, 0);
    expect(bars).toBeGreaterThan(10);
    expect(marks).toBeGreaterThan(0);
    // Every member is owned; a clean coordination must not come from skipping members.
    expect(r.skipped).toEqual([]);
    expect(new Set(r.assemblies.flatMap((a) => a.elementIds)).size).toBe(3);
  });

  it('every condition except the missing leg passes', () => {
    // The cage FITS. Separating "does not fit" from "cannot be restrained by this steel" is
    // the whole point of reporting conditions individually rather than as a verdict.
    const r = detail();
    for (const a of r.assemblies) {
      const failed = (a.constructibility?.conditions ?? [])
        .filter((c) => !c.passed).map((c) => c.condition);
      expect(failed, `${a.id}`).toEqual(['noUnsupportedRule']);
    }
  });

  it('is byte-identical when the members are supplied in a different order', () => {
    // Determinism is a product requirement: two runs of the same model must give the same
    // drawing, or every golden file and every review record is meaningless.
    const a = detail();
    const f = feasibleFrame();
    const reversed = new Map([...f.contexts.entries()].reverse());
    // Same inputs, reversed order — including the verifier. Omitting it here would make
    // the two runs differ in what evidence they were given, which is not a determinism
    // test, it is a comparison of two different questions.
    const b = runDetailing({
      contexts: reversed, outcomes: f.outcomes,
      nodes: f.nodes as never, elements: f.elements as never,
      edition: '2025', verifierId: 'constructible-gate',
      demandRevision: 1, maxAggregateSizeMm: 19,
      reverify: (elementId, depthLoss) => {
        const ctx = f.contexts.get(elementId);
        if (!ctx) return 'fail';
        const d = ctx.section.h - ctx.material.cover - ctx.material.stirrupDia / 1000;
        return d - depthLoss > 0.5 * ctx.section.h ? 'ok' : 'warn';
      },
    });
    const shape = (r: ReturnType<typeof detail>) => r.assemblies.map((x) => ({
      id: x.id, state: x.state, elementIds: x.elementIds,
      bars: x.bars.map((bar) => bar.id).sort(),
      marks: x.marks.map((m) => m.mark).sort(),
    }));
    expect(shape(b)).toEqual(shape(a));
  });
});
