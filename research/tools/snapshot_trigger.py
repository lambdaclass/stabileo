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


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('before')
    parser.add_argument('after')
    args = parser.parse_args()
    def read(ref):
        return subprocess.check_output(['git', 'show', f'{ref}:research/papers.yaml'], text=True)
    print(str(changed(read(args.before), read(args.after))).lower())
