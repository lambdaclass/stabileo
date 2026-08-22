import { assessConstructibility } from '../constructibility';
import { describe, it, expect } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import {
  DETAILING_SCHEMA_VERSION, applyReview, assignMarks, emptyDetailingStore,
  evaluateState, invalidateAffected, isDemandStale, isReviewStale, lockedBars,
  migrateDetailingStore, reviewRank, shapeCode,
  type DetailingAssembly, type ReviewRecord, type UnsupportedCondition,
} from '../assembly';
import {
  buildStraightBarWithHooks, straightSegment, type BarPath,
} from '../../../codes/cirsoc201/bar-geometry';
import type { BarConflict } from '../collision';
import {
  countsAsVerified, deriveMaturity, isProducible, maturityLabelKey, worstMaturity,
} from '../../../codes/maturity';
import { clause } from '../../../codes/regulation';
import { noFloorFamilies } from '../family-record';

const X = { x: 1, y: 0, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

function bar(id: string, len = 5, dia = 20, locked = false): BarPath {
  return {
    id, diameterMm: dia, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: len, y: 0, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: len, ownerElementIds: [1], source: 'generated', locked, refs: [],
  };
}

function conflict(severity: BarConflict['severity'] = 'clearance'): BarConflict {
  return {
    severity, barA: 'a', barB: 'b', at: { x: 0, y: 0, z: 0 },
    clearance: 0.01, required: 0.025, shortfall: 0.015, elementIds: [1],
  };
}

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  return {
    id: 'L1-B', kind: 'beamLine', label: 'Eje B — Nivel +3,40',
    elementIds: [1, 2, 3], bars: [bar('b1')], marks: [], joints: [],
    conflicts: [], unsupported: [], detailingRevision: 1, demandRevision: 7,
    state: 'CONSTRUCTIBLE', maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v', trace: [], assumptions: [] },
    ...over,
  };
}

// ─── Maturity ────────────────────────────────────────────────────

describe('validation maturity', () => {
  const refs = [clause('cirsoc-201', '2025', '15.4')];

  it('is UNSUPPORTED when nothing is implemented', () => {
    const m = deriveMaturity({ implemented: false, refs, benchmarks: [] });
    expect(m.maturity).toBe('UNSUPPORTED');
    expect(m.unsupportedReason).toBeTruthy();
  });

  it('is UNSUPPORTED when an implementation cites no clause', () => {
    // An implementation with no clause behind it is not a code check.
    expect(deriveMaturity({ implemented: true, refs: [], benchmarks: [] }).maturity)
      .toBe('UNSUPPORTED');
  });

  it('is PROVISIONAL when clause-grounded but only internally tested', () => {
    // The exact case that was previously mislabelled UNSUPPORTED.
    const m = deriveMaturity({
      implemented: true, refs,
      benchmarks: [
        { kind: 'handFixture', id: 'hand/joint-interior', source: 'hand calc from §15.4' },
        { kind: 'property', id: 'equilibrium', source: 'residual < 2 %' },
      ],
    });
    expect(m.maturity).toBe('IMPLEMENTED_PROVISIONAL');
    expect(m.promotionPath?.key).toBe('maturity.promotion.needsExternalBenchmark');
    expect(teAt(m.promotionPath!, 'es')).toMatch(/ejemplo resuelto externo/);
    expect(teAt(m.promotionPath!, 'en')).toMatch(/external worked example/);
  });

  it('reaches VALIDATED only with an external benchmark', () => {
    const internalOnly = deriveMaturity({
      implemented: true, refs,
      benchmarks: [{ kind: 'crossCheck', id: 'x', source: 'second implementation' }],
    });
    expect(internalOnly.maturity).toBe('IMPLEMENTED_PROVISIONAL');

    const withExternal = deriveMaturity({
      implemented: true, refs,
      benchmarks: [{ kind: 'external', id: 'Ej. 22.6-1', source: 'worked example', tolerance: 0.01 }],
    });
    expect(withExternal.maturity).toBe('VALIDATED');
    expect(withExternal.promotionPath).toBeUndefined();
  });

  it('lets only VALIDATED count toward verified status, but PROVISIONAL still produce output', () => {
    expect(countsAsVerified('VALIDATED')).toBe(true);
    expect(countsAsVerified('IMPLEMENTED_PROVISIONAL')).toBe(false);
    // Withholding provisional output would leave the engineer nothing to review.
    expect(isProducible('IMPLEMENTED_PROVISIONAL')).toBe(true);
    expect(isProducible('UNSUPPORTED')).toBe(false);
  });

  it('takes the worst maturity across a set', () => {
    expect(worstMaturity([])).toBe('VALIDATED');
    expect(worstMaturity(['VALIDATED', 'VALIDATED'])).toBe('VALIDATED');
    expect(worstMaturity(['VALIDATED', 'IMPLEMENTED_PROVISIONAL'])).toBe('IMPLEMENTED_PROVISIONAL');
    expect(worstMaturity(['IMPLEMENTED_PROVISIONAL', 'UNSUPPORTED'])).toBe('UNSUPPORTED');
  });

  it('has a label key for every state', () => {
    for (const m of ['VALIDATED', 'IMPLEMENTED_PROVISIONAL', 'UNSUPPORTED'] as const) {
      expect(maturityLabelKey(m)).toMatch(/^maturity\./);
    }
  });
});

