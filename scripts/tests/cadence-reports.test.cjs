const assert = require('node:assert/strict');
const {test} = require('node:test');
const {upsertIssue, triage, flakyReport} = require('../../.github/scripts/cadence-reports.cjs');

const OWNERS = ['unbalancedparentheses', 'Batuis'];
const NOW = Date.parse('2026-11-05T06:00:00Z');

function harness({issuesByLabel = {}, runs = [], jobsByRun = {}, comments = []} = {}) {
  const calls = [];
  const rec = (name, fn) => async (args) => {
    calls.push({name, args});
    return fn ? fn(args) : {data: {}};
  };
  const github = {
    rest: {
      issues: {
        listForRepo: rec('listForRepo', (a) => ({data: issuesByLabel[a.labels] || []})),
        listCommentsForRepo: rec('listCommentsForRepo', () => ({data: comments})),
        createLabel: rec('createLabel'),
        create: rec('create', (a) => ({data: {...a, number: 900}})),
        createComment: rec('createComment'),
        update: rec('update'),
        addAssignees: rec('addAssignees'),
      },
      actions: {
        listWorkflowRuns: rec('listWorkflowRuns', () => ({data: runs})),
        listJobsForWorkflowRun: rec('listJobsForWorkflowRun', (a) => ({data: jobsByRun[a.run_id] || []})),
      },
    },
    paginate: async (method, args) => (await method(args)).data,
  };
  const logs = [];
  const core = {info: (m) => logs.push(m), warning: (m) => logs.push(m)};
  const context = {repo: {owner: 'o', repo: 'r'}};
  return {github, core, context, calls, logs, writes: () => calls.filter((c) => !c.name.startsWith('list'))};
}

test('a new report issue is opened with both decision owners assigned', async () => {
  const h = harness();
  const n = await upsertIssue({...h, title: 'Monthly dependency audit', label: 'deps-audit', body: 'x'});
  assert.equal(n, 900);
  const create = h.calls.find((c) => c.name === 'create');
  assert.deepEqual(create.args.assignees, OWNERS);
  assert.deepEqual(create.args.labels, ['deps-audit']);
});

test('an open report issue is updated in place and gets any missing owner', async () => {
  const h = harness({issuesByLabel: {'flaky-report': [{number: 7, title: 'Weekly flaky-test report', assignees: [{login: 'Batuis'}]}]}});
  await upsertIssue({...h, title: 'Weekly flaky-test report', label: 'flaky-report', body: 'new', mode: 'replace'});
  assert.deepEqual(h.writes().map((c) => c.name), ['update', 'addAssignees']);
  assert.equal(h.writes()[0].args.body, 'new');
  assert.deepEqual(h.writes()[1].args.assignees, ['unbalancedparentheses']);
});

