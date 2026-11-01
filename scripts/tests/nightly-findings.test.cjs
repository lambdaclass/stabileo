const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const report = require('../../.github/scripts/nightly-findings.cjs');

const finding = {test: 'opensees/mismatch', seed: 42, model: {loads: [1], elements: {a: {}}},
  command: 'python3 scripts/nightly-models.py --model model.json', reduction: '1-minimal', details: {status: 'mismatch'}};

async function fixture(fn) {
  const previous = process.cwd();
  const dry = process.env.FINDINGS_DRY_RUN;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-reporter-'));
  process.chdir(tmp);
  fs.mkdirSync('nightly-findings');
  const calls = [];
  const issues = [];
  const comments = [];
  const logs = [];
  const api = Object.fromEntries(['getLabel', 'createLabel', 'listForRepo', 'listComments', 'create', 'createComment', 'update'].map(name =>
    [name, async args => {
      calls.push({name, args});
      if (name === 'getLabel') throw Object.assign(new Error('missing label'), {status: 404});
      if (name === 'create') return {data: {...args, number: 1, state: 'open'}};
      return {data: {}};
    }]));
  const args = {github: {rest: {issues: api}, paginate: async method => method === api.listForRepo ? issues : comments},
    context: {repo: {owner: 'owner', repo: 'repo'}, serverUrl: 'https://github.com', runId: 123, sha: 'abc'},
    core: {info: message => logs.push(message)}};
  const save = (name, value = finding) => fs.writeFileSync(`nightly-findings/${name}.finding.json`, JSON.stringify(value));
  try {
    process.env.FINDINGS_DRY_RUN = 'false';
    await fn({args, calls, issues, comments, logs, save});
  } finally {
    process.chdir(previous);
    if (dry === undefined) delete process.env.FINDINGS_DRY_RUN;
    else process.env.FINDINGS_DRY_RUN = dry;
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

test('dry run deduplicates reordered models without writing labels, issues or comments', () => fixture(async ({args, calls, logs, save}) => {
  save('a');
  save('b', {...finding, model: {elements: {a: {}}, loads: [1]}});
  process.env.FINDINGS_DRY_RUN = 'true';
  await report(args);
  assert.equal(calls.length, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /\[dry run\] create opensees\/mismatch/);
  assert.ok(logs[0].includes(finding.command));
  assert.deepEqual(JSON.parse(logs[0].split('```json\n')[1].split('\n```')[0]), finding.model);
}));

test('write creates one issue per root cause and required labels', () => fixture(async ({args, calls, save}) => {
  save('a');
  save('b', {...finding, model: {elements: {a: {}}, loads: [1]}});
  save('c', {...finding, test: 'opensees/false_reject'});
  await report(args);
  assert.deepEqual(calls.filter(c => c.name === 'createLabel').map(c => c.args.name), ['safety', 'nightly-finding', 'wrong-result-candidate']);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 2);
  assert.match(created[0].args.body, /Seed: `42`/);
  assert.match(created[0].args.body, /actions\/runs\/123/);
  assert.deepEqual(JSON.parse(created[0].args.body.split('```json\n')[1].split('\n```')[0]), finding.model);
  assert.deepEqual(created[0].args.labels, ['safety', 'nightly-finding', 'wrong-result-candidate']);
}));

test('existing closed issue gets occurrence comment and reopens; repeated run is idempotent', () => fixture(async ({args, calls, issues, comments, save}) => {
  save('a');
  await report(args);
  const created = calls.find(c => c.name === 'create');
  issues.length = 0;
  issues.push({number: 7, state: 'closed', body: created.args.body.replace(/<!-- nightly-run:[^>]+ -->/, '<!-- nightly-run:old:1 -->')});
  calls.length = 0;
  await report(args);
  const comment = calls.find(c => c.name === 'createComment');
  assert.equal(comment.args.issue_number, 7);
  assert.ok(comment.args.body.includes(finding.command));
  assert.equal(calls.find(c => c.name === 'update').args.state, 'open');
  assert.equal(calls.filter(c => c.name === 'create').length, 0);
  comments.push({body: comment.args.body});
  issues[0].state = 'open';
  calls.length = 0;
  await report(args);
  assert.equal(calls.filter(c => ['create', 'createComment', 'update'].includes(c.name)).length, 0);
  process.env.FINDINGS_DRY_RUN = 'true';
  calls.length = 0;
  await report(args);
  assert.equal(calls.length, 0);
}));

test('empty artifacts produce no writes and malformed findings fail', () => fixture(async ({args, calls, logs, save}) => {
  await report(args);
  assert.equal(calls.length, 0);
  assert.match(logs[0], /No structured numerical findings/);
  save('bad', {test: 'missing model'});
  await assert.rejects(report(args), /Invalid finding/);
  assert.equal(calls.length, 0);
}));

const tonight = [
  [19, 'mirror', 'Node 4 has several supports (2, 3, 4) and not all are plain rigid restraints (springs, prescribed displacemen'],
  [19, 'rotation', 'Node 4 has several supports (2, 3, 4) and not all are plain rigid restraints (springs, prescribed displacemen'],
  [6, 'units', 'Singular stiffness matrix — structure is a mechanism'],
  [3, 'mirror', 'Singular stiffness matrix — structure is a mechanism'],
  [2, 'units', 'Eigenvalue decomposition failed'],
  [2, 'rotation', 'Singular stiffness matrix — structure is a mechanism'],
  [2, 'mirror', 'Eigenvalue decomposition failed'],
  [2, 'rotation', 'Eigenvalue decomposition failed'],
  [1, 'units', 'Singular stiffness matrix'],
  [1, 'units', 'Singular stiffness in SSI iteration'],
  [1, 'mirror', 'Singular tangent stiffness matrix'],
  [1, 'mirror', 'Singular stiffness in SSI iteration'],
  [1, 'rotation', "Failed to solve case 'A': Singular stiffness matrix — structure is a mechanism"],
  [1, 'rotation', 'Complex system solve failed'],
  [1, 'mirror', 'Complex system solve failed'],
  [1, 'units', 'Complex system solve failed'],
  [1, 'mirror', 'Singular effective stiffness matrix -- check constraints and mass'],
  [1, 'rotation', "Failed to solve case 'A': Node 4 has several supports (2, 3, 4) and not all are plain rigid restraints (springs, prescribed displacemen"],
  [1, 'mirror', "Failed to solve case 'A': Node 4 has several supports (2, 3, 4) and not all are plain rigid restraints (springs, prescribed displacemen"],
];

test('tonight: 66 findings become eight input-consistency issues across relations and analyses', () => fixture(async ({args, calls, save}) => {
  let index = 0;
  for (const [count, relation, message] of tonight) for (let i = 0; i < count; i++) {
    save(String(index), {...finding, test: `metamorphic/analysis${i}/${relation}`, seed: 20261030 + index,
      model: {nodes: {1: {}}, loads: Array(i + 1).fill(1)}, original_model_hash: `original-${index % 5}`,
      details: [`random-${index++}: original solved but transformed model failed: ${message}`]});
  }
  assert.equal(index, 66);
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 8);
  assert.deepEqual(created.map(c => Number(c.args.body.match(/\*\*(\d+) findings/)[1])).sort((a,b) => a-b), [1,1,1,2,3,6,12,40]);
  for (const c of created) {
    assert.ok(c.args.labels.includes('invariance-refusal'));
    assert.ok(!c.args.labels.includes('wrong-result-candidate'));
    assert.equal(c.args.body.split('```json').length, 2);
    const model = JSON.parse(c.args.body.split('```json\n')[1].split('\n```')[0]);
    assert.equal(model.loads.length, 1);
  }
  const supports = created.find(c => c.args.body.includes('**40 findings**')).args.body;
  assert.match(supports, /\*\*19 analyses\*\*, \*\*2 relations\*\*, \*\*5 models\*\*/);
}));

