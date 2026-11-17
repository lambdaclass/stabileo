import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = await import(new URL('../../../scripts/research-route-budget.mjs', import.meta.url).href);

async function measure(worker: boolean, options: {
  switches?: { research: boolean; tools: boolean };
  missing?: string[];
  env?: Record<string, string>;
  ceilings?: Record<string, number>;
} = {}) {
  const switches = options.switches ?? { research: true, tools: true };
  const manifest: Record<string, { file: string; name?: string }> = {
    'index.html': { file: 'index.html' },
    App: { name: 'App', file: 'app.js' },
    'src/components/research/load-page.ts': { file: 'research.js' },
    'src/components/tools/load-page.ts': { file: 'tools.js' },
    ...Object.fromEntries(['CalculatorTool', 'BatchTool', 'ModelTool', 'MohrTool', 'ToolViewer', 'MainBatchTool'].map(name => [
      `src/components/tools/${name}.svelte`, { file: `${name}.js` },
    ])),
  };
  for (const key of options.missing ?? []) delete manifest[key];
  const files: Record<string, string> = {
    'index.html': '<html></html>',
    'app.js': '',
    'research.js': '',
    'tools.js': '',
    'CalculatorTool.js': worker ? 'new Worker("/assets/solver-worker-fixture.js")' : '',
    'BatchTool.js': worker ? 'new Worker("/assets/solver-worker-fixture.js")' : '',
    'ModelTool.js': worker ? 'new Worker("/assets/solver-worker-fixture.js")' : '',
    'MohrTool.js': '',
    'ToolViewer.js': '"published calculator";',
    'MainBatchTool.js': '"published batch calculator";',
    'assets/solver-worker-fixture.js': 'import("/assets/worker-dependency.js");',
    'assets/worker-dependency.js': '"worker implementation";',
  };
  const logs: string[] = [];
  const source = readFileSync(new URL('../../../scripts/check-research-route-size.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  const names = ['build', 'readFileSync', 'writeFileSync', 'appendFileSync', 'mkdtempSync', 'rmSync', 'statSync', 'existsSync', 'tmpdir', 'join', 'process', 'console', ...Object.keys(budget)];
  const relative = (path: string) => path.replace('/fixture/', '');
  const run = new Function(...names, `return (async () => {${source}})();`);
  const process = { argv: ['node', 'check', '--ceiling', 'ceiling.json'], env: options.env ?? {}, exitCode: 0 };
  await run(
    async (config: { plugins: { configResolved?: (resolved: unknown) => void }[] }) => {
      for (const plugin of config.plugins) plugin.configResolved?.({
        env: options.env ?? {},
        define: Object.fromEntries(Object.entries(switches).map(([key, value]) => [`__PUBLIC_FEATURES__.${key}`, JSON.stringify(value)])),
      });
    },
    (path: string) => path.endsWith('manifest.json') ? JSON.stringify(manifest) : path === 'ceiling.json' ? JSON.stringify({ routes: Object.fromEntries([
      '/en/', '/es/', '/pt/', '/app/basic', '/app/education', '/app/pro', '/en/research/', '/en/tools/',
      '/en/tools/simply-supported-beam/', '/en/tools/continuous-beam/', '/en/tools/beam-frame/', '/en/tools/mohr-2d/',
    ].map(route => [route, options.ceilings?.[route] ?? 10000])) }) : files[relative(path)],
    () => {}, () => {}, () => '/fixture', () => {},
    (path: string) => ({ size: Buffer.byteLength(files[relative(path)]), isFile: () => true }),
    (path: string) => relative(path) in files,
    () => '/tmp', (...parts: string[]) => parts.join('/'),
    process,
    { log: (text: string) => logs.push(text) }, ...Object.values(budget),
  );
  return { logs, files, exitCode: process.exitCode };
}

describe('route worker footprint', () => {
  it('known wrong result: #2099 — first-navigation tools count solver workers and their assets exactly once', async () => {
    const { logs, files } = await measure(true);
    for (const [route, detail] of [
      ['simply-supported-beam', 'CalculatorTool'], ['continuous-beam', 'BatchTool'], ['beam-frame', 'ModelTool'],
    ]) {
      const bytes = ['index.html', 'tools.js', `${detail}.js`, 'assets/solver-worker-fixture.js', 'assets/worker-dependency.js']
        .reduce((total, file) => total + Buffer.byteLength(files[file]), 0);
      expect(logs).toContain(`/en/tools/${route}/: ${bytes} bytes`);
    }
    expect(logs).toContain(`/en/tools/mohr-2d/: ${Buffer.byteLength(files['index.html'])} bytes`);
  });

  it('routes without a worker retain their measured footprint', async () => {
    const { logs, files } = await measure(false);
    const bytes = Buffer.byteLength(files['index.html']);
    for (const route of ['/en/', '/app/basic', '/en/research/', '/en/tools/simply-supported-beam/']) {
      expect(logs).toContain(`${route}: ${bytes} bytes`);
    }
  });
});

describe('route size build switches', () => {
  it.each([
    ['0', '0'], ['0', '1'], ['1', '0'],
  ])('known wrong result: #2099 — measure built routes and report disabled routes for research=%s tools=%s', async (research, tools) => {
    const missing = [
      ...(tools === '0' ? ['CalculatorTool', 'BatchTool', 'ModelTool', 'MohrTool'].map(name => `src/components/tools/${name}.svelte`) : []),
    ];
    const { logs, files } = await measure(false, {
      switches: { research: research === '1', tools: tools === '1' }, missing,
    });
    const bytes = Buffer.byteLength(files['index.html']);
    for (const route of ['/en/', '/es/', '/pt/', '/app/basic', '/app/education', '/app/pro']) {
      expect(logs).toContain(`${route}: ${bytes} bytes`);
    }
    for (const [route, key, value] of [
      ['/en/research/', '', '1'],
      ['/en/tools/', '', '1'],
      ['/en/tools/simply-supported-beam/', 'ToolViewer', '1'],
      ['/en/tools/continuous-beam/', 'MainBatchTool', '1'],
      ...['beam-frame/', 'mohr-2d/'].map(path => [`/en/tools/${path}`, '', tools]),
    ]) {
      const detailBytes = tools === '0' && key ? Buffer.byteLength(files[`${key}.js`]) : 0;
      expect(logs).toContain(value === '0' ? `${route}: skipped (tools=false)` : `${route}: ${bytes + detailBytes} bytes`);
      expect(logs.filter(line => line.startsWith(`${route}:`))).toHaveLength(1);
    }
  });

  it.each(['/en/research/', '/en/tools/', '/en/tools/simply-supported-beam/', '/en/tools/continuous-beam/'])(
    'known wrong result: #2099 — default published %s enforces its ceiling on both sides of the boundary', async route => {
      const options = { switches: { research: false, tools: false }, missing: ['CalculatorTool', 'BatchTool', 'ModelTool', 'MohrTool'].map(name => `src/components/tools/${name}.svelte`) };
      const { files } = await measure(false, options);
      const detail = route.includes('simply-supported-beam') ? 'ToolViewer.js' : route.includes('continuous-beam') ? 'MainBatchTool.js' : null;
      const bytes = Buffer.byteLength(files['index.html']) + (detail ? Buffer.byteLength(files[detail]) : 0);
      for (const headroom of [-1, 0, 1]) {
        const result = await measure(false, { ...options, ceilings: { [route]: bytes + headroom } });
        expect(result.logs).toContain(`${route}: ${bytes} bytes`);
        expect(result.exitCode).toBe(headroom < 0 ? 1 : 0);
        expect(result.logs.filter(line => line.includes('is over its ceiling'))).toEqual(headroom < 0 ? [`${route} is over its ceiling: ${bytes} > ${bytes - 1} bytes`] : []);
      }
    },
  );

  it.each([
    ['src/components/research/load-page.ts', 'src/components/research/load-page.ts'],
    ['src/components/tools/load-page.ts', 'src/components/tools/load-page.ts'],
    ['src/components/tools/ToolViewer.svelte', 'for ToolViewer.svelte'],
    ['src/components/tools/MainBatchTool.svelte', 'for MainBatchTool.svelte'],
  ])('known wrong result: #2099 — a default published feature with missing %s fails', async (missing, entry) => {
    await expect(measure(false, { switches: { research: false, tools: false }, missing: [missing] })).rejects.toThrow(`missing manifest entry ${entry}`);
  });

  it.each([
    ['src/components/research/load-page.ts', 'src/components/research/load-page.ts'],
    ['src/components/tools/load-page.ts', 'src/components/tools/load-page.ts'],
    ...['CalculatorTool', 'BatchTool', 'ModelTool', 'MohrTool'].map(name => [`src/components/tools/${name}.svelte`, name + '.svelte']),
  ])('an enabled feature with missing %s fails', async (missing, entry) => {
    await expect(measure(false, { missing: [missing] })).rejects.toThrow(`missing manifest entry ${missing.includes('load-page') ? '' : 'for '}${entry}`);
  });
});
