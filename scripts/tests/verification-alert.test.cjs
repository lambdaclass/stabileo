const assert = require('node:assert/strict');
const {test} = require('node:test');
const alert = require('../../.github/scripts/verification-alert.cjs');

const HOUR = 3.6e6;

function harness({run: runOverrides = {}, jobs = [], open = [], workflows = [], runsByWorkflow = {}, label = false, env = {}, comments = [], timeline = []} = {}) {
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
    createLabel: record('createLabel', {data: {}}),
    listForRepo: record('listForRepo', {data: open}),
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
    listRepoWorkflows: record('listRepoWorkflows', {data: {workflows}}),
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

const human = {user: {login: 'someone', type: 'User'}, body: 'Triaged: #757, #758.'};
const bot = {user: {login: 'github-actions[bot]', type: 'Bot'}, body: 'Run 54 of Nightly verification ...'};

test('a green scheduled run closes a triaged issue', async () => {
  for (const triaged of [
    {comments: [bot, human]},
    {comments: [bot], timeline: [{event: 'commented'}, {event: 'cross-referenced'}]},
    {comments: [bot], open: [{number: 14, title: 'CI failure: Nightly verification', labels: [{name: 'ci-failure'}, {name: 'triaged'}]}]},
  ]) {
    const h = harness({run: {conclusion: 'success'}, open: [{number: 14, title: 'CI failure: Nightly verification'}], ...triaged});
    await h.run();
    const w = h.writes();
    assert.deepEqual(w.map((c) => c.name), ['createComment', 'update'], JSON.stringify(triaged));
    assert.match(w[0].args.body, /^Green again: run/);
    assert.deepEqual([w[1].args.issue_number, w[1].args.state, w[1].args.state_reason], [14, 'closed', 'completed']);
  }
});

test('a green scheduled run leaves an untriaged issue open and says so once', async () => {
  const h = harness({run: {conclusion: 'success'}, open: [{number: 14, title: 'CI failure: Nightly verification'}],
    comments: [bot], timeline: [{event: 'commented'}, {event: 'labeled'}]});
  await h.run();
  const w = h.writes();
  assert.deepEqual(w.map((c) => c.name), ['createComment']);
  assert.equal(w[0].args.issue_number, 14);
  assert.match(w[0].args.body, /^Green again, but this issue is not triaged yet: run \[55\]/);
  assert.doesNotMatch(w[0].args.body, /Closing\./);

  const again = harness({run: {conclusion: 'success'}, open: [{number: 14, title: 'CI failure: Nightly verification'}],
    comments: [bot, {user: bot.user, body: w[0].args.body}]});
  await again.run();
  assert.deepEqual(again.writes(), []);
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
  ];
  const runsByWorkflow = {
    1: [{id: 101, html_url: 'u1', conclusion: 'failure', updated_at: at(2)}],
    2: [{id: 102, html_url: 'u2', conclusion: 'success', updated_at: at(40)}],
    3: [{id: 103, html_url: 'u3', conclusion: 'success', updated_at: at(1)}],
    6: [{id: 106, html_url: 'u6', conclusion: 'success', updated_at: at(150)}],
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
