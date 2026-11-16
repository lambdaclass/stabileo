import argparse
import json
import math
from pathlib import Path
import re


def paired_endpoint_keys(before, after):
    names = before.keys() | after.keys()
    missing_before = sorted(names - before.keys())
    missing_after = sorted(names - after.keys())
    if not names or missing_before or missing_after:
        raise ValueError(f'endpoint identity mismatch: missing baseline={missing_before}, missing head={missing_after}, empty={not names}')
    return sorted(names)


def gallery_reference_comparisons(case, before, after):
    def numeric(value):
        return type(value) in (int, float) and math.isfinite(value)

    def indexed(readouts):
        result = {}
        for row in readouts:
            key = row.get('key')
            if not isinstance(key, str) or not key or key in result:
                raise ValueError(f'{case}: missing or duplicate readout identity: {key}')
            if 'reference' in row:
                reference = row['reference']
                if (not isinstance(reference, dict) or not numeric(reference.get('value'))
                        or not isinstance(reference.get('source'), str) or not reference['source']
                        or not numeric(row.get('value'))):
                    raise ValueError(f'{case}: invalid reference evidence: {key}')
            result[key] = row
        return result

    a, b = indexed(before), indexed(after)
    comparisons, changed_targets = [], []
    for key in sorted(a.keys() | b.keys()):
        ar, br = a.get(key, {}).get('reference'), b.get(key, {}).get('reference')
        if ar is None and br is None:
            continue
        if ar != br:
            changed_targets.append(dict(case=case, quantity=key, before_reference=ar, after_reference=br))
            continue
        av, bv, reference = a[key]['value'], b[key]['value'], ar['value']
        comparisons.append(dict(case=case, quantity=key, before=av, after=bv, reference=reference,
                                source=ar['source'], before_error=abs(av-reference), after_error=abs(bv-reference)))
    return comparisons, changed_targets


def measurement_index(records):
    indexed = {}
    for record in records:
        test, site = record.get('test'), record.get('site')
        if not isinstance(test, str) or not test or not isinstance(site, str) or not site:
            raise ValueError('measurement requires nonempty test and site')
        selector = record.get('selector')
        if selector is not None and (not isinstance(selector, dict) or not selector):
            raise ValueError('measurement selector must be a nonempty object')
        key = (test, site, json.dumps(selector, sort_keys=True, separators=(',', ':'), allow_nan=False))
        if key in indexed:
            raise ValueError(f'duplicate measurement identity: {key}; capture an explicit selector for every loop measurement')
        indexed[key] = record
    return indexed


def first_boundary(revisions, evaluate, signature):
    baseline = signature(evaluate(0))
    for index in range(1, len(revisions)):
        if signature(evaluate(index)) != baseline:
            return index - 1, index
    return None


def engineering_signature(value):
    if isinstance(value, dict):
        return {key: engineering_signature(item) for key, item in value.items()
                if key not in {'timings', 'elapsedMs', 'elapsed', 'solveTimeMs', 'solverRunMeta'}}
    if isinstance(value, list):
        return [engineering_signature(item) for item in value]
    return value


def quantity_boundaries(revisions, evaluate, select):
    baseline = engineering_signature(select(evaluate(0)))
    boundaries = {}
    missing = object()
    for index in range(1, len(revisions)):
        current = engineering_signature(select(evaluate(index)))
        for quantity in baseline.keys() | current.keys():
            if quantity not in boundaries and baseline.get(quantity, missing) != current.get(quantity, missing):
                boundaries[quantity] = dict(parent=revisions[index - 1], first_change=revisions[index])
    return dict(sorted(boundaries.items()))


def contributing_tests(record):
    return sorted(set(record.get('tests', []) + ([record['test']] if record.get('test') else [])))


def merge_input_records(previous, incoming):
    for field in ['analysis', 'input']:
        if previous[field] != incoming[field]:
            raise ValueError(f'input identity collision: {field}')
    tests = sorted(set(contributing_tests(previous) + contributing_tests(incoming)))
    if not tests:
        raise ValueError('input has no contributing tests')
    merged = {key: value for key, value in incoming.items() if key != 'result'}
    merged.update(test=tests[0], tests=tests)
    return merged


def failure_inventory(text, failed):
    names = set(re.findall(r'^test (\S+) \.\.\. FAILED$', text, re.MULTILINE))
    for footer in re.findall(r'^failures:\n((?:[ \t]*\n|[ \t]+\S+\n)+)', text, re.MULTILINE):
        names.update(line.strip() for line in footer.splitlines() if line.strip())
    if names and len(names) != failed:
        raise ValueError(f'failure inventory has {len(names)} names for {failed} failures')
    if failed and not names:
        return dict(failed_tests=None, failed_tests_unavailable='Log has a failure count but no test names')
    return dict(failed_tests=sorted(names))


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
    return dict(passed=passed, failed=failed, ignored=ignored, executed=passed + failed, **failure_inventory(text, failed))


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
