const ASSIGNEES = require('./issue-assignees.cjs');

const DAY = 864e5;
const CANDIDATE = 'wrong-result-candidate';

async function ensureLabel(github, owner, repo, name, color) {
  try {
    await github.rest.issues.createLabel({owner, repo, name, color});
  } catch (e) {
    if (e.status !== 422) throw e;
  }
}

async function upsertIssue({github, context, core, title, label, body, mode = 'comment', color = 'c5def5', dry = false}) {
  const {owner, repo} = context.repo;
  const open = await github.paginate(github.rest.issues.listForRepo, {owner, repo, labels: label, state: 'open', per_page: 100});
  const existing = open.find((i) => !i.pull_request && i.title === title);
  if (dry) {
    core.info(`[dry run] ${existing ? `${mode} #${existing.number}` : 'open'} "${title}"\n${body}`);
    return existing?.number ?? null;
  }
  if (existing) {
    if (mode === 'replace') await github.rest.issues.update({owner, repo, issue_number: existing.number, body});
    else await github.rest.issues.createComment({owner, repo, issue_number: existing.number, body});
    const missing = ASSIGNEES.filter((a) => !(existing.assignees || []).some((x) => x.login === a));
    if (missing.length) await github.rest.issues.addAssignees({owner, repo, issue_number: existing.number, assignees: missing});
    return existing.number;
  }
  await ensureLabel(github, owner, repo, label, color);
  const created = await github.rest.issues.create({owner, repo, title, labels: [label], assignees: [...ASSIGNEES], body});
  core.warning(`${title}: opened #${created.data.number}`);
  return created.data.number;
}

async function triage({github, context, core, now = Date.now(), dry = false}) {
  const {owner, repo} = context.repo;
  const open = (await github.paginate(github.rest.issues.listForRepo, {owner, repo, labels: CANDIDATE, state: 'open', per_page: 100}))
    .filter((i) => !i.pull_request);
  const since = now - DAY - 2 * 36e5;
  const comments = await github.paginate(github.rest.issues.listCommentsForRepo, {owner, repo, since: new Date(since).toISOString(), per_page: 100});
  const recurred = new Set(comments
    .filter((c) => c.user?.type === 'Bot' && Date.parse(c.created_at) >= since)
    .map((c) => Number(String(c.issue_url).split('/').pop())));
  const fresh = open.filter((i) => Date.parse(i.created_at) >= since || recurred.has(i.number));
  for (const i of open) {
    const missing = ASSIGNEES.filter((a) => !(i.assignees || []).some((x) => x.login === a));
    if (!missing.length) continue;
    if (dry) core.info(`[dry run] assign ${missing.join(', ')} to #${i.number}`);
    else await github.rest.issues.addAssignees({owner, repo, issue_number: i.number, assignees: missing});
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const lines = [
    `### Triage ${day}`,
    '',
    `${fresh.length} new or recurring wrong-result candidate(s) in the last day; ${open.length} open in all.`,
    '',
    ...fresh.map((i) => `- [ ] #${i.number} ${i.title}`),
  ];
  if (fresh.length) {
    lines.push('', `Decision owners: ${ASSIGNEES.map((a) => '@' + a).join(', ')}. For each: confirm (label \`safety\`, contain it, ` +
      'add its reproducer as an expected-failure test named after the issue) or close it as a harness artefact with the evidence.');
  }
  const body = lines.join('\n');
  if (core.summary?.addRaw) await core.summary.addRaw(body + '\n').write();
  if (!fresh.length) return {fresh: 0, open: open.length, issue: null};
  const issue = await upsertIssue({github, context, core, title: 'Daily triage report', label: 'triage-report', body, dry});
  return {fresh: fresh.length, open: open.length, issue};
}

async function flakyReport({github, context, core, now = Date.now(), dry = false, workflow = 'ci.yml'}) {
  const {owner, repo} = context.repo;
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {owner, repo, workflow_id: workflow, created: `>=${since}`, per_page: 100});
  const bySha = new Map();
  for (const r of runs) bySha.set(r.head_sha, [...(bySha.get(r.head_sha) || []), r]);
  const flaky = new Map();
  for (const list of bySha.values()) {
    const suspicious = list.length > 1 || list.some((r) => r.run_attempt > 1);
    if (!suspicious) continue;
    const outcomes = new Map();
    for (const r of list) {
      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {owner, repo, run_id: r.id, filter: 'all', per_page: 100});
      for (const j of jobs) {
        if (!['success', 'failure'].includes(j.conclusion)) continue;
        const o = outcomes.get(j.name) || {failure: [], success: 0};
        if (j.conclusion === 'failure') o.failure.push(j.html_url);
        else o.success += 1;
        outcomes.set(j.name, o);
      }
    }
    for (const [name, o] of outcomes) {
      if (!o.failure.length || !o.success) continue;
      const f = flaky.get(name) || {commits: 0, examples: []};
      f.commits += 1;
      f.examples.push(...o.failure.slice(0, 1));
      flaky.set(name, f);
    }
  }
  const quarantined = (await github.paginate(github.rest.issues.listForRepo, {owner, repo, labels: 'flaky', state: 'open', per_page: 100}))
    .filter((i) => !i.pull_request);
  const rows = [...flaky].sort((a, b) => b[1].commits - a[1].commits || a[0].localeCompare(b[0]));
  const body = [
    `Week from ${since}: ${runs.length} runs of \`${workflow}\`. A job counts as flaky on a commit when it both failed and passed on that same commit (a rerun, or another run).`,
    '',
    rows.length ? '| job | commits | example failure |\n|---|---:|---|' : 'No job failed and passed on the same commit this week.',
    ...rows.map(([name, f]) => `| ${name} | ${f.commits} | ${f.examples.slice(0, 3).map((u, k) => `[${k + 1}](${u})`).join(' ')} |`),
    '',
    `Quarantined (\`flaky\` issues open): ${quarantined.length ? quarantined.map((i) => `#${i.number}`).join(', ') : 'none'}.`,
    '',
    'Infrastructure reruns (infra-retry.yml) count here too; a job that keeps appearing needs an issue, a fix or the `@flaky` quarantine (web/e2e/README.md).',
  ].join('\n');
  if (core.summary?.addRaw) await core.summary.addRaw(body + '\n').write();
  const issue = await upsertIssue({github, context, core, title: 'Weekly flaky-test report', label: 'flaky-report', body, mode: 'replace', dry});
  return {flaky: rows.map(([name, f]) => ({name, commits: f.commits})), issue};
}

module.exports = {upsertIssue, triage, flakyReport, ASSIGNEES};
