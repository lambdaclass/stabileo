import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../../web/scripts/results-snapshot/gate.mjs';

const registry = { schema: 1, numbered: [], unnumbered: [] };
const file = 'web/results-frozen/arc.json';
const path = 'nonlinear.steps[0].loadFactor';
const entry = { id: 'arc', area: 'analysis', when: { all: ['plane2D', 'analysis:nonlinear'] }, quantities: ['steps'] };
const run = (base, head, entries = [], extra = {}) => decide({
  snapshots: [{ file, base: { format: 1, values: base }, head: { format: 1, values: head } }],
  baseRegistry: registry, headRegistry: { ...registry, unnumbered: entries },
  fragments: [{ file: 'changelog.d/arc.md', text: '### BREAKING (results)\nArc' }],
  caseFeatures: { [file]: ['plane2D', 'members', 'analysis:nonlinear'] }, ...extra,
});

test('known wrong result: #1946 exact frozen arc movement requires registration', { skip: true }, () => {
  const result = run({ [path]: 1 }, { [path]: 1 + Number.EPSILON });
  assert.equal(result.ok, false);
  assert.equal(result.changed.length, 1);
});

test('known wrong result: #1946 a nonlinear entry covers its frozen arc steps', { skip: true }, () => {
  assert.equal(run({ [path]: 1 }, { [path]: 2 }, [entry]).ok, true);
});

test('unchanged frozen outputs need no entry', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 1 }).ok, true);
});

test('an unrelated entry cannot cover changed frozen outputs', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 2 }, [{ ...entry, quantities: ['reactions'] }]).ok, false);
});

test('known wrong result: #1946 SSI additions require their own analysis entry', { skip: true }, () => {
  const ssi = { ...entry, id: 'ssi', when: { all: ['analysis:ssi'] }, quantities: ['reactions'] };
  const extra = { caseFeatures: { [file]: ['plane2D', 'members', 'analysis:ssi'] } };
  const field = 'ssi.results.reactions[0].rx';
  assert.equal(run({}, { [field]: 1 }, [ssi], extra).ok, true);
  assert.equal(run({}, { [field]: 1 }, [entry], extra).ok, false);
  assert.equal(run({ [field]: 1 }, {}, [], extra).ok, false);
});
