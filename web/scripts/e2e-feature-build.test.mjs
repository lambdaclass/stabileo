import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPublicFeatures, e2eBuildFeatures } from './build-public-features.ts';

const root = new URL('..', import.meta.url).pathname;
const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME'];

for (const value of [undefined, '0', '1']) {
  test(`E2E artifact records its resolved switches=${value}`, async () => {
    const previous = { ...process.env };
    try {
      for (const key of keys) delete process.env[key];
      if (value !== undefined) for (const key of keys) process.env[key] = value;
      process.env.VITE_E2E = '1';
      const result = await build({
        root,
        logLevel: 'silent',
        plugins: [{
          name: 'e2e-feature-fixture',
          resolveId: id => id === 'e2e-feature-fixture' ? '\0e2e-feature-fixture' : null,
          load: id => id === '\0e2e-feature-fixture' ? 'console.log("fixture");' : null,
        }],
        build: { write: false, rollupOptions: { input: 'e2e-feature-fixture' } },
      });
      const metadata = result.output.find(output => output.fileName === 'e2e-features.json');
      assert.ok(metadata, 'prebuilt tests must detect the switches of the artifact they serve');
      assert.deepEqual(JSON.parse(metadata.source), Object.fromEntries(keys.map(key => [key, value === '1' ? '1' : '0'])));
    } finally {
      for (const key of [...keys, 'VITE_E2E']) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}

for (const value of ['0', '1']) {
  test(`prebuilt switches=${value} override the opposite runner environment`, () => {
    const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
    const previous = keys.map(key => process.env[key]);
    try {
      for (const key of keys) process.env[key] = value === '0' ? '1' : '0';
      const artifact = new URL(`file://${directory}/e2e-features.json`);
      writeFileSync(artifact, JSON.stringify(Object.fromEntries(keys.map(key => [key, value]))));
      assert.deepEqual(e2eBuildFeatures(true, artifact), { accounts: value === '1', research: value === '1', tools: value === '1', diagramGame: value === '1' });
      assert.deepEqual(e2eBuildFeatures(false, artifact), buildPublicFeatures());
    } finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key];
        else process.env[key] = previous[i];
      });
      rmSync(directory, { recursive: true });
    }
  });
}

test('missing or invalid artifact switches fail instead of silently skipping coverage', () => {
  const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
  const artifact = new URL(`file://${directory}/e2e-features.json`);
  try {
    assert.throws(() => e2eBuildFeatures(true, artifact), { code: 'ENOENT' });
    for (const invalid of ['', '{}', JSON.stringify(Object.fromEntries(keys.map(key => [key, true])))]) {
      writeFileSync(artifact, invalid);
      assert.throws(() => e2eBuildFeatures(true, artifact));
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

for (const mask of [0, 1, 2, 4, 8, 15]) {
  test(`optional specs and main navigation select switch mask=${mask} coverage`, () => {
    const flags = Object.fromEntries(keys.map((key, index) => [key, mask & (1 << index) ? '1' : '0']));
    const files = ['diagram-game', 'mohr-tools', 'tools-models', 'accounts-legal-usage', 'ads-register', 'landing-nav', 'landing-pricing-hu', 'tools', 'tools-main', 'examples'];
    const report = JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', ...files.map(name => `e2e/${name}.spec.ts`), '--project=smoke', '--list', '--reporter=json'], {
      cwd: root,
      env: { ...process.env, E2E_PREBUILT: '0', ...flags },
      encoding: 'utf8',
    }));
    let inspected = 0;
    function inspect(suite, title = '') {
      const fullTitle = `${title} ${suite.title}`;
      for (const spec of suite.specs ?? []) for (const entry of spec.tests) {
        const available = spec.file === 'landing-nav.spec.ts'
          ? fullTitle.includes('with switched items') === (flags.VITE_TOOLS === '1' || flags.VITE_DIAGRAM_GAME === '1')
          : ['tools-main.spec.ts', 'examples.spec.ts'].includes(spec.file) ? flags.VITE_TOOLS !== '1'
          : flags[spec.file === 'diagram-game.spec.ts' ? 'VITE_DIAGRAM_GAME' : spec.file.startsWith('landing-pricing-') ? 'VITE_RESEARCH' : ['accounts-legal-usage.spec.ts', 'ads-register.spec.ts'].includes(spec.file) ? 'VITE_ACCOUNTS' : 'VITE_TOOLS'] === '1';
        assert.equal(entry.expectedStatus, available ? 'passed' : 'skipped', `${fullTitle} ${spec.title}`);
        if (!available) assert.ok(entry.annotations.some(annotation => annotation.type === 'skip' && annotation.description.includes('build')));
        inspected++;
      }
      for (const child of suite.suites ?? []) inspect(child, fullTitle);
    }
    for (const suite of report.suites) inspect(suite);
    assert.ok(inspected > 0);
  });
}

for (const value of [undefined, '0', '1']) {
  for (const prebuilt of [false, true]) {
    test(`#2099 shape-control coverage follows the served research switch=${value}, prebuilt=${prebuilt}`, () => {
      const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
      try {
        const enabled = value === '1';
        for (const path of ['e2e', 'scripts', 'dist']) mkdirSync(resolve(directory, path));
        for (const path of ['e2e/research-shape-control.spec.ts', 'e2e/build-features.ts', 'scripts/build-public-features.ts']) writeFileSync(resolve(directory, path), readFileSync(resolve(root, path)));
        writeFileSync(resolve(directory, 'playwright.config.ts'), `export default { testDir: './e2e', projects: [{ name: 'smoke' }] };`);
        writeFileSync(resolve(directory, 'dist/e2e-features.json'), JSON.stringify(Object.fromEntries(keys.map(key => [key, enabled ? '1' : '0']))));
        const environment = { ...process.env, E2E_PREBUILT: prebuilt ? '1' : '0' };
        for (const key of keys) delete environment[key];
        if (value !== undefined) environment.VITE_RESEARCH = value;
        if (prebuilt) {
          environment.VITE_RESEARCH = enabled ? '0' : '1';
        }
        const report = JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', resolve(directory, 'playwright.config.ts'), '--project=smoke', '--list', '--reporter=json'], {
          cwd: root,
          env: environment,
          encoding: 'utf8',
        }));
        const specs = [];
        function inspect(suite) {
          specs.push(...(suite.specs ?? []));
          for (const child of suite.suites ?? []) inspect(child);
        }
        for (const suite of report.suites) inspect(suite);
        assert.equal(specs.length, 5);
        const baseline = specs.filter(spec => /: the path takes|: a rectangle below/.test(spec.title));
        assert.equal(baseline.length, 2);
        for (const spec of specs) {
          const available = baseline.includes(spec) || enabled;
          assert.equal(spec.tests.length, 1, spec.title);
          assert.equal(spec.tests[0].expectedStatus, available ? 'passed' : 'skipped', spec.title);
          if (!available) assert.ok(spec.tests[0].annotations.some(annotation => annotation.type === 'skip' && annotation.description.includes('build')));
        }
      } finally {
        rmSync(directory, { recursive: true });
      }
    });
  }
}
