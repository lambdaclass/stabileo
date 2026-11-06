const ASSIGNEES = require('./issue-assignees.cjs');

const LABEL = 'ci-failure';
const TITLE = 'CI failure: Timing Budgets on main';

function verdict(outcomes) {
  if (outcomes.some((o) => o === 'failure')) return 'red';
  if (outcomes.length && outcomes.every((o) => o === 'success')) return 'green';
  return 'unknown';
}

function issueBody({ outcomes, runUrl, sha, event }) {
  return [
    `Timing Budgets failed on main (${event}) at ${sha.slice(0, 9)}: ${runUrl}`,
    '',
    `Scale budgets: ${outcomes.scale || 'not run'}. E2E wall-clock budgets: ${outcomes.e2e || 'not run'}.`,
    '',
    'Pull requests and the merge queue only report these budgets (#1562), so an overrun first fails here. A single red can be a runner stall; a second one in a row is a regression to find before a release.',
  ].join('\n');
}

async function openIssues(github, owner, repo) {
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: LABEL, state: 'open', per_page: 100 });
  return open.filter((i) => i.title === TITLE && !i.pull_request).sort((a, b) => a.number - b.number);
}

module.exports = async function alert({ github, context, core }) {
  const { owner, repo } = context.repo;
  const outcomes = { scale: process.env.SCALE_OUTCOME || '', e2e: process.env.E2E_OUTCOME || '' };
  const state = verdict([outcomes.scale, outcomes.e2e]);
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  core.info(`Timing Budgets on ${context.sha}: ${state}`);
  if (state === 'unknown') return;
  const issues = await openIssues(github, owner, repo);
  if (state === 'green') {
    if (!issues.length) return;
    const { data: main } = await github.rest.git.getRef({ owner, repo, ref: 'heads/main' });
    if (main.object.sha !== context.sha) return;
    for (const issue of issues) {
      await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: `Green again: Timing Budgets passed on main at ${context.sha.slice(0, 9)}: ${runUrl}` });
      await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
    }
    return;
  }
  const body = issueBody({ outcomes, runUrl, sha: context.sha, event: context.eventName });
  if (issues.length) {
    await github.rest.issues.createComment({ owner, repo, issue_number: issues[0].number, body });
    core.warning(`${TITLE}: commented on #${issues[0].number}`);
    return;
  }
  const { data } = await github.rest.issues.create({ owner, repo, title: TITLE, labels: [LABEL], assignees: [...ASSIGNEES], body });
  core.warning(`${TITLE}: opened #${data.number}`);
};

Object.assign(module.exports, { TITLE, LABEL, verdict, issueBody });
