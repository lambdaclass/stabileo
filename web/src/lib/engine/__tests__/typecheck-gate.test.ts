import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The typecheck gate must not be able to pass without having typechecked.
 *
 * `scripts/typecheck.mjs` ran `npx tsc`. In a worktree with no `node_modules` — a fresh
 * `git worktree add`, a clean CI image, any clone before `npm ci` — `npx` cannot find a local
 * tsc, prints "This is not the tsc command you are looking for" and exits ZERO. So
 * `execFileSync` did not throw, the script read an empty output as an empty diagnostic list, and
 * the gate printed:
 *
 *     typecheck: 0 errors reported, baseline 490
 *     typecheck: no new type errors
 *
 * A green gate that compiled nothing. It hid a real TS2554 in `floor-design-wiring.test.ts` for
 * as long as it was in place, and it would hide the next one.
 *
 * These run the real script, because the defect was in its behaviour and not in its text.
 */
const WEB = resolve(new URL('../../../..', import.meta.url).pathname);
const SCRIPT = resolve(WEB, 'scripts/typecheck.mjs');

/** Run the gate and return its exit code and combined output. */
function runGate(env: Record<string, string>): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], {
      cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the typecheck gate cannot report a false green', () => {
  it('fails loudly when the TypeScript compiler is absent', () => {
    const { code, out } = runGate({ STABILEO_TYPECHECK_TSC: '/nonexistent/tsc' });
    expect(code).toBe(2);
    expect(out).toMatch(/no TypeScript compiler/);
    expect(out).toMatch(/npm ci/);
    // The exact sentence that must never appear on this path.
    expect(out).not.toMatch(/no new type errors/);
    expect(out).not.toMatch(/0 errors reported/);
  });

  it('resolves the compiler inside the project instead of through the npx shim', () => {
    // `npx` is what exits zero on a missing binary. The gate must not depend on it.
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/execFileSync\(\s*'npx'/);
    expect(src).toContain("join(webRoot, 'node_modules', 'typescript', 'bin', 'tsc')");
  });

  it('refuses to read a tsc crash as an empty diagnostic list', () => {
    // A non-zero exit with nothing the parser recognises is tsc failing, not tsc finding
    // nothing — an unreadable tsconfig, a bad flag, an out-of-memory kill.
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('crashed && errors.length === 0');
    expect(src).toMatch(/reported no parseable diagnostics/);
  });
});
