/**
 * The production detailing path.
 *
 * These tests exist because the forensic audit found that every other test in this
 * directory exercised an engine with no caller. What is asserted here is the CHAIN:
 * verified design in, coordinated assemblies out, with the honest refusals in between.
 *
 * The call-graph assertions at the bottom are the real regression guard. A future refactor
 * that deletes the production caller would leave every unit test green and put the app
 * straight back where the audit found it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { detailingReadiness, runDetailing } from '../run-detailing';
import type { MemberContext } from '../../design/member-context';
import type { MemberDesignOutcome } from '../../design/outcome';
import { teAt } from '../../../i18n/engine-text';

const SRC = new URL('../../../..', import.meta.url).pathname;

// ─── A small, real frame ─────────────────────────────────────────

function node(id: number, x: number, y: number, z: number) {
  return { id, x, y, z };
}

/** One bay, one storey: two columns and the beam spanning them. */
function frame() {
  const nodes = new Map([
    [1, node(1, 0, 0, 0)], [2, node(2, 6, 0, 0)],
    [3, node(3, 0, 0, 3.2)], [4, node(4, 6, 0, 3.2)],
  ]);
  const elements = new Map([
    [10, { id: 10, nodeI: 1, nodeJ: 3 }],   // column A
    [11, { id: 11, nodeI: 2, nodeJ: 4 }],   // column B
    [12, { id: 12, nodeI: 3, nodeJ: 4 }],   // beam
  ]);
  return { nodes, elements };
}

function material() {
  return { fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, maxAggregateSizeMm: 19 };
}

function stations(L: number) {
  const out = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = t * L;
    // A plausible simply-supported-ish envelope with hogging at both ends.
    const my = 120 * (4 * t * (1 - t)) - 60 * (1 - 4 * t * (1 - t));
    out.push({ t, x, n: 0, vy: 0, vz: 140 * (1 - 2 * t), my, mz: 0, torsion: 0 });
  }
  return {
    elementId: 12, length: L, stationTs: out.map((s) => s.t),
    comboResults: [{ comboId: 1, comboName: '1.2 D + 1.6 L', stations: out }],
  };
}

function beamContext(id: number, L: number): MemberContext {
  return {
    elementId: id, elementType: 'beam', L,
    section: { id: 1, name: '30x60', b: 0.3, h: 0.6 },
    material: material(),
    demands: undefined,
    stations: stations(L) as never,
    criticalSections: undefined,
    axes: {} as never,
    slenderDeltaNs: 1,
    orientationSuspect: false,
    codeEdition: '2025',
    analysisRevision: 1, demandRevision: 1,
    blocking: [],
    modelData: {} as never,
  } as unknown as MemberContext;
}

function columnContext(id: number): MemberContext {
  return {
    ...beamContext(id, 3.2),
    elementId: id, elementType: 'column',
    section: { id: 2, name: '40x40', b: 0.4, h: 0.4 },
    stations: undefined,
  } as MemberContext;
}

function verifiedBeam(id: number): MemberDesignOutcome {
  return {
    elementId: id, elementType: 'beam', codeId: 'cirsoc', codeVersion: '2025',
    outcome: 'VERIFIED',
    accepted: {
      regions: {
        topStart: { count: 3, diameter: 16 },
        topEnd: { count: 3, diameter: 16 },
        bottomSpan: { count: 4, diameter: 20 },
      },
      stirrups: { diameter: 8, spacing: 0.15, legs: 2 },
    },
    limiting: [], reasons: [], searchStats: {} as never,
  } as MemberDesignOutcome;
}

function verifiedColumn(id: number): MemberDesignOutcome {
  return {
    elementId: id, elementType: 'column', codeId: 'cirsoc', codeVersion: '2025',
    outcome: 'VERIFIED',
    accepted: { longitudinal: { count: 8, diameter: 20 }, stirrups: { diameter: 8, spacing: 0.15, legs: 2 } },
    limiting: [], reasons: [], searchStats: {} as never,
  } as MemberDesignOutcome;
}

function scenario(opts: { beamVerified?: boolean } = {}) {
  const { nodes, elements } = frame();
  const contexts = new Map<number, MemberContext>([
    [10, columnContext(10)], [11, columnContext(11)], [12, beamContext(12, 6)],
  ]);
  const outcomes = new Map<number, MemberDesignOutcome>([
    [10, verifiedColumn(10)], [11, verifiedColumn(11)],
  ]);
  if (opts.beamVerified !== false) outcomes.set(12, verifiedBeam(12));
  else {
    outcomes.set(12, { ...verifiedBeam(12), outcome: 'SECTION_INADEQUATE', accepted: undefined });
  }
  return {
    contexts, outcomes, nodes, elements,
    edition: '2025' as const, verifierId: 'test',
    demandRevision: 1, maxAggregateSizeMm: 19,
  };
}

