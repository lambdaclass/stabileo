const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const alert = require('../../.github/scripts/slow-e2e-alert.cjs');

const report = (tests) => ({suites: [{title: 'explained-steps.spec.ts', specs: [], suites: [{title: 'explained step by step', specs: tests.map(([title, line, status]) => ({
  title, file: 'explained-steps.spec.ts', line, tests: [{projectName: 'chromium', status}],
}))}]}]});

function shards(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-alert-'));
  entries.forEach((entry, i) => {
    if (!entry) return;
    const base = path.join(dir, `e2e-slow-${i + 1}`);
    fs.mkdirSync(base);
    fs.writeFileSync(path.join(base, 'outcome'), `${entry.outcome}\n`);
    if (entry.report !== undefined) fs.writeFileSync(path.join(base, 'slow.json'), typeof entry.report === 'string' ? entry.report : JSON.stringify(entry.report));
  });
  return dir;
}

test('only unexpected results count as failing; flaky and skipped do not', () => {
  assert.deepEqual(alert.failingSpecs(report([['walks every method', 39, 'unexpected'], ['retried', 60, 'flaky'], ['catalog', 22, 'expected'], ['off', 80, 'skipped']])),
    ['explained-steps.spec.ts:39 › walks every method [chromium]']);
});

test('a red shard, a green shard and a shard without a report', () => {
  const dir = shards([
    {outcome: 'failure', report: report([['walks every method', 39, 'unexpected']])},
    {outcome: 'success', report: report([['catalog', 22, 'expected']])},
    null,
  ]);
  const read = alert.readShards(dir, 3);
  assert.deepEqual(read.map(s => [s.shard, s.outcome, s.failures.length]), [[1, 'failure', 1], [2, 'success', 0], [3, 'missing', 0]]);
  assert.equal(alert.verdict(read), 'red');
});

test('a failed suite with no readable report still counts as red', () => {
  const read = alert.readShards(shards([{outcome: 'failure', report: '{not json'}, {outcome: 'failure'}]), 2);
  assert.deepEqual(read.flatMap(s => s.failures), [
    'shard 1: the slow suite failed without a readable report',
    'shard 2: the slow suite failed without a readable report',
  ]);
  assert.equal(alert.verdict(read), 'red');
});

test('green only when every shard ran and passed; a skipped or missing shard is unknown', () => {
  const pass = {outcome: 'success', report: report([['catalog', 22, 'expected']])};
  assert.equal(alert.verdict(alert.readShards(shards([pass, pass]), 2)), 'green');
  assert.equal(alert.verdict(alert.readShards(shards([pass, {outcome: 'skipped'}]), 2)), 'unknown');
  assert.equal(alert.verdict(alert.readShards(shards([pass, null]), 2)), 'unknown');
  assert.equal(alert.verdict(alert.readShards(shards([]), 0)), 'unknown');
});

test('PR numbers come from merge and squash subjects, once each, in order', () => {
  assert.deepEqual(alert.mergedPrs([
    'Merge pull request #807 from lambdaclass/safety/contain\n\nSafety: contain',
    'A commit inside the PR mentioning #12 in its body',
    'Squashed change (#1509)',
    'Merge pull request #807 from lambdaclass/safety/contain',
    'Merge remote-tracking branch origin/main',
  ]), [807, 1509]);
});

test('only main\'s first-parent chain counts: commits and merges inside a PR branch do not', async () => {
  const commits = {
    b1: ['base', 'Inside the branch (#758)'],
    b2: ['b1', 'Merge pull request #1030 from fork/nested'],
    m1: ['base', 'Merge pull request #807 from lambdaclass/safety/contain'],
    m2: ['m1', 'Merge pull request #1509 from lambdaclass/tests/corpus'],
  };
  const seen = [];
  const github = {rest: {repos: {getCommit: async ({ref}) => { seen.push(ref); return {data: {commit: {message: commits[ref][1]}, parents: [{sha: commits[ref][0]}]}}; }}}};
  const mainline = await alert.mainlineMessages(github, 'o', 'r', 'base', 'm2');
  assert.equal(mainline.complete, true);
  assert.deepEqual(alert.mergedPrs(mainline.messages), [807, 1509]);
  assert.deepEqual(seen, ['m2', 'm1']);
});

