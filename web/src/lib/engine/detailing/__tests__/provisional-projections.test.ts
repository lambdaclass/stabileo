/**
 * A proposal says it is a proposal on EVERY projection, or it is not honest anywhere.
 *
 * ── Why one file rather than an assertion in each ──────────────────
 *
 * The 3-D view, the drawing sheets, the bar schedule and the report are four independent
 * renderers over one document. Each of them was given the provisional marking separately, and
 * that is precisely the shape of defect this file exists to catch: three of them saying "not
 * for construction" and the fourth — the one somebody prints and hands to a site — saying
 * nothing at all.
 *
 * So the test is not "the drawing has a note". It is: for the SAME model, in the SAME run,
 * every output that shows a provisional member's steel also carries the warning, and no
 * output shows a proposal where a verified design would look identical.
 *
 * ── What must never pass ───────────────────────────────────────────
 *
 * A proposal acquiring a certificate. A provisional member counted as MODELLED. A sheet or a
 * schedule that draws provisional steel with no warning on it. A CONSTRUCTIBLE verdict on an
 * assembly that carries one. Each has its own assertion below, and each of them would have
 * been true at some point during the change that added this state.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { workspaceScene, ROLLED_BEAMS } from './helpers/workspace-scene';
import { modelStore } from '../../../store/model.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { detailingStore } from '../../../store/detailing.svelte';
import { renderReportHtml, renderDrawings, renderSchedule } from '../document-render';
import { reportElementStatus, NOT_FOR_CONSTRUCTION_STATUSES, type DesignOutcomeSummary } from '../element-status';
import { REBAR_COLORS } from '../../../three/rebar-scene';
import type { SceneModel } from '../scene-model';
import type { DocumentModel } from '../document-model';

const RENDER = { projectName: 'Provisional QA', locale: 'es' } as const;

/** Every warning must contain this phrase, in Spanish, wherever it appears. */
const NOT_FOR_CONSTRUCTION = /NO APTO PARA EMISI/i;

/**
 * A generous per-test ceiling, because these tests render a WHOLE BUILDING.
 *
 * Vitest's default is 5 s and these run in a pool of 271 files. Each of the assertions below
 * renders the 203-member document — the report, the sheets, the schedule — which takes about
 * 1,9 s on an idle machine and rather more when fifteen workers are competing for the same
 * cores. Three of them timed out in a full-suite run while every assertion in them passed,
 * which is the worst kind of red: it says "broken" and means "busy".
 *
 * A ceiling rather than no ceiling: 30 s is still an order of magnitude below anything that
 * would indicate a real regression, so a genuine slowdown is still caught.
 */
