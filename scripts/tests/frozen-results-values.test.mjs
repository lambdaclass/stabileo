import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compareFrozen, freezeValues } from '../../web/scripts/results-snapshot/frozen.mjs';
import { decide } from '../../web/scripts/results-snapshot/gate.mjs';

const evidence = JSON.parse(readFileSync(new URL('../../docs/verification/soundness-regression-audit-2026-11-11/arc-bisection.json', import.meta.url)));
const entry = JSON.parse(readFileSync(new URL('../../web/src/lib/provenance/result-changes/arc-length-reference-norm.json', import.meta.url)));
const baseRegistry = { schema: 1, numbered: [], unnumbered: [] };
for (const c of evidence) {
  test(`${c.test}: its actual parent/merge outputs require the arc entry`, () => {
    const file = `web/results-frozen/${c.model}`;
    const base = freezeValues(c.before.Ok, 'nonlinear');
    const head = freezeValues(c.after.Ok, 'nonlinear');
    assert.equal(compareFrozen(base, head).differs, true);
    const args = {
      snapshots: [{ file, base: { format: 1, values: base }, head: { format: 1, values: head } }],
      baseRegistry, fragments: [{ file: 'changelog.d/arc.md', text: '### BREAKING (results)' }],
      caseFeatures: { [file]: ['plane2D', 'members', 'analysis:nonlinear'] },
    };
    assert.equal(decide({ ...args, headRegistry: baseRegistry }).ok, false);
    const registered = decide({ ...args, headRegistry: { ...baseRegistry, unnumbered: [entry] } });
    assert.equal(registered.ok, true, registered.report);
  });
}

test('raw capture retains last-bit changes, path steps and empty collections', () => {
  const base = freezeValues({ steps: [{ loadFactor: 1 }], reactions: [] });
  const head = freezeValues({ steps: [{ loadFactor: 1 + Number.EPSILON }], reactions: [{ rx: 1 }] });
  assert.equal(base['steps[0].loadFactor'], 1);
  assert.equal(head['steps[0].loadFactor'], 1 + Number.EPSILON);
  assert.equal(base['reactions.length'], 0);
  const diff = compareFrozen(base, head);
  assert.equal(diff.changed.length, 2);
  assert.deepEqual(diff.added, ['reactions[0].rx']);
  assert.equal(compareFrozen(head, base).removed.length, 1);
});

test('only timing and build provenance are excluded; numerical diagnostics stay frozen', () => {
  const base = freezeValues({ timings: { factor: 1 }, solverRunMeta: { commit: 'a' }, relativeResidual: 1 });
  const timing = freezeValues({ timings: { factor: 2 }, solverRunMeta: { commit: 'b' }, relativeResidual: 1 });
  const numeric = freezeValues({ relativeResidual: 2 });
  assert.equal(compareFrozen(base, timing).differs, false);
  assert.equal(compareFrozen(base, numeric).differs, true);
});

test('non-finite engine output cannot become a frozen numerical baseline', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => freezeValues({ value }), /Non-finite frozen output/);
});