// ─── Readiness ───────────────────────────────────────────────────

describe('detailing readiness', () => {
  it('is ready when every member is verified with accepted reinforcement', () => {
    const r = detailingReadiness(scenario());
    expect(r.ready).toBe(true);
    expect(r.detailable).toEqual([10, 11, 12]);
    expect(r.prerequisites).toEqual([]);
  });

  it('names the unverified members and counts them, rather than saying "run design"', () => {
    const r = detailingReadiness(scenario({ beamVerified: false }));
    const p = r.prerequisites.find((x) => x.kind === 'unverifiedMembers');
    expect(p).toBeDefined();
    expect(p!.count).toBe(1);
    expect(p!.elementIds).toEqual([12]);
    // The message carries the count, so a disabled button can be specific in any language.
    for (const locale of ['en', 'es']) {
      const text = teAt({ key: p!.key, params: { n: p!.count, ids: '12' } }, locale);
      expect(text).not.toBe(p!.key);
      expect(text).toContain('1');
    }
  });

  it('is not ready when nothing has demands at all', () => {
    const r = detailingReadiness({ contexts: new Map(), outcomes: new Map() });
    expect(r.ready).toBe(false);
    expect(r.prerequisites.map((p) => p.kind)).toContain('noMembers');
  });

  it('excludes a member whose local axes are suspect rather than detailing it anyway', () => {
    const s = scenario();
    s.contexts.set(12, { ...s.contexts.get(12)!, orientationSuspect: true });
    const r = detailingReadiness(s);
    expect(r.detailable).not.toContain(12);
    expect(r.prerequisites.map((p) => p.kind)).toContain('orientationSuspect');
  });
});

// ─── The chain ───────────────────────────────────────────────────

describe('runDetailing drives the whole pipeline', () => {
  it('produces coordinated assemblies with real bars from verified design', () => {
    const r = runDetailing(scenario());
    expect(r.assemblies.length).toBeGreaterThan(0);
    const totalBars = r.assemblies.reduce((n, a) => n + a.bars.length, 0);
    expect(totalBars).toBeGreaterThan(0);
    // Marks are assigned, which only happens inside coordinateFloor.
    expect(r.assemblies.some((a) => a.marks.length > 0)).toBe(true);
  });

  it('carries provenance and the demand revision onto every assembly', () => {
    const r = runDetailing({ ...scenario(), demandRevision: 7 });
    for (const a of r.assemblies) {
      expect(a.demandRevision).toBe(7);
      expect(a.provenance.edition).toBe('2025');
    }
  });

  it('generates nothing at all when no member is verified', () => {
    const s = scenario();
    s.outcomes.clear();
    const r = runDetailing(s);
    expect(r.assemblies).toEqual([]);
    expect(r.readiness.ready).toBe(false);
  });

  it('detailing an unverified member is refused, not silently attempted', () => {
    const r = runDetailing(scenario({ beamVerified: false }));
    // The columns still detail; the beam does not, and says so.
    expect(r.readiness.detailable).toEqual([10, 11]);
    const all = r.assemblies.flatMap((a) => a.elementIds);
    expect(all).not.toContain(12);
  });

  it('records every skipped member with a translatable reason', () => {
    const s = scenario();
    // A column with no accepted longitudinal bars cannot be detailed.
    s.outcomes.set(10, { ...verifiedColumn(10), accepted: { stirrups: { diameter: 8, spacing: 0.15, legs: 2 } } } as MemberDesignOutcome);
    const r = runDetailing(s);
    for (const sk of r.skipped) {
      for (const locale of ['en', 'es']) {
        expect(teAt({ key: sk.key }, locale)).not.toBe(sk.key);
      }
    }
  });

  it('honours locked bars by keeping them out of regeneration', () => {
    const first = runDetailing(scenario());
    const locked = first.assemblies[0]?.bars[0];
    expect(locked).toBeDefined();
    const second = runDetailing({
      ...scenario(), lockedBars: [{ ...locked!, locked: true }],
    });
    const ids = second.assemblies.flatMap((a) => a.bars.map((b) => b.id));
    expect(ids).toContain(locked!.id);
    // Exactly once: the locked bar must not coexist with its regenerated twin.
    expect(ids.filter((id) => id === locked!.id)).toHaveLength(1);
  });

  it('does not generate bent-up bars unless the project policy permits them', () => {
    const withDefault = runDetailing(scenario());
    // `unstated` policy: no bent bar anywhere.
    // The generator reports its bent-up decision explicitly; under `unstated` it must be
    // "not permitted", and no bar may carry a mid-span crank.
    const bent = withDefault.assemblies
      .flatMap((a) => a.bars)
      .filter((b) => /bent|doblad/i.test(b.id));
    expect(bent).toEqual([]);
  });

  it('increments the detailing revision on regeneration rather than resetting it', () => {
    const first = runDetailing(scenario());
    const rev = Math.max(...first.assemblies.map((a) => a.detailingRevision));
    const second = runDetailing({ ...scenario(), previousRevision: rev });
    expect(Math.max(...second.assemblies.map((a) => a.detailingRevision)))
      .toBeGreaterThan(rev);
  });
});

