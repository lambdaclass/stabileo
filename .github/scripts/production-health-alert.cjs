// Issues for the production health check (.github/workflows/production-health.yml).
//
// Reads the JSON lines scripts/production-health.mjs wrote ($HEALTH_RESULTS), one per site.
// A failing site opens ONE issue, "Production health check failing: <site>", labelled
// `ci-failure` and `production`, or updates the open one; a passing site closes it. The check
// runs hourly, so an open issue gets its body refreshed every time and a comment at most once a
// day (or when what fails changes): a new issue is the notification, not an hourly comment.

const fs = require('node:fs');

const LABELS = {
  'ci-failure': { color: 'b60205', description: 'A scheduled verification or production check is failing (opened and closed by CI)' },
  production: { color: 'd93f0b', description: 'stabileo.com or staging.stabileo.com is down or serving a broken build' },
};
const COMMENT_EVERY_MS = 24 * 3600 * 1000;

const title = (site) => `Production health check failing: ${site}`;

async function ensureLabels(github, owner, repo) {
  for (const [name, spec] of Object.entries(LABELS)) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name });
    } catch (e) {
      if (e.status !== 404) throw e;
      await github.rest.issues.createLabel({ owner, repo, name, ...spec });
    }
  }
}

function summary(report) {
  return report.checks.map((c) =>
    `- ${c.ok ? 'ok' : '**FAIL**'} ${c.name}${c.detail.length ? `\n${c.detail.map((d) => `  - ${d.replace(/\n/g, ' ')}`).join('\n')}` : ''}`,
  ).join('\n');
}

const failingSet = (report) => report.checks.filter((c) => !c.ok).map((c) => c.name).sort().join(', ');

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const dryRun = process.env.HEALTH_DRY_RUN === 'true';
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const lines = fs.existsSync(process.env.HEALTH_RESULTS)
    ? fs.readFileSync(process.env.HEALTH_RESULTS, 'utf8').split('\n').filter(Boolean) : [];
  const expected = (process.env.HEALTH_SITES || '').split(/\s+/).filter(Boolean);
  const reports = lines.map((l) => JSON.parse(l));
  // A site the script never reported on (it crashed first) is a failure too.
  for (const site of expected) {
    if (!reports.some((r) => r.site === site.replace(/\/+$/, ''))) {
      reports.push({ site: site.replace(/\/+$/, ''), ok: false, checks: [{ name: 'health check script', ok: false, detail: ['did not report on this site (crashed?): see the run log'] }] });
    }
  }

  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: 'production', state: 'open', per_page: 100,
  });
  if (!dryRun && reports.some((r) => !r.ok)) await ensureLabels(github, owner, repo);

  for (const report of reports) {
    const t = title(report.site);
    const existing = open.find((i) => i.title === t && !i.pull_request);
    const now = new Date().toISOString();
    if (report.ok) {
      if (!existing) continue;
      const body = `Healthy again in run ${runUrl} (${now}):\n\n${summary(report)}\n\nClosing.`;
      if (dryRun) { core.info(`[dry run] close #${existing.number}\n${body}`); continue; }
      await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body });
      await github.rest.issues.update({ owner, repo, issue_number: existing.number, state: 'closed', state_reason: 'completed' });
      core.notice(`${t}: closed #${existing.number}`);
      continue;
    }

    const failing = failingSet(report);
    const body = [
      `**${report.site}** fails its health check (\`scripts/production-health.mjs\`, ` +
        '`.github/workflows/production-health.yml`).',
      '',
      `Latest failing run: ${runUrl} (${now}, ${context.eventName}). Failing: ${failing}.`,
      '',
      summary(report),
      '',
      `<!-- failing: ${failing} -->`,
      '---',
      'Opened by CI. The body is refreshed on every failing run (hourly and after each deploy); ' +
        'a comment is added when what fails changes, or once a day. Closed automatically when the ' +
        'site passes again. Rollback: `.github/workflows/rollback.yml`.',
    ].join('\n');

    if (dryRun) { core.info(`[dry run] ${existing ? `update #${existing.number}` : 'open issue'}: ${t}\n${body}`); continue; }
    if (!existing) {
      const created = await github.rest.issues.create({ owner, repo, title: t, labels: Object.keys(LABELS), body });
      core.warning(`${t}: opened #${created.data.number}`);
      continue;
    }
    const before = (existing.body || '').match(/<!-- failing: (.*) -->/)?.[1];
    await github.rest.issues.update({ owner, repo, issue_number: existing.number, body });
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: existing.number, per_page: 100 });
    const last = comments.length ? Date.parse(comments[comments.length - 1].created_at) : Date.parse(existing.created_at);
    if (before !== failing || Date.now() - last > COMMENT_EVERY_MS) {
      await github.rest.issues.createComment({ owner, repo, issue_number: existing.number,
        body: `Still failing in ${runUrl} (${now}). Failing: ${failing}.\n\n${summary(report)}` });
    }
    core.warning(`${t}: updated #${existing.number}`);
  }
};
