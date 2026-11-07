"""Fail a pull request whose merge into its base deletes recent lines written by commits outside it.

usage: revert-check.py BASE HEAD [--days N] [--now EPOCH] [--event FILE] [--labels a,b]

Simulates the merge (git merge-tree --write-tree), blames on BASE every line the merge deletes, and
lists the lines last written within --days by a commit the branch did not start from and did not
make: the branch is HEAD's first-parent line back to the fork, its first commit on BASE's
first-parent line. Lines the branch started with are edits; lines that reached it only by merging
BASE, then went missing, are what a stale merge resolution undoes. The PR label `reverts-ok`, in
the event payload (--event, default $GITHUB_EVENT_PATH) or in --labels (default $LABELS), acknowledges them.
Exit 0: nothing flagged or acknowledged; 1: flagged; 2: the merge conflicts.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter

LABEL = 'reverts-ok'
HUNK = re.compile(r'^@@ -(\d+)(?:,(\d+))? ')


def git(repo, *args, ok=(0,)):
    proc = subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True)
    if proc.returncode not in ok:
        raise RuntimeError(f'git {" ".join(args)} failed: {proc.stderr.strip()}')
    return proc


def merge_tree(repo, base, head):
    proc = git(repo, 'merge-tree', '--write-tree', '--name-only', '--no-messages', base, head, ok=(0, 1))
    lines = proc.stdout.splitlines()
    if not lines or not re.fullmatch(r'[0-9a-f]{40,64}', lines[0]):
        raise RuntimeError(f'git merge-tree {base} {head} failed: {proc.stderr.strip()}')
    if proc.returncode == 0:
        return lines[0], []
    return lines[0], sorted(set(l for l in lines[1:] if l)) or ['(no conflicted file named)']


def unquote(name):
    if not (len(name) >= 2 and name[0] == name[-1] == '"'):
        return name
    out, i, body = bytearray(), 0, name[1:-1]
    escapes = {'a': 7, 'b': 8, 't': 9, 'n': 10, 'v': 11, 'f': 12, 'r': 13, '"': 34, '\\': 92}
    while i < len(body):
        c = body[i]
        if c != '\\':
            out += c.encode()
            i += 1
        elif body[i + 1] in escapes:
            out.append(escapes[body[i + 1]])
            i += 2
        else:
            out.append(int(body[i + 1:i + 4], 8))
            i += 4
    return out.decode('utf-8', 'surrogateescape')


def deleted_ranges(repo, base, tree):
    out = git(repo, 'diff', '-U0', '--find-renames', '--no-color', base, tree).stdout
    ranges, path, header = {}, None, False
    for line in out.splitlines():
        if line.startswith('diff --git '):
            path, header = None, True
        elif header and line.startswith('--- '):
            name = unquote(line[4:].rstrip('\t'))
            path = name[2:] if name.startswith('a/') else None
        elif line.startswith('@@'):
            header = False
            m = HUNK.match(line)
            if not (path and m):
                continue
            start, count = int(m.group(1)), int(m.group(2) if m.group(2) is not None else 1)
            if count:
                ranges.setdefault(path, []).append((start, count))
    return ranges


def blame(repo, base, path, ranges):
    args = ['blame', '--porcelain']
    for start, count in ranges:
        args += ['-L', f'{start},+{count}']
    out = git(repo, *args, base, '--', path).stdout
    return [l.split(' ', 1)[0] for l in out.splitlines() if re.match(r'^[0-9a-f]{40} \d+ \d+', l)]


def branch(repo, base, head):
    trunk = set(git(repo, 'rev-list', '--first-parent', base).stdout.split())
    own = set()
    for sha in git(repo, 'rev-list', '--first-parent', head).stdout.split():
        if sha in trunk:
            return own, sha
        own.add(sha)
    return own, None


def seen_at_fork(repo, sha, fork):
    return fork is not None and git(repo, 'merge-base', '--is-ancestor', sha, fork, ok=(0, 1)).returncode == 0


def recent_foreign_deletions(repo, base, head, days, now):
    tree, conflicts = merge_tree(repo, base, head)
    if conflicts:
        return None, conflicts
    own, fork = branch(repo, base, head)
    since = now - days * 86400
    foreign, hits = {}, Counter()
    for path, ranges in deleted_ranges(repo, base, tree).items():
        for sha in blame(repo, base, path, ranges):
            if sha not in foreign:
                recent = int(git(repo, 'show', '-s', '--format=%ct', sha).stdout) >= since
                foreign[sha] = recent and sha not in own and not seen_at_fork(repo, sha, fork)
            if foreign[sha]:
                hits[(path, sha)] += 1
    rows = []
    for (path, sha), count in hits.items():
        short, date, subject = git(repo, 'show', '-s', '--format=%h%x00%cs%x00%s', sha).stdout.rstrip('\n').split('\0')
        rows.append({'file': path, 'lines': count, 'commit': short, 'date': date, 'subject': subject})
    rows.sort(key=lambda r: (-r['lines'], r['file'], r['commit']))
    return rows, []


def labels(event_path):
    if not event_path or not os.path.exists(event_path):
        return set()
    with open(event_path) as f:
        event = json.load(f)
    return {l.get('name') for l in (event.get('pull_request') or {}).get('labels') or []}


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('base')
    p.add_argument('head')
    p.add_argument('--days', type=int, default=21)
    p.add_argument('--now', type=int, default=None)
    p.add_argument('--event', default=os.environ.get('GITHUB_EVENT_PATH'))
    p.add_argument('--labels', default=os.environ.get('LABELS', ''))
    p.add_argument('--repo', default='.')
    a = p.parse_args(argv)
    rows, conflicts = recent_foreign_deletions(a.repo, a.base, a.head, a.days, a.now if a.now is not None else int(time.time()))
    if conflicts:
        print(f'{a.head} does not merge cleanly into {a.base}; conflicts in:')
        for path in conflicts:
            print(f'  {path}')
        return 2
    if not rows:
        print(f'The merge into {a.base} deletes no line written in the last {a.days} days that this branch did not start from or write.')
        return 0
    print(f'The merge into {a.base} deletes lines written in the last {a.days} days that reached this branch only by merging {a.base}:')
    for r in rows:
        print(f"  {r['file']}: {r['lines']} line{'s' if r['lines'] != 1 else ''} from {r['commit']} {r['date']} {r['subject']}")
    if LABEL in labels(a.event) | set(a.labels.split(',')):
        print(f'Acknowledged by the {LABEL} label.')
        return 0
    print(f'If this pull request means to remove them, add the {LABEL} label and push or re-run all jobs; otherwise restore them on the branch.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