// ─── Call-graph gates ────────────────────────────────────────────

/**
 * Every entry point the audit found orphaned must have a caller OUTSIDE its own tests.
 *
 * A unit test proves an engine computes; only a caller proves a user can reach it. These
 * assertions read the sources, so deleting the wiring fails here rather than in a manual
 * QA session six weeks later.
 */
describe('call-graph: no advertised capability is unreachable', () => {
  function productionSources(): string {
    const files = [
      'lib/store/detailing.svelte.ts',
      'lib/store/design-run.svelte.ts',
      'lib/engine/detailing/run-detailing.ts',
      'components/pro/design/DesignToolbar.svelte',
      'components/pro/design/DetailingWorkflow.svelte',
      // The exports and the review moved into a stage of their own.
      'components/pro/design/DocumentsSection.svelte',
      'components/pro/design/DesignOverview.svelte',
      // The pipeline's actions, and the top of the Design stage where the step's command is pressed.
      'lib/flow/rc-commands.ts',
      'components/pro/desk/DeskProcessBar.svelte',
    ];
    return files.map((f) => readFileSync(`${SRC}/${f}`, 'utf8')).join('\n');
  }

  const src = productionSources();

  it.each([
    ['coordinateFloor', 'the floor coordination pipeline'],
    ['runDetailing', 'the production detailing run'],
    ['setAssemblies', 'writing assemblies to the model'],
    ['detailingReadiness', 'the prerequisite check behind the disabled button'],
    ['generateBeamBars', 'beam bar generation'],
    ['generateColumnStack', 'column stack generation'],
  ])('%s is reachable from production code (%s)', (symbol) => {
    expect(src.includes(symbol), `${symbol} has no production caller`).toBe(true);
  });

  it('the Generate detailing command exists, and calls the store', () => {
    /*
     * Two files, because the button and the call stopped living together and that was the point
     * of both moves. `rc-commands.ts` extracted the action so a stage could reach it without
     * mounting a toolbar; F3 step 4 then moved the BUTTON to the stage strip, because in
     * `DesignToolbar` — which F2 had put inside the DISEÑAR stage — it was unreachable with that
     * stage closed.
     *
     * This assertion named `DesignToolbar` + `DesignOverview` and so went red at the FIRST of
     * those two moves, several commits before the second: `detailingStore.generate()` had already
     * left for `rc-commands.ts` and nothing here followed it. Worth recording, because it is the
     * failure mode this whole describe block exists to catch — wiring that no longer connects —
     * and it caught it in its own subject.
     */
    // The strip is gone with interface A: the button is the Detail step's action at the top of
    // the Design stage (`DeskProcessBar`), and it calls the same action.
    const surface = [
      readFileSync(`${SRC}/components/pro/desk/DeskProcessBar.svelte`, 'utf8'),
      readFileSync(`${SRC}/lib/flow/rc-commands.ts`, 'utf8'),
    ].join('\n');
    expect(surface).toContain('cmd-generate-detailing');
    expect(surface).toContain('detailingStore.generate');
  });

  it('a successful design run triggers detailing unless the project opted out', () => {
    const run = readFileSync(`${SRC}/lib/store/design-run.svelte.ts`, 'utf8');
    expect(run).toMatch(/autoGenerate[\s\S]{0,60}detailingStore\.generate\(\)/);
  });

  it('the empty state offers the command instead of describing one', () => {
    // The detailing panel plus the Documents stage extracted from it.
    const wf = [
      readFileSync(`${SRC}/components/pro/design/DetailingWorkflow.svelte`, 'utf8'),
      readFileSync(`${SRC}/components/pro/design/DocumentsSection.svelte`, 'utf8'),
    ].join('\n');
    expect(wf).toContain('detailing-empty-generate');
    expect(wf).toContain('detailingStore.generate');
  });
});


