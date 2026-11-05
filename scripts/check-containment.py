#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import sys

# TRIAGE: a reported wrong result whose cause (model setup or engine) is not yet confirmed;
# it gets WARN/REFUSE within 24 h of confirmation.
MODES = {'WARN', 'REFUSE', 'SCOPE', 'CORRECTED', 'PARTIAL', 'TRIAGE'}


def decisions(text):
    recorded = {}
    for line in text.splitlines():
        if not line.startswith('| #'):
            continue
        cells = [cell.strip() for cell in line.split('|')[1:-1]]
        if len(cells) != 5 or not re.fullmatch(r'#\d+(?:, #\d+)*', cells[0]):
            raise ValueError(f'Invalid containment row: {line}')
        numbers = [int(n.strip()[1:]) for n in cells[0].split(',')]
        modes = set(cells[2].split(' / '))
        if any(number <= 0 or number in recorded for number in numbers) or not modes or not modes <= MODES:
            raise ValueError(f'Invalid or duplicate containment decision: {line}')
        active = bool(modes & {'WARN', 'REFUSE'})
        if active and not re.fullmatch(r'`[^`]+`(?: / `[^`]+`)*', cells[1]):
            raise ValueError(f'Missing containment id: {line}')
        for number in numbers:
            recorded[number] = modes
    if not recorded:
        raise ValueError('Empty containment ledger')
    return recorded


def audit(recorded, issues):
    indexed = {}
    for issue in issues:
        if not isinstance(issue, dict) or type(issue.get('number')) is not int or issue['number'] <= 0 or issue.get('state') not in ('open', 'closed') or not isinstance(issue.get('labels'), list):
            raise ValueError('Invalid issue response')
        if not all(isinstance(label, dict) and isinstance(label.get('name'), str) for label in issue['labels']):
            raise ValueError('Invalid issue labels')
        if issue['number'] in indexed:
            raise ValueError('Duplicate issue response')
        if 'pull_request' not in issue:
            indexed[issue['number']] = issue
    problems = []
    for number, issue in indexed.items():
        if issue['state'] == 'open' and any(label.get('name') == 'safety' for label in issue['labels']) and (number not in recorded or 'TRIAGE' in recorded[number]):
            problems.append(f'#{number}: no completed containment decision')
    for number, modes in recorded.items():
        if modes & {'WARN', 'REFUSE'}:
            if number not in indexed:
                problems.append(f'#{number}: active containment issue missing from response')
            elif indexed[number]['state'] == 'closed':
                problems.append(f'#{number}: CLOSED issue still has active containment')
    return problems


CLOSING = re.compile(r'\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+(?:lambdaclass/stabileo)?#(\d+)\b', re.IGNORECASE)
REPORT_TITLE = 'Safety containment audit: open safety issues without a decision'
LEDGER = 'docs/verification/CONTAINMENT.md'


def closed_by(texts):
    return sorted({int(n) for text in texts for n in CLOSING.findall(text or '')})


def change_problems(base, head, closes):
    problems = [f'#{n}: its containment row was removed' for n in sorted(set(base) - set(head))]
    for n in closes:
        if n in head and head[n] & {'WARN', 'REFUSE', 'TRIAGE'}:
            problems.append(f'#{n}: closed by this change while its row is {" / ".join(sorted(head[n]))}')
    return problems


def report_body(problems):
    lines = ['Open safety issues need a completed decision in docs/verification/CONTAINMENT.md, and an issue with an active (WARN/REFUSE) row must stay open.', '']
    return '\n'.join(lines + [f'- {p}' for p in problems]) + '\n'


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def check_change(base_ref, event_path):
    root = Path(__file__).resolve().parents[1]
    head = decisions((root / LEDGER).read_text())
    shown = subprocess.run(['git', 'show', f'{base_ref}:{LEDGER}'], cwd=root, capture_output=True, text=True)
    base = decisions(shown.stdout) if shown.returncode == 0 else {}
    texts = [git('-C', str(root), 'log', '--format=%B', f'{base_ref}..HEAD')]
    if event_path:
        pr = json.loads(Path(event_path).read_text()).get('pull_request') or {}
        texts += [pr.get('title'), pr.get('body')]
    return change_problems(base, head, closed_by(texts))


def live_issues():
    result = subprocess.run(
        ['gh', 'api', '--paginate', '--slurp',
         'repos/lambdaclass/stabileo/issues?state=all&per_page=100'],
        check=True, capture_output=True, text=True,
    )
    pages = json.loads(result.stdout)
    if not isinstance(pages, list) or not all(isinstance(page, list) for page in pages):
        raise ValueError('Invalid paginated issue response')
    return [issue for page in pages for issue in page]


def file_report(problems):
    found = json.loads(subprocess.run(
        ['gh', 'issue', 'list', '--repo', 'lambdaclass/stabileo', '--state', 'open', '--search', f'in:title "{REPORT_TITLE}"', '--json', 'number,title'],
        check=True, capture_output=True, text=True).stdout)
    open_reports = [i['number'] for i in found if i['title'] == REPORT_TITLE]
    if problems:
        body = report_body(problems)
        if open_reports:
            subprocess.run(['gh', 'issue', 'edit', str(open_reports[0]), '--repo', 'lambdaclass/stabileo', '--body', body], check=True)
        else:
            subprocess.run(['gh', 'issue', 'create', '--repo', 'lambdaclass/stabileo', '--title', REPORT_TITLE, '--body', body, '--assignee', 'unbalancedparentheses,Batuis'], check=True)
    for number in open_reports if not problems else []:
        subprocess.run(['gh', 'issue', 'close', str(number), '--repo', 'lambdaclass/stabileo', '--comment', 'Every open safety issue has a decision again.'], check=True)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Without --live: checks the ledger and what this change does to it (no network). With --live: audits the ledger against the issue list.')
    parser.add_argument('--base', default='origin/main', help='commit the change is measured against')
    parser.add_argument('--event', help='GitHub event JSON; a pull request title and body are scanned for closing keywords')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--file-issue', action='store_true', help='with --live: open, update or close the report issue')
    args = parser.parse_args()
    if args.live:
        recorded = decisions((Path(__file__).resolve().parents[1] / LEDGER).read_text())
        problems = audit(recorded, live_issues())
        if args.file_issue:
            file_report(problems)
    else:
        problems = check_change(args.base, args.event)
    for problem in problems:
        print(problem)
    if not problems:
        print('Containment ledger consistent.')
    return bool(problems) and not args.file_issue


if __name__ == '__main__':
    sys.exit(main())
