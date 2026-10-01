/**
 * The 63 empty beams — the evidence, and now the regression test that they are not empty.
 *
 * ── What was reported, and what was actually true ──────────────────
 *
 * "Many beams show no proposed reinforcement", with ten ids. All ten HAD bars — 24 to 48 each,
 * in the design, the detailing, the DocumentModel and the SceneModel, none degenerate. Every one
 * of those bars was TRANSVERSE, and not even the beam's own: they were the JOINT ties of the
 * columns those beams frame into, which record the incident beams as owners so the classifier
 * can see the containment. Sixty-three of the 119 beams had no steel of their own at all.
 *
 * ── The mechanism, in one line of `run-detailing.ts` ───────────────
 *
 *     if (!bottom || !topStart || !topEnd) return null;   // beamGroups()
 *
 * All three or nothing. The affected beams were designed with bottom steel and no hogging steel
 * — `bottomSpan=2Ø20`, `topStart=—`, `topEnd=—` in the design's own candidate, so it was never a
 * lossy write — and the gate therefore discarded the bottom bars the design DID produce, and the
 * stirrup cage with them, since `generateBeamBars` builds both in one call.
 *
 * It was not the provisional state, which was the obvious reading and is wrong: 62 of the 63 were
 * PROVISIONAL_BIAXIAL and one was VERIFIED, while 55 other proposals got their longitudinal steel
 * normally. The discriminator was only whether the design produced top steel.
 *
 * ── What replaced it ───────────────────────────────────────────────
 *
 * The missing group is RESOLVED rather than demanded — `../beam-top-steel.ts`, whose
 * header carries the clauses verbatim. Two bars, from §25.7.1.2 (every bend of a closed stirrup
 * contains a longitudinal bar), §25.7.1.3(a) (a U stirrup's hook closes around one) and
 * §9.7.7.1(b) (no fewer than two continuous). No area, because §9.6.1.1 scopes §9.6.1.2 to
 * sections where the analysis requires tension steel and these do not. And no clause at all for
 * the DIAMETER, which is why every bar this produces is marked `stirrupHanger` and no surface may
 * present it as capacity.
 *
 * ── What this file is now ──────────────────────────────────────────
 *
 * The same evidence, kept runnable, with the assertions flipped: what used to assert the defect
 * now asserts its absence, and the table still prints so a regression can be read rather than
 * guessed at. Twelve seconds to re-derive it.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { workspaceScene } from './helpers/workspace-scene';
import { modelStore } from '../../../store/model.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { renderDrawings } from '../document-render';
import { peakMy, peakMz, peakVy, peakVz, peakAxial, peakTorsion } from '../../design/design-axes';
import type { SceneModel } from '../scene-model';
import type { DocumentModel } from '../document-model';

const REPORTED = [197, 199, 201, 203, 198, 163, 140, 143, 146, 89];

interface Row {
  id: number;
  type: string;
  section: string;
  outcome: string;
  limiting: string;
  reasons: string;
  axial: number;
  primary: number;
  secondary: number;
  ratio: number;
  torsion: number;
  shear: number;
  inDesign: boolean;
  inDetailing: number;
  inDocument: number;
  inScene: number;
  inDrawings: number;
  hasSolid: boolean;
}

describe('DIAGNOSTIC: beams with no reinforcement anywhere', { timeout: 900_000 }, () => {
  let scene: SceneModel;
  let doc: DocumentModel;
  let rows: Row[];

  beforeAll(async () => {
    const w = await workspaceScene('pro-edificio-7p');
    scene = w.scene;
    doc = w.doc;

    const drawings = renderDrawings(doc, { projectName: 'diag', locale: 'es' });
    // Every element id named by any text on any sheet.
    const drawnBars = new Map<number, number>();
    for (const a of doc.assemblies) {
      for (const b of a.bars) {
        for (const id of b.ownerElementIds) drawnBars.set(id, (drawnBars.get(id) ?? 0) + 1);
      }
    }

    rows = [];
    for (const [id, el] of modelStore.model.elements) {
      const ctx = verificationStore.contexts.get(id);
      if (!ctx || ctx.elementType !== 'beam') continue;
      const o = verificationStore.outcomeFor(id);
      const d = ctx.demands;
      const my = peakMy(d);
      const mz = peakMz(d);
      rows.push({
        id,
        type: ctx.elementType,
        section: ctx.section.name ?? String(el.sectionId),
        outcome: o?.outcome ?? 'NO-OUTCOME',
        limiting: (o?.limiting ?? []).join('+') || '—',
        reasons: (o?.reasons ?? []).map((r) => r.key.replace('design.reason.', '')).join('+') || '—',
        axial: +peakAxial(d).toFixed(1),
        primary: +Math.max(my, mz).toFixed(1),
        secondary: +Math.min(my, mz).toFixed(1),
        ratio: +(o?.axes?.secondaryRatio ?? 0).toFixed(3),
        torsion: +peakTorsion(d).toFixed(2),
        shear: +Math.max(peakVy(d), peakVz(d)).toFixed(1),
        inDesign: !!(o?.accepted ?? o?.provisional),
        inDetailing: drawnBars.get(id) ?? 0,
        inDocument: doc.assemblies
          .flatMap((a) => a.bars).filter((b) => b.ownerElementIds.includes(id)).length,
        inScene: scene.bars.filter((b) => b.elementIds.includes(id)).length,
        inDrawings: drawings.sheets.filter((s) =>
          s.sheet.texts.some((t) => new RegExp(`\\b${id}\\b`).test(t.text ?? ''))).length,
        hasSolid: scene.solids.some((s) => s.elementIds.includes(id)),
      });
    }
    rows.sort((a, b) => a.id - b.id);
  }, 900_000);

  it('prints the reported members in full', () => {
    const pick = rows.filter((r) => REPORTED.includes(r.id));
    console.log('\n=== REPORTED MEMBERS ===');
    for (const r of pick) console.log(JSON.stringify(r));
    console.log(`(${pick.length} of ${REPORTED.length} reported ids are beams with a context)`);
    const missing = REPORTED.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) {
      console.log('reported ids that are NOT beams with a context:', missing.join(', '));
      for (const id of missing) {
        const ctx = verificationStore.contexts.get(id);
        const el = modelStore.model.elements.get(id);
        console.log(`  ${id}: element=${!!el} ctx=${ctx?.elementType ?? 'none'} `
          + `outcome=${verificationStore.outcomeFor(id)?.outcome ?? 'none'} `
          + `sceneBars=${scene.bars.filter((b) => b.elementIds.includes(id)).length} `
          + `sceneSolid=${scene.solids.some((s) => s.elementIds.includes(id))}`);
      }
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  it('summarises every beam by outcome and by where its steel stops', () => {
    const byOutcome = new Map<string, number>();
    for (const r of rows) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1);
    console.log('\n=== BEAMS BY OUTCOME ===');
    for (const [k, v] of [...byOutcome].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

    const empty = rows.filter((r) => r.inScene === 0);
    console.log(`\n=== BEAMS WITH NO STEEL IN THE SCENE: ${empty.length} of ${rows.length} ===`);
    const byReason = new Map<string, number[]>();
    for (const r of empty) {
      const key = `${r.outcome} | limiting=${r.limiting}`;
      byReason.set(key, [...(byReason.get(key) ?? []), r.id]);
    }
    for (const [k, ids] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${k}  →  ${ids.length} members: ${ids.slice(0, 14).join(', ')}`
        + (ids.length > 14 ? ` …(+${ids.length - 14})` : ''));
    }

    console.log('\n=== WHERE STEEL STOPS (beams that have it in one stage, not the next) ===');
    const designNotDoc = rows.filter((r) => r.inDesign && r.inDocument === 0);
    const docNotScene = rows.filter((r) => r.inDocument > 0 && r.inScene === 0);
    const sceneNoSolid = rows.filter((r) => r.inScene > 0 && !r.hasSolid);
    console.log(`  design → document lost: ${designNotDoc.length} `
      + `${designNotDoc.slice(0, 20).map((r) => r.id).join(', ')}`);
    console.log(`  document → scene lost:  ${docNotScene.length} `
      + `${docNotScene.slice(0, 20).map((r) => r.id).join(', ')}`);
    console.log(`  scene bars with no concrete: ${sceneNoSolid.length}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('checks whether the bars actually produce GEOMETRY, not merely records', () => {
    /**
     * A bar in the SceneModel is not a bar on the screen.
     *
     * `appendTube` needs at least two polyline points and returns nothing for fewer, so a bar
     * record with a degenerate centreline is counted by every data structure and drawn by none.
     * That is the shape a "the beam has reinforcement everywhere and looks empty" report takes.
     */
    const bad: Array<{ id: number; bars: number; degenerate: number; zeroLen: number }> = [];
    for (const r of rows) {
      const bars = scene.bars.filter((b) => b.elementIds.includes(r.id));
      const degenerate = bars.filter((b) => b.polyline.length < 2).length;
      const zeroLen = bars.filter((b) => {
        if (b.polyline.length < 2) return false;
        let len = 0;
        for (let i = 1; i < b.polyline.length; i++) {
          const a = b.polyline[i - 1]; const c = b.polyline[i];
          len += Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
        }
        return len < 1e-6;
      }).length;
      if (degenerate > 0 || zeroLen > 0) bad.push({ id: r.id, bars: bars.length, degenerate, zeroLen });
    }
    console.log(`\n=== BEAMS WHOSE BARS PRODUCE NO TUBE: ${bad.length} ===`);
    for (const b of bad.slice(0, 20)) console.log(JSON.stringify(b));

    // And the diameters — a zero diameter is a tube of zero radius.
    const zeroDia = rows.map((r) => ({
      id: r.id,
      zero: scene.bars.filter((b) => b.elementIds.includes(r.id) && !(b.diameterMm > 0)).length,
    })).filter((x) => x.zero > 0);
    console.log(`=== BEAMS WITH ZERO-DIAMETER BARS: ${zeroDia.length} ===`);
    for (const z of zeroDia.slice(0, 20)) console.log(JSON.stringify(z));

    // Where the reported beams' bars actually sit in space, against the model bounds.
    console.log('\n=== REPORTED BEAMS: bar extents ===');
    for (const id of REPORTED) {
      const bars = scene.bars.filter((b) => b.elementIds.includes(id));
      if (bars.length === 0) { console.log(`  ${id}: no bars`); continue; }
      const pts = bars.flatMap((b) => b.polyline);
      const zs = pts.map((p) => p.z);
      const roles = [...new Set(bars.map((b) => b.role))].join('/');
      const scopes = [...new Set(bars.map((b) => b.ownerScope))].join('/');
      console.log(`  ${id}: ${bars.length} bars, roles=${roles}, scope=${scopes}, `
        + `z ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}, `
        + `assemblies=${[...new Set(bars.map((b) => b.assemblyId))].join(',')}`);
    }
    expect(true).toBe(true);
  });

  it('splits every beam by whether it has LONGITUDINAL steel', () => {
    /**
     * The thing QA actually saw.
     *
     * Every reported member has bars — and all of them transverse. A beam with stirrups and no
     * main steel reads as "no reinforcement" to anyone looking at it, and it is not far wrong:
     * the stirrups come from the transverse cage generator, which runs off the section, and the
     * longitudinal bars are the ones the DESIGN produces.
     */
    const split = rows.map((r) => {
      const bars = scene.bars.filter((b) => b.elementIds.includes(r.id));
      return {
        id: r.id,
        outcome: r.outcome,
        long: bars.filter((b) => b.role === 'longitudinal').length,
        trans: bars.filter((b) => b.role === 'transverse').length,
      };
    });
    const noLong = split.filter((x) => x.long === 0);
    console.log(`\n=== BEAMS WITH ZERO LONGITUDINAL BARS: ${noLong.length} of ${rows.length} ===`);
    const byOutcome = new Map<string, number>();
    for (const x of noLong) byOutcome.set(x.outcome, (byOutcome.get(x.outcome) ?? 0) + 1);
    for (const [k, v] of byOutcome) console.log(`  ${k}: ${v}`);
    console.log('  ids:', noLong.slice(0, 30).map((x) => x.id).join(', '),
      noLong.length > 30 ? `…(+${noLong.length - 30})` : '');

    const withLong = split.filter((x) => x.long > 0);
    console.log(`\n=== BEAMS WITH LONGITUDINAL BARS: ${withLong.length} ===`);
    for (const x of withLong.slice(0, 10)) console.log(`  ${JSON.stringify(x)}`);

    // And the same question one stage earlier: does the DOCUMENT hold longitudinal bars?
    const docLong = rows.map((r) => {
      const bars = doc.assemblies.flatMap((a) => a.bars)
        .filter((b) => b.ownerElementIds.includes(r.id));
      return {
        id: r.id,
        outcome: r.outcome,
        long: bars.filter((b) => b.role === 'longitudinal').length,
        trans: bars.filter((b) => b.role === 'transverse').length,
      };
    });
    console.log(`\n=== DOCUMENT: beams with zero longitudinal bars: `
      + `${docLong.filter((x) => x.long === 0).length} ===`);

    // And one stage earlier still: does the MODEL hold a reinforcement record for them?
    const modelRebar = rows.map((r) => {
      const rf = modelStore.elements.get(r.id)?.reinforcement;
      return {
        id: r.id, outcome: r.outcome,
        hasRebar: !!rf,
        regions: rf?.regions ? Object.keys(rf.regions).filter((k) => (rf.regions as never)[k]).join(',') : '—',
        stirrups: !!rf?.stirrups,
      };
    });
    console.log('\n=== MODEL reinforcement, reported members ===');
    for (const m of modelRebar.filter((x) => REPORTED.includes(x.id))) {
      console.log(`  ${JSON.stringify(m)}`);
    }
    console.log('=== MODEL reinforcement, the two VERIFIED beams ===');
    for (const m of modelRebar.filter((x) => x.outcome === 'VERIFIED')) {
      console.log(`  ${JSON.stringify(m)}`);
    }
    expect(true).toBe(true);
  });

  it('asks whether the DESIGN produced top steel that later went missing', () => {
    /**
     * The distinction that decides whether this is a lossy write or a missing rule.
     *
     * `beamGroups` needs bottom AND topStart AND topEnd, and returns null — discarding the
     * bottom steel too — when any is absent. If the design's own candidate carries top steel
     * and only the model's copy lacks it, the write is lossy and that is a plain bug. If the
     * candidate has none either, then the question is what top steel a beam with no hogging
     * demand should get, and that is a detailing rule, not a defect.
     */
    console.log('\n=== DESIGN CANDIDATE vs MODEL, for the reported members ===');
    for (const id of REPORTED) {
      const o = verificationStore.outcomeFor(id);
      const cand = (o?.accepted ?? o?.provisional?.candidate) as
        undefined | { regions?: Record<string, { count: number; diameter: number } | undefined>;
          top?: { count: number; diameter: number }; bottom?: { count: number; diameter: number } };
      const r = cand?.regions;
      const fmt = (x?: { count: number; diameter: number }) =>
        x ? `${x.count}Ø${x.diameter}` : '—';
      console.log(`  ${id}: candidate bottomSpan=${fmt(r?.bottomSpan)} `
        + `topStart=${fmt(r?.topStart)} topEnd=${fmt(r?.topEnd)} `
        + `top=${fmt(cand?.top)} bottom=${fmt(cand?.bottom)}`);
    }
    console.log('\n=== the same for two beams that DO get longitudinal bars ===');
    const good = rows.filter((r) =>
      scene.bars.some((b) => b.elementIds.includes(r.id) && b.role === 'longitudinal'))
      .slice(0, 3);
    for (const g of good) {
      const o = verificationStore.outcomeFor(g.id);
      const cand = (o?.accepted ?? o?.provisional?.candidate) as
        undefined | { regions?: Record<string, { count: number; diameter: number } | undefined>;
          top?: { count: number; diameter: number } };
      const r = cand?.regions;
      const fmt = (x?: { count: number; diameter: number }) =>
        x ? `${x.count}Ø${x.diameter}` : '—';
      console.log(`  ${g.id} (${g.outcome}): bottomSpan=${fmt(r?.bottomSpan)} `
        + `topStart=${fmt(r?.topStart)} topEnd=${fmt(r?.topEnd)} top=${fmt(cand?.top)}`);
    }
    expect(true).toBe(true);
  });

  it('every reported id now has MAIN steel, not only a cage', () => {
    /**
     * The assertion this file was written to make, inverted.
     *
     * It read `.toBe(0)` and was labelled "this is the defect". Both halves matter now: the
     * member must have longitudinal bars, and they must be bars of its own rather than another
     * member's joint ties claiming its id — which is what the 24-to-48 transverse bars were.
     */
    for (const id of REPORTED) {
      const bars = scene.bars.filter((b) => b.elementIds.includes(id));
      expect(bars.length, `member ${id} has bars in the scene`).toBeGreaterThan(0);
      const long = bars.filter((b) => b.role === 'longitudinal');
      expect(long.length, `member ${id} has main steel`).toBeGreaterThan(0);
      const own = bars.filter((b) => b.role === 'transverse'
        && b.piece !== 'jointTie' && b.piece !== 'jointCrosstie');
      expect(own.length, `member ${id} has a cage of its own`).toBeGreaterThan(0);
    }
  });

  it('leaves no beam in the building with a cage and no main steel', () => {
    const bare = rows.filter((r) =>
      !scene.bars.some((b) => b.elementIds.includes(r.id) && b.role === 'longitudinal'));
    expect(bare.map((r) => r.id)).toEqual([]);
  });

  it('gives the bottom-only beams a marked hanger pair, and only those beams', () => {
    /**
     * The two facts that keep the fix honest, together.
     *
     * A beam whose design produced hogging steel must NOT acquire a hanger marking — its
     * continuous top pair is part of that hogging steel and marking it would understate the
     * design. A beam whose design produced none must have exactly two, marked, and they must be
     * the top face rather than something that merely counted as longitudinal.
     */
    //
    // Which of the reported beams those are is read from the design, not listed: 163, 146 and
    // 89 were bottom-only until self-weight became a member load, and now carry 7Ø10 over each
    // support from their own weight's hogging moment.
    const topSteel = (id: number) => {
      const r = modelStore.model.elements.get(id)?.reinforcement as
        { regions?: { topStart?: { count: number }; topEnd?: { count: number } } } | undefined;
      return (r?.regions?.topStart?.count ?? 0) + (r?.regions?.topEnd?.count ?? 0);
    };
    const bottomOnly = REPORTED.filter((id) => topSteel(id) === 0);
    expect(bottomOnly, 'the bottom-only beams among the reported ones')
      .toEqual([197, 199, 201, 203, 198, 140, 143]);
    for (const id of REPORTED) {
      const hangers = scene.bars.filter((b) =>
        b.elementIds.includes(id) && b.purpose === 'stirrupHanger');
      if (!bottomOnly.includes(id)) {
        expect(hangers, `member ${id} designed top steel, so no hanger`).toEqual([]);
        continue;
      }
      expect(hangers.length, `member ${id} hanger pair`).toBe(2);
      for (const h of hangers) {
        expect(h.role).toBe('longitudinal');
        expect(h.diameterMm, `member ${id} hanger Ø`).toBeGreaterThan(0);
        expect(h.layerId?.split(':')[1], `member ${id} hanger face`).toMatch(/^top/);
      }
    }
    // 85 is the VERIFIED beam whose design DID produce top steel (7Ø10 at each support).
    expect(scene.bars.filter((b) =>
      b.elementIds.includes(85) && b.purpose === 'stirrupHanger')).toEqual([]);
  });

  it('no longer discriminates on whether the design produced top steel', () => {
    /**
     * The old reading — "proposals lose their steel" — was wrong then and is worth keeping
     * disproved: the discriminator was the design's top steel, and it applied to a VERIFIED beam
     * exactly as it applied to a proposal. Both halves are now asserted the other way round.
     */
    const withLong = (id: number) =>
      scene.bars.some((b) => b.elementIds.includes(id) && b.role === 'longitudinal');
    expect(rows.filter((r) => r.outcome === 'PROVISIONAL_BIAXIAL' && !withLong(r.id)))
      .toEqual([]);
    expect(rows.filter((r) => r.outcome === 'VERIFIED' && !withLong(r.id))).toEqual([]);
  });

  it('keeps a provisional proposal provisional, hanger pair or not', () => {
    /**
     * The state the fix is forbidden to move.
     *
     * Giving a beam the two bars §25.7.1.2 asks for says nothing about the axis nobody checked.
     * A proposal that came out of this with a VERIFIED outcome would be a false pass wearing an
     * honest name — the exact failure `assertOutcomeInvariants` exists to stop, reasserted here
     * on the real building because that is where the 62 of them are.
     *
     * 28 members carry a hanger since self-weight became a member load (74 before): a beam's
     * own weight now gives most supports a hogging moment and the top steel that answers it.
     * The building has no proposal left, so what this still guards is the VERIFIED half.
     */
    const hangers = new Set(scene.bars
      .filter((b) => b.purpose === 'stirrupHanger')
      .flatMap((b) => b.elementIds));
    expect(hangers.size).toBeGreaterThan(20);
    for (const id of hangers) {
      const o = verificationStore.outcomeFor(id);
      if (!o) continue;
      expect(['PROVISIONAL_BIAXIAL', 'VERIFIED'], `member ${id}`).toContain(o.outcome);
      if (o.outcome === 'PROVISIONAL_BIAXIAL') {
        expect(o.certificate, `member ${id} must carry no certificate`).toBeUndefined();
      }
    }
  });
});
