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
console.log('snapshot applicability: seeded good and bad cases passed');
