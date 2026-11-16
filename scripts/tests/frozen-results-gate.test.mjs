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

test('exact frozen arc movement requires registration', () => {
  const result = run({ [path]: 1 }, { [path]: 1 + Number.EPSILON });
  assert.equal(result.ok, false);
  assert.equal(result.changed.length, 1);
});

test('a nonlinear entry covers its frozen arc steps', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 2 }, [entry]).ok, true);
});

test('unchanged frozen outputs need no entry', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 1 }).ok, true);
});

test('an unrelated entry cannot cover changed frozen outputs', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 2 }, [{ ...entry, quantities: ['reactions'] }]).ok, false);
});

test('SSI additions require their own analysis entry', () => {
  const ssi = { ...entry, id: 'ssi', when: { all: ['analysis:ssi'] }, quantities: ['reactions'] };
  const extra = { caseFeatures: { [file]: ['plane2D', 'members', 'analysis:ssi'] } };
  const field = 'ssi.results.reactions[0].rx';
  assert.equal(run({}, { [field]: 1 }, [ssi], extra).ok, true);
  assert.equal(run({}, { [field]: 1 }, [entry], extra).ok, false);
  assert.equal(run({ [field]: 1 }, {}, [], extra).ok, false);
});

test('a results fragment remains mandatory for an otherwise covered change', () => {
  assert.equal(run({ [path]: 1 }, { [path]: 2 }, [entry], { fragments: [] }).ok, false);
});

test('an exact corpus cannot use a format bump to hide newly produced output', () => {
  assert.equal(run({}, {}, [], {
    snapshots: [{ file, base: { format: 1, values: {} }, head: { format: 2, values: { 'envelope.new': 1 } } }],
  }).ok, false);
});

test('removing frozen coverage requires an applicable declaration', () => {
  const snapshots = [{ file, base: { format: 1, values: { [path]: 1 } }, head: null }];
  assert.equal(run({}, {}, [], { snapshots }).ok, false);
  assert.equal(run({}, {}, [entry], { snapshots }).ok, true);
});

test('a new frozen case adds coverage without requiring a results entry', () => {
  assert.equal(run({}, {}, [], { snapshots: [{ file, base: null, head: { values: { [path]: 1 } } }] }).ok, true);
});

test('gallery applicability cannot excuse changed saved-model results', () => {
  const gallery = { ...entry, when: { all: ['gallery:slab-on-columns:walls', 'analysis:linear'] }, quantities: ['readouts'] };
  const field = 'gallery.readouts[0].value';
  const snapshots = [{ file, base: { values: { [field]: 1 } }, head: { values: { [field]: 2 } } }];
  assert.equal(run({}, {}, [gallery], { snapshots, caseFeatures: { [file]: ['gallery:slab-on-columns:walls', 'analysis:linear'] } }).ok, true);
  assert.equal(run({}, {}, [gallery], { snapshots, caseFeatures: { [file]: ['gallery:slab-on-columns:columns', 'analysis:linear'] } }).ok, false);
  assert.equal(run({}, {}, [gallery], { snapshots, caseFeatures: { [file]: ['space3D', 'shells', 'analysis:linear'] } }).ok, false);
});
