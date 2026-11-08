const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const check = require('../../.github/scripts/runner-pools.cjs');

const ON = {STABILEO_SELF_HOSTED: 'true', STABILEO_PR_POOL: 'true', STABILEO_E2E_POOL: 'true'};

const runner = (name, labels, status = 'online') => ({name, status, labels: labels.map((l) => ({name: l}))});

const LIVE = [
  ...[1, 2, 3, 4, 5, 6].map((n) => runner(`sgha${n}`, ['self-hosted', 'stabileo', 'stabileo-e2e'])),
  ...[7, 8].map((n) => runner(`sgha${n}`, ['self-hosted', 'stabileo', 'stabileo-pr', 'stabileo-heavy'])),
  ...[9, 10].map((n) => runner(`sgha${n}`, ['self-hosted', 'stabileo', 'stabileo-timing', 'stabileo-pr'])),
  ...[11, 12, 13, 14].map((n) => runner(`sgha${n}`, ['self-hosted', 'stabileo', 'stabileo-pr', 'stabileo-engine'])),
  ...[1, 2, 3].map((n) => runner(`concrete-ci-3-sgha${n}`, ['self-hosted', 'stabileo', 'stabileo-engine'])),
  ...[4, 5, 6, 7].map((n) => runner(`concrete-ci-3-sgha${n}`, ['self-hosted', 'stabileo-nightly'])),
];

function harness({variables = ON, runners = LIVE, token = true} = {}) {
  const errors = [];
  const failed = [];
  const listed = [];
  const env = {...variables, HAS_RUNNER_TOKEN: token ? 'true' : 'false'};
  const saved = {};
  for (const k of [...check.VARIABLES, 'HAS_RUNNER_TOKEN']) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const github = {
    rest: {actions: {listSelfHostedRunnersForRepo: 'listRunners'}},
    paginate: async (fn, args) => {
      listed.push({fn, args});
      return runners;
    },
  };
  const core = {info() {}, error: (m) => errors.push(m), setFailed: (m) => failed.push(m)};
  const run = async () => {
    try {
      await check({github, context: {repo: {owner: 'lambdaclass', repo: 'stabileo'}}, core});
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    return {errors, failed, listed};
  };
  return run;
}

test('the live layout passes', async () => {
  const {errors, failed, listed} = await harness()();
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(listed, [{fn: 'listRunners', args: {owner: 'lambdaclass', repo: 'stabileo', per_page: 100}}]);
});

test('each pool variable that is not "true" is named', async () => {
  for (const name of check.VARIABLES) {
    for (const value of [undefined, 'false', 'TRUE']) {
      const variables = {...ON, [name]: value};
      if (value === undefined) delete variables[name];
      const {errors, failed} = await harness({variables})();
      assert.deepEqual(errors, [`repository variable ${name} is ${JSON.stringify(value ?? '')}, not "true"`]);
      assert.equal(failed.length, 1);
    }
  }
});

test('too few online runners for a label fails and names the ones left', async () => {
  const runners = LIVE.map((r) => (['sgha7', 'sgha8', 'sgha9', 'sgha10', 'sgha11', 'sgha12', 'sgha13'].includes(r.name)
    ? {...r, status: 'offline'} : r));
  const {errors, failed} = await harness({runners})();
  assert.deepEqual(errors, [
    '1 online runners carry stabileo-pr, fewer than 4: sgha14',
    '4 online runners carry stabileo-engine, fewer than 6: sgha14, concrete-ci-3-sgha1, concrete-ci-3-sgha2, concrete-ci-3-sgha3',
    '0 online runners carry stabileo-heavy, fewer than 2: none',
  ]);
  assert.match(failed[0], /^Runner pools drifted \(3\): 1 online runners carry stabileo-pr/);
});

test('the engine pool of concrete-ci-3 alone, as on the night of 2026-11-08, fails', async () => {
  const runners = LIVE.map((r) => (/^sgha1[1-4]$/.test(r.name)
    ? runner(r.name, ['self-hosted', 'stabileo', 'stabileo-pr']) : r));
  const {errors} = await harness({runners})();
  assert.deepEqual(errors, ['3 online runners carry stabileo-engine, fewer than 6: concrete-ci-3-sgha1, concrete-ci-3-sgha2, concrete-ci-3-sgha3']);
});

test('heavy dispatches lose their runners when sgha7-8 are re-registered without stabileo-heavy', async () => {
  const runners = LIVE.map((r) => (r.name === 'sgha7' ? runner(r.name, ['self-hosted', 'stabileo', 'stabileo-pr']) : r));
  const {errors} = await harness({runners})();
  assert.deepEqual(errors, ['1 online runners carry stabileo-heavy, fewer than 2: sgha8']);
});

test('a label lost on re-registration is caught', async () => {
  const runners = LIVE.map((r) => (r.name === 'sgha3' || r.name === 'sgha4' || r.name === 'sgha5'
    ? runner(r.name, ['self-hosted', 'stabileo']) : r));
  const {errors} = await harness({runners})();
  assert.deepEqual(errors, ['3 online runners carry stabileo-e2e, fewer than 4: sgha1, sgha2, sgha6']);
});

test('the exact minimum passes and one fewer fails, for every pool', async () => {
  for (const [label, minimum] of Object.entries(check.MINIMUM_ONLINE)) {
    const only = (n) => Array.from({length: n}, (_, i) => runner(`r${i}`, [label]));
    const others = Object.keys(check.MINIMUM_ONLINE).filter((l) => l !== label)
      .flatMap((l) => Array.from({length: check.MINIMUM_ONLINE[l]}, (_, i) => runner(`${l}${i}`, [l])));
    assert.deepEqual(check.problems({variables: ON, runners: [...only(minimum), ...others]}), [], label);
    assert.equal(check.problems({variables: ON, runners: [...only(minimum - 1), ...others]}).length, 1, label);
  }
});

test('no runners at all reports every pool', async () => {
  const {errors} = await harness({runners: []})();
  assert.deepEqual(errors, [
    '0 online runners carry stabileo, fewer than 6: none',
    '0 online runners carry stabileo-pr, fewer than 4: none',
    '0 online runners carry stabileo-e2e, fewer than 4: none',
    '0 online runners carry stabileo-engine, fewer than 6: none',
    '0 online runners carry stabileo-heavy, fewer than 2: none',
  ]);
});

test('without the token it fails, says which secret to add, and lists nothing', async () => {
  const {errors, failed, listed} = await harness({token: false})();
  assert.deepEqual(listed, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /RUNNER_POOL_TOKEN secret .*Administration: read/);
  assert.equal(failed.length, 1);
});

test('the workflow reads each variable, uses the token only when set, and is watched by the alert', () => {
  const root = path.join(__dirname, '../..');
  const yml = fs.readFileSync(path.join(root, '.github/workflows/runner-pools.yml'), 'utf8');
  assert.match(yml, /^name: Runner pools$/m);
  assert.match(yml, /^  schedule:\n    - cron: /m);
  assert.match(yml, /^  workflow_dispatch:$/m);
  for (const name of check.VARIABLES) assert.ok(yml.includes(`${name}: \${{ vars.${name} }}`), name);
  assert.ok(yml.includes("HAS_RUNNER_TOKEN: ${{ secrets.RUNNER_POOL_TOKEN != '' }}"));
  assert.ok(yml.includes('github-token: ${{ secrets.RUNNER_POOL_TOKEN || github.token }}'));
  const alert = require('../../.github/scripts/verification-alert.cjs');
  assert.ok('Runner pools' in alert.WATCHED);
});