// ─── Marks ───────────────────────────────────────────────────────

describe('bar marks', () => {
  it('groups identical bars into one mark', () => {
    const marks = assignMarks([bar('a'), bar('b'), bar('c')]);
    expect(marks).toHaveLength(1);
    expect(marks[0].quantity).toBe(3);
    expect(marks[0].barIds).toEqual(['a', 'b', 'c']);
  });

  it('separates bars of different diameter, length or shape', () => {
    const hooked = buildStraightBarWithHooks({
      id: 'h', diameterMm: 20, role: 'longitudinal',
      start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 },
      axis: X, hookNormal: Z, endHook: 90, ownerElementIds: [1],
    });
    // Same diameter and nearly the same length, but a different shape: a bundle with
    // both in it would arrive on site with the wrong bars.
    const marks = assignMarks([bar('a', 5, 20), bar('b', 6, 20), bar('c', 5, 25), hooked]);
    expect(marks).toHaveLength(4);
  });

  it('is deterministic and independent of input order', () => {
    const bars = [bar('c', 6, 25), bar('a', 5, 20), bar('b', 5, 20)];
    const m1 = assignMarks(bars);
    const m2 = assignMarks([...bars].reverse());
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
    // Sorted by diameter then length: the Ø20 pair is B1, the Ø25 is B2.
    expect(m1[0].diameterMm).toBe(20);
    expect(m1[0].mark).toBe('B1');
  });

  it('computes mass for the whole mark, not one bar', () => {
    const marks = assignMarks([bar('a'), bar('b')]);
    const oneBar = Math.PI * 0.01 ** 2 * 5 * 7850;
    expect(marks[0].massKg).toBeCloseTo(2 * oneBar, 6);
  });

  it('describes shapes from the actual geometry', () => {
    expect(shapeCode(bar('a'))).toBe('straight');
    const oneHook = buildStraightBarWithHooks({
      id: 'h', diameterMm: 16, role: 'longitudinal',
      start: { x: 0, y: 0, z: 0 }, end: { x: 3, y: 0, z: 0 },
      axis: X, hookNormal: Z, endHook: 90, ownerElementIds: [1],
    });
    expect(shapeCode(oneHook)).toBe('LH90');
    const twoHooks = buildStraightBarWithHooks({
      id: 'u', diameterMm: 16, role: 'longitudinal',
      start: { x: 0, y: 0, z: 0 }, end: { x: 3, y: 0, z: 0 },
      axis: X, hookNormal: Z, startHook: 180, endHook: 180, ownerElementIds: [1],
    });
    expect(shapeCode(twoHooks)).toBe('UH180H180');
  });
});

