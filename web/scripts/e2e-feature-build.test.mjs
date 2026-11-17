import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPublicFeatures, e2eBuildFeatures } from './build-public-features.ts';
import config from '../config/features.json' with { type: 'json' };
import { disabledFeatures, withProductionFeatures } from './public-features-test-fixture.mjs';

const root = new URL('..', import.meta.url).pathname;
const keys = Object.keys(disabledFeatures);
const all = value => Object.fromEntries(keys.map(key => [key, value]));

for (const features of [config.production, disabledFeatures, all(true)]) {
  test(`E2E artifact records its build features=${JSON.stringify(features)}`, async () => {
    const previous = { ...process.env };
    try {
      process.env.VITE_E2E = '1';
      const result = await withProductionFeatures(features, configFile => build({
        root,
        configFile,
        logLevel: 'silent',
        plugins: [{
          name: 'e2e-feature-fixture',
          resolveId: id => id === 'e2e-feature-fixture' ? '\0e2e-feature-fixture' : null,
          load: id => id === '\0e2e-feature-fixture' ? 'console.log("fixture");' : null,
        }],
        build: { write: false, rollupOptions: { input: 'e2e-feature-fixture' } },
      }));
      const metadata = result.output.find(output => output.fileName === 'e2e-features.json');
      assert.ok(metadata, 'prebuilt tests must detect the switches of the artifact they serve');
      assert.deepEqual(JSON.parse(metadata.source), features);
    } finally {
      if (previous.VITE_E2E === undefined) delete process.env.VITE_E2E;
      else process.env.VITE_E2E = previous.VITE_E2E;
    }
  });
}

for (const value of [false, true]) {
  test(`prebuilt features=${value} take precedence over the committed config`, () => {
    const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
    try {
      const artifact = new URL(`file://${directory}/e2e-features.json`);
      writeFileSync(artifact, JSON.stringify(all(value)));
      assert.deepEqual(e2eBuildFeatures(true, artifact), all(value));
      assert.deepEqual(e2eBuildFeatures(false, artifact), buildPublicFeatures());
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
}

test('missing or invalid artifact switches fail instead of silently skipping coverage', () => {
  const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
  const artifact = new URL(`file://${directory}/e2e-features.json`);
  try {
    assert.throws(() => e2eBuildFeatures(true, artifact), { code: 'ENOENT' });
    for (const invalid of ['', '{}', JSON.stringify(all('true'))]) {
      writeFileSync(artifact, invalid);
      assert.throws(() => e2eBuildFeatures(true, artifact));
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

for (const mask of [0, 1, 2, 4, 8, 15]) {
  test(`optional specs and main navigation select switch mask=${mask} coverage`, () => {
    const flags = Object.fromEntries(keys.map((key, index) => [key, Boolean(mask & (1 << index))]));
    const files = ['diagram-game', 'mohr-tools', 'tools-models', 'accounts-legal-usage', 'ads-register', 'landing-nav', 'landing-pricing-hu', 'tools', 'tools-main', 'examples'];
    const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
    let report;
    try {
      const runner = resolve(directory, 'playwright.config.ts');
      writeFileSync(runner, `import config from '../playwright.config'; globalThis.__PUBLIC_FEATURES__ = ${JSON.stringify(flags)}; export default { ...config, testDir: '../e2e', globalSetup: '../e2e/global-setup.ts' };`);
      report = JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', runner, ...files.map(name => `e2e/${name}.spec.ts`), '--project=smoke', '--list', '--reporter=json'], {
        cwd: root,
        env: { ...process.env, E2E_PREBUILT: '0' },
        encoding: 'utf8',
      }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    let inspected = 0;
    function inspect(suite, title = '') {
      const fullTitle = `${title} ${suite.title}`;
      for (const spec of suite.specs ?? []) for (const entry of spec.tests) {
        const available = spec.file === 'landing-nav.spec.ts'
          ? fullTitle.includes('with switched items') === (flags.tools || flags.diagramGame)
          : ['tools-main.spec.ts', 'examples.spec.ts'].includes(spec.file) ? !flags.tools
          : flags[spec.file === 'diagram-game.spec.ts' ? 'diagramGame' : spec.file.startsWith('landing-pricing-') ? 'research' : ['accounts-legal-usage.spec.ts', 'ads-register.spec.ts'].includes(spec.file) ? 'accounts' : 'tools'];
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

for (const enabled of [false, true]) {
  for (const prebuilt of [false, true]) {
    test(`#2099 shape-control coverage follows the served research=${enabled}, prebuilt=${prebuilt}`, () => {
      const directory = mkdtempSync(resolve(root, '.e2e-feature-test-'));
      try {
        for (const path of ['e2e', 'scripts', 'dist', 'config']) mkdirSync(resolve(directory, path));
        for (const path of ['e2e/research-shape-control.spec.ts', 'e2e/build-features.ts', 'scripts/build-public-features.ts', 'config/public-features.mjs']) writeFileSync(resolve(directory, path), readFileSync(resolve(root, path)));
        writeFileSync(resolve(directory, 'playwright.config.ts'), `export default { testDir: './e2e', projects: [{ name: 'smoke' }] };`);
        writeFileSync(resolve(directory, 'config/features.json'), JSON.stringify({ ...config, production: { ...disabledFeatures, research: prebuilt ? !enabled : enabled } }));
        writeFileSync(resolve(directory, 'dist/e2e-features.json'), JSON.stringify({ ...disabledFeatures, research: enabled }));
        const environment = { ...process.env, E2E_PREBUILT: prebuilt ? '1' : '0' };
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
