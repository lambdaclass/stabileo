/**
 * A document narrowed to what the user chose to document, and the claim it may not gain by it.
 *
 * ── The state this file makes unreachable ──────────────────────────
 *
 * Narrowing as an escape hatch. If `documentReadiness` were measured over the subset, a project
 * whose columns are in conflict could select one clean beam and reach FOR_REVIEW — and
 * `Issue for construction` would open on a set taken out of a draft. So the document is built over
 * everything and narrowed afterwards, and the property under test is:
 *
 *   **a narrowed document never claims more than the set it came from.**
 *
 * ── And the three things a member cannot cut ───────────────────────
 *
 * A bar continuous over a support is one physical piece with two owners; a mark's label is read in
 * a workshop; a lap is a relation between two bars. Each of those is asserted below, because each
 * of them is a way a narrowed schedule could come to disagree with the narrowed drawing beside it.
 */

import { describe, expect, it } from 'vitest';
import { buildDocumentModel, type CertificateEntry } from '../document-model';
import { narrowDocument } from '../document-narrow';
import { assignMarks, type DetailingAssembly } from '../assembly';
import { renderSchedule, scopeStatement } from '../document-render';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import type { BarConflict } from '../collision';
import type { LapInterval } from '../lap-materialize';

const X = { x: 1, y: 0, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

/**
 * Two beams and the bar that runs through both.
 *
 * `through` is the whole point of the fixture: it is owned by 1 AND 2, which is what a bar
 * continuous over a support is, and it is the case a naive filter gets wrong in both directions.
 */
function bars(): BarPath[] {
  const bar = (id: string, y: number, owners: number[], to: number) =>
    buildStraightBarWithHooks({
      id, diameterMm: 20, role: 'longitudinal',
      start: { x: 0, y, z: 0.05 }, end: { x: to, y, z: 0.05 },
      axis: X, hookNormal: UP,
      ownerElementIds: owners, layerId: `e${owners[0]}:bottom:0`,
    });
  return [
    bar('b1-a', 0.05, [1], 6),
    bar('b1-b', 0.15, [1], 6),
    bar('b2-a', 0.25, [2], 5),
    bar('through', 0.35, [1, 2], 11),
  ];
}

const LAP: LapInterval = {
  jointId: 'J-1', fromBarId: 'b1-a', toBarId: 'b2-a',
  from: { x: 5.8, y: 0.05, z: 0.05 }, to: { x: 6.2, y: 0.05, z: 0.05 },
  lapLength: 0.4, kind: 'contactLap', spliceClass: 'A', offset: 0, maxOffset: Infinity, refs: [],
};

/** A lap between two bars of member 1 only, so narrowing to 1 keeps it. */
const LAP_INSIDE: LapInterval = { ...LAP, jointId: 'J-2', fromBarId: 'b1-a', toBarId: 'b1-b' };

const CONFLICT: BarConflict = {
  barA: 'b2-a', barB: 'through', elementIds: [2],
  at: { x: 3, y: 0.3, z: 0.05 },
  clearance: -0.01, required: 0.025, shortfall: 0.035,
  severity: 'overlap', pairClass: 'prohibitedOverlap',
} as unknown as BarConflict;

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  const bs = bars();
  return {
    id: 'ASM-1', labelKey: 'detailing.assembly.level', labelParams: { level: 3 },
    kind: 'beamLine',
    elementIds: [1, 2],
    bars: bs,
    marks: assignMarks(bs, 'B'),
    joints: [{
      id: 'J-1', nodeId: 9, elementIds: [1, 2], kind: 'interior', beamCount: 2,
      beamLayers: [{ elementId: 1, layer: 0 }, { elementId: 2, layer: 1 }],
      maturity: 'VALIDATED', unresolved: [],
    }],
    conflicts: [],
    unsupported: [
      { key: 'wholeAssembly', scope: {}, message: 'applies to everything here', refs: [] },
      { key: 'member2Only', scope: { elementIds: [2] }, message: 'about 2', refs: [] },
    ],
    provisionalMembers: [2],
    torsionUnevaluatedMembers: [2],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 3, demandRevision: 2,
    maturity: 'IMPLEMENTED_PROVISIONAL',
    provenance: { edition: '2025', verifierId: 'cirsoc201.v2', trace: [], assumptions: [] },
    ...over,
  } as unknown as DetailingAssembly;
}

const certs = (ids: number[], matches = true): CertificateEntry[] =>
  ids.map((elementId) => ({
    elementId, certifiedHash: 'h', currentHash: matches ? 'h' : 'other', matches,
    verifierId: 'cirsoc201.v2', status: 'ok' as const,
  }));