test('IDs, numbers, seeds and models do not change cause; numeric mismatches stay separate', () => fixture(async ({args, calls, issues, save}) => {
  const refusal = (message, seed) => ({...finding, seed, test: 'metamorphic/static/mirror', model: {loads: [seed]}, details: [`case-${seed}: original solved but transformed model failed: ${message}`]});
  save('a', refusal('Node 4 has several supports (2, 3, 4)', 1));
  await report(args);
  const first = calls.find(c => c.name === 'create');
  issues.push({number: 9, state: 'open', body: first.args.body});
  args.context.runId = 456;
  calls.length = 0;
  save('a', refusal("Failed to solve case 'B': Node 99 has several supports (8, 9)", 2));
  save('numeric', {...finding, test: 'metamorphic/static/rotation', details: ['case-2: displacement error 0.002 exceeds tolerance 1e-6']});
  await report(args);
  assert.equal(calls.filter(c => c.name === 'createComment').length, 1);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 1);
  assert.ok(created[0].args.labels.includes('wrong-result-candidate'));
}));

test('reporter defaults to dry run', () => fixture(async ({args, calls, save}) => {
  save('a');
  delete process.env.FINDINGS_DRY_RUN;
  await report(args);
  assert.equal(calls.length, 0);
}));

for (const adapter of ['opensees', 'codeaster']) test(`${adapter}: adapter quantities and analyses separate defects and deduplicate instances`, () => fixture(async ({args, calls, save}) => {
  const cases = adapter === 'codeaster' ? [
    [1, undefined, 'disp', 'ux'], [2, undefined, 'disp', 'ux'],
    [3, undefined, 'reac', 'fx'], [4, undefined, 'force', 'nStart']
  ] : [
    [1, 'modal', 'eig', 'value'], [2, 'modal', 'eig', 'value'],
    [3, 'pdelta', 'disp', 'ux'], [4, 'pdelta', 'reac', 'fx'],
    [5, 'pdelta', 'force', 'nStart'], [6, 'static', 'disp', 'ux']
  ];
  for (const [i, analysis, quantity, component] of cases) save(String(i), {...finding, test: `${adapter}/mismatch`, details: {
    name: `instance-${i}`, status: 'mismatch', analysis, dim: 3, tol: 1e-6, kappa: i * 100,
    n_bad: 1, max_err: [{eig: i * .01}, {disp_t: i * .01}, {reac_f: i * .01}, {force_f: i * .01}][['eig', 'disp', 'reac', 'force'].indexOf(quantity)], worst: [[quantity, i, component, i, i + 1, i * .01]]
  }});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, adapter === 'codeaster' ? 3 : 5);
  assert.equal(created.filter(c => c.args.body.includes('**2 findings**')).length, 1);
}));
