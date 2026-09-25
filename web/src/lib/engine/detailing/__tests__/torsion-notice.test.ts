/**
 * Unevaluated torsion says so on EVERY projection, and changes nothing else.
 *
 * ── The two halves of this file ────────────────────────────────────
 *
 * The first half is the rule itself, on literals: which members it names, which it does not,
 * and what happens the day an adapter gains the check.
 *
 * The second half is the same shape as `provisional-projections.test.ts`, and for the same
 * reason. The 3-D view, the sheets, the schedule and the report are four independent renderers
 * over one document, each given this warning separately — which is exactly the defect worth
 * guarding: three of them warning and the fourth, the one somebody prints and hands to a site,
 * saying nothing.
 *
 * ── What must never pass ───────────────────────────────────────────
 *
 * A member disappearing from the scene because its torsion was not checked. A member turning
 * into a refusal. A proposal losing its proposal. A certificate changing. Each of those would
 * be the application making the engineer's decision for them by hiding the evidence, and each
 * has its own assertion below.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  TORSION_NOTICE_FLOOR, torsionUnevaluatedMembers, type TorsionNoticeInput,
} from '../torsion-notice';
import { workspaceScene, ROLLED_BEAMS } from './helpers/workspace-scene';
import { verificationStore } from '../../../store/verification.svelte';
import { renderReportHtml, renderDrawings, renderSchedule } from '../document-render';
import type { SceneModel } from '../scene-model';
import type { DocumentModel } from '../document-model';
import type { ElementDesignDemands, GoverningDemand } from '../../station-design-forces';

// ─── The rule ────────────────────────────────────────────────────

/** A demand set carrying exactly the categories named, at the magnitudes named. */
function demands(values: Partial<Record<GoverningDemand['category'], number>>) {
  const list = Object.entries(values).map(([category, absValue]) => ({
    category, value: absValue, absValue, comboId: 1, comboName: 'C1',
    stationT: 0, stationX: 0, forces: {},
  })) as unknown as GoverningDemand[];
  return { demands: list } as unknown as ElementDesignDemands;
}

function member(over: Partial<TorsionNoticeInput> = {}): TorsionNoticeInput {
  return {
    elementId: 1, elementType: 'beam', demands: demands({ Torsion: 5, 'My+': 20 }),
    ...over,
  };
}

const NO_TORSION_CHECK = { beams: false };

describe('which members carry unevaluated torsion', () => {
  it('names a beam whose torsion is real', () => {
    expect(torsionUnevaluatedMembers([member()], NO_TORSION_CHECK))
      .toEqual([{ elementId: 1, torsion: 5, primaryMoment: 20 }]);
  });

  it('says nothing at all when the adapter actually checks torsion', () => {
    // The warning exists because `beams.torsion` is false. The day a code adapter sets it
    // true, this must go quiet by itself rather than needing a second edit somewhere else.
    expect(torsionUnevaluatedMembers([member()], { beams: true })).toEqual([]);
  });

  it('ignores torsion below the floor', () => {
    // A 3-D frame analysis puts a non-zero T on essentially every member. A warning that fires
    // on numerical residue is a warning nobody reads.
    const tiny = member({ demands: demands({ Torsion: TORSION_NOTICE_FLOOR, 'My+': 20 }) });
    expect(torsionUnevaluatedMembers([tiny], NO_TORSION_CHECK)).toEqual([]);
    const just = member({
      demands: demands({ Torsion: TORSION_NOTICE_FLOOR * 1.01, 'My+': 20 }),
    });
    expect(torsionUnevaluatedMembers([just], NO_TORSION_CHECK)).toHaveLength(1);
  });

  it('leaves columns and walls out, deliberately', () => {
    const others: TorsionNoticeInput[] = [
      member({ elementId: 2, elementType: 'column' }),
      member({ elementId: 3, elementType: 'wall' }),
    ];
    // Not an omission: a column's transverse steel is detailed for confinement and its
    // verification is a different unfinished story with a different remedy. One warning
    // standing for two problems tells the reader neither.
    expect(torsionUnevaluatedMembers(others, NO_TORSION_CHECK)).toEqual([]);
  });

  it('reports the torsion beside the bending, so the number has a scale', () => {
    const [n] = torsionUnevaluatedMembers(
      [member({ demands: demands({ Torsion: 4, 'My+': 6, 'Mz-': 300 }) })], NO_TORSION_CHECK);
    expect(n.torsion).toBe(4);
    // The LARGER of the two peaks: "4 kN·m of torsion beside 300 of bending" and "4 beside 6"
    // are different members, and only one of them is worth stopping for.
    expect(n.primaryMoment).toBe(300);
  });

  it('handles a member with no demands at all rather than inventing one', () => {
    expect(torsionUnevaluatedMembers([member({ demands: undefined })], NO_TORSION_CHECK))
      .toEqual([]);
  });

  it('returns the members in id order', () => {
    const out = torsionUnevaluatedMembers(
      [member({ elementId: 9 }), member({ elementId: 2 }), member({ elementId: 5 })],
      NO_TORSION_CHECK);
    expect(out.map((n) => n.elementId)).toEqual([2, 5, 9]);
  });
});

// ─── The projections ─────────────────────────────────────────────

const RENDER = { projectName: 'Torsion QA', locale: 'es' } as const;

/** Every warning must contain this phrase, in Spanish, wherever it appears. */
const NOT_EVALUATED = /TORSIÓN NO EVALUADA/i;

