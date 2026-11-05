const fs = require('node:fs');
const path = require('node:path');
const ASSIGNEES = require('./issue-assignees.cjs');

const LABEL = 'ci-failure';
const TITLE = 'CI failure: @slow E2E on main';
const SCANNED_RUNS = 30;
const MAINLINE_LIMIT = 100;

function failingSpecs(report) {
  const failures = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (t.status === 'unexpected') failures.push(`${spec.file}:${spec.line} › ${spec.title}${t.projectName ? ` [${t.projectName}]` : ''}`);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return failures;
}

function readShards(dir, total) {
  const shards = [];
  for (let shard = 1; shard <= total; shard++) {
    const base = path.join(dir, `e2e-slow-${shard}`);
    const outcomeFile = path.join(base, 'outcome');
    if (!fs.existsSync(outcomeFile)) { shards.push({ shard, outcome: 'missing', failures: [] }); continue; }
    const outcome = fs.readFileSync(outcomeFile, 'utf8').trim();
    const reportFile = path.join(base, 'slow.json');
    let failures = [];
    if (fs.existsSync(reportFile)) {
      try { failures = failingSpecs(JSON.parse(fs.readFileSync(reportFile, 'utf8'))); } catch { failures = []; }
    }
    if (outcome === 'failure' && !failures.length) failures = [`shard ${shard}: the slow suite failed without a readable report`];
    shards.push({ shard, outcome, failures });
  }
  return shards;
}

function verdict(shards) {
  if (shards.some((s) => s.failures.length)) return 'red';
  if (shards.length && shards.every((s) => s.outcome === 'success')) return 'green';
  return 'unknown';
}

function mergedPrs(messages) {
  const numbers = [];
  for (const message of messages) {
    const first = message.split('\n', 1)[0];
    const match = first.match(/^Merge pull request #(\d+)\b/) ?? first.match(/\(#(\d+)\)\s*$/);
    if (match && !numbers.includes(Number(match[1]))) numbers.push(Number(match[1]));
  }
  return numbers;
}

async function mainlineMessages(github, owner, repo, base, head) {
  const messages = [];
  let sha = head;
  while (sha && sha !== base && messages.length < MAINLINE_LIMIT) {
    const { data } = await github.rest.repos.getCommit({ owner, repo, ref: sha });
    messages.push(data.commit.message);
    sha = data.parents[0]?.sha;
  }
  return { messages: messages.reverse(), complete: sha === base };
}

function issueBody({ shards, runUrl, sha, lastGreen, prs, complete = true }) {
  const failures = shards.flatMap((s) => s.failures.map((f) => `- ${f} (shard ${s.shard})`));
  const lines = [
    `The \`@slow\` E2E suite failed on main at ${sha.slice(0, 9)}: ${runUrl}`,
    '',
    'Failing specs:',
    ...failures,
  ];
  const unread = shards.filter((s) => s.outcome === 'missing' || s.outcome === 'skipped').map((s) => s.shard);
  if (unread.length) lines.push('', `No slow report from shard${unread.length > 1 ? 's' : ''} ${unread.join(', ')} (the suite did not run there, or its upload failed).`);
  lines.push('');
  if (!lastGreen) {
    lines.push(`No green \`@slow\` run among the last ${SCANNED_RUNS} main pushes, so the suspect PRs are unknown.`);
  } else {
    lines.push(`Last green \`@slow\` run: ${lastGreen.runUrl} (${lastGreen.sha.slice(0, 9)}).`);
    const listed = prs.map((n) => `#${n}`).join(', ');
    if (!complete) lines.push(`Candidate PRs, from the newest ${MAINLINE_LIMIT} mainline commits only (older ones not listed): ${listed || 'none'}`);
    else lines.push(prs.length ? `Candidate PRs merged since: ${listed}` : 'No PR merged since it.');
  }
  lines.push('', 'A red can also be infrastructure or a flaky test. The merge queue does not run `@slow` (#1519), so a regression shows up only here.');
  return lines.join('\n');
}

async function slowGreenRuns(github, owner, repo) {
  const { data } = await github.rest.actions.listWorkflowRuns({
    owner, repo, workflow_id: 'ci.yml', branch: 'main', event: 'push', status: 'completed', per_page: SCANNED_RUNS,
  });
  const green = [];
  for (const run of data.workflow_runs) {
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
      owner, repo, run_id: run.id, filter: 'latest', per_page: 100,
    });
    const e2e = jobs.filter((j) => /^E2E \(\d+\/\d+\)$/.test(j.name));
    const slowPassed = (j) => (j.steps ?? []).some((step) => step.name.startsWith('E2E slow suite') && step.conclusion === 'success');
    if (e2e.length && e2e.every(slowPassed)) green.push({ id: run.id, runUrl: run.html_url, sha: run.head_sha });
  }
  return green;
}

async function lastGreenRun(github, owner, repo, current) {
  const green = await slowGreenRuns(github, owner, repo);
  if (green.some((run) => run.id > current)) return { newer: true };
  return green.filter((run) => run.id < current).sort((x, y) => y.id - x.id)[0] ?? null;
}

async function openIssues(github, owner, repo) {
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: LABEL, state: 'open', per_page: 100 });
  return open.filter((i) => i.title === TITLE && !i.pull_request).sort((a, b) => a.number - b.number);
}

module.exports = async function alert({ github, context, core }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const shards = readShards(process.env.SLOW_REPORTS_DIR || 'e2e-slow', Number(process.env.E2E_TOTAL || 0));
  const state = verdict(shards);
  core.info(`@slow E2E on ${context.sha}: ${state}`);
  if (state === 'unknown') return;
  const issues = await openIssues(github, owner, repo);
  const existing = issues[0];
  if (state === 'green') {
    if (!existing) return;
    const { data: main } = await github.rest.git.getRef({ owner, repo, ref: 'heads/main' });
    if (main.object.sha !== context.sha) {
      core.info(`main is now at ${main.object.sha}; only a green run of main's head closes #${existing.number}`);
      return;
    }
    for (const issue of issues) {
      await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: `Green again: the \`@slow\` E2E suite passed on main at ${context.sha.slice(0, 9)}: ${runUrl}` });
      await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
    }
    return;
  }
  const lastGreen = await lastGreenRun(github, owner, repo, context.runId);
  if (lastGreen?.newer) {
    core.info('a newer main push already passed the slow suite, so this red is not reported');
    return;
  }
  let prs = [];
  let complete = true;
  if (lastGreen) {
    const mainline = await mainlineMessages(github, owner, repo, lastGreen.sha, context.sha);
    prs = mergedPrs(mainline.messages);
    complete = mainline.complete;
  }
  const body = issueBody({ shards, runUrl, sha: context.sha, lastGreen, prs, complete });
  if (existing) {
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body });
    core.warning(`${TITLE}: commented on #${existing.number}`);
    return;
  }
  const { data } = await github.rest.issues.create({ owner, repo, title: TITLE, labels: [LABEL], assignees: [...ASSIGNEES], body });
  core.warning(`${TITLE}: opened #${data.number}`);
};

Object.assign(module.exports, { TITLE, failingSpecs, readShards, verdict, mergedPrs, mainlineMessages, lastGreenRun, issueBody, MAINLINE_LIMIT });
