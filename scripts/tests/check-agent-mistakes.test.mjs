import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const lint = fileURLToPath(new URL('../check-agent-mistakes.mjs', import.meta.url));
const engine = 'web/src/lib/engine/support.ts';
const webTest = 'web/src/lib/model/support.test.ts';
const rust = 'engine/tests/support.rs';

function run(t, sources, allow = '') {
  const root = mkdtempSync(join(dirname(lint), '.agent-lint-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, source] of Object.entries({ ...sources, 'scripts/agent-mistakes-allow.txt': allow })) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  const result = spawnSync(process.execPath, [lint, '--root', root], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

function passes(result) {
  assert.equal(result.status, 0, result.stderr);
}

function rejects(result, pattern, count) {
  assert.equal(result.status, 1, result.stderr);
  const hits = result.stderr.split('\n').filter(line => line.includes(pattern));
  assert.equal(hits.length, count, result.stderr);
}

test.skip('known wrong result: #2276 — rejects a fixed-restraint default for an unknown support', t => {
  rejects(run(t, { [engine]: `
    function supportDofs(type: string) {
      switch (type) {
        case 'pinned': return { rotation: false };
        default: return { rotation: true };
      }
    }
  ` }), '[switch-default]', 1);
});

test('rejects assignments and fall-through defaults across all three directories', t => {
  rejects(run(t, {
    [engine]: `switch (x) { default: case 'fixed': mask = fixed; break; }`,
    'web/src/lib/model/mask.ts': `switch (x) { default: { if (p) mask.rotation ||= true; break; } }`,
    'web/src/lib/store/mask.svelte.ts': `switch (x) { default: count++; }`,
  }), '[switch-default]', 3);
});

test('accepts refusal, never checks and normal cases without inspecting nested functions as returns', t => {
  passes(run(t, { [engine]: `
    function parse(kind: string) {
      switch (kind) {
        case 'pinned': return 1;
        default: { function debug() { return 1; } throw new Error(kind); }
      }
    }
    function refuse(kind: string) {
      switch (kind) { case 'pinned': doWork(); break; default: return; }
    }
    function checked(kind: 'fixed' | 'pinned') {
      switch (kind) {
        case 'fixed': return 1;
        case 'pinned': return 2;
        default: return kind satisfies never;
      }
    }
    const example = 'default: return 1;';
  `, 'web/src/ui/view.ts': `switch (kind) { default: return aLabel; }` }));
});

test('rejects silent skips, including alias, parameterized and conditional forms', t => {
  rejects(run(t, { [webTest]: `
    import { it as spec, test, describe } from 'vitest';
    spec['skip']('pending', () => {});
    test.skip.each([1, 2])('matrix %s', () => {});
    describe.skip('suite', () => {});
    spec.skipIf(true)('conditional', () => {});
    const skipped = test.skip;
    skipped('alias', () => {});
    test.skip('known wrong result: #', () => {});
    test.skip('known wrong result: #2276x', () => {});
  ` }), '[test-skip]', 7);
});

test('accepts issue-tagged names and ignores comments, strings and other objects', t => {
  passes(run(t, { [webTest]: `
    import { it, test, describe } from 'vitest';
    const name = 'known wrong result: #2276 — condition';
    it.skipIf(someFeature)(name, () => {});
    test.skip.each([1])('matrix: known wrong result: #2276', () => {});
    describe.skip('known wrong result: #2276', () => {});
    it('runs normally', () => {});
    // it.skip('example', () => {});
    const text = "test.skip('example')";
    const result = { skip() {} };
    result.skip('unrelated');
  ` }));
});

test('rejects Rust ignores without an issue, including cfg_attr', t => {
  rejects(run(t, { [rust]: `
    #[test]
    #[ignore]
    fn one() {}
    #[ignore = "temporary"]
    #[test]
    fn two() {}
    #[cfg_attr(not(feature = "fast"), ignore = r#"not fixed"#)]
    #[test]
    fn three() {}
  ` }), '[test-skip]', 3);
});

test('accepts Rust issue tags and ignores attributes in nested comments and raw strings', t => {
  passes(run(t, { [rust]: `
    /* nested /* comment */ #[ignore] */
    const SAMPLE: &str = r##"#[ignore = "example"]"##;
    #[ignore = "known wrong result: #2276"]
    #[test]
    fn one() {}
    #[cfg_attr(feature = "fast", ignore = r#"known wrong result: #2276"#)]
    #[test]
    fn two() {}
  ` }));
});

test('rejects environment-controlled registration, mode and skip, even for an issue-tagged title', t => {
  rejects(run(t, { [webTest]: `
    import { it, test, describe } from 'vitest';
    const direct = process.env.FAST ? it : it.skip;
    direct('known wrong result: #2276', () => {});
    const { ENABLED: enabled } = process['env'];
    describe.runIf(enabled)('suite', () => {});
    const env = import.meta.env;
    const disabled = env['VITE_DISABLE'];
    if (!disabled) test('registered conditionally', () => {});
    const e = process.env;
    e.ALSO && it('short-circuited', () => {});
    it('declared, but can silently return', () => { if (process.env.BYPASS) return; expect(1).toBe(1); });
    it.skipIf(process.env.RUN_KNOWN_WRONG)('known wrong result: #2276', () => {});
  ` }), '[test-env]', 6);
});

test('accepts ordinary env reads and only the issue-matched RUN_KNOWN_WRONG idiom', t => {
  passes(run(t, { [webTest]: `
    import { it } from 'vitest';
    const regression = process.env.RUN_KNOWN_WRONG === '2276' ? it : it.skip;
    regression('known wrong result: #2276 — exact model', () => {});
    it('checks env without changing whether it runs', () => {
      if (process.env.DEBUG) console.log('diagnostics');
      expect(process.env.FORMAT ?? 'model').toBe('model');
    });
  ` }));
  rejects(run(t, { [webTest]: `
    const regression = process.env.RUN_KNOWN_WRONG === '2276' ? it : it.skip;
    regression('known wrong result: #2277 — unrelated', () => {});
  ` }), '[test-env]', 1);
});

test('allowances require a reason, match individual occurrences and must stay current', t => {
  const source = { [engine]: 'switch (axis) { default: return 1; }' };
  const entry = `switch-default ${engine}: return 1;`;
  passes(run(t, source, `## Documented constant for this external format.\n${entry}\n`));
  rejects(run(t, source, `${entry}\n`), 'no "## reason"', 1);
  rejects(run(t, { [engine]: source[engine].repeat(2) }, `## Reviewed.\n${entry}\n`), '[switch-default]', 1);
  rejects(run(t, { [engine]: source[engine].replace('return 1;', 'throw Error();') }, `## Reviewed.\n${entry}\n`), 'no longer matches', 1);
});
