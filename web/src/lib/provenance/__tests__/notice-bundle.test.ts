import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import packed from 'virtual:result-change-packed';
import { RESULT_CHANGES } from '../full-registry';

it('loads translated recheck notices outside the static app route closure', async () => {
  const web = resolve(__dirname, '../../../../..', 'web');
  const out = '.dist-recheck-notice';
  try {
    await promisify(execFile)('npx', ['vite', 'build', '--manifest', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: web, timeout: 240_000, maxBuffer: 32 * 1024 * 1024,
    });
    type Chunk = { file: string; imports?: string[]; dynamicImports?: string[] };
    const manifest = JSON.parse(readFileSync(resolve(web, out, '.vite/manifest.json'), 'utf8')) as Record<string, Chunk>;
    const appKey = Object.keys(manifest).find(key => /^assets\/App-.*\.js$/.test(manifest[key].file));
    const noticesKey = Object.keys(manifest).find(key => /^assets\/applicability-.*\.js$/.test(manifest[key].file));
    expect(appKey).toBeDefined();
    expect(noticesKey).toBeDefined();
    const closure = new Set<string>();
    function visit(key: string) {
      if (closure.has(key)) return;
      closure.add(key);
      for (const dependency of manifest[key].imports ?? []) visit(dependency);
    }
    visit(appKey!);
    expect(closure.has(noticesKey!)).toBe(false);
    expect([...closure].some(key => manifest[key].dynamicImports?.includes(noticesKey!))).toBe(true);
    const initial = [...closure].map(key => readFileSync(resolve(web, out, manifest[key].file), 'utf8')).join('\n');
    const product = new Set<string>();
    function visitProduct(key: string) {
      if (product.has(key) || /components\/research\//.test(key)) return;
      product.add(key);
      for (const dep of [...(manifest[key].imports ?? []), ...(manifest[key].dynamicImports ?? [])]) visitProduct(dep);
    }
    visitProduct(appKey!);
    const allProduct = [...product].map(key => readFileSync(resolve(web, out, manifest[key].file), 'utf8')).join('\n');
    const notices = readFileSync(resolve(web, out, manifest[noticesKey!].file), 'utf8');
    expect(initial).not.toContain(packed);
    const emitted = notices.match(/[A-Za-z0-9+/=]{100,}/g)?.find(value => value === packed);
    expect(emitted).toBe(packed);
    expect(JSON.parse(inflateRawSync(Buffer.from(emitted!, 'base64')).toString('utf8'))).toEqual(RESULT_CHANGES);
    expect(allProduct.split(packed).length - 1).toBe(1);
    for (const change of RESULT_CHANGES.changes) {
      const entry = `id:${JSON.stringify(change.id)},resultsVersion:${change.resultsVersion}`;
      expect(allProduct.includes(entry), `duplicate registry entry: ${change.id}`).toBe(false);
      expect(initial.includes(entry), `eager registry entry: ${change.id}`).toBe(false);
      for (const locale of ['en', 'es', 'pt'] as const) {
        expect(initial).not.toContain(change.explanation[locale]);
        expect(initial).not.toContain(JSON.stringify(change.explanation[locale]).slice(1, -1));
      }
    }
    console.info(`App static JavaScript: ${Buffer.byteLength(initial)} bytes; lazy notices: ${Buffer.byteLength(notices)} bytes`);
  } finally {
    rmSync(resolve(web, out), { recursive: true, force: true });
  }
}, 300_000);
