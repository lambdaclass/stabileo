"""Rerun a pull request run's failed jobs once, only when every failure carries positive evidence
of an infrastructure fault. Anything unrecognised, including an API error, means no rerun."""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

AGGREGATES = {'CI OK'}
API = 'https://api.github.com'

JOB_TIMEOUT = re.compile(r'^The job has exceeded the maximum execution time of (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$')
RUNNER_LOST = re.compile(r'^The (?:self-hosted|hosted) runner: .+ lost communication with the server\.'
                         r'|^The runner has received a shutdown signal\.')
EXIT_CODE = re.compile(r'^Process completed with exit code (\d+)\.$')
CANCELED = 'The operation was canceled.'

ACQUIRE_ACTIONS = re.compile(r'^(?:actions/(?:checkout|cache|upload-artifact|download-artifact)'
                             r'|DeterminateSystems/(?:nix-installer-action|magic-nix-cache-action))@')
ACQUIRE_LINE = re.compile(r'^(?:nix develop(?: \.#\w+)? (?:-c|--command) )?\.github/scripts/retry-infra\.sh \S'
                          r'|^if \[ "[\w-]+" = [\w-]+ \]; then$|^else$|^fi$')
INFRA_LOG = re.compile(
    r'GitHub Actions Cache throttled|HTTP error 41[68]|429 Too Many Requests|HTTP 429|\(429\)'
    r'|rate limit exceeded|exceeded a secondary rate limit|HTTP 50[0234]\b|\b50[0234] (?:Bad Gateway|Service Unavailable|Gateway Time-?out)'
    r'|Internal Server Error|Connection reset by peer|Error in the HTTP2 framing layer|Failed sending data to the peer'
    r'|SSL_ERROR_SYSCALL|ERR_SOCKET_CLOSED_BEFORE_CONNECTION|usually happens due to networking issues'
    r'|Unable to download artifact|Failed to (?:download|upload) artifact|Download stalled for \d+s')
REAL_FAILURE = re.compile(
    r'test result: FAILED|panicked at |error\[E\d{4}\]|error: could not compile|error: test run failed'
    r'|\b[1-9]\d* (?:failed|failures?)\b|^\s*(?:FAIL|FAILED)\b|Unhandled Errors?|AssertionError|assertion .*failed'
    r'|^error(?:\[[\w:-]+\])?: .*\n\s*--> |error TS\d+|\*\* \(\w+(?:\.\w+)*Error\)|^\s+\d+\) \[\w+\] ',
    re.MULTILINE)
ANSI = re.compile(r'\x1b\[[0-9;]*m')
STAMP = re.compile(r'^\d{4}-\d\d-\d\dT[\d:.]+Z ?')


def clean(line):
    return ANSI.sub('', STAMP.sub('', line))


def steps(log):
    """Split a job log into (title, script, body) per top-level `Run` group."""
    out = []
    for raw in log.splitlines():
        line = clean(raw)
        if line.startswith('##[group]Run '):
            out.append({'title': line[len('##[group]Run '):], 'script': [], 'body': [], 'in_header': True})
            continue
        if not out:
            continue
        step = out[-1]
        if step['in_header']:
            if raw and '\x1b[36;1m' in raw:
                step['script'].append(line.strip())
                continue
            if line.startswith('##[endgroup]'):
                step['in_header'] = False
                continue
            if line.startswith(('shell:', 'env:', 'with:', '  ')):
                continue
            step['in_header'] = False
        step['body'].append(line)
    return out


def acquisition(step):
    if ACQUIRE_ACTIONS.match(step['title']):
        return True
    lines = [line for line in step['script'] if line] or [step['title']]
    return all(ACQUIRE_LINE.match(line) for line in lines) and any('retry-infra.sh' in line for line in lines)


def failed_steps(log):
    """The steps whose body ends in an `##[error]` the runner wrote for the step itself."""
    found = []
    for step in steps(log):
        errors = [line[len('##[error]'):] for line in step['body'] if line.startswith('##[error]')]
        if errors:
            found.append((step, errors))
    return found


def seconds(match):
    hours, minutes, secs = (int(part or 0) for part in match.groups())
    return hours * 3600 + minutes * 60 + secs


