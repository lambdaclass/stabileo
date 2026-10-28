// Failure alerting for the scheduled verification workflows (nightly.yml,
// differential.yml, verify.yml, verification-dashboard.yml, mutation-ts.yml,
// supply-chain.yml).
//
// Run by .github/workflows/verification-alert.yml through actions/github-script:
//
// - after each run of those workflows (workflow_run): a failed scheduled run
//   opens ONE issue per workflow, labelled `ci-failure`, or comments on the one
//   already open, with the run link and the failing jobs; a green scheduled
//   run closes it. A new issue (not a comment on an old one) is what notifies
//   the repository's watchers, so the issue is closed as soon as the workflow
//   is green again and the next failure opens a fresh one.
// - once a day (schedule): a workflow whose last scheduled run is older than
//   its window, or that never completed one, counts as failed: a job that
//   silently stops running protects nothing.
//
// What the failure *is* (a differential mismatch, a fuzz crash, a missed
// mutant) is triaged into its own issue (labels `bug`, plus `safety` when a
// result could be wrong) and linked from the `ci-failure` issue; this script
// only says that the workflow is red and where to look.
//
// Negative case: nightly.yml and differential.yml take a `force_failure`
// dispatch input that fails the run at once and names it "[forced failure]
// ...". Such a run alerts like a scheduled one, under its own issue title
// so that the test never lands on (or closes) the real issue.

const LABEL = 'ci-failure';
const BAD = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure']);
const FORCED = '[forced failure]';

// Scheduled workflows watched for staleness: hours since the last completed
// scheduled run before it counts as not running (cron interval plus the
// longest run plus slack).
const WATCHED = {
  'Nightly verification': 32,
  Differential: 32,
  Verify: 32,
  'Mutation testing (TypeScript engine logic)': 32,
  'Supply chain': 32,
  'Verification dashboard': 8 * 24 + 8,
};

const title = (workflow, forced) => `CI failure: ${workflow}${forced ? ` ${FORCED}` : ''}`;

async function ensureLabel(github, owner, repo) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: LABEL });
  } catch (e) {
    if (e.status !== 404) throw e;
    await github.rest.issues.createLabel({
      owner, repo, name: LABEL, color: 'b60205',
      description: 'A scheduled verification or production check is failing (opened and closed by CI)',
    });
  }
}

async function findOpen(github, owner, repo, issueTitle) {
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: LABEL, state: 'open', per_page: 100,
  });
  return open.find((i) => i.title === issueTitle && !i.pull_request);
}

// Open the issue or comment on the open one. Returns the issue number.
async function raise({ github, core, owner, repo, dryRun }, issueTitle, body) {
  const existing = await findOpen(github, owner, repo, issueTitle);
  if (dryRun) {
    core.info(`[dry run] ${existing ? `comment on #${existing.number}` : 'open issue'}: ${issueTitle}\n${body}`);
    return existing?.number;
  }
  if (existing) {
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body });
    core.warning(`${issueTitle}: commented on #${existing.number}`);
    return existing.number;
  }
  await ensureLabel(github, owner, repo);
  const created = await github.rest.issues.create({
    owner, repo, title: issueTitle, labels: [LABEL],
    body: `${body}\n\n---\nOpened by \`.github/workflows/verification-alert.yml\`. Later failures ` +
      'are added as comments; the issue is closed automatically when a scheduled run is green ' +
      'again. Triage each real finding (mismatch, crash, missed mutant, failing proof) into its ' +
      'own issue and link it here.',
  });
  core.warning(`${issueTitle}: opened #${created.data.number}`);
  return created.data.number;
}

async function resolve({ github, core, owner, repo, dryRun }, issueTitle, body) {
  const existing = await findOpen(github, owner, repo, issueTitle);
  if (!existing) {
    core.info(`${issueTitle}: no open issue, nothing to close`);
    return;
  }
  if (dryRun) {
    core.info(`[dry run] close #${existing.number}: ${body}`);
    return;
  }
  await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body });
  await github.rest.issues.update({
    owner, repo, issue_number: existing.number, state: 'closed', state_reason: 'completed',
  });
  core.notice(`${issueTitle}: closed #${existing.number}`);
}