function doc(over: {
  assemblies?: DetailingAssembly[]; laps?: LapInterval[]; certificates?: CertificateEntry[];
} = {}) {
  return buildDocumentModel({
    seriesId: 'S-1',
    revision: {
      number: 4, at: '2026-08-27T10:00:00Z', author: 'Bauti',
      detailingRevision: 3, demandRevision: 2,
    },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: over.assemblies ?? [assembly()],
    laps: over.laps ?? [LAP, LAP_INSIDE],
    certificates: over.certificates ?? certs([1, 2]),
    convergence: { scope: ['column', 'beam'], outOfScope: ['slab'] },
  });
}

// ─── The claim ───────────────────────────────────────────────────

describe('a narrowed document never claims more than the set it came from', () => {
  it('keeps the readiness of the whole set, not of the subset', () => {
    const full = doc({ assemblies: [assembly({ conflicts: [CONFLICT] })] });
    expect(full.readiness, 'the set is a draft because member 2 clashes')
      .toBe('REVIEW_DRAFT');

    const only1 = narrowDocument(full, [1], ['beam']);
    expect(only1.assemblies[0].conflicts, 'the clash is not in the subset').toEqual([]);
    expect(only1.readiness, 'and the subset is still a draft').toBe('REVIEW_DRAFT');
  });

  it('keeps the whole set’s open conflicts, which are the reason it is a draft', () => {
    const full = doc({ assemblies: [assembly({ conflicts: [CONFLICT] })] });
    const only1 = narrowDocument(full, [1], ['beam']);
    expect(only1.openConflicts).toEqual(full.openConflicts);
    expect(only1.openConflicts.length).toBe(1);
  });

  it('keeps the whole set’s maturity and scope', () => {
    const full = doc();
    const only1 = narrowDocument(full, [1], ['beam']);
    expect(only1.maturity).toBe(full.maturity);
    expect(only1.scope).toEqual(['column', 'beam']);
    expect(only1.outOfScope).toEqual(['slab']);
  });

  it('cannot widen the family statement past the document’s own scope', () => {
    const full = doc();
    // A caller handing in a family the scope does not contain gets it dropped, not honoured.
    const narrowed = narrowDocument(full, [1], ['beam', 'slab', 'footing']);
    expect(narrowed.selection?.families).toEqual(['beam']);
  });
});

// ─── What the selection reports ──────────────────────────────────

describe('the selection travels on the document', () => {
  it('names the members, how many there were, and the families', () => {
    const narrowed = narrowDocument(doc(), [1], ['beam']);
    expect(narrowed.selection).toMatchObject({
      elements: [1], ofBase: 2, families: ['beam'],
    });
  });

  it('is absent on a document nobody narrowed', () => {
    expect(doc().selection).toBeUndefined();
  });

  it('names the unselected owners of steel that had to come along', () => {
    const narrowed = narrowDocument(doc(), [1], ['beam']);
    // `through` is owned by 1 and 2. Selecting 1 draws it; 2 is named rather than left implicit.
    expect(narrowed.selection?.sharedWith).toEqual([2]);
  });

  it('reports nothing shared when the selection owns all its steel', () => {
    const narrowed = narrowDocument(doc(), [1, 2], ['beam']);
    expect(narrowed.selection?.sharedWith).toEqual([]);
  });
});

// ─── The content ─────────────────────────────────────────────────

describe('the content follows the members', () => {
  const narrowed = narrowDocument(doc(), [1], ['beam']);
  const a = narrowed.assemblies[0];

  it('drops an assembly with no selected member', () => {
    const two = narrowDocument(
      doc({ assemblies: [assembly(), assembly({ id: 'ASM-2', elementIds: [7], bars: [] })] }),
      [7], ['beam'],
    );
    expect(two.assemblies.map((x) => x.id)).toEqual(['ASM-2']);
  });

  it('keeps a bar when ANY of its owners is selected', () => {
    expect(a.bars.map((b) => b.id).sort()).toEqual(['b1-a', 'b1-b', 'through']);
  });

  it('drops the certificates of members that are not there', () => {
    expect(narrowed.certificates.map((c) => c.elementId)).toEqual([1]);
  });

  it('filters the per-member records and leaves the assembly-wide ones', () => {
    expect(a.source.provisionalMembers).toEqual([]);
    expect(a.source.torsionUnevaluatedMembers).toEqual([]);
    expect(a.source.unsupported.map((u) => u.key), 'the assembly-wide condition stays')
      .toEqual(['wholeAssembly']);
  });

  it('keeps a joint the selection touches and narrows its layer allocation', () => {
    expect(a.source.joints).toHaveLength(1);
    expect(a.source.joints[0].beamLayers.map((l) => l.elementId)).toEqual([1]);
  });

  it('keeps a lap only when both of its bars are in the document', () => {
    expect(a.laps.map((l) => l.jointId), 'the lap to b2-a is not a splice any more')
      .toEqual(['J-2']);
  });

  it('narrows the layer list to the layers still present', () => {
    expect(a.layers).toEqual(['e1:bottom:0']);
  });
});

