import importlib.util
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/verify-changes.py'
spec = importlib.util.spec_from_file_location('verify_changes', SCRIPT)
verify_changes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_changes)
select = verify_changes.select


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


def strip_test_modules(text):
    while (m := re.search(r'#\[cfg\(test\)\]\s*(pub\s+)?mod\s+\w+\s*\{', text)):
        depth, j = 0, m.end() - 1
        while True:
            depth += {'{': 1, '}': -1}.get(text[j], 0)
            if depth == 0:
                break
            j += 1
        text = text[:m.start()] + text[j + 1:]
    return text


def module_file(src, parts):
    for k in range(len(parts), 0, -1):
        for f in (src.joinpath(*parts[:k]).with_suffix('.rs'), src.joinpath(*parts[:k], 'mod.rs')):
            if f.exists():
                return f
    return None


def module_path(src, f):
    parts = list(f.relative_to(src).with_suffix('').parts)
    return parts[:-1] if parts[-1] in ('mod', 'lib') else parts


def references(text):
    for m in re.finditer(r'\b(crate|super(?:::super)*)::((?:\w+::)*)(\{|\w+|\*)', text):
        head = [p for p in m.group(2).split('::') if p]
        if m.group(3) != '{':
            yield m.group(1), head + ([m.group(3)] if m.group(3) != '*' else [])
            continue
        depth, j = 1, m.end()
        while depth:
            depth += {'{': 1, '}': -1}.get(text[j], 0)
            j += 1
        for item in use_tree(text[m.end():j - 1]):
            yield m.group(1), head + [p for p in item if p != 'self']


def use_tree(group):
    """The paths of a `{a, b::{c, d}}` use group's contents, innermost groups expanded."""
    items, depth, start = [], 0, 0
    for i, ch in enumerate(group + ','):
        depth += {'{': 1, '}': -1}.get(ch, 0)
        if ch == ',' and depth == 0:
            items.append(group[start:i].strip())
            start = i + 1
    for item in filter(None, items):
        prefix, _, rest = item.partition('{')
        parts = [p for p in prefix.split('::') if p and p != '*']
        if rest:
            yield from (parts + inner for inner in use_tree(rest.rsplit('}', 1)[0]))
        else:
            yield [p.split(' as ')[0].strip() for p in parts]


def harness_closure(src=ROOT / 'engine/src'):
    """Files of `src` the Kani harnesses reach: what they call, then everything those use outside tests."""
    text = strip_comments((src / 'kani_proofs.rs').read_text())
    local = set(re.findall(r'\b(?:fn|struct|enum|const|type)\s+(\w+)', text))
    defined = {}
    for f in src.rglob('*.rs'):
        for name in re.findall(r'\bfn\s+(\w+)', strip_comments(f.read_text())):
            defined.setdefault(name, set()).add(f)
    seeds, globbed = set(), []
    for kind, parts in references(re.sub(r'\buse\s+crate::[\w:]*::\*\s*;', '', text)):
        f = module_file(src, parts)
        if f is not None:
            seeds.add(f)
    for m in re.finditer(r'\buse\s+crate::((?:\w+::)*\w+)::\*', text):
        mod_file = module_file(src, m.group(1).split('::'))
        exported = re.findall(r'^\s*pub use (\w+)::', mod_file.read_text(), re.M)
        globbed += [module_file(src, m.group(1).split('::') + [e]) for e in exported] + [mod_file]
    for name in set(re.findall(r'(?<![.\w:])([a-z_]\w*)\s*\(', text)) - local:
        homes = defined.get(name, set())
        if not homes:
            continue
        found = homes & set(globbed)
        assert found, f'harness call {name}() into {sorted(map(str, homes))} not resolved through a crate import'
        seeds |= found
    seen, todo = {src / 'kani_proofs.rs'}, list(seeds)
    while todo:
        f = todo.pop()
        if f in seen:
            continue
        seen.add(f)
        body = strip_test_modules(strip_comments(f.read_text()))
        here = module_path(src, f)
        for kind, parts in references(body):
            base = [] if kind == 'crate' else here[:len(here) - kind.count('super')]
            target = module_file(src, base + parts)
            if target is not None:
                todo.append(target)
        if f.name in ('mod.rs', 'lib.rs'):
            todo += [t for e in re.findall(r'^\s*pub use (\w+)::', body, re.M) if (t := module_file(src, here + [e]))]
    return {f.relative_to(ROOT).as_posix() if f.is_relative_to(ROOT) else str(f) for f in seen}



