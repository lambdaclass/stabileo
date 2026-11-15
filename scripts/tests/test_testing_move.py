import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('docs_links', ROOT / 'scripts/check-docs-links.py')
LINKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LINKS)


def markdown_evidence(data):
    lines = []
    fence = None
    for line in data.decode().splitlines(keepends=True):
        marker = re.match(r'^ {0,3}(`{3,}|~{3,})', line)
        if marker:
            if fence is None:
                fence = marker[1]
            elif marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            lines.append(line)
            continue
        if fence is None:
            code = [m.span() for m in re.finditer(r'(`+).*?\1', line)]

            def replace(match):
                if any(start <= match.start() < end for start, end in code):
                    return match[0]
                return match[1] + '<destination>' + match[3]

            line = re.sub(r'(!?\[[^\]\n]*\]\()([^\n)]+)(\))', replace, line)
        lines.append(line)
    return ''.join(lines).encode()


class AuditEvidence(unittest.TestCase):
    def test_recorded_bytes_survive_the_move(self):
        manifest = json.loads((ROOT / 'scripts/tests/fixtures/testing-move-evidence.json').read_text())
        for name, expected in manifest['sha256'].items():
            with self.subTest(record=name):
                data = (ROOT / 'testing/docs/audits' / name).read_bytes()
                if name.endswith('.md'):
                    data = markdown_evidence(data)
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected, name)

    def test_only_markdown_destinations_are_excluded_from_evidence_hashes(self):
        a = b'[fixture](old.json)\n`e[fn](n)`\n```js\ne[fn](n)\n```\n'
        self.assertEqual(markdown_evidence(a), markdown_evidence(a.replace(b'old.json', b'new.json')))
        self.assertNotEqual(markdown_evidence(a), markdown_evidence(a.replace(b'e[fn](n)', b'e[fn](../n)')))
        self.assertNotEqual(markdown_evidence(a), markdown_evidence(a.replace(b'fixture', b'changed')))


class DocumentationLinks(unittest.TestCase):
    def check(self, target):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            root = pathlib.Path(tmp)
            (root / 'docs').mkdir()
            (root / 'testing/docs').mkdir(parents=True)
            (root / 'docs/source.md').write_text('[target](../testing/docs/target.md#missing)\n')
            (root / 'testing/docs/target.md').write_text(target)
            return LINKS.check(root), subprocess.run(
                [sys.executable, '-B', '-I', str(ROOT / 'scripts/check-docs-links.py'), '--root', str(root)],
                capture_output=True, text=True)

    def test_fenced_anchors_do_not_satisfy_a_link(self):
        targets = [f'{fence}\n{anchor}\n{fence[:3]}\n'
                   for fence in ('```html', '~~~html')
                   for anchor in ('<a id="missing"></a>', "<a name='missing'></a>", '# missing')]
        targets += ['`<a id="missing"></a>`\n', "`<a name='missing'></a>`\n"]
        for target in targets:
            with self.subTest(target=target):
                (count, problems), result = self.check(target)
                self.assertEqual(count, 1)
                self.assertEqual(problems, ['docs/source.md: missing heading ../testing/docs/target.md#missing'])
                self.assertEqual(result.returncode, 1, result.stdout)

    def test_real_anchors_and_headings_still_satisfy_a_link(self):
        for anchor in ('<a id="missing"></a>', "<a name='missing'></a>", '# missing'):
            with self.subTest(anchor=anchor):
                (count, problems), result = self.check(f'```html\n<a id="example"></a>\n```\n{anchor}\n')
                self.assertEqual((count, problems), (1, []))
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_links_inside_code_are_not_checked(self):
        self.assertEqual(list(LINKS.destinations('```md\n[example](absent.md)\n```\n`[example](absent.md)`\n')), [])


class DashboardSnapshots(unittest.TestCase):
    def carry_over(self, paths, available=True):
        workflow = (ROOT / '.github/workflows/verification-dashboard.yml').read_text()
        block = workflow.split('      - name: Carry over release snapshots of the pending automation PR\n', 1)[1]
        block = block.split('        run: |\n', 1)[1].split('      # A release snapshot', 1)[0]
        block = '\n'.join(line[10:] for line in block.splitlines())
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            root = pathlib.Path(tmp)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)

            def tree(entries):
                return subprocess.check_output(['git', 'mktree'], cwd=root, input=entries.encode()).decode().strip()

            entries = []
            for directory, content in paths.items():
                blob = subprocess.check_output(['git', 'hash-object', '-w', '--stdin'], cwd=root, input=content).decode().strip()
                oid = tree(f'100644 blob {blob}\tv0.2.0.json\n')
                parts = directory.split('/')
                for part in reversed(parts[1:]):
                    oid = tree(f'040000 tree {oid}\t{part}\n')
                entries.append(f'040000 tree {oid}\t{parts[0]}\n')
            revision = tree(''.join(entries))
            bindir = root / 'bin'
            bindir.mkdir()
            git = shutil.which('git')
            wrapper = bindir / 'git'
            wrapper.write_text(f'#!/bin/sh\nif [ "$1" = fetch ]; then\n  [ "$SNAPSHOT_AVAILABLE" = true ] || exit 1\n  printf "%s\\n" "$SNAPSHOT_REVISION" > .git/FETCH_HEAD\n  exit 0\nfi\nexec {git} "$@"\n')
            wrapper.chmod(0o755)
            destination = root / 'testing/docs/releases'
            destination.mkdir(parents=True)
            (destination / 'retained.json').write_text('retained\n')
            env = dict(os.environ, PATH=str(bindir) + os.pathsep + os.environ['PATH'], SNAPSHOT_REVISION=revision, SNAPSHOT_AVAILABLE=str(available).lower())
            result = subprocess.run(['bash', '-eu', '-o', 'pipefail', '-c', block], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((destination / 'retained.json').read_text(), 'retained\n')
            self.assertFalse((root / 'docs/verification/releases').exists())
            return {p.name: p.read_bytes() for p in destination.iterdir()}

    def test_pending_pr_with_old_snapshot_path_keeps_its_snapshots(self):
        snapshot = b'{"release":"old"}\n'
        files = self.carry_over({'docs/verification/releases': snapshot})
        self.assertEqual(files.get('v0.2.0.json'), snapshot)

    def test_pending_pr_with_new_snapshot_path_keeps_its_snapshots(self):
        snapshot = b'{"release":"new"}\n'
        files = self.carry_over({'testing/docs/releases': snapshot})
        self.assertEqual(files.get('v0.2.0.json'), snapshot)

    def test_new_snapshot_directory_takes_precedence(self):
        old, new = b'{"release":"old"}\n', b'{"release":"new"}\n'
        files = self.carry_over({'docs/verification/releases': old, 'testing/docs/releases': new})
        self.assertEqual(files.get('v0.2.0.json'), new)

    def test_missing_branch_or_snapshot_directory_keeps_current_snapshots(self):
        for available in (False, True):
            with self.subTest(available=available):
                self.assertEqual(self.carry_over({}, available), {'retained.json': b'retained\n'})


if __name__ == '__main__':
    unittest.main()
