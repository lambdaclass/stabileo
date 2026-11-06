const assert = require('node:assert/strict');
const {test} = require('node:test');
const alert = require('../../.github/scripts/timing-budget-alert.cjs');

function fake({open = [], mainSha = 'abc123456789'} = {}) {
  const calls = [];
  const github = {
    paginate: async () => open,
    rest: {
      issues: {
        listForRepo: () => {},
        create: async (a) => { calls.push(['create', a]); return {data: {number: 900}}; },
        createComment: async (a) => { calls.push(['comment', a]); },
        update: async (a) => { calls.push(['update', a]); },
      },
      git: {getRef: async () => ({data: {object: {sha: mainSha}}})},
    },
  };
  const core = {info: () => {}, warning: () => {}};
  const context = {repo: {owner: 'o', repo: 'r'}, serverUrl: 'https://github.com', runId: 7, sha: 'abc123456789', eventName: 'push'};
  return {github, core, context, calls};
}

async function run(env, f) {
  const saved = {SCALE_OUTCOME: process.env.SCALE_OUTCOME, E2E_OUTCOME: process.env.E2E_OUTCOME};
  Object.assign(process.env, env);
  try { await alert(f); } finally { Object.assign(process.env, saved); for (const k of Object.keys(saved)) if (saved[k] === undefined) delete process.env[k]; }
  return f.calls;
}

const issue = {number: 41, title: alert.TITLE};

test('any failed budget is red, both passed is green, anything else is unknown', () => {
  assert.equal(alert.verdict(['success', 'failure']), 'red');
  assert.equal(alert.verdict(['failure', 'skipped']), 'red');
  assert.equal(alert.verdict(['success', 'success']), 'green');
  assert.equal(alert.verdict(['success', 'skipped']), 'unknown');
  assert.equal(alert.verdict(['', '']), 'unknown');
});

test('a red on main opens the issue, assigned and labelled, naming the failed budget', async () => {
  const calls = await run({SCALE_OUTCOME: 'success', E2E_OUTCOME: 'failure'}, fake());
  assert.equal(calls.length, 1);
  const [kind, args] = calls[0];
  assert.equal(kind, 'create');
  assert.equal(args.title, alert.TITLE);
  assert.deepEqual(args.labels, [alert.LABEL]);
  assert.deepEqual(args.assignees, ['unbalancedparentheses', 'Batuis']);
  assert.match(args.body, /E2E wall-clock budgets: failure/);
  assert.match(args.body, /actions\/runs\/7/);
});

test('a red with the issue open comments on it instead of opening another', async () => {
  const calls = await run({SCALE_OUTCOME: 'failure', E2E_OUTCOME: 'success'}, fake({open: [issue]}));
  assert.deepEqual(calls.map(([k, a]) => [k, a.issue_number]), [['comment', 41]]);
});

test('a green of main\'s head closes the open issue; a green of an older commit does not', async () => {
  const closed = await run({SCALE_OUTCOME: 'success', E2E_OUTCOME: 'success'}, fake({open: [issue]}));
  assert.deepEqual(closed.map(([k, a]) => [k, a.issue_number, a.state]), [['comment', 41, undefined], ['update', 41, 'closed']]);
  const stale = await run({SCALE_OUTCOME: 'success', E2E_OUTCOME: 'success'}, fake({open: [issue], mainSha: 'fff'}));
  assert.deepEqual(stale, []);
});

test('a red of an older commit, rerun after main moved on, touches nothing', async () => {
  assert.deepEqual(await run({SCALE_OUTCOME: 'failure', E2E_OUTCOME: 'success'}, fake({mainSha: 'fff'})), []);
  assert.deepEqual(await run({SCALE_OUTCOME: 'failure', E2E_OUTCOME: 'success'}, fake({open: [issue], mainSha: 'fff'})), []);
});

test('an unknown outcome touches nothing', async () => {
  assert.deepEqual(await run({SCALE_OUTCOME: 'success', E2E_OUTCOME: 'skipped'}, fake({open: [issue]})), []);
});
