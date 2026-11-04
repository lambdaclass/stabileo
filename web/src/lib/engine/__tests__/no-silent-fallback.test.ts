/**
 * The engine is the only source of engineering results (docs/verification/TS_ENGINE_LOGIC.md).
 *
 * The TypeScript copies that used to stand in for the engine, silently, when it was not loaded
 * are test oracles now (`__tests__/differential/*-oracle.ts`, `sectionPoint` behind
 * `useTypeScriptReferenceForTests`). This guard fails if app code reaches for any of them again.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));

function appFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'wasm' || name === 'node_modules') continue;
    if (statSync(path).isDirectory()) appFiles(path, out);
    else if (/\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

describe('no app module reaches a TypeScript stand-in for the engine', () => {
  const files = appFiles(SRC);

  it('scans the app', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('no app module imports a test oracle', () => {
    const offenders = files.filter((f) => /from ['"][^'"]*-oracle['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('no app module switches the RC section to its TypeScript reference', () => {
    const offenders = files.filter((f) => !f.endsWith('cirsoc201-section.ts') && readFileSync(f, 'utf8').includes('useTypeScriptReferenceForTests'));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });

  it('the design-check wrappers do not swallow the engine error', () => {
    const src = readFileSync(join(SRC, 'lib/engine/wasm-solver.ts'), 'utf8');
    const wrappers = src.split('\n').filter((l) => /^export function check\w+\(input: any\)/.test(l));
    expect(wrappers.length).toBe(13);
    expect(src).not.toMatch(/export function check\w+\(input: any\): any \| null/);
  });
});
