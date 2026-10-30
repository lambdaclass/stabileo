import argparse
import subprocess
import yaml


def versions(text):
    papers = yaml.safe_load(text)['papers']
    result = {}
    for paper in papers:
        key = paper['id']
        if key in result:
            raise ValueError(f'duplicate experiment: {key}')
        result[key] = paper.get('version')
    return result


def changed(before, after):
    old, new = versions(before), versions(after)
    return any(old.get(key) != new.get(key) for key in old.keys() | new.keys())


def read(ref, missing_ok=False):
    subprocess.check_call(['git', 'rev-parse', '--verify', f'{ref}^{{commit}}'], stdout=subprocess.DEVNULL)
    paths = subprocess.check_output(['git', 'ls-tree', '--name-only', ref, '--', 'research/papers.yaml'], text=True)
    if missing_ok and not paths.strip():
        return 'papers: []'
    return subprocess.check_output(['git', 'show', f'{ref}:research/papers.yaml'], text=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('before')
    parser.add_argument('after')
    args = parser.parse_args()
    print(str(changed(read(args.before, missing_ok=True), read(args.after))).lower())
