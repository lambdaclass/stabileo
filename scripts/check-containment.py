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


def main():
    ledger = Path(__file__).resolve().parents[1] / 'docs/verification/CONTAINMENT.md'
    recorded = decisions(ledger.read_text())
    result = subprocess.run(
        ['gh', 'api', '--paginate', '--slurp',
         'repos/lambdaclass/stabileo/issues?state=all&per_page=100'],
        check=True, capture_output=True, text=True,
    )
    pages = json.loads(result.stdout)
    if not isinstance(pages, list) or not all(isinstance(page, list) for page in pages):
        raise ValueError('Invalid paginated issue response')
    problems = audit(recorded, [issue for page in pages for issue in page])
    for problem in problems:
        print(problem)
    if not problems:
        print('All open safety issues have decisions; all active containments name open issues.')
    return bool(problems)


if __name__ == '__main__':
    sys.exit(main())