// ─── State machine ───────────────────────────────────────────────

describe('earned review state', () => {
  /**
   * A fully evidenced assembly.
   *
   * `constructibility` is not decoration. The top rung of the ladder used to be awarded
   * whenever the conflict list happened to be empty, which is how a search result with
   * 7,246 interpenetrating bars came to be reported as buildable. An empty conflict list
   * is one of twelve conditions; without the gate the state caps at COORDINATED.
   */
  const base = {
    bars: [bar('b1')], conflicts: [], unsupported: [] as UnsupportedCondition[],
    membersVerified: true, coordinated: true,
    constructibility: assessConstructibility({
      completeEnvelope: true, searchTruncated: false,
      applicableMembers: 1, assignedMembers: 1,
      selectedTransitions: 0, materialisedTransitions: 0, unmaterialisedTransitions: 0,
      requiredTransversePieces: 0, materialisedTransversePieces: 0,
      prohibitedConflicts: 0, reverifiedMembers: 1, certificateHashMatches: 1,
      spacingNotCodeLegal: 0, spacingNotPlacementRobust: 0,
      unsupportedRules: 0, staleAssemblies: 0,
      // A beam line: no panels, walls or footings. Measured, not omitted.
      familyRequirements: noFloorFamilies(),
    }),
  };

  it('an ungated assembly cannot reach CONSTRUCTIBLE however clean it looks', () => {
    const { constructibility, ...ungated } = base;
    expect(evaluateState(ungated).state).toBe('COORDINATED');
  });

  it('stays DRAFT while any member fails its own checks', () => {
    expect(evaluateState({ ...base, membersVerified: false }).state).toBe('DRAFT');
  });

  it('reaches VERIFIED but not COORDINATED without coordination', () => {
    expect(evaluateState({ ...base, coordinated: false }).state).toBe('VERIFIED');
  });

  it('reaches CONSTRUCTIBLE when bars exist and fit', () => {
    const r = evaluateState(base);
    expect(r.state).toBe('CONSTRUCTIBLE');
    expect(r.blockers).toEqual([]);
  });

  it('stops at COORDINATED while a real conflict remains', () => {
    const r = evaluateState({ ...base, conflicts: [conflict('overlap')] });
    expect(r.state).toBe('COORDINATED');
    expect(r.blockers.join(' ')).toMatch(/conflicto/);
  });

  it('tolerates a marginal conflict', () => {
    expect(evaluateState({ ...base, conflicts: [conflict('marginal')] }).state)
      .toBe('CONSTRUCTIBLE');
  });

  it('blocks CONSTRUCTIBLE on an unsupported condition even when the bars fit', () => {
    // A cage that fits but was never checked for something is not constructible,
    // it is unchecked.
    const r = evaluateState({
      ...base,
      unsupported: [{ key: 'beamTorsion', scope: {}, message: 'torsión no verificada', refs: [] }],
    });
    expect(r.state).toBe('COORDINATED');
    expect(r.blockers.join(' ')).toMatch(/beamTorsion/);
  });

  it('cannot award REVIEWED or ISSUED', () => {
    // A function that could would be the software signing off on itself.
    for (const c of [base, { ...base, conflicts: [conflict()] }]) {
      expect(reviewRank(evaluateState(c).state)).toBeLessThan(reviewRank('REVIEWED'));
    }
  });
});

