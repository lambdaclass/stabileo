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

const relabeled = [
  [1055, 'certified linear/relabel', 'fuzz_rich_3d/21463: stress[0]: label vm_quad@e382[0] vs expected vm_quad@e1[0]'],
  [1054, 'linear/relabel', 'fuzz_rich_3d/21463: stress[0]: label vm_quad@e83[0] vs expected vm_quad@e1[0]'],
  [1006, 'certified linear/relabel', 'fuzz_rich_3d/21500: stress[0]: label vm_plate@e80[0] vs expected vm_quad@e1[0]'],
  [1038, 'cable solver/relabel', 'fuzz_rich_3d/21021: force N@e308[0]: got 1.4824886988e-17, expected -2.7789125665e-17, |diff| 4.261e-17 > tol 1.425e-23 (scale 6.939e-16, rel 2.05e-8)'],
  [1039, 'staged (one stage)/relabel', 'fuzz_rich_3d/21021: force N@e838[0]: got 5.2891896818e-18, expected -9.5509834709e-18, |diff| 1.484e-17 > tol 2.854e-25 (scale 5.274e-16, rel 5.41e-10)'],
  [1037, 'load combinations/superposition', 'fuzz_rich_3d/21180: R(kA) ≠ k·R(A): force N@e1[0]: got -1.4921397451e-13, expected -7.1054273576e-14, |diff| 7.816e-14 > tol 7.348e-23 (scale 7.105e-14, rel 1.03e-9)'],
  [1010, 'linear (PCG)/linear agreement', 'fuzz_rich_2d/21477: translation u@n8[1]: got -5.7853999336e-1, expected -5.7854234972e-1, |diff| 2.356e-6 > tol 2.142e-6 (scale 6.907e-1, rel 3.10e-6)'],
  [1011, 'fiber nonlinear/mirror', 'replay: translation u@n3[0]: got 1.9972805791e-5, expected 1.7853492689e-5, |diff| 2.119e-6 > tol 8.126e-13 (scale 4.063e-5, rel 2.00e-8)'],
  [1033, 'harmonic/rotation', 'replay: translation H_im1@n2[0]: got -9.8706895406e-5, expected 3.3948969682e-4, |diff| 4.382e-4 > tol 1.346e-4 (scale 1.282e0, rel 1.05e-4)'],
  [1031, 'Winkler (no foundation)/reversal', 'replay: rotation ry@n2[0]: got 5.9109295926e-2, expected 5.9109295926e-2, |diff| 6.196e-13 > tol 2.421e-15 (scale 5.911e-2, rel 4.10e-14)'],
  [993, 'linear (sparse path)/units', 'fuzz_rich_2d/20892: rotation ry@n6[0]: got 1.8326633534e3, expected 1.8327897428e3, |diff| 1.264e-1 > tol 4.607e-2 (scale 1.833e3, rel 2.51e-5)'],
  [1009, 'time history/reciprocity', 'fuzz_rich_3d/21721: u_t020: δ(n4←n2) = 2.5970546145e-3 vs δ(n2←n4) = 2.4937973053e-3, |diff| 1.033e-4 > tol 9.840e-5'],
];

test('node and element ids in quantity labels do not split a root cause (issues #993-#1055)', () => fixture(async ({args, calls, save}) => {
  for (const [issue, analysisRelation, message] of relabeled) save(String(issue), {...finding, seed: issue, test: `metamorphic/${analysisRelation}`, model: {loads: [issue]}, details: [message]});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  const causes = created.map(c => c.args.body.match(/^Root cause: (.*)$/m)[1]).sort();
  assert.deepEqual(causes, [
    'force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'r(ka) ≠ k·r(a): force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'rotation ry@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'stress[#]: label vm_plate@e#[#] vs expected vm_quad@e#[#]',
    'stress[#]: label vm_quad@e#[#] vs expected vm_quad@e#[#]',
    'translation h_im1@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'translation u@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'u_t020: δ(n#←n#) = # vs δ(n#←n#) = #, |diff| # > tol #',
  ]);
  const hits = cause => Number(created.find(c => c.args.body.includes(`Root cause: ${cause}\n`)).args.body.match(/\*\*(\d+) findings/)[1]);
  assert.equal(hits('stress[#]: label vm_quad@e#[#] vs expected vm_quad@e#[#]'), 2);
  assert.equal(hits('force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)'), 2);
  assert.equal(hits('translation u@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)'), 2);
  assert.equal(hits('rotation ry@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)'), 2);
}));