test('triage assigns the owners to every open candidate and reports only the new ones', async () => {
  const h = harness({issuesByLabel: {'wrong-result-candidate': [
    {number: 11, title: 'Nightly finding: metamorphic/wrong-result-candidate: a', created_at: '2026-11-05T01:00:00Z', assignees: []},
    {number: 5, title: 'Nightly finding: opensees/wrong-result-candidate: b', created_at: '2026-10-20T01:00:00Z', assignees: OWNERS.map((login) => ({login}))},
    {number: 6, title: 'PR', created_at: '2026-11-05T01:00:00Z', pull_request: {}},
  ]}});
  const r = await triage({...h, now: NOW});
  assert.deepEqual(r, {fresh: 1, open: 2, issue: 900});
  const assigned = h.calls.filter((c) => c.name === 'addAssignees');
  assert.deepEqual(assigned.map((c) => [c.args.issue_number, c.args.assignees]), [[11, OWNERS]]);
  const create = h.calls.find((c) => c.name === 'create');
  assert.equal(create.args.title, 'Daily triage report');
  assert.deepEqual(create.args.assignees, OWNERS);
  assert.match(create.args.body, /- \[ \] #11 /);
  assert.doesNotMatch(create.args.body, /#5 /);
});

test('a candidate that recurred overnight is reported again', async () => {
  const h = harness({
    issuesByLabel: {'wrong-result-candidate': [
      {number: 5, title: 'Nightly finding: opensees/wrong-result-candidate: b', created_at: '2026-10-20T01:00:00Z', assignees: OWNERS.map((login) => ({login}))},
      {number: 8, title: 'Nightly finding: fuzz/wrong-result-candidate: c', created_at: '2026-10-21T01:00:00Z', assignees: OWNERS.map((login) => ({login}))},
    ]},
    comments: [
      {issue_url: 'https://api.github.com/repos/o/r/issues/5', created_at: '2026-11-05T02:00:00Z', user: {type: 'Bot'}},
      {issue_url: 'https://api.github.com/repos/o/r/issues/8', created_at: '2026-11-05T02:00:00Z', user: {type: 'User'}},
    ],
  });
  const r = await triage({...h, now: NOW});
  assert.deepEqual(r, {fresh: 1, open: 2, issue: 900});
  const create = h.calls.find((c) => c.name === 'create');
  assert.match(create.args.body, /- \[ \] #5 /);
  assert.doesNotMatch(create.args.body, /#8 /);
});

test('a quiet day opens no triage issue', async () => {
  const h = harness();
  const r = await triage({...h, now: NOW});
  assert.deepEqual(r, {fresh: 0, open: 0, issue: null});
  assert.deepEqual(h.writes(), []);
});

test('a job that failed and passed on one commit is reported flaky; a real failure is not', async () => {
  const h = harness({
    runs: [
      {id: 1, head_sha: 'a', run_attempt: 2, conclusion: 'success'},
      {id: 2, head_sha: 'b', run_attempt: 1, conclusion: 'failure'},
      {id: 3, head_sha: 'c', run_attempt: 1, conclusion: 'failure'},
      {id: 4, head_sha: 'c', run_attempt: 1, conclusion: 'success'},
      {id: 5, head_sha: 'd', run_attempt: 1, conclusion: 'failure'},
      {id: 6, head_sha: 'd', run_attempt: 1, conclusion: 'failure'},
    ],
    jobsByRun: {
      1: [{name: 'E2E (3/14)', conclusion: 'failure', html_url: 'u1'}, {name: 'E2E (3/14)', conclusion: 'success'}, {name: 'WASM', conclusion: 'success'}],
      2: [{name: 'Engine Suite (1/4)', conclusion: 'failure', html_url: 'u2'}],
      3: [{name: 'E2E (3/14)', conclusion: 'failure', html_url: 'u3'}, {name: 'Lint Engine', conclusion: 'failure', html_url: 'u4'}],
      4: [{name: 'E2E (3/14)', conclusion: 'success'}, {name: 'Lint Engine', conclusion: 'cancelled'}],
      5: [{name: 'Web Unit (2/4)', conclusion: 'failure', html_url: 'u5'}, {name: 'Engine Gates', conclusion: 'success'}],
      6: [{name: 'Web Unit (2/4)', conclusion: 'success'}, {name: 'Engine Gates', conclusion: 'failure', html_url: 'u6'}],
    },
  });
  const r = await flakyReport({...h, now: NOW});
  assert.deepEqual(r.flaky, [{name: 'E2E (3/14)', commits: 2}, {name: 'Engine Gates', commits: 1}, {name: 'Web Unit (2/4)', commits: 1}]);
  assert.ok(!h.calls.some((c) => c.name === 'listJobsForWorkflowRun' && c.args.run_id === 2));
  const create = h.calls.find((c) => c.name === 'create');
  assert.equal(create.args.title, 'Weekly flaky-test report');
  assert.deepEqual(create.args.assignees, OWNERS);
  assert.match(create.args.body, /\| E2E \(3\/14\) \| 2 \| \[1\]\(u1\) \[2\]\(u3\) \|/);
});
