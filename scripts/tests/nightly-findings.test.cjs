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
  for (const c of created) assert.deepEqual(c.args.assignees, ['unbalancedparentheses', 'Batuis']);
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

test('tonight: 66 findings become 32 issues with analyses kept distinct', () => fixture(async ({args, calls, save}) => {
  let index = 0;
  for (const [count, relation, message] of tonight) for (let i = 0; i < count; i++) {
    save(String(index), {...finding, test: `metamorphic/analysis${i}/${relation}`, seed: 20261030 + index,
      model: {nodes: {1: {}}, loads: Array(i + 1).fill(1)}, original_model_hash: `original-${index % 5}`,
      details: [`random-${index++}: original solved but transformed model failed: ${message}`]});
  }
  assert.equal(index, 66);
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 32);
  assert.deepEqual(created.map(c => Number(c.args.body.match(/\*\*(\d+) findings/)[1])).sort((a,b) => a-b), [
    1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,4,4
  ]);
  for (const c of created) {
    assert.ok(c.args.labels.includes('invariance-refusal'));
    assert.ok(!c.args.labels.includes('wrong-result-candidate'));
    assert.equal(c.args.body.split('```json').length, 2);
    const analysis = Number(c.args.body.match(/Analyses \(hits\): analysis(\d+):/)[1]);
    const model = JSON.parse(c.args.body.split('```json\n')[1].split('\n```')[0]);
    assert.equal(model.loads.length, analysis + 1);
  }
  const supports = created.filter(c => c.args.body.includes('node # has several supports'));
  assert.equal(supports.length, 19);
  assert.match(supports.find(c => c.args.body.includes('**4 findings**')).args.body, /\*\*1 analyses\*\*, \*\*2 relations\*\*/);
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

test('codeaster refusals that differ only in numbers are one root cause', () => fixture(async ({args, calls, save}) => {
  const refusal = v => ({...finding, test: 'codeaster/false_reject', details: {status: 'false_reject', why: [
    `stabileo: Support 3 (node 2): the prescribed dy = ${v} would not be applied, because that direction is not restrained (its flag is not set). Restrain that direction to impose it, or remove the prescribed value.`]}});
  save('a', refusal(-0.00010986903031340312));
  save('b', {...refusal(0.0025), model: {loads: [2], elements: {b: {}}}});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 1);
  assert.match(created[0].args.title, /restrain that direction to impose it/);
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

test('analysis stays distinct when quantity labels contain node and element ids', () => fixture(async ({args, calls, save}) => {
  for (const [issue, analysisRelation, message] of relabeled) save(String(issue), {...finding, seed: issue, test: `metamorphic/${analysisRelation}`, model: {loads: [issue]}, details: [message]});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 12);
  const causes = created.map(c => c.args.body.match(/^Root cause: (.*)$/m)[1]).sort();
  assert.deepEqual(causes, [
    'force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'r(ka) ≠ k·r(a): force n@e#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'rotation dof#@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'rotation dof#@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'stress[#]: label vm_plate@e#[#] vs expected vm_quad@e#[#]',
    'stress[#]: label vm_quad@e#[#] vs expected vm_quad@e#[#]',
    'stress[#]: label vm_quad@e#[#] vs expected vm_quad@e#[#]',
    'translation h_im#@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'translation u@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'translation u@n#[#]: got #, expected #, |diff| # > tol # (scale #, rel #)',
    'u_t#: δ(n#←n#) = # vs δ(n#←n#) = #, |diff| # > tol #',
  ]);
  assert.ok(created.every(c => c.args.body.includes('**1 findings**')));
}));

test('support, DOF, number and secondary solver variants share one signature with bounded display', () => fixture(async ({args, calls, save}) => {
  const refusal = (support, node, type, dof, value, kappa) => ({...finding, test: 'opensees/false_reject', details: {
    status: 'false_reject', why: [
      `stabileo: Support ${support} (node ${node}, ${type}): the prescribed ${dof} = ${value} would not be applied, because that direction is not restrained (its flag is not set). Restrain that direction to impose it, or remove the prescribed value.`,
      `opensees kappa=${kappa}`]
  }});
  save('a', refusal(2, 3, 'rollerX', 'dx', '0.0072504954813476675', '6.7e+01'));
  save('b', refusal(20, 30, 'pinned', 'dry', '0.00725', '8.1e+02'));
  save('c', refusal(200, 300, 'guidedZ', 'drz', '7.25e-3', '9.2e+03'));
  save('d', refusal(2000, 3000, 'fixed', 'dy', '0.007250495', '1.0e+04'));
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 1);
  assert.match(created[0].args.body, /\*\*4 findings\*\*/);
  assert.equal(created[0].args.body.match(/^Root cause: (.*)$/m)[1].length, 200);
}));

test('reasons that differ after the display limit keep distinct signatures', () => fixture(async ({args, calls, save}) => {
  const prefix = `solver failed: ${'x'.repeat(220)}`;
  const refusal = reason => ({...finding, test: 'opensees/false_reject', details: {
    status: 'false_reject', why: [`${prefix} ${reason}`]
  }});
  save('a', refusal('constraint alpha'));
  save('b', refusal('constraint beta'));
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 2);
  assert.ok(created.every(c => c.args.body.match(/^Root cause: (.*)$/m)[1].length === 200));
}));

test('leading-decimal and zero-padded numbers share one signature', () => fixture(async ({args, calls, save}) => {
  const refusal = (value, tolerance) => ({...finding, test: 'opensees/false_reject', details: {
    status: 'false_reject', why: [`displacement error ${value} exceeds tolerance ${tolerance}`]
  }});
  save('leading', refusal('.5', '.000001'));
  save('padded', refusal('0.5', '0.000001'));
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 1);
  assert.match(created[0].args.body, /\*\*2 findings\*\*/);
}));