class VerifyChanges(unittest.TestCase):
    def test_kani_runs_only_when_its_inputs_change(self):
        for paths, verify, kani in [
            (['engine/src/solver/buckling.rs'], True, False),
            (['engine/src/certify/buckling.rs', 'docs/verification/CONTAINMENT.md'], True, False),
            (['engine/tests/metamorphic/regressions.rs', 'web/src/App.svelte'], False, False),
            (['verify/Certify/Bundle.lean'], True, False),
            (['tools/symbolic/gen.py'], True, False),
            (['engine/src/kani_proofs.rs'], True, True),
            (['engine/src/element/frame.rs'], True, True),
            (['engine/src/linalg/amd.rs'], True, True),
            (['engine/src/types/input.rs'], True, True),
            (['engine/src/certify/interval.rs'], True, True),
            (['engine/src/certify/sparse.rs'], True, True),
            (['engine/src/lib.rs'], True, True),
            (['engine/Cargo.toml'], True, True),
            (['Cargo.lock'], True, True),
            (['engine/Cargo.lock'], False, True),
            (['Cargo.toml'], False, True),
            (['rust-toolchain.toml'], False, True),
            (['.cargo/config.toml'], False, True),
            (['engine/.cargo/config.toml'], False, True),
            (['engine/build.rs'], False, True),
            (['build.rs'], False, True),
            (['research/.cargo/config.toml'], False, False),
            (['flake.nix'], True, True),
            (['flake.lock'], True, True),
            (['scripts/kani-safe.sh'], True, True),
            (['scripts/kani-setup.sh'], True, True),
            (['.github/workflows/verify.yml'], True, True),
            (['.github/scripts/verify-changes.py'], True, True),
            (['web/src/App.svelte', 'engine/src/element/truss.rs'], True, True),
            (['research/Cargo.toml'], False, False),
            (['engine/src/linalgx.rs'], True, False),
        ]:
            with self.subTest(paths=paths):
                self.assertEqual(select(paths), {'verify': verify, 'kani': kani})

    def test_it_runs_everything_when_it_cannot_tell_what_changed(self):
        self.assertEqual(select([]), {'verify': True, 'kani': True})
        self.assertEqual(select(['']), {'verify': True, 'kani': True})
        listed = [f'web/src/f{i}.ts' for i in range(verify_changes.API_FILE_LIMIT)]
        self.assertEqual(select(listed), {'verify': True, 'kani': True})
        self.assertEqual(select(listed[:-1]), {'verify': False, 'kani': False})

    def test_the_script_prints_github_outputs(self):
        def run(text):
            return subprocess.run([sys.executable, '-I', str(SCRIPT)], input=text, capture_output=True, text=True, check=True).stdout
        self.assertEqual(run('web/src/App.svelte\n'), 'verify=false\nkani=false\n')
        self.assertEqual(run('engine/src/linalg/dense.rs\n'), 'verify=true\nkani=true\n')
        self.assertEqual(run('\n'), 'verify=true\nkani=true\n')
        self.assertEqual(run(''), 'verify=true\nkani=true\n')

    def test_everything_the_harnesses_reach_is_a_kani_input(self):
        reached = harness_closure()
        self.assertIn('engine/src/element/frame.rs', reached)
        self.assertIn('engine/src/certify/finite.rs', reached)
        self.assertEqual(sorted(p for p in reached if not verify_changes.kani_input(p)), [])

    def test_the_closure_follows_grouped_imports_super_and_reexports(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp)
            files = {
                'kani_proofs.rs': 'use crate::a::*;\nuse crate::b::helper;\nfn h() { top(); helper::x(); crate::c::d::f(); }\n',
                'a/mod.rs': 'mod top;\npub use top::*;\n',
                'a/top.rs': 'pub fn top() { super::near::g(); }\n#[cfg(test)]\nmod tests { use crate::only_tests::t; }\n',
                'a/near.rs': 'pub fn g() { crate::{e, f::{inner}}::x(); crate::r::thing(); }\nuse crate::{g, h::deep};\n',
                'r/mod.rs': 'mod sub;\npub use sub::*;\n', 'r/sub.rs': 'pub fn thing() {}\n',
                'b/helper.rs': 'pub fn x() {}\n', 'c/d.rs': 'pub fn f() {}\n', 'e.rs': '', 'f/inner.rs': '', 'f/mod.rs': '',
                'g.rs': '', 'h/deep.rs': '', 'only_tests.rs': '', 'unrelated.rs': 'pub fn top() {}\n',
            }
            for name, text in files.items():
                (src / name).parent.mkdir(parents=True, exist_ok=True)
                (src / name).write_text(text)
            reached = {pathlib.Path(p).relative_to(src).as_posix() for p in harness_closure(src)}
        self.assertEqual(reached, {'kani_proofs.rs', 'a/top.rs', 'a/near.rs', 'b/helper.rs', 'c/d.rs', 'e.rs',
                                   'f/inner.rs', 'g.rs', 'h/deep.rs', 'r/mod.rs', 'r/sub.rs'})

    def test_a_harness_call_into_the_engine_that_cannot_be_resolved_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = pathlib.Path(tmp)
            (src / 'kani_proofs.rs').write_text('fn h() { hidden(); }\n')
            (src / 'x.rs').write_text('pub fn hidden() {}\n')
            with self.assertRaises(AssertionError):
                harness_closure(src)

    def test_every_kani_input_module_exists(self):
        for path in verify_changes.KANI_MODULES:
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).exists(), path)

    def test_the_workflow_runs_kani_on_main_and_nightly_and_fails_closed(self):
        text = (ROOT / '.github/workflows/verify.yml').read_text()
        changes = text.split('\n  changes:\n', 1)[1].split('\n  lean:\n', 1)[0]
        self.assertIn('kani: ${{ steps.filter.outputs.kani }}', changes)
        self.assertIn('python3 -I .github/scripts/verify-changes.py <<<"$files" | tee -a "$GITHUB_OUTPUT"', changes)
        self.assertIn("if: github.event_name == 'pull_request' || github.event_name == 'merge_group'", changes)
        kani = text.split('\n  kani:\n', 1)[1]
        gate = re.search(r'^    if: (.+)$', kani, re.M).group(1)
        self.assertIn("(github.event_name != 'pull_request' && github.event_name != 'merge_group')", gate)
        self.assertIn("needs.changes.result != 'success'", gate)
        self.assertIn("needs.changes.outputs.kani != 'false'", gate)
        self.assertIn('schedule:', text.split('\njobs:\n', 1)[0])
        self.assertIn('branches: [main]', text.split('\njobs:\n', 1)[0])


if __name__ == '__main__':
    unittest.main()