def duration(job):
    try:
        start = datetime.fromisoformat(job['started_at'].replace('Z', '+00:00'))
        end = datetime.fromisoformat(job['completed_at'].replace('Z', '+00:00'))
    except (KeyError, AttributeError, TypeError, ValueError):
        return None
    return (end - start).total_seconds()


def classify(job, annotations, log):
    """('infra', evidence) only on positive evidence and nothing contradicting it; else ('real'|'unsure', why)."""
    failures = [a.get('message', '').strip() for a in annotations if a.get('annotation_level') == 'failure']
    if any(a.get('annotation_level') == 'failure' and (a.get('title') or a.get('path') not in (None, '', '.github'))
           for a in annotations):
        return 'real', 'a failure annotation names a test or file'
    evidence = []
    job_level = None
    for message in failures:
        timeout = JOB_TIMEOUT.match(message)
        if timeout:
            took = duration(job)
            if job.get('conclusion') != 'cancelled' or took is None or took < seconds(timeout) - 60:
                return 'unsure', f'timeout annotation without a cancelled job that ran its full budget: {message}'
            job_level = f'job timeout ({message})'
        elif RUNNER_LOST.match(message):
            job_level = f'runner lost ({message.splitlines()[0]})'
        elif message != CANCELED and not EXIT_CODE.match(message):
            return 'unsure', f'unrecognised failure annotation: {message[:200]}'
    if job_level:
        evidence.append(job_level)
    if log is None:
        if job_level and job_level.startswith('runner lost'):
            return 'infra', '; '.join(evidence)
        return 'unsure', 'job log unavailable'
    failed = failed_steps(log)
    if not failed:
        if job_level and job_level.startswith('runner lost'):
            return 'infra', '; '.join(evidence)
        return 'unsure', 'no failed step in the log'
    for step, errors in failed:
        body = '\n'.join(step['body'])
        if REAL_FAILURE.search(body):
            return 'real', f"test or compiler failure in step '{step['title'][:80]}'"
        for error in errors:
            code = EXIT_CODE.match(error)
            if error == CANCELED:
                if not job_level:
                    return 'unsure', f"step '{step['title'][:80]}' cancelled without a job timeout or lost runner"
            elif code and code.group(1) == '137':
                evidence.append(f"exit 137 (SIGKILL, OOM) in step '{step['title'][:80]}'")
            elif code:
                hit = INFRA_LOG.search(body)
                if not acquisition(step):
                    return 'unsure', f"exit {code.group(1)} in step '{step['title'][:80]}', which is not a download or cache step"
                if not hit:
                    return 'unsure', f"exit {code.group(1)} in step '{step['title'][:80]}' without an infrastructure signature"
                evidence.append(f"'{hit.group(0)}' in step '{step['title'][:80]}'")
            else:
                return 'unsure', f'unrecognised error line: {error[:200]}'
    if not evidence:
        return 'unsure', 'no infrastructure evidence'
    return 'infra', '; '.join(evidence)


def decide(run, jobs, annotations, logs, newest_id, repository):
    """(retry, reason, rows): rows are (job name, conclusion, verdict, why) for the summary."""
    rows = []
    if run.get('event') != 'pull_request':
        return False, f"event {run.get('event')}: only pull_request runs are retried here", rows
    if run.get('run_attempt') != 1:
        return False, f"attempt {run.get('run_attempt')}: already rerun once", rows
    if run.get('conclusion') not in ('failure', 'cancelled'):
        return False, f"conclusion {run.get('conclusion')}", rows
    if (run.get('head_repository') or {}).get('full_name') != repository:
        return False, 'fork pull request', rows
    if newest_id != run.get('id'):
        return False, f'superseded by run {newest_id} on the same branch', rows
    failed = [job for job in jobs if job.get('conclusion') in ('failure', 'cancelled', 'timed_out')]
    own = [job for job in failed if job.get('name') not in AGGREGATES]
    if not own:
        return False, 'no failed job besides the aggregate', rows
    retry = True
    for job in own:
        verdict, why = classify(job, annotations.get(job['id'], []), logs.get(job['id']))
        rows.append((job.get('name', '?'), job.get('conclusion'), verdict, why))
        retry = retry and verdict == 'infra'
    for job in failed:
        if job.get('name') in AGGREGATES:
            rows.append((job['name'], job.get('conclusion'), 'derived', 'fails because a job above failed'))
    return retry, ('every failed job is infrastructure' if retry else 'a failed job is not proven infrastructure'), rows


