const VARIABLES = ['STABILEO_SELF_HOSTED', 'STABILEO_PR_POOL', 'STABILEO_E2E_POOL'];
const MINIMUM_ONLINE = { stabileo: 6, 'stabileo-pr': 4, 'stabileo-e2e': 4, 'stabileo-engine': 6, 'stabileo-heavy': 2 };

function problems({ variables, runners }) {
  const out = VARIABLES.filter((name) => variables[name] !== 'true')
    .map((name) => `repository variable ${name} is ${JSON.stringify(variables[name] ?? '')}, not "true"`);
  if (!runners) {
    out.push('cannot list self-hosted runners: add the RUNNER_POOL_TOKEN secret (fine-grained, lambdaclass/stabileo only, Administration: read)');
    return out;
  }
  for (const [label, minimum] of Object.entries(MINIMUM_ONLINE)) {
    const online = runners.filter((r) => r.status === 'online' && r.labels.some((l) => l.name === label));
    if (online.length < minimum) {
      out.push(`${online.length} online runners carry ${label}, fewer than ${minimum}: ${online.map((r) => r.name).join(', ') || 'none'}`);
    }
  }
  return out;
}

module.exports = async ({ github, context, core }) => {
  const variables = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
  const runners = process.env.HAS_RUNNER_TOKEN === 'true'
    ? await github.paginate(github.rest.actions.listSelfHostedRunnersForRepo, { ...context.repo, per_page: 100 })
    : null;
  if (runners) core.info(runners.map((r) => `${r.name} ${r.status} ${r.labels.map((l) => l.name).join(',')}`).join('\n'));
  const found = problems({ variables, runners });
  for (const p of found) core.error(p);
  if (found.length) core.setFailed(`Runner pools drifted (${found.length}): ${found.join('; ')}`);
};
module.exports.problems = problems;
module.exports.MINIMUM_ONLINE = MINIMUM_ONLINE;
module.exports.VARIABLES = VARIABLES;
