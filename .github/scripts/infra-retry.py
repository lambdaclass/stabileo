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
ACQUIRE_LINE = re.compile(
    r'(?:nix develop \.#e2e -c )?\.github/scripts/retry-infra\.sh (?:'
    r'nix develop(?: \.#e2e)? --command true'
    r'|(?:nix develop --command )?gh run download "\$RUN_ID" --name [\w-]+ --dir [\w/.-]+'
    r'|make (?:web\.deps|e2e\.web\.setup)(?: NIX_RUN=)?'
    r'|nix develop --command cargo fetch --locked(?: --manifest-path [\w/.-]+)?'
    r'|nix develop --command bash -c "cd web && npx playwright install-deps [a-z ]+")'
    r'|if \[ "[\w-]+" = [\w-]+ \]; then|else|fi')
TEST_STEP = re.compile(r'\bmake (?:test|e2e\.web\.(?:smoke|slow|flaky|visual|build)|typecheck|lint|check)'
                       r'|vitest|nextest|playwright test|cargo (?:test|clippy)|mix test|check\.mjs|run-area-e2e')
BUILD_LINE = re.compile(r'nix develop --command env RUSTC_WRAPPER= SCCACHE_DISABLE=1 research/[\w/.-]+/wasm/build\.sh'
                        r'|(?:nix develop --command )?make wasm(?: NIX_RUN=)?')
RETRIED = 'Known infrastructure failure; retry'
TAIL_LINES = 3
MAKE_ERROR = re.compile(r'^make(?:\[\d+\])?: \*\*\* \[[^\]]+\] Error \d+$')
OTHER_ERROR = re.compile(r'(?i)\berror\b|\bfailed\b|\bcannot\b|\bnot found\b')
AGGREGATE_STEP = 'Every job passed or was skipped'
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
    return all(ACQUIRE_LINE.fullmatch(line) for line in lines) and any('retry-infra.sh' in line for line in lines)


def testing(step):
    return any(TEST_STEP.search(line) for line in [step['title'], *step['script']])


def known_build(step):
    if acquisition(step):
        return True
    lines = [line for line in step['script'] if line] or [step['title']]
    return all(ACQUIRE_LINE.fullmatch(line) or BUILD_LINE.fullmatch(line) for line in lines)


def terminal_infra(body):
    """The infrastructure signature that ends the step's last attempt, with no other error after it."""
    lines = body.splitlines()
    marks = [index for index, line in enumerate(lines) if line.startswith(RETRIED)]
    lines = [line for line in (lines[marks[-1] + 1:] if marks else lines)
             if line.strip() and not line.startswith('##[') and not MAKE_ERROR.match(line)]
    hits = [index for index, line in enumerate(lines) if INFRA_LOG.search(line)]
    if not hits or hits[-1] < len(lines) - TAIL_LINES:
        return None
    if any(OTHER_ERROR.search(line) and not INFRA_LOG.search(line) for line in lines[hits[-1] + 1:]):
        return None
    return INFRA_LOG.search(lines[hits[-1]])


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
    if len(annotations) >= 100:
        return 'unsure', 'too many annotations to read them all'
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
    if log is not None:
        for step in steps(log):
            if REAL_FAILURE.search('\n'.join(step['body'])):
                return 'real', f"test or compiler failure in step '{step['title'][:80]}'"
    exits = [message for message in failures if EXIT_CODE.match(message)]
    if log is None:
        if job_level and job_level.startswith('runner lost') and not exits:
            return 'infra', '; '.join(evidence)
        return 'unsure', 'job log unavailable'
    failed = failed_steps(log)
    stopped = [step for step in job.get('steps') or [] if step.get('conclusion') in ('failure', 'cancelled')]
    if job.get('steps') is not None and len(stopped) != len(failed):
        return 'unsure', f'{len(stopped)} failed steps in the API but {len(failed)} in the log'
    if not failed:
        if job_level and job_level.startswith('runner lost') and not exits:
            return 'infra', '; '.join(evidence)
        return 'unsure', 'no failed step in the log'
    for step, errors in failed:
        body = '\n'.join(step['body'])
        name = step['title'][:80]
        for error in errors:
            code = EXIT_CODE.match(error)
            if error == CANCELED:
                if not job_level:
                    return 'unsure', f"step '{name}' cancelled without a job timeout or lost runner"
                if job_level.startswith('job timeout') and (testing(step) or not known_build(step)):
                    return 'unsure', f"timeout in step '{name}', which is not a download or known build (could be a hang the change introduced)"
            elif code and code.group(1) == '137':
                if testing(step) or not known_build(step):
                    return 'unsure', f"exit 137 in step '{name}', which is not a download or known build (could be the change's own memory use)"
                evidence.append(f"exit 137 (SIGKILL, OOM) in step '{name}'")
            elif code:
                hit = terminal_infra(body)
                if not acquisition(step):
                    return 'unsure', f"exit {code.group(1)} in step '{name}', which is not a download or cache step"
                if not hit:
                    return 'unsure', f"exit {code.group(1)} in step '{name}' without an infrastructure signature at the end of its last attempt"
                evidence.append(f"'{hit.group(0)}' in step '{name}'")
            else:
                return 'unsure', f'unrecognised error line: {error[:200]}'
    if not evidence:
        return 'unsure', 'no infrastructure evidence'
    return 'infra', '; '.join(evidence)


def aggregate_only(job, annotations):
    failed = [step.get('name') for step in job.get('steps') or [] if step.get('conclusion') not in ('success', 'skipped')]
    messages = [a.get('message', '').strip() for a in annotations if a.get('annotation_level') == 'failure']
    return (job.get('conclusion') == 'failure' and failed == [AGGREGATE_STEP]
            and messages == ['Process completed with exit code 1.'])


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
            derived = aggregate_only(job, annotations.get(job['id'], []))
            rows.append((job['name'], job.get('conclusion'), 'derived' if derived else 'unsure',
                         'fails because a job above failed' if derived else 'the aggregate failed in a way of its own'))
            retry = retry and derived
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


def check_run(repo, job):
    return job.get('check_run_url') or f"repos/{repo}/check-runs/{job['id']}"


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
    failed = [job for job in jobs if job.get('conclusion') in ('failure', 'cancelled', 'timed_out')]
    annotations = {job['id']: get(check_run(repo, job) + '/annotations?per_page=100') for job in failed}
    logs = {job['id']: log(repo, job['id']) for job in failed if job.get('name') not in AGGREGATES}
    return run, jobs, annotations, logs, newest_run(get, repo, run)


def newest_run(get, repo, run):
    branch = urllib.parse.quote(run['head_branch'], safe='')
    newest = get(f"repos/{repo}/actions/workflows/{run['workflow_id']}/runs?branch={branch}"
                 f"&event=pull_request&per_page=1")['workflow_runs']
    return newest[0]['id'] if newest else None


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
            if (current.get('run_attempt') != attempt or current.get('status') != 'completed'
                    or newest_run(get, repo, run) != run_id):
                summary(head + ['Decision: no rerun (the run was rerun, restarted or superseded meanwhile)', ''] + table, env)
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
