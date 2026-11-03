"""Cancel unfinished merge_group runs of the given workflows whose head is no longer in the merge queue."""
import json
import os
import subprocess
import sys

QUERY = '''query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    mergeQueue(branch: "main") {
      entries(first: 100, after: $after) { nodes { headCommit { oid } } pageInfo { hasNextPage endCursor } }
    }
  }
}'''


def gh(*args):
    return subprocess.run(['gh', *args], check=True, capture_output=True, text=True).stdout


def live_heads(entries, queue_refs):
    return ({n['headCommit']['oid'] for n in entries if n.get('headCommit')}
            | {r['object']['sha'] for r in queue_refs})


def superseded(runs, queue_heads, own_sha):
    if own_sha not in queue_heads:
        return []
    return [run['id'] for run in runs
            if run['event'] == 'merge_group'
            and run['status'] != 'completed'
            and run['head_sha'] not in queue_heads]


def queue_entries(owner, name):
    nodes, after = [], None
    while True:
        args = ['api', 'graphql', '-f', f'query={QUERY}', '-f', f'owner={owner}', '-f', f'name={name}']
        if after:
            args += ['-f', f'after={after}']
        page = json.loads(gh(*args))['data']['repository']['mergeQueue']['entries']
        nodes += page['nodes']
        if not page['pageInfo']['hasNextPage']:
            return nodes
        after = page['pageInfo']['endCursor']


def queue_refs(repo):
    out = gh('api', '--paginate', '--jq', '.[]',
             f'repos/{repo}/git/matching-refs/heads/gh-readonly-queue/main/?per_page=100')
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def queue_heads(repo, owner, name):
    return live_heads(queue_entries(owner, name), queue_refs(repo))


def unfinished_runs(repo, workflows):
    runs = []
    for workflow in workflows:
        for status in ('queued', 'in_progress', 'waiting', 'pending', 'requested'):
            out = gh('api', '--paginate', '--jq', '.workflow_runs[]',
                     f'repos/{repo}/actions/workflows/{workflow}/runs?event=merge_group&status={status}&per_page=100')
            runs += [json.loads(line) for line in out.splitlines() if line.strip()]
    return runs


def confirmed(runs, snapshots, own_sha):
    if not snapshots or any(own_sha not in heads for heads in snapshots):
        return []
    return superseded(runs, set().union(*snapshots), own_sha)


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    owner, name = repo.split('/')
    own_sha = os.environ['GITHUB_SHA']
    before = queue_heads(repo, owner, name)
    runs = unfinished_runs(repo, sys.argv[1:])
    after = queue_heads(repo, owner, name)
    stale = set(confirmed(runs, [before, after], own_sha))
    if stale:
        stale &= set(confirmed(runs, [before, after, queue_heads(repo, owner, name)], own_sha))
    elif own_sha not in before or own_sha not in after:
        print('this run is not in the merge queue; cancelling nothing')
    for run_id in sorted(stale):
        print(f'cancel superseded merge_group run {run_id}')
        subprocess.run(['gh', 'run', 'cancel', str(run_id), '-R', repo], check=False)
    return 0

if __name__ == '__main__':
    sys.exit(main())