describe('engineer review record', () => {
  const record: Omit<ReviewRecord, 'revision'> = {
    engineer: 'Ing. R. Pérez', at: '2026-07-26T10:00:00Z', state: 'REVIEWED',
    provisionalAcknowledged: false, acknowledgedProvisional: [],
  };

  it('records a review of a specific revision', () => {
    const r = applyReview(assembly(), record);
    expect(r.ok).toBe(true);
    expect(r.assembly?.state).toBe('REVIEWED');
    expect(r.assembly?.review?.revision).toBe(1);
    expect(r.assembly?.review?.engineer).toBe('Ing. R. Pérez');
  });

  it('refuses below CONSTRUCTIBLE', () => {
    const r = applyReview(assembly({ state: 'COORDINATED' }), record);
    expect(r.ok).toBe(false);
    // A KEY and its parameter, not a sentence. This assertion used to match Spanish prose, and
    // it passed because the refusal really was a Spanish string built inside a pure module —
    // so an English-locale user was told in Spanish why their review was refused. The state is
    // a parameter, because the reader needs to know which state blocked them.
    expect(r.reason?.key).toBe('detailing.review.notConstructible');
    expect(r.reason?.params).toMatchObject({ state: 'COORDINATED' });
  });

  it('refuses without a named engineer', () => {
    expect(applyReview(assembly(), { ...record, engineer: '  ' }).ok).toBe(false);
  });

  it('refuses while a provisional calculation is unacknowledged', () => {
    // A provisional result may be accepted, but only deliberately.
    const r = applyReview(assembly(), record, ['jointShear']);
    expect(r.ok).toBe(false);
    expect(r.reason?.key).toBe('detailing.review.provisionalOutstanding');
    // The outstanding keys travel with the message: a refusal that does not name WHICH
    // provisional calculation is unacknowledged cannot be acted on.
    expect(r.reason?.params).toMatchObject({ keys: 'jointShear' });
  });

  it('accepts when the reviewer explicitly acknowledges each provisional item', () => {
    const r = applyReview(assembly(), {
      ...record, provisionalAcknowledged: true, acknowledgedProvisional: ['jointShear'],
    }, ['jointShear']);
    expect(r.ok).toBe(true);
    expect(r.assembly?.review?.acknowledgedProvisional).toEqual(['jointShear']);
  });

  it('marks a review stale once the assembly moves on', () => {
    const reviewed = applyReview(assembly(), record).assembly!;
    expect(isReviewStale(reviewed)).toBe(false);
    expect(isReviewStale({ ...reviewed, detailingRevision: 2 })).toBe(true);
  });

  it('detects demands that have moved under a generated assembly', () => {
    expect(isDemandStale(assembly({ demandRevision: 7 }), 7)).toBe(false);
    expect(isDemandStale(assembly({ demandRevision: 7 }), 8)).toBe(true);
  });
});

// ─── Persistence ─────────────────────────────────────────────────

