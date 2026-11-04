import json
import subprocess
import sys
import time

REQUIRED = 'CI OK'


def verdict(runs):
    mine = [r for r in runs if r.get('name') == REQUIRED]
    if any(r.get('status') == 'completed' and r.get('conclusion') == 'success' for r in mine):
        return 'pass'
    if not mine or any(r.get('status') != 'completed' for r in mine):
        return 'wait'
    return 'fail'


def check_runs(repo, commit):
    pages = subprocess.check_output(['gh', 'api', '--paginate', f'repos/{repo}/commits/{commit}/check-runs?per_page=100', '-q', '.check_runs[]'], text=True)
    return [json.loads(line) for line in pages.splitlines() if line.strip()]


def main(repo, commit, attempts=180, delay=60):
    for _ in range(attempts):
        state = verdict(check_runs(repo, commit))
        if state == 'pass':
            return 0
        if state == 'fail':
            print(f'{REQUIRED} failed for {commit}: no snapshot of an unvalidated commit', file=sys.stderr)
            return 1
        time.sleep(delay)
    print(f'{REQUIRED} did not finish for {commit}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