test('independent why reasons survive while solver metadata stays secondary', () => fixture(async ({args, calls, save}) => {
  save('independent', {...finding, test: 'opensees/false_reject', details: {
    status: 'false_reject', why: [
      'stabileo: support constraint failed',
      'stabileo: element formulation failed',
      'opensees kappa=6.7e+01',
      'code_aster solves it (NPREC=10 singularity check passed)'
    ]
  }});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 2);
  assert.deepEqual(created.map(c => c.args.body.match(/^Root cause: (.*)$/m)[1]).sort(), [
    'stabileo: element formulation failed',
    'stabileo: support constraint failed'
  ]);
}));

test('symmetry, timestep, mode, plane and non-finite variants collapse within each finding', () => fixture(async ({args, calls, save}) => {
  save('symmetry', {...finding, test: 'metamorphic/symmetry/projection', details: [
    'case-a: symmetric response not symmetric: u_t010@n1 got nan, expected inf',
    'case-b: antisymmetric response not antisymmetric: u_t020@n2 got NaN, expected -inf'
  ]});
  save('modes', {...finding, test: 'certificates/modal', details: [
    'xz: f00 lambda0 meff00 h_re0 h_im0 il_t0000',
    'yz: f03 lambda2 meff02 h_re1 h_im1 il_t0001'
  ]});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 2);
  assert.ok(created.every(c => c.args.body.includes('**1 findings**')));
  assert.ok(created.some(c => c.args.body.includes('Root cause: symmetric response not symmetric: u_t#@n# got #nonfinite, expected #nonfinite')));
  assert.ok(created.some(c => c.args.body.includes('Root cause: plane: f# lambda# meff# h_re# h_im# il_t#')));
}));

