/**
 * The concrete design, pinned member by member, before the metallic work touches anything.
 *
 * ── Why the existing gate is not enough ────────────────────────────
 *
 * `autodesign-regression.test.ts` asserts the AGGREGATE on the same fixture: 386 verified,
 * 22 search-exhausted, nothing else. That is a real gate and it stays. It is also blind to
 * the failure mode this branch can actually cause.
 *
 * PR21 has to touch `member-context.ts` — the builder that reads a material's `fy` as a
 * concrete `f'c` and hands it to every adapter. A change there that shifted one column's
 * effective depth, or swapped which axis governs on a handful of members, would move
 * utilizations and reinforcement while leaving the counts at 386/22 exactly. The aggregate
 * cannot see it. A digest of every member's own result can.
 *
 * ── What is pinned, and what deliberately is not ───────────────────
 *
 * Per element: the outcome, the governing constraints, and the certified utilization
 * rounded to four decimals. That last rounding is the one judgement call here — the search
 * is deterministic, but pinning a full double would make the test a hostage to the last
 * bit of a square root on a different CPU. Four decimals is far tighter than any change
 * that matters and far looser than floating-point noise.
 *
 * NOT pinned: timings, candidate counts, verifier call counts. Those are performance
 * facts, they already have their own budgets in the regression suite, and freezing them
 * here would make every optimisation look like a correctness regression.
 *
 * ── When this test fails ───────────────────────────────────────────
 *
 * It means the concrete design changed. That is a defect in this branch until proven
 * otherwise: PR21 is not allowed to change a concrete result. Do not re-record the digest
 * to make it pass — find what moved.
 */

import { describe, it, expect } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { solveFixture, assertRealSolver } from './helpers';
import type { DesignRunSummary } from '../outcome';

/**
 * One line per member: `id|OUTCOME|limiting,in,order|utilization`.
 *
 * Sorted by element id so the comparison is order-independent — the run's own map order
 * is an implementation detail and would otherwise make a scheduling change look like a
 * design change.
 */
function digestLines(s: DesignRunSummary): string[] {
  return [...s.outcomes.values()]
    .sort((a, b) => a.elementId - b.elementId)
    .map((o) => {
      const util = o.certificate ? o.certificate.worstUtilization.toFixed(4) : '—';
      const limiting = [...o.limiting].sort().join(',');
      return `${o.elementId}|${o.outcome}|${limiting}|${util}`;
    });
}

