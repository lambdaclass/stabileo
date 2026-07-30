/**
 * The DocumentModel.
 *
 * The property that matters most here is not what a document says — it is what it refuses
 * to say. A conflicted floor may be documented, because engineers need drawings to discuss
 * a problem long before it is solved; it may never produce something that looks issued.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDocumentModel, documentReadiness, openConflictsOf, supersede, isConstructionReady,
  type CertificateEntry, type DocumentAssembly, type DocumentRevision,
} from '../document-model';
import type { DetailingAssembly } from '../assembly';
import type { BarConflict } from '../collision';
import { straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { clause } from '../../../codes/regulation';

const REVISION: DocumentRevision = {
  number: 3, at: '2026-07-27T10:00:00Z', author: 'Bauti',
  detailingRevision: 7, demandRevision: 4,
};

function bar(id: string, layerId?: string): BarPath {
  return {
    id, diameterMm: 16, role: 'longitudinal',
    segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 5, ownerElementIds: [1], source: 'generated', locked: false,
    layerId,
    refs: [clause('cirsoc-201', '2025', '25.2.1', 'separación mínima')],
  };
}

function conflict(severity: BarConflict['severity'] = 'blocking'): BarConflict {
  return {
    severity, barA: 'a', barB: 'b', at: { x: 1, y: 2, z: 3 },
    clearance: -0.004, required: 0.025, shortfall: 0.029,
    elementIds: [1, 2], pairClass: 'prohibitedOverlap',
  } as BarConflict;
}

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  return {
    id: 'level-3.20', labelKey: 'detailing.assembly.level', labelParams: { level: '3.20' },
    kind: 'beamLine', elementIds: [1, 2],
    bars: [bar('b1', 'e1:bottom:0'), bar('b2', 'e1:top:0')],
    joints: [], conflicts: [], unsupported: [], marks: [],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 7,
    maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'v1', trace: [], assumptions: [] },
    ...over,
  } as DetailingAssembly;
}

const GOOD_CERT: CertificateEntry = {
  elementId: 1, certifiedHash: 'h1', currentHash: 'h1', matches: true,
  verifierId: 'v1', status: 'ok',
};

function build(over: Partial<Parameters<typeof buildDocumentModel>[0]> = {}) {
  return buildDocumentModel({
    seriesId: 'S1', revision: REVISION,
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: [assembly()], laps: [], certificates: [GOOD_CERT],
    ...over,
  });
}

describe('a conflicted floor is documented, but never as issued', () => {
  it('drops to REVIEW_DRAFT on a single blocking conflict', () => {
    const d = build({ assemblies: [assembly({ conflicts: [conflict()] })] });
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });

  it('still produces a document — refusing to draw a problem is obstruction', () => {
    const d = build({ assemblies: [assembly({ conflicts: [conflict()] })] });
    expect(d.assemblies).toHaveLength(1);
    expect(d.assemblies[0].bars.length).toBeGreaterThan(0);
  });

  it('carries the conflicts on the document itself, not in a footnote', () => {
    const d = build({ assemblies: [assembly({ conflicts: [conflict()] })] });
    expect(d.openConflicts).toHaveLength(1);
    expect(d.openConflicts[0].pairClass).toBe('prohibitedOverlap');
  });

  it('never claims construction readiness', () => {
    const d = build({ assemblies: [assembly({ conflicts: [conflict()] })] });
    expect(isConstructionReady(d)).toBe(false);
  });

  it('a marginal conflict is not a blocker', () => {
    const d = build({ assemblies: [assembly({ conflicts: [conflict('marginal')] })] });
    expect(d.openConflicts).toEqual([]);
    expect(d.readiness).not.toBe('REVIEW_DRAFT');
  });
});

describe('the readiness ladder is climbed on evidence', () => {
  it('CONSTRUCTIBLE and clean reaches FOR_REVIEW, not REVIEWED', () => {
    expect(build().readiness).toBe('FOR_REVIEW');
  });

  it('a REVIEWED assembly reaches REVIEWED', () => {
    expect(build({ assemblies: [assembly({ state: 'REVIEWED' })] }).readiness)
      .toBe('REVIEWED');
  });

  it('an ISSUED assembly reaches ISSUED, and only then is it buildable', () => {
    const d = build({ assemblies: [assembly({ state: 'ISSUED' })] });
    expect(d.readiness).toBe('ISSUED');
    expect(isConstructionReady(d)).toBe(true);
  });

  it('the LOWEST assembly governs — one draft holds the whole set back', () => {
    const d = build({
      assemblies: [assembly({ state: 'ISSUED' }), assembly({ id: 'L2', state: 'COORDINATED' })],
    });
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });

  it('a certificate that no longer describes the model blocks everything', () => {
    // Worse than no certificate: a correct-looking claim about geometry that is gone.
    const stale: CertificateEntry = { ...GOOD_CERT, currentHash: 'h2', matches: false };
    const d = build({ assemblies: [assembly({ state: 'ISSUED' })], certificates: [stale] });
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });

  it('no certificates at all is not a pass', () => {
    const d = build({ assemblies: [assembly({ state: 'ISSUED' })], certificates: [] });
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });

  it('a failing certificate blocks even when the hashes match', () => {
    const failed: CertificateEntry = { ...GOOD_CERT, status: 'fail' };
    const d = build({ assemblies: [assembly({ state: 'ISSUED' })], certificates: [failed] });
    expect(d.readiness).toBe('REVIEW_DRAFT');
  });
});

describe('SUPERSEDED', () => {
  it('supersession wins over every other signal', () => {
    const d = build({ assemblies: [assembly({ state: 'ISSUED' })], supersededBy: 4 });
    expect(d.readiness).toBe('SUPERSEDED');
    expect(isConstructionReady(d)).toBe(false);
  });

  it('names the revision that replaced it', () => {
    const d = supersede(build({ assemblies: [assembly({ state: 'ISSUED' })] }), 4);
    expect(d.supersededBy).toBe(4);
    expect(d.summary.key).toBe('detailing.document.superseded');
  });

  it('does not mutate or discard the superseded document', () => {
    // A project that cannot show what it previously issued cannot answer the only question
    // that matters after something goes wrong.
    const original = build({ assemblies: [assembly({ state: 'ISSUED' })] });
    const snapshot = JSON.stringify(original);
    supersede(original, 4);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('keeps its own revision number and content', () => {
    const d = supersede(build({ assemblies: [assembly({ state: 'ISSUED' })] }), 9);
    expect(d.revision.number).toBe(3);
    expect(d.assemblies).toHaveLength(1);
  });
});

describe('one model, so the three outputs cannot drift', () => {
  it('collects the layer identities present', () => {
    const d = build();
    expect(d.assemblies[0].layers).toEqual(['e1:bottom:0', 'e1:top:0']);
  });

  it('cites the clauses the bars were actually built under', () => {
    const d = build();
    expect(d.refs.map((r) => r.clause)).toContain('25.2.1');
  });

  it('deduplicates clauses across assemblies', () => {
    const d = build({ assemblies: [assembly(), assembly({ id: 'L2' })] });
    expect(d.refs.filter((r) => r.clause === '25.2.1')).toHaveLength(1);
  });

  it('records a bar owned by two members as a fusion', () => {
    const fused = { ...bar('f1', 'e1:bottom:0'), ownerElementIds: [1, 2] };
    const d = build({ assemblies: [assembly({ bars: [fused] })] });
    expect(d.assemblies[0].fusions).toHaveLength(1);
    expect(d.assemblies[0].fusions[0].ownerElementIds).toEqual([1, 2]);
  });

  it('carries the revision it was built from', () => {
    const d = build();
    expect(d.revision.detailingRevision).toBe(7);
    expect(d.revision.demandRevision).toBe(4);
  });

  it('reads the clock from nobody — the timestamp is supplied', () => {
    expect(build().revision.at).toBe('2026-07-27T10:00:00Z');
  });
});

describe('conflict records are actionable', () => {
  // Only what `openConflictsOf` reads. It takes a `Pick`, so a fixture asking a question
  // about conflicts no longer has to invent a source assembly, family records and
  // certificates to be allowed to ask it.
  const a: Pick<DocumentAssembly, 'id' | 'conflicts' | 'maturity'> = {
    id: 'L1', conflicts: [conflict()], maturity: 'VALIDATED',
  };

  it('names the members, the bars and the place', () => {
    const [c] = openConflictsOf(a);
    expect(c.elementIds).toEqual([1, 2]);
    expect(c.barIds).toEqual(['a', 'b']);
    expect(c.at).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('reports what was measured against what was required', () => {
    const [c] = openConflictsOf(a);
    expect(c.clearance).toBeCloseTo(-0.004, 9);
    expect(c.required).toBeCloseTo(0.025, 9);
  });

  it('suggests an action rather than only stating the fault', () => {
    const [c] = openConflictsOf(a);
    expect(c.suggestedAction.key).toBe('detailing.action.prohibitedOverlap');
  });

  it('records the alternatives that were already tried', () => {
    const tried = [{ key: 'detailing.attempt.rankTwo', params: {} }];
    const [c] = openConflictsOf(a, tried);
    expect(c.attempted).toEqual(tried);
  });

  it('carries the maturity of the calculation behind it', () => {
    expect(openConflictsOf(a)[0].maturity).toBe('VALIDATED');
  });
});

describe('documentReadiness is pessimistic by construction', () => {
  it('an empty document is a draft, not a pass', () => {
    expect(documentReadiness({ assemblies: [], certificates: [] })).toBe('REVIEW_DRAFT');
  });
});