test('quantity components collapse while quantity class, analysis, check and diagnostic stay distinct', () => fixture(async ({args, calls, save}) => {
  const differential = (test, analysis, quantity, code) => ({...finding, test, details: {
    status: 'mismatch', analysis, code, worst: quantity === 'disp' ? [
      ['disp', 1, 'ux', 1, 2, 0.2], ['disp', 2, 'ry', 1, 2, 0.1], ['disp', 3, 'step010.0', 1, 2, 0.05]
    ] : [
      ['force', 1, 'nStart', 1, 2, 0.2], ['force', 2, 'mEnd', 1, 2, 0.1]
    ]
  }});
  save('components', differential('opensees/mismatch', 'static', 'disp'));
  save('quantity', differential('opensees/mismatch', 'static', 'force'));
  save('analysis', differential('opensees/mismatch', 'pdelta', 'force'));
  save('check', differential('codeaster/mismatch', 'static', 'force'));
  save('diagnostic', differential('opensees/mismatch', 'static', 'force', 'residual_high'));
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 5);
  assert.equal(created.filter(c => c.args.body.includes('Root cause: static: disp')).length, 1);
  assert.equal(created.filter(c => c.args.body.includes('Root cause: static: force')).length, 3);
  assert.equal(created.filter(c => c.args.body.includes('Root cause: pdelta: force')).length, 1);
  assert.ok(created.some(c => c.args.body.includes('Test: **codeaster/mismatch**')));
  assert.ok(created.some(c => c.args.body.includes('diagnostic: **residual_high**')));
  assert.ok(created.every(c => c.args.body.includes('**1 findings**')));
}));

test('recent, truncated and pre-id legacy markers match without opening duplicates', () => fixture(async ({args, calls, issues, save}) => {
  const marker = parts => `<!-- nightly-finding:${require('node:crypto').createHash('sha256').update(JSON.stringify(parts)).digest('hex')} -->`;
  const support = 'stabileo: Support 2 (node 3, rollerX): the prescribed dx = 0.0072504954813476675 would not be applied, because that direction is not restrained (its flag is not set). Restrain that direction to impose it, or remove the prescribed value.';
  const legacyNormalize = message => String(message)
    .replace(/\b(node|element|member|support|case)\s+(?:['"][^'"]+['"]|[a-zA-Z_]*\d[\w.-]*)/gi, '$1 #')
    .replace(/\b([ne])\d+\b/g, '$1#')
    .replace(/[-+]?\b\d+(?:\.\d*)?(?:e[-+]?\d+)?\b/gi, '#')
    .replace(/#(?:\s*,\s*#)+/g, '#')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  issues.push(
    {number: 71, state: 'open', body: marker(['opensees', 'false_reject', legacyNormalize(support.slice(0, 200))])},
    {number: 72, state: 'open', body: marker(['metamorphic', 'wrong-result-candidate', 'translation u@n8[#]: got #, expected #'])},
    {number: 73, state: 'open', body: marker(['opensees', 'wrong-result-candidate', 'static: disp/ux'])},
    {number: 74, state: 'open', body: marker(['metamorphic', 'wrong-result-candidate', 'antisymmetric response not antisymmetric: displacement #'])}
  );
  save('support', {...finding, test: 'opensees/false_reject', details: {status: 'false_reject', why: [support]}});
  save('ids', {...finding, test: 'metamorphic/static/rotation', details: ['case: translation u@n8[1]: got 1, expected 2']});
  save('worst', {...finding, test: 'opensees/mismatch', details: {status: 'mismatch', analysis: 'static', worst: [
    ['disp', 1, 'ux', 1, 2, 0.2], ['disp', 2, 'ry', 1, 2, 0.1]
  ]}});
  save('symmetry', {...finding, test: 'metamorphic/symmetry/projection', details: [
    'case: symmetric response not symmetric: displacement 1',
    'case: antisymmetric response not antisymmetric: displacement 2'
  ]});
  await report(args);
  assert.equal(calls.filter(c => c.name === 'create').length, 0);
  assert.deepEqual(calls.filter(c => c.name === 'createComment').map(c => c.args.issue_number).sort(), [71, 72, 73, 74]);
}));

