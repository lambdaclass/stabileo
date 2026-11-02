"""React to a failed CI run of a push to main: rerun its failed jobs once, then open a revert.

A second failure reverts every merge commit since the last green push to main in one PR, created
with a signed commit. The PR still needs a person's approval (branch protection). Once it is
approved and its required checks pass, it is enqueued at the front of the merge queue. Each
outcome is sent to ntfy. The suspect range is reverted whole because one push can land up to five
queued PRs.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import time

MARKER = '[auto-revert]'
BRANCH = 'revert/auto-'
ROOT = os.path.dirname(os.path.abspath(__file__))


def run(*args, cwd=None, check=True):
    return subprocess.run(args, cwd=cwd, check=check, capture_output=True, text=True).stdout


def gh(*args, token=None, check=True):
    env = dict(os.environ)
    if token:
        env['GH_TOKEN'] = token
    result = subprocess.run(['gh', *args], capture_output=True, text=True, env=env)
    if check and result.returncode:
        raise RuntimeError(f'gh {args[:2]} failed: {result.stderr.strip()}')
    return result.stdout


def graphql(query, variables, token):
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as body:
        json.dump({'query': query, 'variables': variables}, body)
    try:
        data = json.loads(gh('api', 'graphql', '--input', body.name, token=token))
    finally:
        os.unlink(body.name)
    if data.get('errors'):
        raise RuntimeError(f"GraphQL: {data['errors']}")
    return data['data']


def notify(priority, title, body):
    subprocess.run([os.path.join(ROOT, 'ntfy-send.sh'), priority, title, body], check=False)


def last_green_before(runs, created_at):
    green = [r for r in runs if r['conclusion'] == 'success' and r['created_at'] < created_at]
    return max(green, key=lambda r: r['created_at'])['head_sha'] if green else None


def green_after(runs, created_at):
    return any(r['conclusion'] == 'success' and r['created_at'] > created_at for r in runs)


def suspect_merges(repo, good, bad):
    if good and subprocess.run(['git', 'merge-base', '--is-ancestor', good, bad], cwd=repo).returncode == 0:
        span = f'{good}..{bad}'
    else:
        span = f'{bad}^..{bad}'
    return run('git', 'rev-list', '--first-parent', '--merges', span, cwd=repo).split()


def revert_changes(repo, base, merges):
    with tempfile.TemporaryDirectory() as tmp:
        work = os.path.join(tmp, 'w')
        run('git', 'worktree', 'add', '--detach', work, base, cwd=repo)
        try:
            for sha in merges:
                ok = subprocess.run(['git', '-c', 'user.name=ci', '-c', 'user.email=ci@localhost',
                                     'revert', '--no-edit', '-m', '1', sha],
                                    cwd=work, capture_output=True).returncode == 0
                if not ok:
                    return None
            additions, deletions, unsupported = [], [], []
            for line in run('git', 'diff', '--no-renames', '--name-status', base, 'HEAD', cwd=work).splitlines():
                status, path = line.split('\t', 1)
                if status == 'D':
                    deletions.append({'path': path})
                    continue
                if {mode(work, rev, path) for rev in (base, 'HEAD')} - {None, '100644'}:
                    unsupported.append(path)
                blob = subprocess.run(['git', 'show', f'HEAD:{path}'], cwd=work, check=True, capture_output=True).stdout
                additions.append({'path': path, 'contents': base64.b64encode(blob).decode()})
            return {'additions': additions, 'deletions': deletions, 'unsupported': unsupported}
        finally:
            run('git', 'worktree', 'remove', '--force', work, cwd=repo, check=False)


def mode(repo, rev, path):
    entry = run('git', 'ls-tree', rev, '--', path, cwd=repo).split()
    return entry[0] if entry else None


def open_revert(prs):
    return next((p['url'] for p in prs if p['headRefName'].startswith(BRANCH)), None)


def pr_numbers(repo, merges):
    out = []
    for sha in merges:
        subject = run('git', 'log', '-1', '--format=%s', sha, cwd=repo)
        if subject.startswith('Merge pull request #'):
            out.append(subject.split()[3].lstrip('#'))
    return out


def ready(state):
    checks = state['checks']
    return (state['review'] == 'APPROVED' and bool(checks)
            and all(c in ('pass', 'skipping') for c in checks))


def failed(state):
    return any(c in ('fail', 'cancel') for c in state['checks'])


def pr_state(number, token):
    review = gh('pr', 'view', str(number), '--json', 'reviewDecision', '-q', '.reviewDecision', token=token, check=False).strip()
    try:
        checks = [c['bucket'] for c in json.loads(gh('pr', 'checks', str(number), '--required', '--json', 'bucket', token=token, check=False))]
    except ValueError:
        checks = []
    return {'review': review, 'checks': checks}


def wait_until_ready(number, token, minutes):
    deadline = time.time() + minutes * 60
    while time.time() < deadline:
        time.sleep(60)
        state = pr_state(number, token)
        if ready(state):
            return 'ready'
        if failed(state):
            return 'failed'
    return 'timeout'


def main():
    repo_name = os.environ['GITHUB_REPOSITORY']
    bot = os.environ['REVERT_TOKEN']
    run_id, attempt = os.environ['RUN_ID'], int(os.environ['RUN_ATTEMPT'])
    bad, created_at, url = os.environ['HEAD_SHA'], os.environ['RUN_CREATED_AT'], os.environ['RUN_URL']
    repo = os.getcwd()

    if attempt < 2:
        gh('run', 'rerun', run_id, '--failed', '-R', repo_name, token=bot)
        print(f'first failure of run {run_id}: failed jobs rerun')
        return 0

    runs = json.loads(gh('api', f'repos/{repo_name}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=100'))['workflow_runs']
    if green_after(runs, created_at):
        notify('default', 'main CI failure already superseded', f'{url}\nA later push to main is green; nothing reverted.')
        return 0
    branch = f'{BRANCH}{bad[:12]}'
    if gh('pr', 'list', '-R', repo_name, '--head', branch, '--state', 'all', '--json', 'number', '-q', '.[].number').strip():
        print(f'{branch} already has a PR')
        return 0
    pending = open_revert(json.loads(gh('pr', 'list', '-R', repo_name, '--state', 'open', '--base', 'main', '--limit', '200', '--json', 'headRefName,url')))
    if pending:
        notify('urgent', 'main CI failed again', f'{url}\nAn auto-revert is already open ({pending}); land it, then check this failure by hand.')
        return 1
    main_head = run('git', 'rev-parse', 'origin/main', cwd=repo).strip()
    merges = suspect_merges(repo, last_green_before(runs, created_at), bad)
    subjects = [run('git', 'log', '-1', '--format=%s%n%b', sha, cwd=repo) for sha in merges]
    if not merges or any(MARKER in s for s in subjects):
        notify('urgent', 'main CI failed: revert by hand', f'{url}\nNo merge to revert automatically (none found, or the range holds an auto-revert).')
        return 1
    changes = revert_changes(repo, main_head, merges)
    if changes is None:
        notify('urgent', 'main CI failed: revert conflicts', f'{url}\nReverting {" ".join(m[:12] for m in merges)} on {main_head[:12]} conflicts; revert by hand.')
        return 1
    if changes.pop('unsupported'):
        notify('urgent', 'main CI failed: revert by hand', f'{url}\nThe revert of {" ".join(m[:12] for m in merges)} touches an executable, a symlink or a file mode, which a signed API commit cannot carry.')
        return 1
    prs = pr_numbers(repo, merges)
    title = f'{MARKER} Revert {", ".join("#" + n for n in prs) or ", ".join(m[:12] for m in merges)}: main CI failed on {bad[:12]}'
    body = f'{MARKER} main CI failed twice on {bad} ({url}).\n\nReverts these merge commits, newest first:\n' + \
        '\n'.join(f'- {sha}' for sha in merges) + \
        '\n\nApprove it and it is enqueued at the front of the merge queue once its required checks pass.' + \
        ' Then fix the reverted PRs and queue them again.'
    gh('api', '-X', 'POST', f'repos/{repo_name}/git/refs', '-f', f'ref=refs/heads/{branch}', '-f', f'sha={main_head}', token=bot)
    graphql('''mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }''',
            {'input': {'branch': {'repositoryNameWithOwner': repo_name, 'branchName': branch},
                       'message': {'headline': title, 'body': body},
                       'fileChanges': changes, 'expectedHeadOid': main_head}}, bot)
    created = json.loads(gh('api', '-X', 'POST', f'repos/{repo_name}/pulls', '-f', f'title={title}', '-f', f'body={body}',
                            '-f', f'head={branch}', '-f', 'base=main', token=bot))
    number, node, pr_url = created['number'], created['node_id'], created['html_url']
    notify('urgent', 'main CI failed: approve the revert', f'{url}\n{pr_url} reverts {", ".join(prs) or len(merges)}. Approve it; it jumps the merge queue once green.')
    outcome = wait_until_ready(number, bot, int(os.environ.get('WAIT_MINUTES', '170')))
    if outcome != 'ready':
        notify('urgent', f'main CI failed: revert {outcome}', f'{url}\n{pr_url} was not approved and green in time ({outcome}); enqueue it by hand.')
        return 1
    try:
        graphql('''mutation($id: ID!) { enqueuePullRequest(input: {pullRequestId: $id, jump: true}) { mergeQueueEntry { position } } }''',
                {'id': node}, bot)
    except RuntimeError as error:
        notify('urgent', 'main CI failed: revert not enqueued', f'{url}\n{pr_url}\n{error}')
        return 1
    notify('high', 'main CI failed: revert enqueued first', f'{url}\n{pr_url} jumps the merge queue.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