// A whole-building test: 30 s rather than Vitest's 5 s default, for the reason set out in
// `provisional-projections.test.ts` — under a full-suite pool these were failing on
// contention with every assertion passing.
describe('unevaluated torsion, across every projection', { timeout: 30_000 }, () => {
  let scene: SceneModel;
  let doc: DocumentModel;
  let flagged: number[];

  beforeAll(async () => {
    // With five beams turned about their axis, so the building also carries provisional
    // proposals and the two warnings can be checked side by side (see `ROLLED_BEAMS`).
    const w = await workspaceScene('pro-edificio-7p', ROLLED_BEAMS);
    scene = w.scene;
    doc = w.doc;
    flagged = scene.torsionUnevaluatedMembers;
    // The audit behind `docs/audits/biaxial-beam-design.md` measured a median torsion of
    // 1,33 kN·m in this population. If this is empty, either the fixture changed or the
    // warning stopped being computed, and both are worth failing on.
    expect(flagged.length, 'the building actually carries unevaluated torsion')
      .toBeGreaterThan(0);
  }, 900_000);

  it('records it on the assemblies that carry the steel', () => {
    const claimed = new Set(
      doc.assemblies.flatMap((a) => a.source.torsionUnevaluatedMembers ?? []));
    expect([...claimed].sort((a, b) => a - b)).toEqual(flagged);
  });

  it('keeps every flagged member fully visible in the 3-D scene', () => {
    for (const id of flagged) {
      // The whole point. A member whose torsion was not checked is the member the engineer
      // most needs to look at, and hiding it — or refusing it into a state with no geometry —
      // would take away the evidence they need to make the call this app is declining to make.
      expect(scene.solids.some((s) => s.elementIds.includes(id)),
        `member ${id} still has concrete in the scene`).toBe(true);
    }
    const withSteel = flagged.filter(
      (id) => scene.bars.some((b) => b.elementIds.includes(id)));
    expect(withSteel.length, 'flagged members keep the steel they were given')
      .toBeGreaterThan(0);
  });

  it('changes no outcome, no certificate and no proposal', () => {
    for (const id of flagged) {
      const o = verificationStore.outcomeFor(id);
      if (!o) continue;
      /**
       * The authority over torsion is unchanged in this pass.
       *
       * The precise statement is the second one: no member is limited BY torsion, because
       * nothing in the design layer was given torsion as a constraint. The first is the
       * requirement in the words it was written in — a member must not become a failure it was
       * not, because a refusal takes its geometry off the screen and the geometry is exactly
       * what the engineer needs in order to judge the torsion for themselves.
       */
      expect(o.outcome, `member ${id} keeps its outcome`).not.toBe('FAILED');
      expect(o.limiting ?? [], `member ${id} is not limited by torsion`)
        .not.toContain('torsion');
    }
    // A member that is BOTH a proposal and torsion-unevaluated keeps both facts. Neither
    // warning may swallow the other.
    const both = flagged.filter((id) => scene.provisionalMembers.includes(id));
    for (const id of both) {
      expect(scene.provisionalMembers, `member ${id} is still a proposal`).toContain(id);
      expect(scene.torsionUnevaluatedMembers, `member ${id} still warns about torsion`)
        .toContain(id);
    }
  });

  it('prints the warning on the sheets of every assembly that carries one', () => {
    const drawings = renderDrawings(doc, RENDER);
    let checked = 0;
    for (const a of doc.assemblies) {
      if ((a.source.torsionUnevaluatedMembers ?? []).length === 0) continue;
      checked += 1;
      const mine = drawings.sheets.filter((s) => s.name.includes(a.id));
      expect(mine.length, `assembly ${a.id} produced sheets`).toBeGreaterThan(0);
      for (const s of mine) {
        expect(s.sheet.notes.some((n) => NOT_EVALUATED.test(n)),
          `sheet ${s.name} carries the torsion note`).toBe(true);
        // Near the top: note order is read order, and this sits with the other statements
        // about what the sheet may and may not be used for.
        expect(s.sheet.notes.slice(0, 2).some((n) => NOT_EVALUATED.test(n)),
          `sheet ${s.name} states it early`).toBe(true);
      }
    }
    expect(checked, 'at least one assembly was actually examined').toBeGreaterThan(0);
  });

  it('states it on the bar schedule, per row and at the top', () => {
    const books = renderSchedule(doc, RENDER);
    const flat = books.map((b) => b.aoa.flat().join(' | ')).join('\n');
    expect(flat, 'the schedule warns at sheet level').toMatch(NOT_EVALUATED);
    // And in the status column, beside the mark somebody is about to order.
    const rows = books.flatMap((b) => b.aoa)
      .filter((r) => r.some((c) => typeof c === 'string' && NOT_EVALUATED.test(c)));
    expect(rows.length, 'the warning reaches individual rows').toBeGreaterThan(0);
  });

  it('states it in the report, above the fold and in its own section', () => {
    const html = renderReportHtml(doc, RENDER, (k) => k);
    expect(html).toMatch(NOT_EVALUATED);
    expect(html).toContain('Torsión no evaluada');
    expect(html, 'and says it is unfinished rather than a verdict').toContain('PR21');
    for (const id of flagged) {
      expect(html, `member ${id} is listed in the report`).toMatch(new RegExp(`<td>${id}</td>`));
    }
  });

  it('keeps the provisional warning intact beside it', () => {
    // Two independent gaps in the verification are two warnings. A report that lost one when
    // the other was added would be worse than the report that had neither.
    const html = renderReportHtml(doc, RENDER, (k) => k);
    expect(html).toContain('Propuestas provisionales');
    expect(html).toContain('Torsión no evaluada');
  });
});
