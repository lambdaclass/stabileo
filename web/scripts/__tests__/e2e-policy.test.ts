import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectE2E, SMOKE_PATTERN, SMOKE_TIMEOUT_MS } from '../e2e-policy';

const web = fileURLToPath(new URL('../../', import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}
const findings = files(join(web, 'e2e')).map(file => inspectE2E(readFileSync(file, 'utf8'), relative(web, file)));

it('every static E2E JSON import uses with { type: json }', () => {
  expect(findings.flatMap(f => f.jsonImports), 'JSON imports missing with { type: \'json\' } (file:line)').toEqual([]);
});
it('smoke specs respect the test budget and document individual wait exceptions', () => {
  expect(findings.flatMap(f => f.smokeTimeouts), `Invalid smoke budgets (cap ${SMOKE_TIMEOUT_MS} ms); only individual waits may use // slow-ok: <reason>`).toEqual([]);
});

describe('policy regression cases', () => {
  it.each(['0', '45_001', '120_000'])('rejects test.info().setTimeout(%s) even with an exception', timeout => {
    const call = `test.info().setTimeout(${timeout});`;
    expect(inspectE2E(`test('@smoke example', () => { ${call} });`).smokeTimeouts).toEqual(['spec.ts:1']);
    expect(inspectE2E(`test('@smoke example', () => {
      ${call} // slow-ok: live solve
    });`).smokeTimeouts).toEqual(['spec.ts:2']);
    for (const reason of ['', ' // slow-ok:', " const reason = '// slow-ok: fake';"]) {
      expect(inspectE2E(`test('@smoke example', () => {
        // slow-ok: previous line is insufficient
        ${call}${reason}
      });`).smokeTimeouts).toEqual(['spec.ts:3']);
    }
    for (const tag of ['@slow', '@flaky']) {
      expect(inspectE2E(`test('@smoke check', () => {});
        test.describe('${tag} journey', () => { test('long test', () => { ${call} }); });
      `).smokeTimeouts).toEqual([]);
    }
  });
  it.each([
    'test.setTimeout(VALUE)', 'testInfo.setTimeout(VALUE)', 'info.setTimeout(VALUE)',
    'test.info().setTimeout(VALUE)', 'test.describe.configure({ timeout: VALUE })',
  ])('enforces literal capped budgets for %s despite exceptions', call => {
    for (const value of ['0', '60_000', '60 * 1000', 'LIMIT', '(60_000)', '(0)']) {
      expect(inspectE2E(`const LIMIT = 60_000;
        test('@smoke check', () => {
          ${call.replace('VALUE', value)}; // slow-ok: live solve
        });`).smokeTimeouts).toEqual(['spec.ts:3']);
    }
    for (const value of ['1', '45_000', '(45_000)']) {
      expect(inspectE2E(`test('@smoke check', () => { ${call.replace('VALUE', value)}; });`).smokeTimeouts).toEqual([]);
    }
  });
  it('does not exempt test.slow with a documented reason', () => {
    expect(inspectE2E(`test('@smoke check', () => {
      test.slow(); // slow-ok: live solve
    });`).smokeTimeouts).toEqual(['spec.ts:2']);
  });
  it.each(['test', 'test.describe'])('ignores annotation tag text in %s scopes', scope => {
    for (const tag of ['@slow', '@flaky']) {
      expect(inspectE2E(`${scope}('@smoke check', {
        annotation: { type: 'issue', description: 'Related ${tag} journey' },
      }, () => { test.setTimeout(0); });`).smokeTimeouts).toEqual(['spec.ts:3']);
      expect(inspectE2E(`${scope}('check', { tag: '@smoke',
        annotation: { type: 'issue', description: 'Related ${tag} journey' },
      }, () => { test.setTimeout(0); });`).smokeTimeouts).toEqual(['spec.ts:3']);
      expect(inspectE2E(`${scope}('check', { tag: ['@smoke', '${tag}'] },
        () => { test.setTimeout(0); });`).smokeTimeouts).toEqual([]);
    }
    expect(inspectE2E(`${scope}('check', {
      annotation: { type: 'issue', description: 'Related @smoke journey' },
    }, () => { test.setTimeout(0); });`).smokeTimeouts).toEqual([]);
  });
  it.each(['1', '45_000'])('allows test.info().setTimeout(%s) within the smoke budget', timeout => {
    expect(inspectE2E(`test('@smoke example', () => { test.info().setTimeout(${timeout}); });`).smokeTimeouts).toEqual([]);
  });
  it('recognizes test.info timeout calls across whitespace and comments', () => {
    expect(inspectE2E(`test('@smoke example', () => {
      test.info( /* current test */ )
        .setTimeout(0);
    });`).smokeTimeouts).toEqual(['spec.ts:2']);
  });
  it.each([
    '${locale} @smoke example',
    '${locale} @smoke ${example}',
    'example ${locale} suffix ${example} @smoke',
  ])('detects smoke tags after interpolations: %s', title => {
    expect(inspectE2E('test(`' + title + '`, () => { test.setTimeout(120_000); });').smokeTimeouts).toHaveLength(1);
  });
  it.each(['serial', 'parallel'])('recognizes slow describe.%s scopes without exempting smoke siblings', modifier => {
    expect(inspectE2E(`
      test.describe.${modifier}('@slow journey', () => {
        test('long test', () => { test.setTimeout(120_000); });
      });
      test.describe.${modifier}('@smoke checks', () => {
        test('over budget', () => { test.setTimeout(120_000); });
      });
      test('@smoke sibling', () => { test.setTimeout(120_000); });
    `).smokeTimeouts).toHaveLength(2);
  });
  it.each(['@slow', '@flaky'])('recognizes %s tags in template middles and tails', tag => {
    for (const title of ['${locale} ' + tag + ' journey', '${locale} ' + tag + ' ${journey}']) {
      expect(inspectE2E("test('@smoke check', () => {}); test(`" + title + '`, () => { test.setTimeout(120_000); });').smokeTimeouts).toEqual([]);
    }
  });
  it('parses multiline imports, side effects and attributes; ignores comments and dynamic imports', () => {
    expect(inspectE2E(`
      // import fake from './fake.json';
      import a from './a.json' with { type: 'json' };
      import b\n from './b.json';
      import './c.json';
      import d from './d.json' assert { type: 'json' };
      import e from './e.json' with { type: 'text' };
      const dynamic = import('./dynamic.json');
    `).jsonImports).toHaveLength(4);
  });
  it('catches multiline/numeric separator options and timeout overrides', () => {
    expect(inspectE2E(`test('@smoke x', () => {
      expect(x).toBeVisible({\n timeout: 60_000 });
      test.setTimeout(120000);
      test.describe.configure({ timeout: 90000 });
      test.slow();
      expect(x).toBeVisible({ 'timeout': 0 });
    });`).smokeTimeouts).toHaveLength(5);
  });
  it('requires a real same-line reason; a string or previous-line comment is insufficient', () => {
    expect(inspectE2E(`test('@smoke x', () => {
      f({ timeout: 45000 });
      f({ timeout: 60000 }); // slow-ok: live solve
      f({ timeout: 60000 }); // slow-ok:
      // slow-ok: not on the timeout line
      f({ timeout: 60000 });
      f({ timeout: 60000, message: '// slow-ok: fake' });
    });`).smokeTimeouts).toHaveLength(3);
  });
  it('checks shared helpers but leaves explicit slow and flaky scopes alone', () => {
    expect(inspectE2E(`
      function shared() { f({ timeout: 60000 }); }
      test('@smoke x', () => {});
      test('@slow y', () => { test.setTimeout(120000); });
      test.describe('z', { tag: ['@smoke', '@flaky'] }, () => { f({ timeout: 60000 }); });
    `).smokeTimeouts).toHaveLength(1);
    expect(inspectE2E(`// @smoke\nf({ timeout: 60000 });`).smokeTimeouts).toEqual([]);
  });
  it('routes smoke only once and preserves longer slow/flaky budgets', () => {
    expect(SMOKE_TIMEOUT_MS).toBe(45_000);
    expect(SMOKE_PATTERN.test('chromium file @smoke example')).toBe(true);
    for (const title of ['@slow example', '@smoke @flaky example', '@slow @smoke example', 'untagged']) expect(SMOKE_PATTERN.test(title)).toBe(false);
    const config = readFileSync(join(web, 'playwright.config.ts'), 'utf8');
    expect(config).toContain("name: 'smoke', grep: SMOKE_PATTERN, timeout: SMOKE_TIMEOUT_MS");
    expect(config).toContain("name: 'chromium', grepInvert: SMOKE_PATTERN");
  });
});