describe('a provisional proposal, across every projection', { timeout: 30_000 }, () => {
  let scene: SceneModel;
  let doc: DocumentModel;
  let provisional: number[];

  beforeAll(async () => {
    // Five beams turned about their axis, so they bend about both (see `ROLLED_BEAMS`).
    const w = await workspaceScene('pro-edificio-7p', ROLLED_BEAMS);
    scene = w.scene;
    doc = w.doc;
    provisional = scene.provisionalMembers;
    expect(provisional.length, 'the fixture actually produces proposals').toBeGreaterThan(0);
  }, 900_000);

  it('marks the steel in the document, and marks all of it', () => {
    const provisionalSet = new Set(provisional);
    for (const a of doc.assemblies) {
      for (const bar of a.bars) {
        const ownedByProposal = bar.ownerElementIds.some((id) => provisionalSet.has(id));
        // A bar continuous over a support belongs to the beam it was designed for AND to the
        // column it passes through. It is unbuildable from a certified drawing either way, so
        // the marking follows the BAR's owners, not only its designed member.
        expect(!!bar.provisional, `bar ${bar.id}`).toBe(ownedByProposal);
      }
    }
  });

  it('carries the mark into the 3-D scene, with a colour of its own', () => {
    const marked = scene.bars.filter((b) => b.provisional);
    expect(marked.length, 'provisional steel reaches the scene').toBeGreaterThan(0);
    // Not a shade of a role colour: a proposal and a design must not be told apart by
    // recognising two similar blues.
    expect(REBAR_COLORS.provisional).not.toBe(REBAR_COLORS.longitudinal);
    expect(REBAR_COLORS.provisional).not.toBe(REBAR_COLORS.transverse);
    expect(REBAR_COLORS.provisional).not.toBe(REBAR_COLORS.conflicted);
    // The scene never hides them — that was the state being replaced, not the fix.
    for (const id of provisional) {
      expect(scene.bars.some((b) => b.elementIds.includes(id)),
        `member ${id} has steel in the scene`).toBe(true);
      expect(scene.solids.some((s) => s.elementIds.includes(id)),
        `member ${id} has concrete in the scene`).toBe(true);
    }
    expect(scene.unreinforcedMembers, 'and no beam is left bare').toEqual([]);
  });

  it('gives the workspace a state that is neither modelled nor a refusal', () => {
    const outcomes = new Map<number, DesignOutcomeSummary>();
    for (const [id] of modelStore.model.elements) {
      const o = verificationStore.outcomeFor(id);
      if (!o) continue;
      const v = verificationStore.providedFor(id);
      outcomes.set(id, {
        outcome: o.outcome,
        verificationStatus: v?.overallStatus,
        verificationLimiting: (v?.checks ?? [])
          .filter((c) => c.status === 'fail')
          .flatMap((c) => (c.limiting ? [String(c.limiting)] : [])),
        limiting: o.limiting,
        reasonKey: o.reasons?.[0]?.key,
      });
    }
    const report = reportElementStatus(scene, outcomes);
    const provisionalEntries = report.entries.filter((e) => e.status === 'PROVISIONAL');
    expect(provisionalEntries.map((e) => e.elementId).sort((a, b) => a - b)).toEqual(provisional);
    expect(NOT_FOR_CONSTRUCTION_STATUSES).toContain('PROVISIONAL');
    // MODELLED is the state that means "finished". No proposal may hold it.
    for (const e of provisionalEntries) expect(e.status).not.toBe('MODELLED');
  });

  it('prints the warning on the sheets of every assembly that carries a proposal', () => {
    const drawings = renderDrawings(doc, RENDER);
    let checked = 0;
    for (const a of doc.assemblies) {
      if ((a.source.provisionalMembers ?? []).length === 0) continue;
      checked += 1;
      // Sheets are named from the assembly id by `renderDrawings`, so an assembly's own
      // sheets are findable without reaching into the renderer's numbering.
      const mine = drawings.sheets.filter((s) => s.name.includes(a.id));
      expect(mine.length, `assembly ${a.id} produced sheets`).toBeGreaterThan(0);
      for (const s of mine) {
        expect(s.sheet.notes.some((n) => NOT_FOR_CONSTRUCTION.test(n)),
          `sheet ${s.name} carries the provisional note`).toBe(true);
        // The note must be FIRST: note order is read order, and a reader who stops after
        // two lines has to have read this one.
        expect(NOT_FOR_CONSTRUCTION.test(s.sheet.notes[0]),
          `sheet ${s.name} states it first`).toBe(true);
      }
    }
    expect(checked, 'at least one assembly was actually examined').toBeGreaterThan(0);
  });

  it('states it on the bar schedule, per row and at the top', () => {
    const books = renderSchedule(doc, RENDER);
    const withProposal = books.filter((b) => b.aoa.flat().join(' ').match(NOT_FOR_CONSTRUCTION));
    expect(withProposal.length, 'the schedule says it is not for issue').toBeGreaterThan(0);
    // And per row: a reader ordering one mark must see it beside that mark.
    const flat = books.map((b) => b.aoa.flat().join(' | ')).join('\n');
    expect(flat).toMatch(/PROVISIONAL — no apto para emisi/i);
  });

  it('states it in the report, above the fold and in its own section', () => {
    const html = renderReportHtml(doc, RENDER, (k) => k);
    expect(html).toMatch(NOT_FOR_CONSTRUCTION);
    expect(html).toContain('Propuestas provisionales');
    // Every provisional member is named, not merely counted.
    for (const id of provisional) {
      expect(html, `member ${id} is listed in the report`).toMatch(new RegExp(`<td>${id}</td>`));
    }
  });

  it('never issues a certificate for a proposal, on any surface', () => {
    for (const id of provisional) {
      const o = verificationStore.outcomeFor(id)!;
      expect(o.outcome).toBe('PROVISIONAL_BIAXIAL');
      expect(o.certificate, `member ${id} has no certificate`).toBeUndefined();
      expect(o.accepted, `member ${id} assigns no certified reinforcement`).toBeUndefined();
      expect(o.finalGeometryCertificate).toBeUndefined();
    }
    /**
     * The document's certificate table LISTS them, and that is correct — it is a report of
     * every member's certification state, not a list of certified members.
     *
     * `matches` on that row answers a STALENESS question ("does the verification on record
     * still describe the steel in the model"), so a member whose steel was verified and
     * refused can legitimately show `matches: true`. On a table headed "verification
     * certificates" that is one glance from being read as certified, which is why the row
     * carries `provisional` and the renderer puts the word in the status cell.
     */
    const rows = new Map(doc.certificates.map((c) => [c.elementId, c]));
    let examined = 0;
    for (const id of provisional) {
      const row = rows.get(id);
      if (!row) continue;   // not in a persisted assembly — nothing claimed either way
      examined += 1;
      expect(row.provisional, `member ${id} is flagged provisional on its row`).toBe(true);
      expect(row.status, `member ${id} is not reported as ok`).not.toBe('ok');
    }
    expect(examined, 'the certificate table was actually examined').toBeGreaterThan(0);

    const html = renderReportHtml(doc, RENDER, (k) => k);
    expect(html, 'and the rendered table says so in words')
      .toContain('PROVISIONAL, sin certificar');
  });

  it('cannot be counted as verified by the design run summary', () => {
    const s = verificationStore.runSummary!;
    expect(s.provisionalBiaxial).toBe(provisional.length);
    // The count that a "how did the design go?" bar reads must exclude them.
    expect(s.verified + s.provisionalBiaxial).toBeLessThanOrEqual(s.total);
    expect(s.verified).toBeLessThan(s.total);
  });

  it('is reported by the detailing run itself, not only inferred from bars', () => {
    const run = detailingStore.lastRun;
    expect(run, 'the detailing run is available').toBeTruthy();
    expect(run!.provisionalMembers).toEqual(provisional);
  });
});
