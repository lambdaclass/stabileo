/**
 * The concrete regulation's rules reached around its adapter: a ratchet.
 *
 * Design asks a regulation through its adapter (`engine/design/code-adapter.ts`), so a second
 * concrete regulation would be one more adapter. The detailing, part of the design and the
 * sheets still import CIRSOC 201's rules directly: each such file would have to change for that
 * regulation too. This list is those files as they stand. A new file reaching the rules directly
 * fails here (ask the adapter instead, or add the file knowingly); a file that stops doing so
 * fails until it is taken off the list, so the list only shrinks.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '../../..');
const RULES = /from\s+'[^']*codes\/cirsoc201\//;

/** Files outside the rules and the adapters that import them, relative to `src/`. */
const COUPLED = [
  'components/pro/design/RcBarList.svelte',
  'components/pro/desk/column/ColumnLaps.svelte',
  'lib/engine/codes/argentina/cirsoc201.ts',
  'lib/engine/design/beam-flange.ts',
  'lib/engine/design/candidate-enumerate-beam.ts',
  'lib/engine/design/candidate-enumerate-column.ts',
  'lib/engine/design/crack-spacing.ts',
  'lib/engine/design/end-support-anchorage.ts',
  'lib/engine/design/joint-threading-check.ts',
  'lib/engine/design/section-bounds.ts',
  'lib/engine/design/slabs/stairs.ts',
  'lib/engine/design/special/coupling-beam.ts',
  'lib/engine/detailing/assembly.ts',
  'lib/engine/detailing/bar-shape-diagram.ts',
  'lib/engine/detailing/beam-top-steel.ts',
  'lib/engine/detailing/candidates.ts',
  'lib/engine/detailing/classify.ts',
  'lib/engine/detailing/collision-kernel.ts',
  'lib/engine/detailing/collision.ts',
  'lib/engine/detailing/column-bar-index.ts',
  'lib/engine/detailing/column-candidates.ts',
  'lib/engine/detailing/coordinate-floor.ts',
  'lib/engine/detailing/document-model.ts',
  'lib/engine/detailing/document-narrow.ts',
  'lib/engine/detailing/drawings.ts',
  'lib/engine/detailing/family-drawings.ts',
  'lib/engine/detailing/family-record.ts',
  'lib/engine/detailing/floor-design.ts',
  'lib/engine/detailing/floor-transverse.ts',
  'lib/engine/detailing/footing-dowel-cage.ts',
  'lib/engine/detailing/footing-flexure.ts',
  'lib/engine/detailing/footing-mat-anchorage.ts',
  'lib/engine/detailing/footing-mat-geometry.ts',
  'lib/engine/detailing/generate-beam.ts',
  'lib/engine/detailing/generate-column.ts',
  'lib/engine/detailing/joint-packing.ts',
  'lib/engine/detailing/joint-threading.ts',
  'lib/engine/detailing/lap-materialize.ts',
  'lib/engine/detailing/member-sheets.ts',
  'lib/engine/detailing/repair-envelope.ts',
  'lib/engine/detailing/run-detailing.ts',
  'lib/engine/detailing/run-footing-design.ts',
  'lib/engine/detailing/scene-model.ts',
  'lib/engine/detailing/shaped-ties.ts',
  'lib/engine/detailing/sheet-geometry.ts',
  'lib/engine/detailing/slab-deflection.ts',
  'lib/engine/detailing/slab-design.ts',
  'lib/engine/detailing/slab-wall-drawings.ts',
  'lib/engine/detailing/span-detailing.ts',
  'lib/engine/detailing/splice-checks.ts',
  'lib/engine/detailing/splice.ts',
  'lib/engine/detailing/support-anchorage.ts',
  'lib/engine/foundation/general-footing.ts',
  'lib/engine/physical/member-frame.ts',
  'lib/engine/station-design-forces.ts',
  'lib/export/rc-cad-families.ts',
  'lib/export/rc-cad-handoff-v2.ts',
  'lib/export/rc-cad-handoff.ts',
  'lib/listings/bvbs.ts',
  'lib/sheets/details/beams.ts',
  'lib/sheets/details/columns.ts',
  'lib/sheets/details/foundations.ts',
  'lib/sheets/details/general.ts',
  'lib/sheets/details/joints.ts',
  'lib/sheets/details/slabs.ts',
  'lib/sheets/details/values.ts',
  'lib/sheets/details/walls.ts',
  'lib/sheets/plans/stair-pt-plans.ts',
  'lib/store/budget.ts',
  'lib/store/cracked-deflection.ts',
  'lib/store/ifc-export.ts',
  'lib/store/work-drawings.ts',
];

function coupled(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(SRC, p);
      if (statSync(p).isDirectory()) {
        if (name === '__tests__' || rel === 'lib/codes' || rel === 'lib/engine/design/adapters' || name === 'node_modules') continue;
        walk(p);
      } else if ((name.endsWith('.ts') || name.endsWith('.svelte')) && RULES.test(readFileSync(p, 'utf8'))) out.push(rel);
    }
  };
  walk(SRC);
  return out.sort();
}

describe('CIRSOC 201 reached around the adapter', () => {
  const now = coupled();
  it('no new file reaches the rules directly', () => {
    expect(now.filter((p) => !COUPLED.includes(p))).toEqual([]);
  });
  it('a file that no longer does is taken off the list', () => {
    expect(COUPLED.filter((p) => !now.includes(p))).toEqual([]);
  });
});
