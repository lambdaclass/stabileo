import argparse
import pathlib
import re
import sys

HEADER = ['Technique', 'What bug class it catches', 'Where it lives',
          'CI job or make target that runs it', 'How often']


def cells(line):
    return [cell.strip() for cell in line.strip().strip('|').split('|')]


def references(cell):
    values = re.findall(r'`([^`]+)`', cell)
    return values if values and not re.sub(r'`[^`]+`', '', cell).strip(' ,') else []


def check(root):
    lines = (root / 'testing/README.md').read_text().splitlines()
    headers = [i for i, line in enumerate(lines) if line.startswith('|') and cells(line) == HEADER]
    if len(headers) != 1:
        return ['expected one testing map table']
    start = headers[0] + 1
    if start >= len(lines) or len(cells(lines[start])) != len(HEADER) or not all(
            re.fullmatch(r':?-+:?', cell) for cell in cells(lines[start])):
        return ['invalid testing map table separator']
    targets = set()
    for match in re.finditer(r'^([\w.%/-]+(?:[ \t]+[\w.%/-]+)*)[ \t]*:(?![=])',
                             (root / 'Makefile').read_text(), re.M):
        targets.update(match[1].split())
    problems = []
    rows = 0
    for number in range(start + 1, len(lines)):
        if not lines[number].startswith('|'):
            break
        row = cells(lines[number])
        rows += 1
        prefix = f'testing/README.md:{number + 1}: '
        if len(row) != len(HEADER) or not all(row):
            problems.append(prefix + 'expected five nonempty cells')
            continue
        paths = references(row[2])
        if not paths:
            problems.append(prefix + 'path cell must list paths in backticks')
        for path in paths:
            candidate = pathlib.Path(path)
            if candidate.is_absolute() or '..' in candidate.parts or not (root / candidate).exists():
                problems.append(prefix + f'missing path: {path}')
        runners = references(row[3])
        if not runners:
            problems.append(prefix + 'runner cell must list make targets or CI jobs in backticks')
        for runner in runners:
            target = re.fullmatch(r'make ([\w.-]+)', runner)
            job = re.fullmatch(r'([\w.-]+\.ya?ml):([\w-]+)', runner)
            if target:
                if target[1] not in targets:
                    problems.append(prefix + f'unknown make target: {target[1]}')
            elif job:
                workflow = root / '.github/workflows' / job[1]
                if not workflow.is_file():
                    problems.append(prefix + f'missing workflow: {job[1]}')
                    continue
                text = workflow.read_text()
                section = re.search(r'^jobs:[ \t]*\n', text, re.M)
                jobs = set(re.findall(r'^  ([\w-]+):[ \t]*(?:\n|$)', text[section.end():], re.M)) if section else set()
                if job[2] not in jobs:
                    problems.append(prefix + f'unknown CI job: {runner}')
            else:
                problems.append(prefix + f'invalid runner: {runner}')
    if not rows:
        problems.append('testing map table has no techniques')
    return problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        problems = check(args.root)
    except OSError as exc:
        problems = [str(exc)]
    for problem in problems:
        print(problem, file=sys.stderr)
    return int(bool(problems))


if __name__ == '__main__':
    sys.exit(main())
