"""Cancel unfinished merge_group runs of the given workflows whose head is no longer in the merge queue."""
import json
import os
import subprocess
import sys

QUERY = '''query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    mergeQueue(branch: "main") { entries(first: 100) { nodes { headCommit { oid } } } }
  }
}'''


def gh(*args):
    return subprocess.run(['gh', *args], check=True, capture_output=True, text=True).stdout


def superseded(runs, queue_heads, own_sha):
    if own_sha not in queue_heads:
        return []
    return [run['id'] for run in runs
            if run['event'] == 'merge_group'
            and run['status'] != 'completed'
            and run['head_sha'] not in queue_heads]


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    owner, name = repo.split('/')
    data = json.loads(gh('api', 'graphql', '-f', f'query={QUERY}', '-f', f'owner={owner}', '-f', f'name={name}'))
    nodes = data['data']['repository']['mergeQueue']['entries']['nodes']
    heads = {n['headCommit']['oid'] for n in nodes if n.get('headCommit')}
    runs = []
    for workflow in sys.argv[1:]:
        for status in ('queued', 'in_progress', 'waiting', 'pending', 'requested'):
            page = json.loads(gh('api', f'repos/{repo}/actions/workflows/{workflow}/runs?event=merge_group&status={status}&per_page=100'))
            runs += page['workflow_runs']
    stale = superseded(runs, heads, os.environ['GITHUB_SHA'])
    if not stale and os.environ['GITHUB_SHA'] not in heads:
        print('this run is not in the merge queue; cancelling nothing')
    for run_id in sorted(set(stale)):
        print(f'cancel superseded merge_group run {run_id}')
        subprocess.run(['gh', 'run', 'cancel', str(run_id), '-R', repo], check=False)
    return 0


if __name__ == '__main__':
    sys.exit(main())
