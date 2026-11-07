"""Open one issue per scheduled job that failed its last two scheduled runs on main; close it once green.

usage: red-nightlies.py [--dry-run]   (GH_TOKEN and GITHUB_REPOSITORY from the environment)

A job counts red on failure, timed_out or startup_failure, and on cancelled only when GitHub
cancelled it for exceeding its timeout; any other cancellation leaves that run undecided for the
job. Only the latest attempt of a rerun job counts. Matrix jobs share their name without the
parenthesised suffix, so a rotating shard name does not hide a job that fails every night.
"""
import argparse
import json
import os
import re
import subprocess
import sys

LABEL = 'nightly-red'
ASSIGNEES = ['unbalancedparentheses', 'Batuis']
RUNS = 8
SELF = 'Red nightlies'
BAD = {'failure', 'timed_out', 'startup_failure'}
GOOD = {'success'}
TIMEOUT_NOTE = 'has exceeded the maximum execution time'


def title(workflow, job):
    return f'Stays red: {workflow} / {job}'


def group(name):
    return re.sub(r'\s*\([^()]*\)$', '', name)


def outcome(job):
    conclusion = job.get('conclusion')
    if conclusion in BAD or (conclusion == 'cancelled' and job.get('timed_out')):
        return 'red'
    if conclusion in GOOD:
        return 'green'
    if conclusion == 'cancelled':
        return 'unknown'
    return None


def latest_attempts(jobs):
    latest = {}
    for job in jobs:
        prev = latest.get(job['name'])
        if prev is None or job.get('run_attempt', 1) > prev.get('run_attempt', 1):
            latest[job['name']] = job
    return list(latest.values())


def job_history(runs):
    history = {}
    for run in runs:
        seen = {}
        jobs = run.get('jobs') or []
        if not jobs and run.get('conclusion') in BAD:
            seen['(run)'] = ('red', [])
        elif run.get('conclusion') in GOOD:
            seen['(run)'] = ('green', [])
        for job in latest_attempts(jobs):
            state = outcome(job)
            if state is None:
                continue
            key = group(job['name'])
            prev, failing = seen.get(key, ('green', []))
            if state == 'red':
                failing = failing + [job]
            seen[key] = (next(st for st in ('red', 'unknown', 'green') if st in (prev, state)), failing)
        for key, (state, failing) in seen.items():
            if state != 'unknown':
                history.setdefault(key, []).append({'run': run, 'state': state, 'failing': failing})
    return history


def verdicts(workflow, runs):
    out = {}
    for key, entries in job_history(runs).items():
        if len(entries) >= 2 and entries[0]['state'] == 'red' and entries[1]['state'] == 'red':
            out[title(workflow, key)] = {'state': 'red', 'workflow': workflow, 'job': key, 'entries': entries[:2]}
        elif entries[0]['state'] == 'green':
            out[title(workflow, key)] = {'state': 'green', 'workflow': workflow, 'job': key, 'entries': entries[:1]}
    return out


def describe(entry):
    run = entry['run']
    lines = [f"- [{run['created_at'][:10]} run {run['id']}]({run['html_url']})"]
    for job in entry['failing']:
        why = 'timed out' if job.get('timed_out') else job.get('conclusion')
        lines.append(f"  - [{job['name']}]({job['html_url']}): {why}")
    return '\n'.join(lines)


def red_body(v):
    return '\n'.join([
        f"`{v['job']}` in the scheduled workflow **{v['workflow']}** failed its last two scheduled runs on main:",
        '',
        *[describe(e) for e in v['entries']],
    ])


def plan(found, open_issues):
    by_title = {}
    for issue in sorted(open_issues, key=lambda i: i['number']):
        by_title.setdefault(issue['title'], issue)
    actions = []
    for issue_title, v in sorted(found.items()):
        issue = by_title.get(issue_title)
        if v['state'] == 'red':
            latest = v['entries'][0]['run']['html_url']
            if issue is None:
                actions.append({'action': 'open', 'title': issue_title, 'body': red_body(v)})
            elif latest not in issue.get('text', ''):
                actions.append({'action': 'comment', 'number': issue['number'], 'body': f'Still red.\n\n{describe(v["entries"][0])}'})
        elif issue is not None:
            run = v['entries'][0]['run']
            actions.append({'action': 'close', 'number': issue['number'],
                            'body': f"Green again in [run {run['id']}]({run['html_url']}) ({run['created_at'][:10]}). Closing."})
    return actions


def gh(*args, data=None):
    proc = subprocess.run(['gh', *args], capture_output=True, text=True, input=data)
    if proc.returncode != 0:
        raise RuntimeError(f'gh {" ".join(args)} failed: {proc.stderr.strip()}')
    return proc.stdout


def fetch(repo):
    workflows = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repo}/actions/workflows?per_page=100'))
    found = {}
    for page in workflows:
        for wf in page['workflows']:
            if wf['state'] != 'active' or wf['name'] == SELF:
                continue
            runs = json.loads(gh('api', f"repos/{repo}/actions/workflows/{wf['id']}/runs?branch=main&event=schedule&status=completed&per_page={RUNS}"))['workflow_runs']
            for run in runs:
                pages = json.loads(gh('api', '--paginate', '--slurp', f"repos/{repo}/actions/runs/{run['id']}/jobs?filter=all&per_page=100"))
                run['jobs'] = [j for p in pages for j in p['jobs']]
                for job in run['jobs']:
                    if job.get('conclusion') == 'cancelled':
                        notes = json.loads(gh('api', '--paginate', '--slurp', f"repos/{repo}/check-runs/{job['id']}/annotations?per_page=100"))
                        job['timed_out'] = any(TIMEOUT_NOTE in (n.get('message') or '') for p in notes for n in p)
            if runs:
                found.update(verdicts(wf['name'], runs))
    return found


def open_issues(repo):
    pages = json.loads(gh('api', '--paginate', '--slurp', f'repos/{repo}/issues?labels={LABEL}&state=open&per_page=100'))
    issues = [i for p in pages for i in p if 'pull_request' not in i]
    for issue in issues:
        comments = json.loads(gh('api', '--paginate', '--slurp', f"repos/{repo}/issues/{issue['number']}/comments?per_page=100"))
        issue['text'] = '\n'.join([issue.get('body') or '', *[c.get('body') or '' for p in comments for c in p]])
    return issues


def apply(repo, actions, dry_run):
    for a in actions:
        if dry_run:
            print(json.dumps(a))
            continue
        if a['action'] == 'open':
            gh('label', 'create', LABEL, '--repo', repo, '--color', 'b60205', '--force',
               '--description', 'A scheduled job failed its last two scheduled runs on main (opened and closed by CI)')
            args = ['issue', 'create', '--repo', repo, '--title', a['title'], '--label', LABEL, '--body-file', '-']
            for who in ASSIGNEES:
                args += ['--assignee', who]
            print(gh(*args, data=a['body'] + f'\n\n---\nOpened by `.github/workflows/red-nightlies.yml`; closed by it when the job passes again.').strip())
        elif a['action'] == 'comment':
            gh('issue', 'comment', str(a['number']), '--repo', repo, '--body-file', '-', data=a['body'])
            print(f"commented on #{a['number']}")
        else:
            gh('issue', 'close', str(a['number']), '--repo', repo, '--comment', a['body'])
            print(f"closed #{a['number']}")


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args(argv)
    repo = os.environ['GITHUB_REPOSITORY']
    actions = plan(fetch(repo), open_issues(repo))
    apply(repo, actions, a.dry_run)
    if not actions:
        print('No scheduled job changed state.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
