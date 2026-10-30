/**
 * Check that two prerender runs of the same build are 100% byte-identical.
 *
 * Verifies that:
 * 1. SVG chart clipPath IDs are deterministic across renders (LineChart.svelte).
 * 2. GitHub star count is consistent across all pages (prerender.ts).
 * 3. No non-deterministic timestamps, random tokens, or race conditions cause output drift.
 *
 * Usage:
 *   node scripts/check-prerender-reproducible.mjs
 *   node scripts/check-prerender-reproducible.mjs --dir-a <dir1> --dir-b <dir2>
 */

import { readdirSync, readFileSync, statSync, existsSync, cpSync, rmSync, mkdtempSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

export function compareDirectories(dirA, dirB) {
  function collectFiles(base, sub = '') {
    const dir = join(base, sub);
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = join(sub, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectFiles(base, rel));
      } else if (entry.isFile()) {
        files.push(rel.replace(/\\/g, '/'));
      }
    }
    return files;
  }

  const filesA = new Set(collectFiles(dirA));
  const filesB = new Set(collectFiles(dirB));

  const onlyInA = [...filesA].filter(f => !filesB.has(f));
  const onlyInB = [...filesB].filter(f => !filesA.has(f));
  const differing = [];

  for (const f of filesA) {
    if (!filesB.has(f)) continue;
    const bufA = readFileSync(join(dirA, f));
    const bufB = readFileSync(join(dirB, f));
    if (Buffer.compare(bufA, bufB) !== 0) {
      differing.push(f);
    }
  }

  return {
    totalA: filesA.size,
    totalB: filesB.size,
    onlyInA,
    onlyInB,
    differing,
    identical: onlyInA.length === 0 && onlyInB.length === 0 && differing.length === 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dirAIndex = args.indexOf('--dir-a');
  const dirBIndex = args.indexOf('--dir-b');

  if (dirAIndex !== -1 && dirBIndex !== -1) {
    const dirA = resolve(args[dirAIndex + 1]);
    const dirB = resolve(args[dirBIndex + 1]);
    const result = compareDirectories(dirA, dirB);
    if (!result.identical) {
      console.error(`❌ Prerender output differs between ${dirA} and ${dirB}:`);
      if (result.onlyInA.length) console.error(`   Only in A: ${result.onlyInA.slice(0, 10).join(', ')}`);
      if (result.onlyInB.length) console.error(`   Only in B: ${result.onlyInB.slice(0, 10).join(', ')}`);
      if (result.differing.length) console.error(`   Differing content (${result.differing.length} files): ${result.differing.slice(0, 10).join(', ')}`);
      process.exit(1);
    }
    console.log(`✅ Prerender is byte-identical: all ${result.totalA} files match exactly.`);
    return;
  }

  // Ensure base build exists
  if (!existsSync(join(DIST, 'index.html'))) {
    console.log('Running base build first...');
    const b = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
    if (b.status !== 0) {
      console.error('Base build failed');
      process.exit(1);
    }
  }

  const tmpA = mkdtempSync(join(tmpdir(), 'prerender-serial-'));
  const tmpB = mkdtempSync(join(tmpdir(), 'prerender-parallel-'));

  try {
    console.log('Seeding temporary dist directories...');
    cpSync(DIST, tmpA, { recursive: true });
    cpSync(DIST, tmpB, { recursive: true });

    const fixedStars = process.env.STABILEO_BUILD_STARS || '1250';

    console.log('Running serial prerender (concurrency 1)...');
    const run1 = spawnSync('npx', ['tsx', 'scripts/prerender.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PRERENDER_OUT: tmpA, PRERENDER_CONCURRENCY: '1', STABILEO_BUILD_STARS: fixedStars },
    });
    if (run1.status !== 0) {
      throw new Error(`Serial prerender failed with code ${run1.status}`);
    }

    console.log('Running parallel prerender (concurrency 4)...');
    const run2 = spawnSync('npx', ['tsx', 'scripts/prerender.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PRERENDER_OUT: tmpB, PRERENDER_CONCURRENCY: '4', STABILEO_BUILD_STARS: fixedStars },
    });
    if (run2.status !== 0) {
      throw new Error(`Parallel prerender failed with code ${run2.status}`);
    }

    console.log('Comparing outputs byte-for-byte...');
    const result = compareDirectories(tmpA, tmpB);

    if (!result.identical) {
      console.error(`❌ Prerender is NOT reproducible! Found differences:`);
      if (result.differing.length) {
        console.error(`   ${result.differing.length} differing files:`);
        for (const file of result.differing.slice(0, 20)) {
          console.error(`     - ${file}`);
        }
      }
      if (result.onlyInA.length) console.error(`   Only in serial: ${result.onlyInA.slice(0, 10).join(', ')}`);
      if (result.onlyInB.length) console.error(`   Only in parallel: ${result.onlyInB.slice(0, 10).join(', ')}`);
      process.exit(1);
    }

    console.log(`✅ Prerender is byte-identical: all ${result.totalA} files match exactly between serial and parallel runs.`);
  } finally {
    try { rmSync(tmpA, { recursive: true, force: true }); } catch {}
    try { rmSync(tmpB, { recursive: true, force: true }); } catch {}
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

