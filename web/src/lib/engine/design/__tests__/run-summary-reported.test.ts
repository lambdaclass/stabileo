/**
 * Every bucket a design run can put a member in must be REPORTED somewhere a reader looks.
 *
 * ── The bucket that went dark ──────────────────────────────────────
 *
 * `tallyRunSummary` sorts every member into exactly one outcome bucket, and the design
 * toolbar's run cluster renders a chip per bucket that hides at zero. Hiding at zero is right:
 * a bar with six greyed-out chips reads as noise. What it means is that a bucket with no chip
 * is not "shown as zero" — it is invisible, always, at every count.
 *
 * That happened. The biaxial fallback added `provisionalBiaxial` and moved 22 members of the
 * flagship (117 of the 7-storey building) out of `unsupported` into it. The cluster had a chip
 * for `unsupported` and never gained one for `provisionalBiaxial`, so the run went from
 * "— 22 unsupported" to saying nothing at all about those members, on the one bar whose job is
 * to report what the run produced. `design.counts.provisional` had even been translated into
 * all fourteen locales already and was used by nothing.
 *
 * ── Why this is a source test ──────────────────────────────────────
 *
 * Because the property is "a bucket exists in the tally AND a chip exists in the toolbar", and
 * those two facts live in two files that no runtime path forces to agree. A behavioural test
 * can only check the buckets a particular fixture happens to fill; this checks all of them,
 * including the ones no fixture reaches yet. Mounting the component is not available in this
 * project's test environment either.
 *
 * ── The allow-list is the point, not an escape hatch ───────────────
 *
 * Two buckets are deliberately reported by the DISPLAY cluster instead, and saying so here in
 * one line is what makes them a decision rather than an omission. Adding a bucket now forces
 * the author to either wire a chip or write down why they did not.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUTCOME = fileURLToPath(new URL('../outcome.ts', import.meta.url));
/**
 * The counts moved out of the command bar and into `DesignOverview.svelte`, the section that now
 * opens the tab. Every assertion below is about where a run outcome SURFACES, not about which
 * file holds it, so both are read.
 */
const TOOLBAR_FILES = [
  fileURLToPath(new URL('../../../../components/pro/design/DesignToolbar.svelte', import.meta.url)),
  fileURLToPath(new URL('../../../../components/pro/design/DesignOverview.svelte', import.meta.url)),
];

const outcomeSrc = readFileSync(OUTCOME, 'utf8');
const toolbarSrc = TOOLBAR_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');
/** The surface the provisional chip actually renders on — the violet claim is about THIS file. */
const overviewSrc = readFileSync(TOOLBAR_FILES[1], 'utf8');

/**
 * The summary field each outcome is tallied into, read from the switch that does it.
 *
 * Parsed rather than restated: a list written out here would be a third copy of the same
 * knowledge and would go stale in exactly the way this test exists to catch.
 */
function bucketsFromTally(src: string): Array<{ outcome: string; field: string }> {
  const body = src.slice(src.indexOf('export function tallyRunSummary'));
  const out: Array<{ outcome: string; field: string }> = [];
  const re = /case '([A-Z_]+)':\s*s\.(\w+)\+\+/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    out.push({ outcome: m[1], field: m[2] });
  }
  return out;
}

/**
 * Buckets the run cluster deliberately does not carry a chip for, and why.
 *
 * Not "these are fine to ignore" — these are reported by the DISPLAY cluster on the same bar,
 * which counts what is written to each member rather than what the run decided.
 */
const REPORTED_ELSEWHERE: Record<string, string> = {
  verified: 'counted by summary-count-verified / -warn, from the display status',
  demandUnavailable:
    'a member with no demands gets no reinforcement, so it is counted by '
    + 'summary-count-unavailable',
  provisionalBiaxial:
    'counted by summary-count-provisional, which is now a DISPLAY status — the same '
    + 'arrangement `verified` has, and the right one: the display cluster reports what each '
    + 'member currently is, and a proposal is now one of the things it can say. It briefly '
    + 'had a run-cluster chip of its own, which was the stopgap for a display status that '
    + 'could not express it',
};

describe('every design-run bucket reaches the user', () => {
  const buckets = bucketsFromTally(outcomeSrc);

  it('finds the tally at all', () => {
    // A parse that silently matched nothing would pass forever.
    expect(buckets.length, 'outcome buckets parsed from tallyRunSummary')
      .toBeGreaterThanOrEqual(6);
    expect(buckets.map((b) => b.outcome)).toContain('PROVISIONAL_BIAXIAL');
  });

  for (const { outcome, field } of bucketsFromTally(outcomeSrc)) {
    it(`${outcome} → run.${field} is reported`, () => {
      if (REPORTED_ELSEWHERE[field]) {
        // Still asserted: the excuse has to name a chip that exists.
        expect(toolbarSrc, `${field}: ${REPORTED_ELSEWHERE[field]}`)
          .toMatch(/summary-count-(verified|unavailable|provisional)/);
        return;
      }
      expect(
        toolbarSrc.includes(`run.${field}`),
        `\`run.${field}\` is never read by the design toolbar, so members that land in `
        + `${outcome} are counted by the run and shown to nobody. Each chip hides at zero, so `
        + 'a missing chip is not a zero — it is silence at every count. Add a '
        + '`summary-count-*` chip, or add the field to REPORTED_ELSEWHERE with the chip that '
        + 'covers it.',
      ).toBe(true);
      // And the chip must be reachable by a test id, or a browser spec cannot assert it.
      expect(toolbarSrc, `${field} has a test id`).toMatch(/data-testid="summary-count-/);
    });
  }

  it('gives the proposals their own chip, with the violet the rest of the app uses', () => {
    // Named separately because this is the one that was missing, and because the colour is
    // load-bearing: violet means "proposal" in the 3-D view and the detailing panel too.
    // Asserted against the overview itself — the chip and its tone must live on the same
    // surface, or the violet could be supplied by a rule nothing references (it was:
    // `.c-prov` in the toolbar kept this green while styling nothing).
    expect(overviewSrc).toContain('data-testid="summary-count-provisional"');
    expect(overviewSrc).toContain("t('design.counts.provisional')");
    expect(overviewSrc, 'the provisional chip carries the proposal violet').toContain('#a066d3');
    expect(overviewSrc, 'the chip row uses the violet tone').toMatch(
      /tone-prov[^"]*"[^>]*data-testid="summary-count-provisional"/);
  });

  it('drives that chip from the DISPLAY count, not from the run outcome', () => {
    /**
     * The distinction is the whole reason the display status gained the state.
     *
     * `run.provisionalBiaxial` is what the last design run decided. `counts.provisional` is
     * what the members ARE now, which is the question the rest of that cluster answers and
     * the one that changes when a user edits a member's steel afterwards. Reading the run
     * counter here would freeze the chip at whatever the last run said.
     */
    expect(toolbarSrc).toContain('{counts.provisional}');
    expect(toolbarSrc, 'the run counter no longer drives a chip of its own')
      .not.toContain('run.provisionalBiaxial');
  });
});
