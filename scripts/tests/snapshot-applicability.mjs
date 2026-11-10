import assert from 'node:assert/strict';
import { decide } from '../../web/scripts/results-snapshot/gate.mjs';

const baseRegistry = { schema: 1, numbered: [], unnumbered: [] };
const file = 'web/results-snapshots/seed.json';
const path = 'base.displacements[n1].ux';
const snapshot = (value) => ({ format: 2, values: { [path]: value } });
const seed = {
  snapshots: [{ file, base: snapshot(1), head: snapshot(2) }],
  baseRegistry,
  fragments: [{ file: 'changelog.d/seed.md', text: '### BREAKING (results)\nSeed' }],
  caseFeatures: { [file]: ['space3D', 'members', 'analysis:linear'] },
};
const entry = { id: 'seed-change', when: { all: ['space3D', 'members'] }, quantities: ['displacements.ux'] };
const run = (entries, extra = {}) => decide({ ...seed, headRegistry: { ...baseRegistry, unnumbered: entries }, ...extra });
assert.equal(run([entry]).ok, true, 'a matching entry covers its field');
assert.equal(run([{ ...entry, when: { any: ['cirsoc201'] } }]).ok, false, 'an unrelated design entry cannot excuse a frame displacement');
assert.equal(run([{ ...entry, when: { all: ['space3D', 'analysis:modal'] } }]).ok, false, 'an unrun analysis cannot excuse a linear result');
assert.equal(run([{ ...entry, quantities: ['reactions'] }]).ok, false, 'a matching model with unrelated fields cannot excuse a displacement');
assert.equal(run([{ ...entry, quantities: undefined }]).ok, false, 'missing quantities explain no analysis result');
assert.equal(run([entry], { caseFeatures: {} }).ok, false, 'missing case metadata fails closed');
const second = 'combo[2].reactions[n1].fx';
assert.equal(run([entry], { snapshots: [{ file, base: { format: 2, values: { [path]: 1, [second]: 1 } }, head: { format: 2, values: { [path]: 2, [second]: 2 } } }] }).ok, false, 'every moved field needs coverage');

assert.equal(run([{ ...entry, when: { any: ['analysis:modal'] } }], { caseFeatures: { [file]: ['space3D', 'members', 'analysis:linear', 'analysis:modal'] } }).ok, false, 'running modal does not let a modal-only entry excuse a linear field');
assert.equal(run([{ ...entry, when: { allOf: [['plane2D', 'space3D'], ['members']] } }]).ok, true, 'OR groups combine with AND');
const moved = (field) => [{ file, base: { format: 2, values: { [field]: 1 } }, head: { format: 2, values: { [field]: 2 } } }];
for (const field of ['case[1].displacements[n1].ux', 'combo[2].displacements[n1].ux', 'envelope.maxAbs.displacements[n1].ux']) {
  assert.equal(run([entry], { snapshots: moved(field) }).ok, true, field);
}
assert.equal(run([{ ...entry, quantities: ['*'] }], { snapshots: [{ file, base: { values: { 'solve.ok': true } }, head: { values: { 'solve.ok': false } } }] }).ok, false, 'a wildcard cannot acknowledge refusal');
assert.equal(run([{ ...entry, quantities: ['solve.ok'] }], { snapshots: [{ file, base: { values: { 'solve.ok': true } }, head: { values: { 'solve.ok': false } } }] }).ok, true, 'explicit refusal coverage');
assert.equal(run([entry], { snapshots: [{ file, base: { values: {} }, head: { values: { [path]: 1 } } }] }).ok, true, 'declared additions');
assert.equal(run([entry], { snapshots: [{ file, base: { values: { [path]: 1 } }, head: { values: {} } }] }).ok, true, 'declared removals');

const otherFile = 'web/results-snapshots/other.json';
const example = { id: 'example-inputs', scope: 'examples', examples: ['seed-example'] };
const other = { file: otherFile, base: snapshot(1), head: snapshot(2) };
assert.equal(run([example, { ...entry, when: { any: ['cirsoc201'] } }], { snapshots: [...seed.snapshots, other], caseExample: { [file]: 'seed-example' }, changedFixtures: ['seed-example'], caseFeatures: { ...seed.caseFeatures, [otherFile]: seed.caseFeatures[file] } }).ok, false, 'an example entry and an unrelated engine entry cannot excuse another model');
const designField = 'design.steel[e1].ratio';
assert.equal(run([{ ...entry, area: 'design', quantities: ['steel'] }], { snapshots: moved(designField) }).ok, true, 'a matching design entry covers its declared design collection');
assert.equal(run([{ ...entry, area: 'design', quantities: ['*'] }]).ok, false, 'a design entry cannot excuse analysis fields in the same model');
console.log('snapshot applicability: seeded good and bad cases passed');