async function alertRun(ctx, runId, anyEvent) {
  const { github, core, owner, repo } = ctx;
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId });
  // run.name is the run's display name (run-name), not the workflow's.
  const { data: wf } = await github.rest.actions.getWorkflow({ owner, repo, workflow_id: run.workflow_id });
  const workflow = wf.name;
  const forced = (run.display_title || '').startsWith(FORCED);
  if (run.event !== 'schedule' && !forced && !anyEvent) {
    core.info(`${workflow} run ${runId} was triggered by ${run.event}, not schedule: no alert`);
    return;
  }
  if (run.event === 'schedule' && run.head_branch !== ctx.defaultBranch) {
    core.info(`${workflow} run ${runId} is on ${run.head_branch}: no alert`);
    return;
  }
  const issueTitle = title(workflow, forced);
  const link = `[${runId}](${run.html_url})`;

  if (run.conclusion === 'success') {
    await resolve(ctx, issueTitle, `Green again: run ${link} on \`${run.head_branch}\` @ ` +
      `${run.head_sha.slice(0, 10)} succeeded. Closing.`);
    return;
  }
  if (!BAD.has(run.conclusion)) {
    core.info(`${workflow} run ${runId} concluded ${run.conclusion}: no alert`);
    return;
  }

  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner, repo, run_id: runId, filter: 'latest', per_page: 100,
  });
  const lines = [];
  for (const job of jobs) {
    if (job.status !== 'completed' || !BAD.has(job.conclusion)) continue;
    const step = (job.steps || []).find((s) => BAD.has(s.conclusion));
    lines.push(`- [${job.name}](${job.html_url}): **${job.conclusion}**` +
      (step ? ` in step \`${step.name}\`` : ' (no failing step: setup, runner loss or job timeout)'));
  }
  if (lines.length === 0) {
    lines.push('- no job failed: the workflow did not start (invalid workflow file, ' +
      'startup failure) or was cancelled before its jobs ran');
  }
  const body = [
    `Run ${link} of **${workflow}** on \`${run.head_branch}\` @ ${run.head_sha.slice(0, 10)} ` +
      `(${run.event}, ${run.created_at}) concluded **${run.conclusion}**:`,
    '',
    ...lines,
    '',
    'Logs and uploaded reports (mismatch dumps, crash inputs, mutants.out) are on the run page.',
  ].join('\n');
  await raise(ctx, issueTitle, body);
}

// A watched workflow without a completed scheduled run inside its window.
async function checkStale(ctx) {
  const { github, core, owner, repo } = ctx;
  const { data } = await github.rest.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
  const now = Date.now();
  for (const [name, hours] of Object.entries(WATCHED)) {
    const wf = data.workflows.find((w) => w.name === name);
    if (!wf) {
      await raise(ctx, title(name, false),
        `Staleness check: no workflow named **${name}** exists any more (renamed or deleted?). ` +
        'Update WATCHED in `.github/scripts/verification-alert.cjs` and the workflow_run list ' +
        'in `.github/workflows/verification-alert.yml`.');
      continue;
    }
    const { data: runs } = await github.rest.actions.listWorkflowRuns({
      owner, repo, workflow_id: wf.id, event: 'schedule', status: 'completed', per_page: 1,
    });
    const last = runs.workflow_runs[0];
    const age = last ? (now - Date.parse(last.updated_at)) / 3.6e6 : Infinity;
    if (wf.state !== 'active' || age > hours) {
      await raise(ctx, title(name, false),
        `Staleness check: **${name}** (\`${wf.path}\`, state \`${wf.state}\`) has ` +
        (last ? `not completed a scheduled run for ${age.toFixed(0)} h ` +
          `(last: [${last.id}](${last.html_url}), ${last.conclusion}, ${last.updated_at})`
          : 'never completed a scheduled run') +
        `; its window is ${hours} h. A job that silently stops running protects nothing.`);
    } else {
      core.info(`${name}: last scheduled run ${age.toFixed(1)} h ago (${last.conclusion}), window ${hours} h`);
    }
  }
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const ctx = {
    github, core, owner, repo,
    dryRun: process.env.ALERT_DRY_RUN === 'true',
    defaultBranch: context.payload.repository?.default_branch || 'main',
  };
  if (process.env.ALERT_MODE === 'stale') {
    await checkStale(ctx);
    return;
  }
  const runId = Number(process.env.ALERT_RUN_ID);
  if (!runId) throw new Error('ALERT_RUN_ID is not set');
  await alertRun(ctx, runId, process.env.ALERT_ANY_EVENT === 'true');
};
