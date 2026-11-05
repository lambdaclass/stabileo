const assert = require('node:assert/strict');
const {test} = require('node:test');
const alert = require('../../.github/scripts/verification-alert.cjs');

const HOUR = 3.6e6;

function harness({run: runOverrides = {}, jobs = [], open = [], workflows = [], runsByWorkflow = {}, label = false, labelRace = false, env = {}, comments = [], timeline = []} = {}) {
  const calls = [];
  const logs = [];
  const record = (name, result) => async (args) => {
    calls.push({name, args});
    return typeof result === 'function' ? result(args) : result;
  };
  const issues = {
    getLabel: record('getLabel', () => {
      if (!label) throw Object.assign(new Error('missing'), {status: 404});
      return {data: {}};
    }),
    createLabel: record('createLabel', () => {
      if (labelRace) {
        label = true;
        throw Object.assign(new Error('already_exists'), {status: 422});
      }
      return {data: {}};
    }),
    listForRepo: record('listForRepo', () => ({data: typeof open === 'function' ? open() : open})),
    create: record('create', (a) => ({data: {...a, number: 900}})),
    createComment: record('createComment', {data: {}}),
    update: record('update', {data: {}}),
    listComments: record('listComments', {data: comments}),
    listEventsForTimeline: record('listEventsForTimeline', {data: timeline}),
  };
  const actions = {
    getWorkflowRun: record('getWorkflowRun', {data: {
      id: 55, workflow_id: 7, event: 'schedule', head_branch: 'main', head_sha: 'abcdef0123456789',
      conclusion: 'failure', html_url: 'https://x/runs/55', created_at: '2026-11-01T05:00:00Z',
      display_title: 'Nightly verification', ...runOverrides,
    }}),
    getWorkflow: record('getWorkflow', {data: {name: 'Nightly verification'}}),
    listJobsForWorkflowRun: record('listJobsForWorkflowRun', {data: jobs}),
    listRepoWorkflows: record('listRepoWorkflows', {data: workflows}),
    listWorkflowRuns: record('listWorkflowRuns', (a) => ({data: {workflow_runs: runsByWorkflow[a.workflow_id] || []}})),
  };
  const github = {
    rest: {issues, actions},
    paginate: async (method, args) => (await method(args)).data,
  };
  const core = Object.fromEntries(['info', 'notice', 'warning'].map((k) => [k, (m) => logs.push(m)]));
  const context = {repo: {owner: 'o', repo: 'r'}, payload: {repository: {default_branch: 'main'}}};
  const run = async () => {
    const saved = {...process.env};
    Object.assign(process.env, {ALERT_MODE: 'run', ALERT_RUN_ID: '55', ALERT_DRY_RUN: 'false', ALERT_ANY_EVENT: 'false', ...env});
    try {
      await alert({github, context, core});
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  };
  const writes = () => calls.filter((c) => ['createLabel', 'create', 'createComment', 'update'].includes(c.name));
  return {run, calls, logs, writes};
}

const failedJob = {
  name: 'mutants (3)', status: 'completed', conclusion: 'failure', html_url: 'https://x/job/1',
  steps: [{name: 'Checkout', conclusion: 'success'}, {name: 'Mutants (shard 3/512)', conclusion: 'failure'}],
};

test('a failed scheduled run opens one issue named after the workflow, with the failing job and step', async () => {
  const h = harness({jobs: [failedJob, {...failedJob, name: 'bench', conclusion: 'success'}]});
  await h.run();
  const w = h.writes();
  assert.deepEqual(w.map((c) => c.name), ['createLabel', 'create']);
  assert.equal(w[0].args.name, 'ci-failure');
  const issue = w[1].args;
  assert.equal(issue.title, 'CI failure: Nightly verification');
  assert.deepEqual(issue.labels, ['ci-failure']);
  assert.match(issue.body, /\[55\]\(https:\/\/x\/runs\/55\)/);
  assert.match(issue.body, /\[mutants \(3\)\]\(https:\/\/x\/job\/1\): \*\*failure\*\* in step `Mutants \(shard 3\/512\)`/);
  assert.doesNotMatch(issue.body, /bench/);
  assert.match(issue.body, /abcdef0123 /);
});

test('a label created by a concurrent alert does not stop this one', async () => {
  const h = harness({jobs: [failedJob], labelRace: true});
  await h.run();
  assert.deepEqual(h.calls.filter((c) => c.name.endsWith('Label')).map((c) => c.name), ['getLabel', 'createLabel', 'getLabel']);
  assert.equal(h.writes().find((c) => c.name === 'create').args.title, 'CI failure: Nightly verification');
});

test('a later failure comments on the open issue instead of opening another', async () => {
  const h = harness({jobs: [failedJob], open: [
    {number: 12, title: 'CI failure: Nightly verification [forced failure]'},
    {number: 13, title: 'CI failure: Nightly verification', pull_request: {}},
    {number: 14, title: 'CI failure: Nightly verification'},
  ]});
  await h.run();
  const w = h.writes();
  assert.deepEqual(w.map((c) => c.name), ['createComment']);
  assert.equal(w[0].args.issue_number, 14);
  assert.match(w[0].args.body, /mutants \(3\)/);
});

const at = (h) => `2026-11-01T${String(h).padStart(2, '0')}:00:00Z`;
const issue14 = {number: 14, title: 'CI failure: Nightly verification', created_at: at(5)};
const bot = {user: {login: 'github-actions[bot]', type: 'Bot'}, body: 'Run 54 of Nightly verification ...', created_at: at(6)};
const human = (h, author_association = 'MEMBER', body = 'Triaged: #757, #758.') => ({user: {login: 'someone', type: 'User'}, author_association, body, created_at: at(h)});

test('a green scheduled run closes an issue triaged after its latest failure', async () => {
  for (const triaged of [
    {comments: [bot, human(7)]},
    {comments: [bot, human(7, 'COLLABORATOR')]},
    {comments: [bot, human(7, 'OWNER', 'See https://github.com/lambdaclass/stabileo/issues/760')]},
    {comments: [bot, human(7, 'MEMBER', 'No finding: the runner ran out of disk.')]},
    {comments: [bot], timeline: [{event: 'labeled', label: {name: 'triaged'}, created_at: at(7)}]},
  ]) {
    const h = harness({run: {conclusion: 'success'}, open: [issue14], runsByWorkflow: {7: [{id: 55, conclusion: 'success'}]}, ...triaged});
    await h.run();
    const w = h.writes();
    assert.deepEqual(w.map((c) => c.name), ['createComment', 'update'], JSON.stringify(triaged));
    assert.match(w[0].args.body, /^Green again: run/);
    assert.deepEqual([w[1].args.issue_number, w[1].args.state, w[1].args.state_reason], [14, 'closed', 'completed']);
  }
});

test('triage before the latest failure, by an outsider or by a mere reference does not count', async () => {
  for (const stale of [
    {comments: [human(5), bot]},
    {comments: [bot], timeline: [{event: 'cross-referenced', created_at: at(5)}, {event: 'labeled', label: {name: 'triaged'}, created_at: at(5)}]},
    {comments: [bot], timeline: [{event: 'labeled', label: {name: 'bug'}, created_at: at(7)}]},
    {comments: [bot, human(7, 'NONE'), human(7, 'CONTRIBUTOR')]},
    {comments: [bot, human(7, 'MEMBER', 'looking'), human(7, 'OWNER', 'Probably a flaky seed, will check issue 12 later')]},
    {comments: [bot], timeline: [{event: 'cross-referenced', created_at: at(7)}]},
  ]) {
    const h = harness({run: {conclusion: 'success'}, open: [issue14], ...stale});
    await h.run();
    assert.deepEqual(h.writes().map((c) => c.name), ['createComment'], JSON.stringify(stale));
    assert.match(h.writes()[0].args.body, /^Green again, but this issue is not triaged yet/);
  }
});

test('a green scheduled run leaves an untriaged issue open and says so once per failure', async () => {
  const h = harness({run: {conclusion: 'success'}, open: [issue14], comments: [bot], timeline: [{event: 'commented', created_at: at(6)}]});
  await h.run();
  const w = h.writes();
  assert.deepEqual(w.map((c) => c.name), ['createComment']);
  assert.equal(w[0].args.issue_number, 14);
  assert.match(w[0].args.body, /^Green again, but this issue is not triaged yet: run \[55\]/);
  assert.doesNotMatch(w[0].args.body, /Closing\./);

  const held = {user: bot.user, body: w[0].args.body, created_at: at(8)};
  const again = harness({run: {conclusion: 'success'}, open: [issue14], comments: [bot, held]});
  await again.run();
  assert.deepEqual(again.writes(), []);

  const newFailure = {...bot, created_at: at(9)};
  const later = harness({run: {conclusion: 'success'}, open: [issue14], comments: [bot, held, newFailure]});
  await later.run();
  assert.deepEqual(later.writes().map((c) => c.name), ['createComment']);
});

test('two alerts that both opened an issue keep the oldest and close the other', async () => {
  let listed = 0;
  const open = () => (listed++ === 0 ? [] : [{number: 901, title: 'CI failure: Nightly verification'}, {number: 900, title: 'CI failure: Nightly verification'}]);
  const h = harness({jobs: [failedJob], label: true, open});
  await h.run();
  const w = h.writes().map((c) => [c.name, c.args.issue_number, c.args.state]);
  assert.deepEqual(w, [['create', undefined, undefined], ['createComment', 900, undefined], ['createComment', 901, undefined], ['update', 901, 'closed']]);
  assert.match(h.writes()[2].args.body, /Duplicate of #900/);
});

test('a raced duplicate hands its own report to the issue that stays open', async () => {
  const other = 'Run 54 of Nightly verification concluded **failure**: - [e2e](https://x/jobs/2)';
  let listed = 0;
  const open = () => (listed++ === 0 ? [] : [{number: 899, title: 'CI failure: Nightly verification', body: 'first report'}, {number: 902, title: 'CI failure: Nightly verification', body: other}]);
  const h = harness({jobs: [failedJob], label: true, open});
  await h.run();
  const toKeep = h.writes().filter((c) => c.name === 'createComment' && c.args.issue_number === 899);
  assert.deepEqual(toKeep.map((c) => c.args.body), [other]);
});

test('a triaged label removed again does not let a green run close the issue', async () => {
  const label = (event, h) => ({event, label: {name: 'triaged'}, created_at: at(h)});
  const removed = harness({run: {conclusion: 'success'}, open: [issue14], comments: [bot], timeline: [label('labeled', 7), label('unlabeled', 8)]});
  await removed.run();
  assert.deepEqual(removed.writes().map((c) => c.name), ['createComment']);
  assert.match(removed.writes()[0].args.body, /^Green again, but this issue is not triaged yet/);
  const again = harness({run: {conclusion: 'success'}, open: [issue14], comments: [bot], runsByWorkflow: {7: [{id: 55, conclusion: 'success'}]}, timeline: [label('labeled', 7), label('unlabeled', 8), label('labeled', 9)]});
  await again.run();
  assert.deepEqual(again.writes().map((c) => c.name), ['createComment', 'update']);
});

test('an older green run replayed after a newer failure does not close the issue', async () => {
  const h = harness({run: {conclusion: 'success', id: 55}, open: [issue14], comments: [bot, human(7)],
    runsByWorkflow: {7: [{id: 60, conclusion: 'failure'}]}, env: {ALERT_ANY_EVENT: 'true'}});
  await h.run();
  assert.deepEqual(h.writes(), []);
  const latest = h.calls.find((c) => c.name === 'listWorkflowRuns').args;
  assert.deepEqual([latest.workflow_id, latest.event, latest.status, latest.branch], [7, 'schedule', 'completed', 'main']);
});

test('a green run with nothing open writes nothing', async () => {
  const h = harness({run: {conclusion: 'success'}});
  await h.run();
  assert.deepEqual(h.writes(), []);
});

test('the forced-failure run gets its own issue, never the real one', async () => {
  const h = harness({
    run: {event: 'workflow_dispatch', head_branch: 'ci/x', display_title: '[forced failure] Nightly verification'},
    jobs: [{...failedJob, name: 'plan', steps: [{name: 'Plan', conclusion: 'failure'}]}],
    open: [{number: 14, title: 'CI failure: Nightly verification'}],
  });
  await h.run();
  const w = h.writes();
  assert.deepEqual(w.map((c) => c.name), ['createLabel', 'create']);
  assert.equal(w[1].args.title, 'CI failure: Nightly verification [forced failure]');
});

test('manual, pull-request and off-main scheduled runs do not alert', async () => {
  for (const run of [{event: 'workflow_dispatch'}, {event: 'pull_request'}, {event: 'schedule', head_branch: 'feature'}]) {
    const h = harness({run, jobs: [failedJob]});
    await h.run();
    assert.deepEqual(h.writes(), [], JSON.stringify(run));
  }
});

test('any_event alerts for a manual run', async () => {
  const h = harness({run: {event: 'workflow_dispatch'}, jobs: [failedJob], label: true, env: {ALERT_ANY_EVENT: 'true'}});
  await h.run();
  assert.deepEqual(h.writes().map((c) => c.name), ['create']);
});

test('timed-out, cancelled and startup failures alert; skipped and neutral do not', async () => {
  for (const conclusion of ['timed_out', 'cancelled', 'startup_failure']) {
    const h = harness({run: {conclusion}, label: true});
    await h.run();
    const w = h.writes();
    assert.equal(w.length, 1, conclusion);
    assert.match(w[0].args.body, new RegExp(`concluded \\*\\*${conclusion}\\*\\*`));
    assert.match(w[0].args.body, /no job failed: the workflow did not start/);
  }
  for (const conclusion of ['skipped', 'neutral', 'action_required']) {
    const h = harness({run: {conclusion}});
    await h.run();
    assert.deepEqual(h.writes(), [], conclusion);
  }
});

test('a failed job without a failing step says so', async () => {
  const h = harness({jobs: [{...failedJob, conclusion: 'cancelled', steps: []}], label: true});
  await h.run();
  assert.match(h.writes()[0].args.body, /\*\*cancelled\*\* \(no failing step: setup, runner loss or job timeout\)/);
});

test('dry run reads but never writes', async () => {
  const h = harness({jobs: [failedJob], env: {ALERT_DRY_RUN: 'true'}});
  await h.run();
  assert.deepEqual(h.writes(), []);
  assert.ok(h.logs.some((m) => m.startsWith('[dry run] open issue: CI failure: Nightly verification')));
});

test('the staleness check reports missing, disabled and stale workflows, and leaves fresh ones alone', async () => {
  const now = Date.now();
  const at = (hoursAgo) => new Date(now - hoursAgo * HOUR).toISOString();
  const workflows = [
    {id: 1, name: 'Nightly verification', state: 'active', path: '.github/workflows/nightly.yml'},
    {id: 2, name: 'Differential', state: 'active', path: '.github/workflows/differential.yml'},
    {id: 3, name: 'Verify', state: 'disabled_manually', path: '.github/workflows/verify.yml'},
    {id: 4, name: 'Mutation testing (TypeScript engine logic)', state: 'active', path: '.github/workflows/mutation-ts.yml'},
    {id: 6, name: 'Verification dashboard', state: 'active', path: '.github/workflows/verification-dashboard.yml'},
    {id: 7, name: 'Runner pools', state: 'active', path: '.github/workflows/runner-pools.yml'},
    {id: 8, name: 'Performance', state: 'active', path: '.github/workflows/performance.yml'},
  ];
  const runsByWorkflow = {
    1: [{id: 101, html_url: 'u1', conclusion: 'failure', updated_at: at(2)}],
    2: [{id: 102, html_url: 'u2', conclusion: 'success', updated_at: at(40)}],
    3: [{id: 103, html_url: 'u3', conclusion: 'success', updated_at: at(1)}],
    6: [{id: 106, html_url: 'u6', conclusion: 'success', updated_at: at(150)}],
    7: [{id: 107, html_url: 'u7', conclusion: 'failure', updated_at: at(20)}],
    8: [{id: 108, html_url: 'u8', conclusion: 'success', updated_at: at(10)}],
  };
  const h = harness({workflows, runsByWorkflow, label: true, env: {ALERT_MODE: 'stale'}});
  await h.run();
  const created = h.writes().filter((c) => c.name === 'create').map((c) => c.args);
  assert.deepEqual(created.map((i) => i.title).sort(), [
    'CI failure: Differential',
    'CI failure: Mutation testing (TypeScript engine logic)',
    'CI failure: Supply chain',
    'CI failure: Verify',
  ]);
  const body = (t) => created.find((i) => i.title === `CI failure: ${t}`).body;
  assert.match(body('Differential'), /not completed a scheduled run for 40 h .*window is 32 h/);
  assert.match(body('Verify'), /state `disabled_manually`/);
  assert.match(body('Mutation testing (TypeScript engine logic)'), /never completed a scheduled run/);
  assert.match(body('Supply chain'), /no workflow named \*\*Supply chain\*\* exists/);
  const scheduled = h.calls.filter((c) => c.name === 'listWorkflowRuns').map((c) => c.args);
  assert.ok(scheduled.every((a) => a.event === 'schedule' && a.status === 'completed'));
});

test('a run id is required outside the staleness check', async () => {
  const h = harness({env: {ALERT_RUN_ID: ''}});
  await assert.rejects(h.run(), /ALERT_RUN_ID is not set/);
});

test('every watched workflow exists and triggers the alert', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '../../.github/workflows');
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').match(/^name: (.+)$/m)?.[1]);
  const yml = fs.readFileSync(path.join(dir, 'verification-alert.yml'), 'utf8');
  const triggers = yml.split('    workflows:\n')[1].split('    types:')[0].match(/(?<=- ).+/g);
  assert.deepEqual([...triggers].sort(), Object.keys(alert.WATCHED).sort());
  for (const name of triggers) assert.ok(names.includes(name), name);
});

test('alert runs for one workflow are serialized and never cancelled', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const yml = fs.readFileSync(path.join(__dirname, '../../.github/workflows/verification-alert.yml'), 'utf8');
  const block = yml.split('\nconcurrency:\n')[1]?.split('\n\n')[0] || '';
  assert.match(block, /^  group: verification-alert-\$\{\{ github\.event\.workflow_run\.name \|\| github\.event_name \}\}$/m);
  assert.match(block, /^  cancel-in-progress: false$/m);
});
