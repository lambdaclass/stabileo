import argparse
import json
from pathlib import Path
import re


def first_boundary(revisions, evaluate, signature):
    baseline = signature(evaluate(0))
    for index in range(1, len(revisions)):
        if signature(evaluate(index)) != baseline:
            return index - 1, index
    return None


def check_suite(log, status, allow_failures=False):
    text = Path(log).read_text()
    summaries = re.findall(r'test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;', text)
    if len(summaries) != 1:
        raise ValueError(f'{log}: expected exactly one test summary')
    passed, failed, ignored = map(int, summaries[0])
    if passed + failed == 0:
        raise ValueError(f'{log}: no executed tests ({ignored} ignored)')
    if status != (101 if failed else 0) or failed and not allow_failures:
        raise ValueError(f'{log}: test command failed with status {status}, {failed} failures')
    return dict(passed=passed, failed=failed, ignored=ignored, executed=passed + failed)


def check_replay(source, target, additional=None):
    sources = {f.name: f for f in Path(source).glob('*.json')}
    if additional is not None:
        extras = {f.name: f for f in Path(additional).glob('*.json')}
        if sources.keys() & extras.keys():
            raise ValueError('overlapping replay manifests')
        sources.update(extras)
    targets = {f.name: f for f in Path(target).glob('*.json')}
    if not sources or sources.keys() != targets.keys():
        raise ValueError(f'replay manifest mismatch: {len(sources)} inputs, {len(targets)} outputs')
    for name, path in sources.items():
        expected = json.loads(path.read_text())
        actual = json.loads(targets[name].read_text())
        result = actual.get('result')
        if not isinstance(result, dict) or len(result) != 1 or not {'Ok', 'Err'} & result.keys():
            raise ValueError(f'{name}: missing or malformed result')
        actual.pop('result')
        expected.pop('result', None)
        if actual != expected:
            raise ValueError(f'{name}: replay changed input or provenance')
    return len(sources)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    suite = sub.add_parser('check-suite')
    suite.add_argument('log')
    suite.add_argument('status', type=int)
    suite.add_argument('--allow-failures', action='store_true')
    replay = sub.add_parser('check-replay')
    replay.add_argument('source')
    replay.add_argument('target')
    replay.add_argument('--additional')
    args = parser.parse_args()
    if args.command == 'check-suite':
        print(json.dumps(check_suite(args.log, args.status, args.allow_failures)))
    else:
        print('verified replay outputs', check_replay(args.source, args.target, args.additional))
