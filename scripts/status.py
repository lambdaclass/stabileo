import json
import re
import subprocess
import sys
import time


CONTEXTS = '''contexts(first: 100, after: $checksCursor) {
  nodes { __typename ... on CheckRun { name status conclusion }
    ... on StatusContext { context state } }
  pageInfo { hasNextPage endCursor }
}'''
QUERY = '''query($owner: String!, $name: String!, $cursor: String, $checksCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 30, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { number title author { login } isDraft mergeStateStatus autoMergeRequest { enabledAt }
        commits(last: 1) { nodes { commit { statusCheckRollup { id ''' + CONTEXTS + ''' } } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}'''
CHECK_QUERY = '''query($id: ID!, $checksCursor: String) {
  node(id: $id) { ... on StatusCheckRollup { ''' + CONTEXTS + ''' } }
}'''


def gh_json(*args):
    for attempt in range(3):
        try:
            result = subprocess.run(['gh', *args], capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            result = subprocess.CompletedProcess(['gh', *args], 1, '', 'GitHub request timed out')
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if not isinstance(data, dict) or not data.get('errors'):
                return data
        error = result.stderr or result.stdout
        if attempt == 2 or not re.search(r'\b(502|503|504)\b|gateway|temporarily unavailable|connection reset|timed out', error, re.I):
            raise RuntimeError(error.strip())
        time.sleep(2 ** attempt)
    raise AssertionError('unreachable')


def graphql(query, **variables):
    args = ['api', 'graphql', '-f', f'query={query}']
    for key, value in variables.items():
        if value is not None:
            args.extend(['-f', f'{key}={value}'])
    return gh_json(*args)['data']


def pull_requests():
    owner, name = gh_json('repo', 'view', '--json', 'nameWithOwner')['nameWithOwner'].split('/')
    cursor = None
    prs = {}
    while True:
        page = graphql(QUERY, owner=owner, name=name, cursor=cursor)['repository']['pullRequests']
        for pr in page['nodes']:
            commits = pr.pop('commits')['nodes']
            rollup = commits[-1]['commit']['statusCheckRollup'] if commits else None
            checks = []
            if rollup:
                contexts = rollup['contexts']
                while True:
                    checks.extend(contexts['nodes'])
                    if not contexts['pageInfo']['hasNextPage']:
                        break
                    contexts = graphql(CHECK_QUERY, id=rollup['id'],
                                       checksCursor=contexts['pageInfo']['endCursor'])['node']['contexts']
            pr['statusCheckRollup'] = checks
            prs[pr['number']] = pr
        if not page['pageInfo']['hasNextPage']:
            return list(prs.values())
        cursor = page['pageInfo']['endCursor']


def table(prs):
    yield ['PR', 'TITLE', 'STATE', 'MERGE', 'AUTO-MERGE', 'FAILING CHECKS', 'PENDING']
    excluded = {'dimank92', 'brayaniglesias08', 'dependabot', 'dependabot[bot]', 'app/dependabot'}
    failures = {'FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'}
    for pr in prs:
        if ((pr['author'] or {}).get('login') or '').lower() in excluded:
            continue
        checks = pr['statusCheckRollup']
        failing = [c.get('name', c.get('context', '')) for c in checks
                   if (c.get('conclusion') or c.get('state')) in failures]
        pending = sum(c.get('state') == 'PENDING' if c['__typename'] == 'StatusContext'
                      else c.get('status') != 'COMPLETED' for c in checks)
        yield [pr['number'], re.sub(r'[\t\r\n]', ' ', pr['title'])[:60],
               'draft' if pr['isDraft'] else 'ready', pr['mergeStateStatus'],
               'on' if pr['autoMergeRequest'] else 'off', ', '.join(failing), pending]


def main():
    try:
        rows = list(table(pull_requests()))
        for row in rows:
            print('\t'.join(str(cell).replace('\t', ' ').replace('\r', ' ').replace('\n', ' ') for cell in row))
    except (RuntimeError, ValueError, KeyError) as error:
        print(f'status: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
