import base64
import difflib
import hashlib
import json
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'web/config/pro-plates-off.json'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def lines(data):
    return data.decode().split('\n')


def main(base):
    flags = json.loads(git('show', f'{base}:web/config/features.json'))
    if any('proPlatesUnified' in row for row in flags.values()):
        raise SystemExit('The disabled profile requires a main revision from before the unified plates integration.')
    paths = git('diff', '--name-status', '--no-renames', '-z', base, '--', 'web/src').decode().split('\0')
    entries = {}
    for status, path in zip(paths[0:-1:2], paths[1:-1:2], strict=True):
        if '/__tests__/' in path:
            continue
        name = path.removeprefix('web/')
        if status == 'A':
            entries[name] = None
            continue
        before = git('show', f'{base}:{path}')
        if status == 'D':
            entries[name] = {'original': before.decode()}
            continue
        assert status == 'M', (status, path)
        current = (ROOT / path).read_bytes()
        old_lines = lines(before)
        changes = [
            [start, end - start, old_lines[first:last]]
            for op, start, end, first, last in difflib.SequenceMatcher(None, lines(current), old_lines, autojunk=False).get_opcodes()
            if op != 'equal'
        ]
        entries[name] = {'source': sha(current), 'original': sha(before), 'changes': changes}
    registry = subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import { readRegistryAt } from './web/scripts/result-changes/registry.mjs';"
        "const registry = readRegistryAt(process.argv[1]);"
        "if (!registry) throw new Error('Missing base results registry');"
        "process.stdout.write(JSON.stringify(registry));", base,
    ], cwd=ROOT)
    data = {
        'base': git('rev-parse', base).decode().strip(),
        'resultsRegistry': base64.b64encode(zlib.compress(registry, level=9)).decode(),
        'files': entries,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main(sys.argv[1])
