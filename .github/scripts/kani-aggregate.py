import pathlib
import sys


def check(root, total):
    problems = []
    for shard in range(1, total + 1):
        result_path = root / f'kani-result-{shard}' / 'result'
        if not result_path.is_file():
            problems.append(f'Kani shard {shard}/{total}: missing result')
            continue
        result = result_path.read_text().strip()
        if result != 'success':
            problems.append(f"Kani shard {shard}/{total}: {result or 'empty result'}")
    return problems


def main():
    if len(sys.argv) != 3:
        print('usage: kani-aggregate.py RESULTS_DIR SHARD_COUNT', file=sys.stderr)
        return 2
    total = int(sys.argv[2])
    if total < 1:
        print('SHARD_COUNT must be positive', file=sys.stderr)
        return 2
    problems = check(pathlib.Path(sys.argv[1]), total)
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print(f'All {total} Kani shards passed')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
