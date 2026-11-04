/**
 * The TypeScript concrete arithmetic that moved into the engine is kept only as a test oracle.
 *
 * `__tests__/differential/oracle/` holds the CIRSOC 201 modules as they were before the engine
 * took them over (section integration, interaction diagrams, flanged/circular/capacity, slabs,
 * the legacy designer, the station verifier's column solver). They exist to be compared with
 * the engine. Production code importing one would bring back a second, unverified
 * implementation, so no file outside `__tests__` may import from there.
 *
 * The clauses that do remain in production TypeScript are listed in
 * docs/verification/TS_ENGINE_LOGIC.md; this guards the ones that left.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'wasm' || name === 'node_modules') continue;
      sources(p, out);
    } else if (/\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe('concrete oracles stay in the tests', () => {
  it('no production module imports the differential oracles', () => {
    const imports = /(?:from|import)\s*\(?\s*['"][^'"]*differential\/oracle[^'"]*['"]/;
    const offenders = sources(SRC).filter((f) => imports.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the moved clauses have no TypeScript definition left in production', () => {
    /*
     * Definitions, not mentions: the TypeScript that integrated a section, solved a column by
     * bisection, or estimated Bresler's uniaxial loads must not come back under its old name.
     */
    const banned = [
      /function\s+compressedZone\b/, /function\s+circularSegment\b/,
      /function\s+solveColumnSectionReference\b/, /function\s+estimateUniaxialCapacity(Local)?\b/,
      /function\s+steelStressAtEquilibrium\b/,
    ];
    const offenders: string[] = [];
    for (const f of sources(SRC)) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const re of banned) if (re.test(src)) offenders.push(`${f}: ${re}`);

    }
    expect(offenders).toEqual([]);
  });
});