test('a mainline longer than the limit is reported as incomplete', async () => {
  const github = {rest: {repos: {getCommit: async ({ref}) => {
    const i = Number(ref.slice(1));
    return {data: {commit: {message: `Merge pull request #${i} from x`}, parents: [{sha: `c${i - 1}`}]}};
  }}}};
  const mainline = await alert.mainlineMessages(github, 'o', 'r', 'c0', `c${alert.MAINLINE_LIMIT + 50}`);
  assert.equal(mainline.complete, false);
  assert.equal(mainline.messages.length, alert.MAINLINE_LIMIT);
  const body = alert.issueBody({shards: [{shard: 1, outcome: 'failure', failures: ['a.spec.ts:1 › x [chromium]']}], runUrl: 'u', sha: 'abcdef1234',
    lastGreen: {runUrl: 'g', sha: 'c0aaaaaaaaa'}, prs: alert.mergedPrs(mainline.messages).slice(0, 2), complete: false});
  assert.match(body, /Candidate PRs, from the newest 100 mainline commits only \(older ones not listed\): #51, #52/);
});

test('the issue body names the failing specs, the run, the last green run and the PRs since', () => {
  const body = alert.issueBody({
    shards: [
      {shard: 6, outcome: 'failure', failures: ['explained-steps.spec.ts:39 › walks every method [chromium]']},
      {shard: 7, outcome: 'success', failures: []},
      {shard: 8, outcome: 'skipped', failures: []},
    ],
    runUrl: 'https://github.com/o/r/actions/runs/42110223149',
    sha: '40287f932aaaaaaaaaaa',
    lastGreen: {runUrl: 'https://github.com/o/r/actions/runs/42048340349', sha: '525c78766bbbbbbbbbbb'},
    prs: [807, 1509],
  });
  assert.equal(body, [
    'The `@slow` E2E suite failed on main at 40287f932: https://github.com/o/r/actions/runs/42110223149',
    '',
    'Failing specs:',
    '- explained-steps.spec.ts:39 › walks every method [chromium] (shard 6)',
    '',
    'No slow report from shard 8 (the suite did not run there, or its upload failed).',
    '',
    'Last green `@slow` run: https://github.com/o/r/actions/runs/42048340349 (525c78766).',
    'Candidate PRs merged since: #807, #1509',
    '',
    'A red can also be infrastructure or a flaky test. The merge queue does not run `@slow` (#1519), so a regression shows up only here.',
  ].join('\n'));
});

test('without a green run in reach the body says the suspects are unknown', () => {
  const body = alert.issueBody({shards: [{shard: 1, outcome: 'failure', failures: ['a.spec.ts:1 › x [chromium]']}], runUrl: 'u', sha: 'abcdef1234', lastGreen: null, prs: []});
  assert.match(body, /No green `@slow` run among the last 30 main pushes, so the suspect PRs are unknown\./);
  assert.doesNotMatch(body, /Candidate PRs/);
});

function fakeGithub({open = [], runs = [], jobs = {}, commits = [], main = 'cccccccccc'}) {
  const calls = [];
  const record = (name, result) => async (args) => { calls.push({name, args}); return {data: typeof result === 'function' ? result(args) : result}; };
  const rest = {
    issues: {
      listForRepo: record('listForRepo', open),
      createComment: record('createComment', {}),
      update: record('update', {}),
      create: record('create', {number: 77}),
    },
    actions: {
      listWorkflowRuns: record('listWorkflowRuns', {workflow_runs: runs}),
      listJobsForWorkflowRun: record('listJobsForWorkflowRun', (args) => jobs[args.run_id] ?? []),
    },
    git: {getRef: record('getRef', {object: {sha: main}})},
    repos: {getCommit: record('getCommit', ({ref}) => {
      const i = ref === 'cccccccccc' ? commits.length - 1 : Number(ref.slice(1));
      return {commit: {message: commits[i]}, parents: [{sha: i ? `s${i - 1}` : 'aaaaaaaaaa'}]};
    })},
  };
  const paginate = async (method, args) => (await method(args)).data;
  return {github: {rest, paginate}, calls};
}

async function run(github, entries, total) {
  const previous = {dir: process.env.SLOW_REPORTS_DIR, total: process.env.E2E_TOTAL};
  process.env.SLOW_REPORTS_DIR = shards(entries);
  process.env.E2E_TOTAL = String(total);
  const logs = [];
  try {
    await alert({github, context: {repo: {owner: 'o', repo: 'r'}, serverUrl: 'https://github.com', runId: 300, sha: 'cccccccccc'},
      core: {info: m => logs.push(m), warning: m => logs.push(m)}});
  } finally {
    for (const [key, value] of [['SLOW_REPORTS_DIR', previous.dir], ['E2E_TOTAL', previous.total]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  return logs;
}

const slowStep = (conclusion) => [{name: 'E2E smoke suite (shard 1/2)', conclusion: 'success'}, {name: 'E2E slow suite (shard 1/2)', conclusion}];
const red = {outcome: 'failure', report: report([['walks every method', 39, 'unexpected']])};
const green = {outcome: 'success', report: report([['walks every method', 39, 'expected']])};

test('red with no open issue opens one, labelled and assigned, blaming PRs since the last green run', async () => {
  const {github, calls} = fakeGithub({
    runs: [{id: 300}, {id: 299, html_url: 'r299', head_sha: 'bbbbbbbbbb'}, {id: 297, html_url: 'r297', head_sha: 'dddddddddd'}, {id: 298, html_url: 'r298', head_sha: 'aaaaaaaaaa'}],
    jobs: {299: [{name: 'E2E (1/2)', conclusion: 'failure', steps: slowStep('failure')}, {name: 'E2E (2/2)', conclusion: 'success', steps: slowStep('success')}],
      297: [{name: 'E2E (1/2)', conclusion: 'success', steps: slowStep('skipped')}, {name: 'E2E (2/2)', conclusion: 'success', steps: slowStep('success')}],
      298: [{name: 'E2E (1/2)', conclusion: 'failure', steps: [...slowStep('success'), {name: 'Upload slow suite outcome', conclusion: 'failure'}]}, {name: 'E2E (2/2)', conclusion: 'success', steps: slowStep('success')}, {name: 'Web Unit (1/8)', conclusion: 'failure'}]},
    commits: ['Merge pull request #807 from x', 'Merge pull request #1509 from y'],
  });
  await run(github, [red, green], 2);
  assert.deepEqual(calls.filter(c => c.name === 'listJobsForWorkflowRun').map(c => c.args.run_id), [300, 299, 297, 298]);
  assert.deepEqual(calls.filter(c => c.name === 'getCommit').map(c => c.args.ref), ['cccccccccc', 's0']);
  const created = calls.find(c => c.name === 'create').args;
  assert.equal(created.title, 'CI failure: @slow E2E on main');
  assert.deepEqual(created.labels, ['ci-failure']);
  assert.deepEqual(created.assignees, ['unbalancedparentheses', 'Batuis']);
  assert.match(created.body, /explained-steps\.spec\.ts:39 › walks every method \[chromium\] \(shard 1\)/);
  assert.match(created.body, /Last green `@slow` run: r298 \(aaaaaaaaa\)\.\nCandidate PRs merged since: #807, #1509/);
  assert.match(created.body, /actions\/runs\/300/);
});

test('a red is not reported when a newer main push already passed the slow suite', async () => {
  const {github, calls} = fakeGithub({
    runs: [{id: 301, html_url: 'r301', head_sha: 'eeeeeeeeee'}, {id: 298, html_url: 'r298', head_sha: 'aaaaaaaaaa'}],
    jobs: {301: [{name: 'E2E (1/1)', conclusion: 'success', steps: slowStep('success')}], 298: [{name: 'E2E (1/1)', conclusion: 'success', steps: slowStep('success')}]},
  });
  await run(github, [red], 1);
  assert.equal(calls.filter(c => ['create', 'createComment'].includes(c.name)).length, 0);
});

test('a newer push that skipped the slow suite does not hide a red', async () => {
  const {github, calls} = fakeGithub({
    runs: [{id: 301, html_url: 'r301', head_sha: 'eeeeeeeeee'}, {id: 298, html_url: 'r298', head_sha: 'aaaaaaaaaa'}],
    jobs: {301: [{name: 'E2E (1/1)', conclusion: 'success', steps: slowStep('skipped')}], 298: [{name: 'E2E (1/1)', conclusion: 'success', steps: slowStep('success')}]},
    commits: ['Merge pull request #807 from x'],
  });
  await run(github, [red], 1);
  assert.match(calls.find(c => c.name === 'create').args.body, /Last green `@slow` run: r298/);
});

test('red with the issue already open comments on it instead of opening another', async () => {
  const {github, calls} = fakeGithub({open: [{number: 9, title: 'CI failure: @slow E2E on main'}, {number: 5, title: 'CI failure: Nightly verification'}]});
  await run(github, [red], 1);
  assert.equal(calls.filter(c => c.name === 'create').length, 0);
  const comment = calls.find(c => c.name === 'createComment').args;
  assert.equal(comment.issue_number, 9);
  assert.match(comment.body, /No green `@slow` run among the last 30/);
});

test('green closes the open issue with a comment, and does nothing when none is open', async () => {
  const open = fakeGithub({open: [{number: 9, title: 'CI failure: @slow E2E on main'}]});
  await run(open.github, [green, green], 2);
  assert.match(open.calls.find(c => c.name === 'createComment').args.body, /^Green again: .*actions\/runs\/300$/);
  assert.deepEqual(open.calls.find(c => c.name === 'update').args, {owner: 'o', repo: 'r', issue_number: 9, state: 'closed', state_reason: 'completed'});
  const none = fakeGithub({});
  await run(none.github, [green], 1);
  assert.deepEqual(none.calls.map(c => c.name), ['listForRepo']);
});

test('a green run of a commit main has moved past does not close the issue', async () => {
  const {github, calls} = fakeGithub({open: [{number: 9, title: 'CI failure: @slow E2E on main'}], main: 'dddddddddd'});
  await run(github, [green], 1);
  assert.deepEqual(calls.map(c => c.name), ['listForRepo', 'getRef']);
});

test('a red run still reports after main has moved on, since the newer push may not run the slow suite', async () => {
  const {github, calls} = fakeGithub({main: 'dddddddddd'});
  await run(github, [red], 1);
  assert.equal(calls.filter(c => c.name === 'getRef').length, 0);
  assert.match(calls.find(c => c.name === 'create').args.body, /failed on main at ccccccccc/);
});

test('an unknown result neither opens nor closes', async () => {
  const {github, calls} = fakeGithub({open: [{number: 9, title: 'CI failure: @slow E2E on main'}]});
  await run(github, [green, null], 2);
  assert.deepEqual(calls.map(c => c.name), []);
});