test('one legacy issue cannot absorb distinct analysis and diagnostic groups', () => fixture(async ({args, calls, issues, save}) => {
  const legacy = require('node:crypto').createHash('sha256').update(JSON.stringify(['opensees', 'wrong-result-candidate', 'solver residual #'])).digest('hex');
  issues.push({number: 75, state: 'open', body: `<!-- nightly-finding:${legacy} -->`});
  save('static', {...finding, test: 'opensees/mismatch', details: {
    status: 'mismatch', analysis: 'static', code: 'residual_high', message: 'solver residual 1'
  }});
  save('pdelta', {...finding, test: 'opensees/mismatch', details: {
    status: 'mismatch', analysis: 'pdelta', code: 'iteration_limit', message: 'solver residual 2'
  }});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 1);
  const commented = calls.filter(c => c.name === 'createComment');
  assert.deepEqual(commented.map(c => c.args.issue_number), [75]);
  const bodies = [created[0].args.body, commented[0].args.body];
  assert.ok(bodies.some(body => body.includes('diagnostic: **residual_high**') && body.includes('Analyses (hits): static: 1')));
  assert.ok(bodies.some(body => body.includes('diagnostic: **iteration_limit**') && body.includes('Analyses (hits): pdelta: 1')));
}));

test('replay-pending placeholders do not open numerical findings', () => fixture(async ({args, calls, logs, save}) => {
  save('original', {...finding, test: 'opensees/dumped_failure', details: {status: 'original failure; replay pending'}});
  await report(args);
  assert.equal(calls.filter(c => ['createLabel', 'create', 'createComment', 'update'].includes(c.name)).length, 0);
  assert.match(logs[0], /No structured numerical findings/);
}));

test('legacy worst markers hashed verbatim still match mixed-case and decimal-step components', () => fixture(async ({args, calls, issues, save}) => {
  const marker = parts => `<!-- nightly-finding:${require('node:crypto').createHash('sha256').update(JSON.stringify(parts)).digest('hex')} -->`;
  issues.push(
    {number: 81, state: 'open', body: marker(['opensees', 'wrong-result-candidate', 'static: force/nStart'])},
    {number: 82, state: 'open', body: marker(['opensees', 'wrong-result-candidate', 'static: disp/step#.0'])}
  );
  save('nstart', {...finding, test: 'opensees/mismatch', details: {status: 'mismatch', analysis: 'static', worst: [['force', 1, 'nStart', 1, 2, 0.2]]}});
  save('step', {...finding, test: 'opensees/mismatch', details: {status: 'mismatch', analysis: 'static', worst: [['disp', 1, 'step3.0', 1, 2, 0.2]]}});
  await report(args);
  assert.equal(calls.filter(c => c.name === 'create').length, 0);
  assert.deepEqual(calls.filter(c => c.name === 'createComment').map(c => c.args.issue_number).sort(), [81, 82]);
}));

test('reason findings take the model analysis when the details give none', () => fixture(async ({args, calls, save}) => {
  save('static', {...finding, test: 'opensees/false_reject', model: {...finding.model, analysis: 'static'}, details: {status: 'false_reject', why: ['refused: singular']}});
  save('modal', {...finding, test: 'opensees/false_reject', model: {...finding.model, analysis: 'modal'}, details: {status: 'false_reject', why: ['refused: singular']}});
  await report(args);
  const created = calls.filter(c => c.name === 'create');
  assert.equal(created.length, 2);
  assert.ok(created.some(c => c.args.body.includes('Analyses (hits): static: 1')));
  assert.ok(created.some(c => c.args.body.includes('Analyses (hits): modal: 1')));
}));

test('an exact-signature issue wins over a legacy alias listed before it', () => fixture(async ({args, calls, issues, save}) => {
  const sha = parts => require('node:crypto').createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  issues.push(
    {number: 91, state: 'open', body: `<!-- nightly-finding:${sha(['opensees', 'wrong-result-candidate', 'static: force/nStart'])} -->`},
    {number: 92, state: 'open', body: `<!-- nightly-finding:${sha(['opensees', 'wrong-result-candidate', 'static', 'unspecified', 'static: force'])} -->`}
  );
  save('first', {...finding, test: 'opensees/mismatch', details: {status: 'mismatch', analysis: 'static', worst: [['force', 1, 'nStart', 1, 2, 0.2]]}});
  await report(args);
  assert.equal(calls.filter(c => c.name === 'create').length, 0);
  assert.deepEqual(calls.filter(c => c.name === 'createComment').map(c => c.args.issue_number), [92]);
}));