/** Small stable hash, so a mismatch reports one changed number instead of 408 lines. */
function fingerprint(lines: readonly string[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      h1 = Math.imul(h1 ^ line.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 + line.charCodeAt(i), 0x85ebca6b) >>> 0;
    }
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

describe('RC design baseline — the flagship frame, member by member', () => {
  const solved = solveFixture(frame);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  const lines = digestLines(summary);

  it('still designs the same number of members the same ways', () => {
    assertRealSolver();
    // Restated here rather than only in the aggregate suite: if these move, the digest
    // below has moved too, and the reader should see the coarse reason first.
    /**
     * 408 and 386 are the numbers this file recorded at its ORIGINAL base, and they are
     * unchanged. That is the load-bearing fact in the re-recording below: main moved the
     * refused members from one label to another without designing a single member differently.
     */
    /*
     * 395 and 13 since self-weight became a member load. The weight lumped at the nodes gave
     * a beam no bending; as a load along it, it adds strong-axis moment and nothing lateral, so
     * nine BEAM-Y members (243, 246, 249, 274, 280, 364, 376, 395, 407) fall under the
     * 10 % lateral-to-strong ratio that makes a beam biaxial: 0,104–0,125 before, 0,080–0,097
     * after. They are designed and verified. No member went the other way.
     */
    /*
     * 373 and 22 since the design reads the column cages (`joint-threading-check.ts`): 22 beams
     * whose bars no layout passes through the columns' bars at their joints refuse on
     * congestion (13 of them on anchorage as well), where they were certified and then laid
     * through those bars. Before: 395 verified, 0 inadequate; after: 373 and 22.
     */
    expect(summary.total).toBe(408);
    /*
     * 379 and 16 since the verifier checks the ductility of a flexural member (§9.3.3.1): six of
     * the 22 reach a passing arrangement that threads the cages (see the fingerprint).
     */
    // 383 and 12 since the minimum shear reinforcement of §9.6.3.1 (see the fingerprint).
    // 372 and 23 since the design met main's concrete in the engine (see the fingerprint): the
    // columns are read on the engine's load contour and carry bars on every face, and 11 more
    // edge beams find no layout through those cages.
    expect(summary.verified).toBe(372);
    // The 23 congested beams are an exhausted search, not a proven section (`section-bounds.ts`).
    expect(summary.searchExhausted).toBe(23);
    expect(summary.provisionalBiaxial).toBe(13);
    expect(summary.sectionInadequate).toBe(0);
    expect(summary.demandUnavailable).toBe(0);
    expect(summary.unsupported).toBe(0);
    expect(summary.aborted).toBe(false);
  });

  it('produces one digest line per member, and no member without an id', () => {
    expect(lines).toHaveLength(408);
    expect(new Set(lines.map((l) => l.split('|')[0])).size).toBe(408);
  });

  it('never certifies above the fail threshold', () => {
    for (const o of summary.outcomes.values()) {
      if (!o.certificate) continue;
      expect(o.certificate.worstUtilization).toBeLessThanOrEqual(1.000001);
    }
  });

  /**
   * The gate itself.
   *
   * The expected fingerprint is recorded from this branch at its base commit, with no
   * metallic code in the path. Every later commit on this branch must reproduce it.
   */
  it('reproduces the recorded per-member fingerprint exactly', () => {
    const actual = fingerprint(lines);
    /*
     * Re-recorded 2026-08-15 against origin/main@d6b32ff0. See RECORDED_FINGERPRINT for how,
     * and why it was not this branch's to keep. The rule above still stands: do NOT re-record
     * to make a change of yours pass.
     *
     * Re-recorded again here, and this one IS this branch's change, so it carries its evidence.
     * `computeFlexureCapacity` was returning a doubly reinforced section that satisfied no
     * equilibrium — see `doubly-reinforced-capacity-balances.test.ts`. Correcting it moves
     * capacities, so this digest had to move with them. What was checked before re-recording,
     * member by member across all 408:
     *
     *   outcome changed              0
     *   limiting constraint changed  0
     *   utilisation changed         65  (28 up, 37 down)
     *   worst utilisation after   0.9970  — the 1.0 gate above still holds
     *
     * Both directions are expected and neither is alarming. Up: the section now reports the
     * capacity it has, so the same steel is used harder. Down: the search no longer believes
     * in capacity that was not there, so it places more steel and lands further below its
     * target. What must NOT move is a verdict, and none did.
     *
     * And again, for self-weight as a member load (see the counts above). Checked across all
     * 408 before re-recording:
     *
     *   outcome changed               9  (PROVISIONAL_BIAXIAL → VERIFIED, the nine named above)
     *   limiting constraint changed   0
     *   utilisation changed         100  (65 up, 35 down; −0,077 to +0,103)
     *   worst utilisation after   1,0000 — the gate above still holds
     *
     * Up: a beam now carries its weight's wL²/8 and its fixed-end moments reach the columns.
     * Down: where wind governs a support region, the added gravity moment opposes it there.
     *
     * And again, for the design reading the column cages at each beam's joints. Checked across
     * all 408 against the previous commit before re-recording:
     *
     *   outcome changed              22  (VERIFIED → SECTION_INADEQUATE, congestion)
     *   limiting constraint changed  22  (the same 22)
     *   utilisation changed          15  (all down, to −0,193: beams redesigned to bars that pass,
     *                                     and to support rows whose hooks anchor where they are laid)
     *   worst utilisation after   0,998 — the gate above still holds
     *
     * And again, for the ductility check of a flexural member (CIRSOC 201-2025 §9.3.3.1, from
     * main with the beam check moved into the engine). Checked across all 408 against the same
     * run with only that check switched off, before re-recording:
     *
     *   outcome changed               6  (SEARCH_EXHAUSTED → VERIFIED: 169, 170, 171, 172, 197, 198)
     *   limiting constraint changed   2  (164 and 165 trade «anchorage», both still congestion)
     *   utilisation changed           7  (162, 163 up 0,812 → 0,851; 173, 192, 195, 254, 257
     *                                     down by 0,001 to 0,003)
     *   worst utilisation after   0,998 — the gate above still holds
     *
     * A check added: over-reinforced candidates are rejected for maxSteel before the joint stage,
     * and the search reaches, for the six, bars that pass every check and thread the cages.
     *
     * And again, for the minimum shear reinforcement of §9.6.3.1 on beams deeper than 250 mm
     * (Av,min where Vu > φ·0,085·√f'c·bw·d). Checked across all 408 against the run without it:
     *
     *   outcome changed               4  (165–168 SEARCH_EXHAUSTED → VERIFIED)
     *   limiting constraint changed   6  (those four; 182 and 188 add «anchorage», still congestion)
     *   stirrups changed            169  (closer spacing where Av,min governs)
     *   utilisation changed         135  (125 down to −0,363; 10 up to +0,251, all ≤ 0,974)
     *   worst utilisation after   0,998 — the gate above still holds
     *
     * The generator no longer offers stirrups under Av,min, so its first 30 options per region
     * reach arrangements it used to cut off: the four that now verify, and lighter Ø6 sets in
     * place of Ø8 c/30 on the ten that move up.
     */
    /*
     * And again for refactor/concrete-in-engine (#390), which IS that branch's change: the
     * station verifier's beam flexure takes the axial force acting with each moment (finding
     * 17), its biaxial columns are checked on the engine's load contour instead of Bresler with
     * Nu·φMn/Mu estimates, and the column's axial cap and φ come from the engine. Measured, not
     * reasoned: the dump below was taken on a detached worktree of the base (5b1482c7, which
     * reproduces the previous fingerprint f8a66e1b74ca71f1 exactly) and on the branch, all 408:
     *
     *   outcome changed               0
     *   limiting constraint changed   0
     *   utilisation changed          65  (51 up, 14 down; −0,065 to +0,049)
     *   worst utilisation after   0,9980 — the gate above still holds
     *
     * Up: beams in tension now lose the flexural strength the tension takes, and biaxial columns
     * are read on the real contour. Down: compressed beams below balance gain some, and the
     * contour credits what the Bresler estimate did not. No verdict moved.
     */
    expect(actual).toBe(RECORDED_FINGERPRINT);
  });

  it('keeps the members that refuse, refusing for the same reason', () => {
    // The same 22 members are the fixture's BEAM-Y set, refused on unchecked biaxial demand.
    // Pinned separately from the fingerprint because this is the assertion whose meaning a
    // reader can check without recomputing a hash — and it is where main's drift is visible in
    // words: the SET did not change, the SIZE did not change, the REASON did not change. Only
    // the name the engine gives that refusal did.
    // 13 since self-weight bends the beams: nine of the 22 left the biaxial band (see above).
    // 22 more since the design reads the column cages: congestion, never a certificate.
    // 16 of them since the ductility check (see the fingerprint): 169–172, 197 and 198 verify.
    // 12 since the minimum shear reinforcement (§9.6.3.1, see the fingerprint): 165–168 verify.
    const congested = [...summary.outcomes.values()].filter((o) => o.outcome === 'SEARCH_EXHAUSTED');
    // 23 since main's concrete in the engine (see the fingerprint): 162, 163, 165–172 and 185.
    expect(congested.map((o) => o.elementId).sort((a, b) => a - b)).toEqual([
      161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 180, 181, 182, 183, 184, 185, 186, 187, 188, 196, 199,
    ]);
    for (const o of congested) {
      expect(o.limiting).toContain('congestion');
      expect(o.insufficiency).toBeUndefined();
      expect(o.exhaustion?.scope).toBe('implementedAlternatives');
      expect(o.certificate).toBeUndefined();
      expect(o.accepted).toBeUndefined();
    }
    const refused = [...summary.outcomes.values()].filter((o) => o.outcome !== 'VERIFIED' && o.outcome !== 'SEARCH_EXHAUSTED');
    expect(refused).toHaveLength(13);
    for (const o of refused) {
      expect(o.outcome).toBe('PROVISIONAL_BIAXIAL');
      expect(o.limiting).toContain('biaxial');
      expect(o.certificate).toBeUndefined();
      expect(o.accepted).toBeUndefined();
    }
  });
});

/**
 * Re-recorded against `origin/main@d6b32ff0` on 2026-08-15. The drift is MAIN's, not PR21's.
 *
 * Kept as a named constant at the bottom rather than inline so that the one line anybody would
 * be tempted to edit is the one line that says, immediately above it, not to. It was edited
 * once, under authorisation, and this is the evidence that made that the right call.
 *
 * ── How it was established, and how to repeat it ───────────────────
 *
 * Not reasoned about — measured, on a checkout with NO code from this branch in it:
 *
 *     git worktree add /tmp/probe origin/main --detach
 *     cp <this file> /tmp/probe/web/src/lib/engine/design/__tests__/
 *     cp -R web/src/lib/wasm/. /tmp/probe/web/src/lib/wasm/    # gitignored build output
 *     cd /tmp/probe/web && npx vitest run --project unit rc-baseline-digest
 *
 * Pure `origin/main` reproduces this branch's failure exactly: same digest, same reclassified
 * outcome. So the concrete design changed in main, in the 113 commits between `542fc664` — the
 * base this fingerprint was first taken at — and `d6b32ff0`.
 *
 * ── What actually moved, and what did not ──────────────────────────
 *
 *                        first recording      current main
 *     total                          408               408   ← unchanged
 *     verified                       386               386   ← unchanged
 *     refused                         22                22   ← the SAME members
 *     their `limiting`         ['biaxial']       ['biaxial']  ← the same reason
 *     their outcome       SEARCH_EXHAUSTED  PROVISIONAL_BIAXIAL  ← only this
 *     certificate / accepted    undefined         undefined   ← still nothing certified
 *
 * Main's biaxial-proposal work gave a NAME to a refusal that already existed. Not one member
 * is designed differently, and nothing is certified that was not certified before. The digest
 * changed because the outcome string is part of every line of it.
 *
 * ── Why PR21 could not have caused it ──────────────────────────────
 *
 * `PROVISIONAL_BIAXIAL` is produced by `candidate-search.ts` and declared in `outcome.ts`.
 * This branch touches neither — `git diff origin/main..HEAD` lists no file under
 * `engine/design/` except its own two test files, `member-context.ts` (which EXCLUDES metallic
 * members from this pipeline) and `cirsoc301-capabilities.ts` (every faculty `false`).
 * A member of the flagship frame is concrete, so the exclusion cannot reach it.
 *
 * Re-recorded once more (was `792b6f88ea1fc3a4`) when self-weight became a member load; the
 * member-by-member check is in the test above.
 *
 * And again (was `c05971b8f79bb372`) when the column check moved to the design curve: it solved
 * Pn(c) = Pu and took φ·Mn there, which read φMn up to 50 % high at high axial load. Only
 * columns moved, 21 of them (1–15, 17–19, 27–29), each still VERIFIED and now with more steel:
 * their certified utilization rose from 0,86–1,00 to 0,95–1,00 as the search took the next
 * layout. The counts, 395 verified and 13 provisional, are unchanged.
 *
 * And (was `c23ac6b57251ce0b`) when shear followed CIRSOC 201-2025: Vc = [0,17·√f'c + Nu/(6·Ag)]
 * with the gross area, Av,min and row (c) of Tabla 22.5.5.1 below it, and the §22.5.1.2 limit on
 * Vs. 191 beams moved, every one still VERIFIED, their certified utilization within ±0,11 of
 * before; the counts are unchanged.
 *
 * And (was `99271275a69883ab`) when the check's development length became Tabla 25.4.2.3, the
 * one the drawings read: 4 members moved, still VERIFIED, utilization down by 0,004–0,03.
 */
// Re-recorded after preserving axial distributed self-weight in member force recovery.
// Replacing only globalDistributedToSolver with its pre-fix implementation reproduces
// f4681de2873ce5ac exactly on the current engine. Restoring the fix changes utilization
// for columns 1, 3, 6–10, 12–14 (ten members), with no outcome or limiting-constraint
// changes among all 408 members; 395 remain verified and 13 provisional. The maximum
// utilization remains 1.0000. See the closed-form axial tests in calculation-fidelity-regressions.test.ts.
// And again on PRO 19's design changes (columns on the design curve, shear per 22.5, ld per
// Tabla 25.4.2.3): the fingerprint PRO 19 recorded, which the merge with main reproduces.
// And (was `a84e9893c41e5501`) when the check's ld stopped assuming Tabla 25.4.2.3's favourable
// row and ψt = 1 for every bar: the row is now established from the layout (clear cover ≥ db,
// and spacing ≥ 2·db, or ≥ db with stirrups at Av,min and s ≤ d/2), and top bars with more
// than 300 mm of concrete below take ψt = 1,3. One member of 408 moved, beam 161 (35×65, H-30,
// 7,5 m): on its search path a 7Ø16 bottom with eØ6 c/20 no longer holds the favourable row
// (29 mm clear < 2·db, Av/s 2,83 < 2,92 cm²/m), its ld into the 86 cm support region went from
// 58 to 88 cm and drew a «needs hook» warning, and the search settled on top 6Ø25, bottom 5Ø20
// instead of top 3Ø32, bottom 7Ø16 — still VERIFIED, utilization 0,9940 → 0,9500. No outcome
// or limiting constraint changed; 395 verified and 13 provisional, as before. M2,min for
// slender columns (§6.6.4.5.4), in the same change, was measured on its own first: it moves no
// member of this frame.
// And (was `f8a66e1b74ca71f1`) when column ties took one rule for every caller, CIRSOC 201-2025
// art. 25.7.2.1(b): 16·db of the longitudinal bar instead of the 12·db the verifier and the
// candidate search carried over from 2005 (the detailing already used 16), with the widest tie
// spacing the search offers held at the design target (0,95 of the maximum, O5) so a column does
// not land at 0,977 of the limit. The 160 columns take other tie spacings (eØ6 c/12,5 → c/17,5,
// c/27,5 → c/25 and the like). No outcome or limiting constraint changed, utilization moved by
// −0,07 to 0, and the counts stay 395 verified and 13 provisional.
// And (was `dd765d21f22a3ccd`) when the verifier checked the minimum top steel at a support that
// hogs (§9.6.1, waived by §9.6.1.3 where the bars give 4/3 of what the moment asks). The 35×65
// H-30 beams carried 8Ø10 = 6,28 cm² over supports whose ρmin·b·d = 0,00333·0,35·0,61 = 7,12 cm²,
// with 4/3·As,req ≈ 8,3 cm² above it, so the minimum governed and was not met. 110 beams of 408
// take more top steel at one or both supports (50 both, 60 one; 8Ø10 → 7Ø12 the usual step),
// and nothing else of theirs moves: no bottom bar, no stirrup, no outcome, no limiting
// constraint. Utilization moved on 37, all down (−0,047 to −0,043); the worst is 0,998, and the
// counts stay 395 verified and 13 provisional.
// And (was `b7b912467b15bd76`) when a beam built with its column took its support moments at the
// column's face (§9.4.2.1), interpolated per combination between the stations either side of
// it, instead of at the node. The columns are 50×50, so the face sits 0,25 m from the node
// whichever way the column turns. 163 beams of 408 take less top steel at one or both supports
// (3 822 → 3 200 cm² over the changed beams; 4 lose a little bottom steel with it, 1 a stirrup
// step); no column moves, no outcome or limiting constraint changes. Utilization moved on 93
// (62 up, 31 down, −0,056 to +0,051); the worst stays 0,998, and the counts stay 395 verified
// and 13 provisional.
// And (was `b67513c0500dfd36`) when the design checked every bar end in a column as the detailing
// builds it (`end-support-anchorage.ts`): a top bar's 90° hook turned inside the column's bars
// with §25.2.3's clearance, clear of the crossing beams' corner bars, at the row it lies in. The
// detailing had been left 36 ends it could not anchor, all Ø32 (top bars, and bottom bars the design
// hooked) of beams 161–200 in the 50×50 edge columns: 35,0–40,7 cm against ldh 58,9 cm. 30 beams of 408
// move, all on the frame's edges (161–265): their top steel at the edge columns goes from 3Ø32,
// 6Ø20 or 7Ø16 in one row to Ø16 or Ø12 in two or three, whose hooks fit; top area over them
// 1 177 → 1 198 cm², bottom 286 → 475 cm² as the search settles on other families. No column,
// no outcome, no limiting constraint changes; utilization moved on 30 (9 up, 21 down, −0,180 to
// +0,062), the worst stays 0,998, and the counts stay 395 verified and 13 provisional.
// And (was `f6e258764bc2bd5a`) when SECTION_INADEQUATE came to require a proof (a code bound no
// reinforcement lifts, `section-bounds.ts`) and an exhausted search was labelled as one: the 22
// beams refused on congestion and anchorage (161, 164–172, 180–184, 186–188, 196–199) read
// SEARCH_EXHAUSTED. Compared line by line against f2f2bdb38, those 22 lines are the only ones
// that change, and only in the outcome word: no limiting constraint, no utilization, no other
// member moves.
// And (was `412d42e8c8633856`) when a support's second top layer stepped from the continuous
// pair where the pair is the larger bar (§25.2.2, `stackedLayerDepth`): the design read the Ø10
// layer under a Ø12 pair 10 + 25 mm below the Ø10 bars, the detailing laid it there, and it stood
// inside the pair's clear distance. Compared line by line against 7bbab5dcb: no outcome, no
// limiting constraint, no bar changes; utilization moved on 4, all up (328 and 331, 8Ø10 + 6Ø10
// under a Ø12 pair: 0,773 → 0,774; 347 and 350, 8Ø10 + 8Ø10 under a Ø16 pair: 0,731 → 0,735);
// the worst stays 0,998, and the counts stay 373 verified, 22 exhausted, 13 provisional.
// And (was `9b015fe44bba30f4`) when the design stack met main, whose verifier checks the
// ductility of a flexural member (CIRSOC 201-2025 §9.3.3.1, εt ≥ εty + 0,003) and takes φMn and
// φVn from the engine's kernel. The kernel reproduces the TypeScript capacities on this frame
// (checked on the sections and bars of the members that moved); the ductility check is what
// moves it. Compared line by line with only that check switched off: beams 169–172, 197 and 198
// SEARCH_EXHAUSTED → VERIFIED, 164 and 165 trade «anchorage», utilization moves on 7 (162, 163
// up to 0,851; five down by at most 0,003); the worst stays 0,998, and the counts are 379
// verified, 16 exhausted, 13 provisional.
// And (was `ebe350998ab46447`) when the provided-reinforcement verifier checks the minimum shear
// reinforcement of CIRSOC 201-2025 §9.6.3.1 on beams deeper than 250 mm: Av,min (§9.6.3.4,
// max(0,062·√f'c, 0,35)·bw·s/fyt) wherever Vu > φ·0,085·√f'c·bw·d, and the generator stops
// offering stirrups under it. Compared line by line against the run without it: 165, 166, 167
// and 168 SEARCH_EXHAUSTED → VERIFIED (0,743, 0,733, 0,733, 0,743); 182 and 188 add «anchorage» to «congestion», still
// exhausted; stirrups change on 169 members (Ø6 c/25–c/30 → c/17,5 where Av,min governs, and
// several Ø8 c/30 → Ø6 c/17,5, lighter and meeting it); utilization moves on 135, 125 down (to
// −0,363: more Vs) and 10 up (to +0,251, the Ø8 → Ø6 ones, all ≤ 0,974); the worst stays 0,998.
// The counts are 383 verified, 12 exhausted, 13 provisional.
// And (was `43cfaf49844937cb` on the design stack and `fa8e6e36ba649044` on main) when the design
// stack met main's concrete in the engine: flexure, shear and columns sized against the engine,
// the station verifier's beam flexure with the axial force acting with each moment, and columns
// checked on the engine's load contour instead of Bresler. Compared line by line against the
// stack before it (a6013dcf1): 11 members SEARCH_EXHAUSTED ← VERIFIED (162, 163, 165–172, 185),
// and on 4 that were already exhausted «anchorage» comes or goes (161, 164, 180, 186). The cause
// is the columns: 2, 3, 4, 6, 10 and 18 take main's longitudinal steel (6 and 10: 4Ø32 → 24Ø16;
// 2 and 4: 16Ø20 → 28Ø16; 18: 8Ø20 → 24Ø12; 3: 24Ø16 → 16Ø20), because the stack's bars fail
// the load contour (4Ø32 on 6 and 10 at Nu = 2 923 kN, Mu = 345,9 kN·m). Cages with bars on
// every face leave the edge beams that cross them no layout through: run alone, 162, 165 and
// 185 verify, and the stack's own bars pass the merged verifier, so it is the cage. 169–172
// also lose the flexural strength their axial tension takes: with that check off they verify
// and the other seven stay exhausted. 173, 347 and 350 change bars and stay verified (347 and
// 350: bottom 7Ø12 → 5Ø25). Utilization moved on 85 (57 up, 28 down, −0,224 to +0,032); the
// worst stays 0,998. The counts are 372 verified, 23 exhausted, 13 provisional.
const RECORDED_FINGERPRINT = '71413f54c7416874';