describe('detailing persistence', () => {
  it('round-trips through JSON', () => {
    const store = { version: DETAILING_SCHEMA_VERSION, assemblies: [assembly()] };
    const { store: back, notices } = migrateDetailingStore(JSON.parse(JSON.stringify(store)));
    expect(back.assemblies[0].id).toBe('L1-B');
    expect(back.assemblies[0].elementIds).toEqual([1, 2, 3]);
    expect(back.assemblies[0].state).toBe('CONSTRUCTIBLE');
    expect(notices).toEqual([]);
  });

  it('treats an absent store as empty without complaint', () => {
    expect(migrateDetailingStore(undefined).store).toEqual(emptyDetailingStore());
    expect(migrateDetailingStore(undefined).notices).toEqual([]);
  });

  it('degrades a corrupt payload to empty and SAYS so', () => {
    // Losing the detailing is recoverable by regenerating; failing to open the project
    // is not. But the loss must not be silent.
    const r = migrateDetailingStore('not an object');
    expect(r.store.assemblies).toEqual([]);
    expect(r.notices[0].key).toBe('detailing.migration.corrupt');
  });

  it('drops individual malformed assemblies and reports the count', () => {
    const r = migrateDetailingStore({
      version: 1,
      assemblies: [assembly(), null, { id: 'x' }, { elementIds: [1] }],
    });
    expect(r.store.assemblies).toHaveLength(1);
    expect(r.notices.find((n) => n.key === 'detailing.migration.dropped')?.params?.count).toBe(3);
  });

  it('rejects a bogus review state rather than trusting it', () => {
    const r = migrateDetailingStore({
      version: 1, assemblies: [{ ...assembly(), state: 'ISSUED_BY_ROBOT' }],
    });
    expect(r.store.assemblies[0].state).toBe('DRAFT');
  });

  /**
   * The two member-level statements survive a restore.
   *
   * They did not. This function rebuilds every assembly field by field, and both were missing
   * from that list — so a project that came back from a `.ded`, an autosave, an undo or a tab
   * switch kept `bar.provisional` on its bars (because `bars` is carried through whole) and lost
   * the assembly's own `provisionalMembers`. The workspace banner, the sheet note and the report
   * section all read the member-level field: all three went quiet while the bars stayed violet.
   *
   * Found by `e2e/ded-roundtrip.spec.ts`, which saves the designed 7-storey building to a file
   * and reopens it on a page that has never seen it.
   */
  it('carries the provisional and torsion member lists through a restore', () => {
    const source = {
      ...assembly(),
      provisionalMembers: [88, 151, 153],
      torsionUnevaluatedMembers: [12],
    };
    const r = migrateDetailingStore({
      version: DETAILING_SCHEMA_VERSION,
      assemblies: [JSON.parse(JSON.stringify(source))],
    });
    expect(r.store.assemblies[0].provisionalMembers).toEqual([88, 151, 153]);
    expect(r.store.assemblies[0].torsionUnevaluatedMembers).toEqual([12]);
  });

  it('leaves both absent when the stored assembly never had them', () => {
    // Absent is not the same as empty, and neither is invented: an assembly with no proposal
    // must not come back claiming an empty list it never carried, because "we checked and there
    // are none" and "nobody recorded it" are different statements.
    const r = migrateDetailingStore({
      version: DETAILING_SCHEMA_VERSION, assemblies: [assembly()],
    });
    expect(r.store.assemblies[0].provisionalMembers).toBeUndefined();
    expect(r.store.assemblies[0].torsionUnevaluatedMembers).toBeUndefined();
  });
});

describe('targeted invalidation', () => {
  const store = {
    version: DETAILING_SCHEMA_VERSION,
    assemblies: [
      assembly({ id: 'A', elementIds: [1, 2] }),
      assembly({ id: 'B', elementIds: [3, 4] }),
    ],
  };

  it('bumps only the assemblies containing the changed element', () => {
    // The whole reason detailingRevision is per-assembly: editing one beam line must
    // not mark an untouched line on the far side of the floor stale.
    const r = invalidateAffected(store, [3]);
    expect(r.invalidated).toEqual(['B']);
    expect(r.store.assemblies[0].detailingRevision).toBe(1);
    expect(r.store.assemblies[1].detailingRevision).toBe(2);
  });

  it('leaves an untouched assembly at CONSTRUCTIBLE', () => {
    const r = invalidateAffected(store, [3]);
    expect(r.store.assemblies[0].state).toBe('CONSTRUCTIBLE');
    expect(r.store.assemblies[1].state).toBe('VERIFIED');
  });

  it('keeps a review record but makes it stale, rather than deleting the audit trail', () => {
    const reviewed = applyReview(assembly({ id: 'A', elementIds: [1] }), {
      engineer: 'Ing. P', at: '2026-07-26T10:00:00Z', state: 'REVIEWED',
      provisionalAcknowledged: false, acknowledgedProvisional: [],
    }).assembly!;
    const r = invalidateAffected({ version: 1, assemblies: [reviewed] }, [1]);
    expect(r.store.assemblies[0].review).toBeDefined();
    expect(isReviewStale(r.store.assemblies[0])).toBe(true);
  });

  it('does nothing when no assembly contains the changed element', () => {
    const r = invalidateAffected(store, [99]);
    expect(r.invalidated).toEqual([]);
    expect(r.store.assemblies.every((a) => a.detailingRevision === 1)).toBe(true);
  });
});

describe('locks', () => {
  it('finds the bars the user pinned', () => {
    const a = assembly({ bars: [bar('a'), bar('b', 5, 20, true), bar('c')] });
    expect(lockedBars(a).map((b) => b.id)).toEqual(['b']);
  });
});
