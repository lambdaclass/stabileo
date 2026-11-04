"""Print tested=true when the pushed main commit's tree is the tree of a merge-group commit whose CI run
succeeded, read through the GitHub API. Anything else, including an API error, prints tested=false."""
import json
import os
import subprocess
import sys


def gh(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def tested_by(sha, repo, api=gh, runs=30):
    tree = api(f'repos/{repo}/git/commits/{sha}')['tree']['sha']
    listed = api(f'repos/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page={runs}')
    for run in listed['workflow_runs']:
        if run.get('event') != 'merge_group' or run.get('conclusion') != 'success':
            continue
        if api(f"repos/{repo}/git/commits/{run['head_sha']}")['tree']['sha'] == tree:
            return run
    return None


def main(env=os.environ, api=gh, out=sys.stdout):
    run = None
    if env.get('GITHUB_EVENT_NAME') == 'push' and env.get('GITHUB_REF') == 'refs/heads/main':
        try:
            run = tested_by(env['GITHUB_SHA'], env['GITHUB_REPOSITORY'], api)
        except (KeyError, TypeError, ValueError, OSError, subprocess.CalledProcessError) as error:
            print(f'::warning::cannot verify the merge-queue run for this tree, running everything: {error}', file=sys.stderr)
    if run:
        print(f"Tree tested by merge-queue run {run.get('html_url', run['id'])} ({run['head_sha']})", file=sys.stderr)
    print(f"tested={'true' if run else 'false'}", file=out)


if __name__ == '__main__':
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        main(out=out)
