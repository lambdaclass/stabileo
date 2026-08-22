/**
 * An assembly bar says it is one on EVERY projection, or the distinction is worth nothing.
 *
 * ── What is being distinguished ────────────────────────────────────
 *
 * `2Ø10` at the top of a beam looks the same whether a negative moment sized it or a stirrup
 * bend did. One of those has a verified capacity behind it and the other has nothing but
 * §25.7.1.2 — the regulation asks for a bar in the bend and says nothing about its size, so the
 * diameter is this app's choice. A reader who cannot tell them apart on the sheet they are
 * holding has been handed a number to trust that nobody checked.
 *
 * Which is why this is one file over one run rather than an assertion in each renderer. The
 * 3-D scene, the sheets, the schedule and the report are four independent readers of one
 * document, and the defect this catches is three of them saying "assembly steel" while the
 * fourth — the one that gets printed — says nothing.
 *
 * Modelled on `provisional-projections.test.ts`, which does the same job for the other
 * distinction a beam's steel can carry. A member can be both, either or neither, and the two
 * files deliberately do not know about each other.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { workspaceScene } from './helpers/workspace-scene';
import { verificationStore } from '../../../store/verification.svelte';
import { renderReportHtml, renderDrawings, renderSchedule } from '../document-render';
import { reportElementStatus, type DesignOutcomeSummary } from '../element-status';
import type { SceneModel } from '../scene-model';
import type { DocumentModel } from '../document-model';

const RENDER = { projectName: 'Top steel QA', locale: 'es' } as const;

describe('top assembly reinforcement, across every projection', { timeout: 60_000 }, () => {
  let scene: SceneModel;
  let doc: DocumentModel;
  /** Members whose top steel is the §25.7.1.2 pair, from the scene. */
  let hangers: number[];
  /** The design outcomes exactly as `RebarWorkspace` derives them. */
  let outcomes: Map<number, DesignOutcomeSummary>;

  beforeAll(async () => {
    const w = await workspaceScene('pro-edificio-7p');
    scene = w.scene;
    doc = w.doc;
    outcomes = w.outcomes;
    hangers = [...new Set(scene.bars
      .filter((b) => b.purpose === 'stirrupHanger')
      .flatMap((b) => b.elementIds))].sort((a, b) => a - b);
    expect(hangers.length, 'the fixture actually produces assembly bars').toBeGreaterThan(0);
  }, 900_000);

  it('leaves no beam in the building with a cage and no main steel', () => {
    /**
     * Requirement 16, on the real model. This is the sentence the whole change exists for: a
     * cage of stirrups with no main steel is not a beam, and 63 of the 119 were exactly that.
     */
    const beams = [...verificationStore.contexts]
      .filter(([, c]) => c.elementType === 'beam')
      .map(([id]) => id);
    expect(beams.length).toBeGreaterThan(100);
    const bare = beams.filter((id) =>
      !scene.bars.some((b) => b.elementIds.includes(id) && b.role === 'longitudinal'));
    expect(bare).toEqual([]);
  });

  it('carries the same marking in the document as in the scene', () => {
    const inDoc = [...new Set(doc.assemblies
      .flatMap((a) => a.bars)
      .filter((b) => b.purpose === 'stirrupHanger')
      .flatMap((b) => b.ownerElementIds))].sort((a, b) => a - b);
    expect(inDoc).toEqual(hangers);
  });

  it('never marks a bar the design produced hogging steel for', () => {
    /**
     * The understatement half. A member with a designed top group has its continuous pair
     * counted INTO that group, so marking it assembly steel would report a design that was made
     * as one that was not.
     */
    for (const id of hangers) {
      const o = verificationStore.outcomeFor(id);
      const cand = (o?.accepted ?? o?.provisional?.candidate) as
        undefined | { regions?: Record<string, { count: number } | undefined> };
      expect(cand?.regions?.topStart, `member ${id} designed topStart`).toBeUndefined();
      expect(cand?.regions?.topEnd, `member ${id} designed topEnd`).toBeUndefined();
    }
  });

  it('gives every marked bar a real diameter, a real length and a mark', () => {
    /**
     * "Do not declare it done if bars of zero diameter are drawn." A bar that every data
     * structure counts and no renderer draws is the exact shape the original report took.
     */
    for (const a of doc.assemblies) {
      const markOf = new Map<string, string>();
      for (const m of a.source.marks) for (const id of m.barIds) markOf.set(id, m.mark);
      for (const b of a.bars) {
        if (b.purpose !== 'stirrupHanger') continue;
        expect(b.diameterMm, b.id).toBeGreaterThan(0);
        expect(b.cuttingLength, b.id).toBeGreaterThan(0);
        expect(markOf.get(b.id), `${b.id} has a schedule mark`).toBeTruthy();
      }
    }
    for (const b of scene.bars) {
      if (b.purpose !== 'stirrupHanger') continue;
      expect(b.polyline.length, b.barId).toBeGreaterThan(1);
      expect(b.diameterMm, b.barId).toBeGreaterThan(0);
      expect(b.mark, b.barId).toBeTruthy();
    }
  });

  it('gives the schedule its own column, and never merges the two roles into one row', () => {
    const sheets = renderSchedule(doc, RENDER);
    const flat = sheets.map((s) => s.aoa.map((r) => r.join('|')).join('\n')).join('\n');
    expect(flat).toContain('Función');
    expect(flat).toContain('Armado (25.7.1.2)');
    expect(flat).toContain('Resistente');

    // A mark carries one role, by construction: `purpose` is part of the grouping key.
    for (const a of doc.assemblies) {
      for (const m of a.source.marks) {
        const bars = a.bars.filter((b) => m.barIds.includes(b.id));
        expect(new Set(bars.map((b) => b.purpose ?? '')).size, `mark ${m.mark}`).toBe(1);
      }
    }
  });

  it('puts the warning on the sheets, saying both things a reader acts on', () => {
    const drawings = renderDrawings(doc, RENDER);
    const notes = drawings.sheets
      .flatMap((s) => s.sheet.notes)
      .filter((n) => /ARMADURA SUPERIOR DE ARMADO/.test(n));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      // That the steel does not resist a moment, and that its size is not the regulation's.
      expect(n).toMatch(/NO son armadura resistente/);
      expect(n).toMatch(/no fija su diámetro/);
      // And WHICH members, so the note is a way in rather than a disclaimer.
      expect(n).toMatch(/\d+/);
    }
  });

  it('says it in the report above the fold AND in a section of its own', () => {
    const html = renderReportHtml(doc, RENDER, (k) => k);
    expect(html).toMatch(/ARMADURA SUPERIOR DE ARMADO/);
    expect(html).toMatch(/Armadura superior de armado<\/h2>/);
    // The clause that does NOT apply is named as not applying, rather than quietly omitted.
    expect(html).toMatch(/9\.6\.1\.2 no la alcanza/);
    expect(html).toMatch(/25\.7\.1\.2/);
    // And every member is named, not just counted.
    for (const id of hangers.slice(0, 10)) {
      expect(html).toMatch(new RegExp(`<td>${id}</td>`));
    }
  });

  it('shows it in the status table without moving anybody\'s state', () => {
    const report = reportElementStatus(scene, outcomes);
    expect(report.hangerTopMembers).toEqual(hangers.filter(
      (id) => report.entries.some((e) => e.elementId === id)));

    // The state stays whatever the design made it: a member the design verified must not be
    // demoted by a top-steel projection, and one it left provisional must not be promoted.
    for (const id of report.hangerTopMembers) {
      const e = report.entries.find((x) => x.elementId === id)!;
      expect(e.topSteel).toBe('hangerProvisional');
      expect(['PROVISIONAL', 'MODELLED'], `member ${id}`).toContain(e.status);
    }
    // The set is substantial, so "nobody's state moved" is a real claim rather than a
    // statement about an empty list.
    expect(report.hangerTopMembers.length, 'hanger top steel reaches many members').toBe(74);
    // None of them is PROVISIONAL any more. This assertion used to require the opposite —
    // over 50 proposals — because the fixture's transposed section inertias inflated
    // secondary moments until almost every beam was refused, and the canonical-section work
    // that came with the merge now derives those inertias from geometry. See
    // beam-reinforcement-audit.test.ts. With the axes right these members are verified, and
    // their top steel is still projected as
    // `hangerProvisional`: an assembly proposal on a member whose flexural design passed.
    // That distinction is the thing worth pinning, and the loop above pins it.
    const proposals = report.hangerTopMembers.filter((id) =>
      report.entries.find((x) => x.elementId === id)!.status === 'PROVISIONAL');
    expect(proposals.length, 'no hanger-top member is a flexural proposal now').toBe(0);
    // And the two axes stay orthogonal in the aggregate as well as member by member: the
    // top-steel chip says what the steel IS, the state column says what the design CONCLUDED,
    // and every member of the set is accounted for by one state or the other. Asserted apart
    // from the count above because it survives whatever the load combination makes that count.
    const modelled = report.hangerTopMembers.filter((id) =>
      report.entries.find((x) => x.elementId === id)!.status === 'MODELLED');
    expect(proposals.length + modelled.length, 'every top-steel member is in one state or the other')
      .toBe(report.hangerTopMembers.length);
  });

  it('never lets an assembly bar acquire a certificate', () => {
    /**
     * The one thing this change is forbidden to do. Two constructive bars say nothing about
     * the axis nobody checked, so a proposal that came out of this VERIFIED would be a false
     * pass wearing an honest name.
     */
    for (const id of hangers) {
      const o = verificationStore.outcomeFor(id);
      if (o?.outcome === 'PROVISIONAL_BIAXIAL') {
        expect(o.certificate, `member ${id}`).toBeUndefined();
        expect(o.accepted, `member ${id}`).toBeUndefined();
      }
    }
  });
});
