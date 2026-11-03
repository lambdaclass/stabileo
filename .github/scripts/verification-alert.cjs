const LABEL = 'ci-failure';
const BAD = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure']);
const FORCED = '[forced failure]';
const TRIAGED = 'triaged';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const HELD = 'Green again, but this issue is not triaged yet';
const TRIAGE_NOTE = /(^|[\s(])#\d+\b|\/(issues|pull)\/\d+|\bno findings?\b/i;

// Hours since the last completed scheduled run: cron interval plus the longest run plus slack.
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
    try {
      await github.rest.issues.createLabel({
        owner, repo, name: LABEL, color: 'b60205',
        description: 'A scheduled verification or production check is failing (opened and closed by CI)',
      });
    } catch (err) {
      if (err.status !== 422) throw err;
      await github.rest.issues.getLabel({ owner, repo, name: LABEL });
    }
  }
}

async function listOpen(github, owner, repo, issueTitle) {
  const open = await github.paginate(github.rest.issues.listForRepo, {
    owner, repo, labels: LABEL, state: 'open', per_page: 100,
  });
  return open.filter((i) => i.title === issueTitle && !i.pull_request).sort((a, b) => a.number - b.number);
}

async function findOpen(github, owner, repo, issueTitle) {
  return (await listOpen(github, owner, repo, issueTitle))[0];
}

async function closeDuplicates({ github, core, owner, repo }, issueTitle, body, created) {
  const [keep, ...dups] = await listOpen(github, owner, repo, issueTitle);
  if (!keep) return created;
  for (const d of dups) {
    await github.rest.issues.createComment({ owner, repo, issue_number: keep.number, body });
    await github.rest.issues.createComment({ owner, repo, issue_number: d.number, body: `Duplicate of #${keep.number} (two alerts raced).` });
    await github.rest.issues.update({ owner, repo, issue_number: d.number, state: 'closed', state_reason: 'not_planned' });
    core.warning(`${issueTitle}: closed duplicate #${d.number} in favour of #${keep.number}`);
  }
  return keep.number;
}

async function raise(ctx, issueTitle, body) {
  const { github, core, owner, repo, dryRun } = ctx;
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
      'are added as comments. Triage each real finding (mismatch, crash, missed mutant, failing ' +
      'proof) into its own issue and link it in a comment here (or comment "no finding" and why), or add the ' +
      `\`${TRIAGED}\` label; after that the next green scheduled run closes this issue.`,
  });
  core.warning(`${issueTitle}: opened #${created.data.number}`);
  return closeDuplicates(ctx, issueTitle, body, created.data.number);
}

async function triage(github, owner, repo, issue) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: issue.number, per_page: 100,
  });
  const isBot = (c) => c.user && c.user.type === 'Bot';
  const reports = comments.filter((c) => isBot(c) && !(c.body || '').startsWith(HELD)).map((c) => c.created_at);
  const since = [issue.created_at, ...reports].filter(Boolean).sort().at(-1) || '';
  const after = (x) => (x.created_at || '') > since;
  const held = comments.some((c) => (c.body || '').startsWith(HELD) && after(c));
  if (comments.some((c) => !isBot(c) && TRUSTED.has(c.author_association) && after(c) && TRIAGE_NOTE.test(c.body || ''))) return { triaged: true, held };
  const events = await github.paginate(github.rest.issues.listEventsForTimeline, {
    owner, repo, issue_number: issue.number, per_page: 100,
  });
  const triaged = events.some((e) => after(e) && e.event === 'labeled' && e.label && e.label.name === TRIAGED);
  return { triaged, held };
}

async function resolve({ github, core, owner, repo, dryRun }, issueTitle, body) {
  const existing = await findOpen(github, owner, repo, issueTitle);
  if (!existing) {
    core.info(`${issueTitle}: no open issue, nothing to close`);
    return;
  }
  const t = await triage(github, owner, repo, existing);
  if (!t.triaged) {
    if (t.held) {
      core.info(`${issueTitle}: #${existing.number} is green but untriaged (already said so)`);
    } else if (dryRun) {
      core.info(`[dry run] keep #${existing.number} open, untriaged`);
    } else {
      await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body:
        `${HELD}: ${body.replace(/^Green again: /, '').replace(/ Closing\.$/, '')} The failures above may be real findings that ` +
        'a later green run does not fix (seeds and shards rotate). Link the finding issues in a comment here, ' +
        `say why there are none, or add the \`${TRIAGED}\` label; the next green scheduled run then closes this.` });
      core.warning(`${issueTitle}: #${existing.number} green but untriaged, left open`);
    }
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
    const { data: latest } = await github.rest.actions.listWorkflowRuns({
      owner, repo, workflow_id: run.workflow_id, event: 'schedule', status: 'completed',
      branch: ctx.defaultBranch, per_page: 1,
    });
    const newest = latest.workflow_runs[0];
    if (!forced && newest && newest.id !== run.id) {
      core.info(`${workflow} run ${runId} is green but not the latest scheduled run (${newest.id}, ${newest.conclusion}): not closing`);
      return;
    }
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

async function checkStale(ctx) {
  const { github, core, owner, repo } = ctx;
  const workflows = await github.paginate(github.rest.actions.listRepoWorkflows, { owner, repo, per_page: 100 });
  const now = Date.now();
  for (const [name, hours] of Object.entries(WATCHED)) {
    const wf = workflows.find((w) => w.name === name);
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
module.exports.WATCHED = WATCHED;
