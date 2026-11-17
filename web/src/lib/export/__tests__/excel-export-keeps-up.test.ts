/**
 * The results export has to keep up with what the application can produce.
 *
 * ── The same silence as the importer's guard, from the other side ──
 *
 * `portable-formats-keep-up.test.ts` watches what goes IN. This watches what
 * comes out. The failure mode is identical and just as quiet: a feature ships,
 * the export still works, the workbook still opens, and it simply has one
 * fewer sheet than the model has content. Nobody notices, because nobody
 * opens an export looking for the thing they did not know was absent.
 *
 * ── What it does not do ────────────────────────────────────────────
 *
 * It does not demand a sheet for everything. PRO's design results reach the
 * same workbook through `extraSheets`, injected by `DocumentsSection.svelte`
 * — that is a deliberate split, base export for the model and basic results,
 * PRO adding its own — and a guard that ignored it would be demanding
 * duplication.
 *
 * So each entry below is either COVERED, with the sheet that covers it, or
 * exempt WITH A REASON. The reason is the point. An exemption list is a
 * record of decisions; a list of names is a way of turning the test off.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** Everything a finished model can hold that a reader might expect to export. */
const CONTENT = [
  'nodes', 'elements', 'materials', 'sections', 'supports', 'loads',
  'reactions', 'displacements', 'elementForces',
  'plates', 'quads',
  'perCombo', 'envelope',
  'reinforcement', 'footings',
] as const;

/**
 * How each is served, and by what.
 *
 * `sheet` names a function in `excel.ts`. `elsewhere` records that something
 * else covers it, and says what — those are the entries a reviewer should
 * read hardest, because they are the ones claiming a gap is not a gap.
 */
const COVERAGE: Record<(typeof CONTENT)[number], { sheet?: string; elsewhere?: string }> = {
  nodes: { sheet: 'createNodesSheet' },
  elements: { sheet: 'createElementsSheet' },
  materials: { sheet: 'createMaterialsSheet' },
  sections: { sheet: 'createSectionsSheet' },
  supports: { sheet: 'createNodesSheet' },
  loads: { sheet: 'createElementsSheet' },
  reactions: { sheet: 'createReactionsSheet' },
  displacements: { sheet: 'createNodesSheet' },
  elementForces: { sheet: 'createElementsSheet' },
  plates: { sheet: 'createShellsSheet' },
  quads: { sheet: 'createShellsSheet' },
  perCombo: { sheet: 'createCombinationsSheet' },
  envelope: { sheet: 'createCombinationsSheet' },
  reinforcement: {
    elsewhere:
      'PRO injects its detailing sheets through `extraSheets` from ' +
      'components/pro/design/DocumentsSection.svelte. Duplicating them in the base ' +
      'export would give one project two schedules that could disagree.',
  },
  footings: {
    elsewhere:
      'Same route as the reinforcement — the foundation documents are part of ' +
      "PRO's document set, not of a Basic results workbook.",
  },
};

describe('the Excel results export keeps up', () => {
  it('everything a model can hold is either exported or exempt with a reason', () => {
    const src = read('export/excel.ts');

    const failures: string[] = [];
    for (const item of CONTENT) {
      const c = COVERAGE[item];
      if (c.elsewhere) {
        expect(c.elsewhere.length, `${item}'s exemption needs a real reason`).toBeGreaterThan(40);
        continue;
      }
      if (!c.sheet) { failures.push(`${item}: no sheet and no reason`); continue; }
      if (!src.includes(c.sheet)) {
        failures.push(`${item}: COVERAGE names ${c.sheet}, which excel.ts does not define`);
      }
    }

    expect(
      failures,
      `the export has fallen behind the model:\n  ${failures.join('\n  ')}\n` +
        'Add the sheet in lib/export/excel.ts, or record in COVERAGE what covers it instead.',
    ).toEqual([]);
  });

  it('every sheet it builds is actually appended to the workbook', () => {
    /*
     * A `createXSheet` that nothing appends is dead code that reads as
     * coverage — the guard above would pass on it, which is exactly the kind
     * of false comfort a guard should not provide.
     */
    const src = read('export/excel.ts');
    const built = [...src.matchAll(/function (create\w+Sheet)\(/g)].map((m) => m[1]);
    const orphans = built.filter((fn) => !src.includes(`${fn}()`) || src.split(`${fn}()`).length < 2);
    expect(orphans, `built and never appended: ${orphans.join(', ')}`).toEqual([]);
  });
});