// ─── Marks: the label survives, the count follows ────────────────

describe('a mark keeps its label and loses the bars that left', () => {
  it('recomputes the quantity and the mass, and does not renumber', () => {
    const full = doc();
    const fullMarks = full.assemblies[0].source.marks;
    const narrowed = narrowDocument(full, [2], ['beam']);
    const marks = narrowed.assemblies[0].source.marks;

    // Member 2 owns `b2-a` and shares `through`. Both are 20 mm, so the marks split by length.
    const total = marks.reduce((s, m) => s + m.quantity, 0);
    expect(total, 'two bars, two rows of one').toBe(2);

    for (const m of marks) {
      const original = fullMarks.find((x) => x.mark === m.mark);
      expect(original, `${m.mark} is one of the set's own marks, not a new number`).toBeTruthy();
      expect(m.diameterMm).toBe(original!.diameterMm);
      expect(m.cuttingLength).toBe(original!.cuttingLength);
      // Linear in the quantity, because a mark groups identical items.
      expect(m.massKg).toBeCloseTo(original!.massKg * (m.quantity / original!.quantity), 9);
    }
  });

  it('emits no row for a mark that lost every bar', () => {
    const narrowed = narrowDocument(doc(), [2], ['beam']);
    const marks = narrowed.assemblies[0].source.marks;
    expect(marks.every((m) => m.quantity > 0)).toBe(true);
    expect(marks.every((m) => m.barIds.length === m.quantity)).toBe(true);
  });

  it('narrows the mark’s owners and its zones to what is left', () => {
    const narrowed = narrowDocument(doc(), [1], ['beam']);
    for (const m of narrowed.assemblies[0].source.marks) {
      expect(m.ownerElementIds.some((id) => id === 1)).toBe(true);
    }
  });
});

// ─── The stamp on the paper ──────────────────────────────────────

describe('the stamp declares the members, and both kinds of absence', () => {
  it('a whole set carries no member line', () => {
    const s = scopeStatement(doc(), 'en');
    expect(s).toContain('SCOPE: COLUMNS, BEAMS');
    expect(s).toContain('NOT IN THIS SET: SLABS');
    expect(s, 'nothing was narrowed, so there is no selection to declare')
      .not.toContain('MEMBERS');
  });

  it('a narrowed set names the count, the ids and the total', () => {
    const s = scopeStatement(narrowDocument(doc(), [1], ['beam']), 'en');
    expect(s).toContain('MEMBERS: 1 of 2');
    expect(s).toContain('(1)');
  });

  it('names the unselected owners of steel that is drawn anyway', () => {
    const s = scopeStatement(narrowDocument(doc(), [1], ['beam']), 'en');
    expect(s).toContain('STEEL SHARED WITH: 2');
  });

  it('a family the design covered and this document does not is NOT IN THIS SET', () => {
    /*
     * The gap this closes. `outOfScope` is what the model has and the design never covered; a
     * narrowing creates a second absence — a family the design DID cover, dropped because no
     * member of it was selected. Printing only the first would stamp `SCOPE: BEAMS` on a
     * beams-only selection of a beams-and-columns project and never say where the columns are.
     */
    const s = scopeStatement(narrowDocument(doc(), [1], ['beam']), 'en');
    expect(s).toContain('SCOPE: BEAMS');
    expect(s, 'the columns the design covered, and this set does not')
      .toContain('NOT IN THIS SET: COLUMNS, SLABS');
  });

  it('says the same two things in Spanish', () => {
    const s = scopeStatement(narrowDocument(doc(), [1], ['beam']), 'es');
    expect(s).toContain('ALCANCE: VIGAS');
    expect(s).toContain('NO INCLUYE: COLUMNAS, LOSAS');
    expect(s).toContain('ELEMENTOS: 1 de 2');
    expect(s).toContain('ACERO COMPARTIDO CON: 2');
  });
});

// ─── And the schedule agrees with it ─────────────────────────────

describe('the schedule of a narrowed document counts the narrowed steel', () => {
  it('totals fewer bars than the whole set', () => {
    const full = doc();
    const quantity = (d: ReturnType<typeof doc>) => {
      const sheets = renderSchedule(d, { locale: 'es', projectName: 'P' });
      let n = 0;
      for (const { aoa } of sheets) {
        for (const row of aoa) {
          if (/^B\d+$/.test(String(row[0] ?? '').trim())) n += Number(row[7]);
        }
      }
      return n;
    };
    const whole = quantity(full);
    const part = quantity(narrowDocument(full, [1], ['beam']));
    expect(whole, 'four bars in the set').toBe(4);
    expect(part, 'three of them belong to member 1').toBe(3);
  });
});