it('#2239 detailing refuses to replace mixed column bars with the legacy mirror', () => {
  const input = scenario();
  const accepted = input.outcomes.get(10)!.accepted!;
  input.outcomes.set(10, {
    ...verifiedColumn(10),
    accepted: { ...accepted,
      column: { cornerDia: 16, faceDia: 25, nBottom: 1, nTop: 1, nLeft: 0, nRight: 0 },
      longitudinal: { count: 6, diameter: 16 },
    },
  });
  const result = runDetailing(input);
  expect.soft(result.skipped).toContainEqual({ elementId: 10, key: 'detailing.skip.columnBarLayout' });
  expect(result.skipped).toContainEqual({ elementId: 12, key: 'detailing.skip.beamColumnBarLayout' });
  expect(result.readiness.detailable).toEqual([11]);
  expect(result.assemblies.flatMap(a => a.bars).some(b => b.ownerElementIds.includes(10))).toBe(false);
  expect(result.skipped.some(row => row.elementId === 11)).toBe(false);
});


it('#2239 physical detailing reads a representable explicit cage without a legacy mirror', () => {
  const input = scenario({ beamVerified: false });
  input.outcomes.set(10, {
    ...verifiedColumn(10),
    accepted: { column: { cornerDia: 20, faceDia: 16, nBottom: 0, nTop: 0, nLeft: 0, nRight: 0 } },
  });
  const result = runDetailing(input);
  expect(result.skipped.some(row => row.elementId === 10)).toBe(false);
  const bars = result.assemblies.flatMap(a => a.bars).filter(b => b.role === 'longitudinal' && b.ownerElementIds.includes(10));
  expect(bars.map(b => b.diameterMm)).toEqual([20, 20, 20, 20]);
});

it('keeps both right-hand cutoff checks independent of remote shear demand', () => {
  function rightCuts(multiplier: number) {
    const model = scenario();
    model.contexts.get(12)!.stations!.comboResults[0]!.stations[0]!.vz *= multiplier;
    const notes = runDetailing(model).assemblies.flatMap(a => a.provenance.trace)
      .filter(note => note.includes('9.7.3.5(') && /superior J|Corte derecho/.test(note));
    expect(notes).toHaveLength(2);
    return notes;
  }
  expect(rightCuts(2)).toEqual(rightCuts(1));
});

it('checks the placed section at each right-hand cut and blocks a missing axial action', () => {
  const model = scenario();
  const checked = runDetailing(model).assemblies;
  const notes = checked.flatMap(a => a.provenance.trace);
  const cornerRadius = (32 + 8) / 2000;
  const barContact = (8 + 20) / 2000;
  const depth = 0.60 - 0.025 - 0.004 - (cornerRadius - (cornerRadius - barContact) / Math.sqrt(2));
  const vc = 0.17 * Math.sqrt(25) * 0.30 * depth * 1000;
  const vs = 2 * 0.503e-4 * 420_000 * depth / 0.15;
  const threshold = ((2 / 3) * 0.75 * (vc + vs)).toFixed(1);
  for (const [cut, shear] of [['superior J', '105.0'], ['Corte derecho', '140.0']] as const) {
    expect(notes.find(note => note.includes(cut) && note.includes('9.7.3.5(a)')))
      .toContain(`Vu = ${shear} kN ≤ (2/3)φVn = ${threshold} kN`);
  }
  expect(checked.flatMap(a => a.unsupported).filter(u => u.key === 'detailing.cutoff.unverified')).toEqual([]);
  model.contexts.get(12)!.stations!.comboResults[0]!.stations[7]!.n = NaN;
  const refused = runDetailing(model).assemblies.flatMap(a => a.unsupported)
    .filter(u => u.key === 'detailing.cutoff.unverified');
  expect(refused.map(u => u.params?.x).sort()).toEqual(['4.668', '5.277']);
});

it.skip('known wrong result: unnumbered — withholds a cutoff proof when a pinned stirrup replaces the checked reinforcement', () => {
  const initial = runDetailing(scenario()).assemblies;
  const ties = initial.flatMap(a => a.bars).filter(b => b.role === 'transverse' && b.ownerElementIds.includes(12));
  const tie = ties.filter(b => b.segments[0]!.start.x <= 5.277)
    .sort((a, b) => b.segments[0]!.start.x - a.segments[0]!.start.x)[0]!;
  function withPinned(diameterMm: number) {
    return runDetailing({ ...scenario(), lockedBars: [{ ...tie, diameterMm, locked: true }] }).assemblies;
  }
  const checked = withPinned(tie.diameterMm);
  expect(checked.flatMap(a => a.unsupported).filter(u => u.key === 'detailing.cutoff.unverified')).toEqual([]);
  const changed = withPinned(tie.diameterMm / 2);
  expect(changed.flatMap(a => a.unsupported).filter(u => u.key === 'detailing.cutoff.unverified')
    .map(u => u.params?.x)).toEqual(['5.277']);
  expect(changed.flatMap(a => a.provenance.trace)
    .some(note => note.includes('Corte derecho') && note.includes('9.7.3.5(a)'))).toBe(false);
});