def request(path, method='GET', raw=False):
    req = urllib.request.Request(path if path.startswith('http') else f'{API}/{path}', method=method, headers={
        'Authorization': f"Bearer {os.environ['GH_TOKEN']}", 'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(req, timeout=60) as response:
        body = response.read()
    if raw:
        return body.decode('utf-8', 'replace')
    return json.loads(body) if body else None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def job_log(repo, job_id):
    req = urllib.request.Request(f'{API}/repos/{repo}/actions/jobs/{job_id}/logs', headers={
        'Authorization': f"Bearer {os.environ['GH_TOKEN']}", 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            return response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        if error.code in (404, 410):
            return None
        if error.code not in (301, 302, 303, 307, 308) or not error.headers.get('Location'):
            raise
        location = error.headers['Location']
    with urllib.request.urlopen(location, timeout=120) as response:
        return response.read().decode('utf-8', 'replace')


def summary(lines, env=os.environ):
    text = '\n'.join(lines) + '\n'
    print(text)
    path = env.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a') as out:
            out.write(text)


def collect(repo, run_id, attempt, get=None, log=None):
    get, log = get or request, log or job_log
    run = get(f'repos/{repo}/actions/runs/{run_id}/attempts/{attempt}')
    jobs, page = [], 1
    while True:
        listed = get(f'repos/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}')
        jobs += listed['jobs']
        if len(listed['jobs']) < 100:
            break
        page += 1
    branch = urllib.parse.quote(run['head_branch'], safe='')
    newest = get(f"repos/{repo}/actions/workflows/{run['workflow_id']}/runs?branch={branch}"
                 f"&event=pull_request&per_page=1")['workflow_runs']
    failed = [job for job in jobs if job.get('conclusion') in ('failure', 'cancelled', 'timed_out')
              and job.get('name') not in AGGREGATES]
    annotations = {job['id']: get(f"repos/{repo}/check-runs/{job['id']}/annotations?per_page=100") for job in failed}
    logs = {job['id']: log(repo, job['id']) for job in failed}
    return run, jobs, annotations, logs, (newest[0]['id'] if newest else None)


def main(env=os.environ, get=None, log=None, post=None):
    get, post = get or request, post or (lambda path: request(path, method='POST'))
    repo, run_id, attempt = env['GITHUB_REPOSITORY'], int(env['RUN_ID']), int(env['RUN_ATTEMPT'])
    head = [f"## Infrastructure retry: run {run_id}, attempt {attempt}", '']
    try:
        run, jobs, annotations, logs, newest_id = collect(repo, run_id, attempt, get, log)
        retry, reason, rows = decide(run, jobs, annotations, logs, newest_id, repo)
        table = ['| Job | Conclusion | Verdict | Evidence |', '| --- | --- | --- | --- |']
        table += [f"| {name} | {conclusion} | {verdict} | {why.replace('|', '/')} |" for name, conclusion, verdict, why in rows]
        if retry and env.get('DRY_RUN') == '1':
            summary(head + [f'Decision: would rerun failed jobs once ({reason}); dry run', ''] + table, env)
        elif retry:
            current = get(f'repos/{repo}/actions/runs/{run_id}')
            if current.get('run_attempt') != attempt or current.get('status') != 'completed':
                summary(head + ['Decision: no rerun (the run was rerun or restarted meanwhile)', ''] + table, env)
                return 0
            post(f'repos/{repo}/actions/runs/{run_id}/rerun-failed-jobs')
            summary(head + [f'Decision: RERUN failed jobs once ({reason})', ''] + table, env)
        else:
            summary(head + [f'Decision: no rerun ({reason})', ''] + (table if rows else []), env)
    except Exception as error:
        summary(head + [f'Decision: no rerun (unsure: {type(error).__name__}: {error})'], env)
    return 0


if __name__ == '__main__':
    sys.exit(main())
