/**
 * One answer to "is this a space workspace?": `is3DWorkspace` (Basic 3D and PRO).
 *
 * A check for '3d' alone treats PRO — always a space workspace — as a plane one. It was written that
 * way 36 times beside 39 that remembered PRO, and the ones that did not were bugs wherever PRO could
 * reach them (#245: the kinematic panel counted PRO frames as their XY projection). This gate keeps
 * the comparison in one place: it fails on any comparison with '2d' or '3d' — either quotes, either
 * side, strict or loose, or a `case` — outside `utils/workspace.ts`. Asking WHICH mode something is
 * (the Basic mode buttons, restoring a snapshot's own mode) is the exception, listed with its reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { is3DWorkspace } from '../workspace';

const SRC = join(import.meta.dirname, '../../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'wasm') sources(p, out); }
    else if (/\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const DIM = String.raw`['"\x60](?:2d|3d)['"\x60]`;
/** A value compared with '2d' or '3d': ===, ==, !==, != on either side, or a case label. */
const DIMENSION_COMPARISON = new RegExp(String.raw`(?:[!=]==?\s*${DIM})|(?:${DIM}\s*[!=]==?)|(?:\bcase\s+${DIM})`);

/** Where a mode is compared to ask which mode it is, not which dimension — each with its reason. */
const WHICH_MODE: Array<{ file: string; snippet: string; why: string }> = [
  { file: 'components/Toolbar.svelte', snippet: "class:active={uiStore.analysisMode === '2d'}", why: 'the Basic 2D mode button' },
  { file: 'components/Toolbar.svelte', snippet: "class:active={uiStore.analysisMode === '3d'}", why: 'the Basic 3D mode button' },
  { file: 'components/AiDrawer.svelte', snippet: "snapshotMode === '2d' && is3DMode", why: "restores a snapshot's own mode; one without a mode leaves it alone" },
];

describe('the space-workspace check', () => {
  it('is Basic 3D and PRO, nothing else', () => {
    expect(['2d', '3d', 'pro', 'edu'].filter(is3DWorkspace)).toEqual(['3d', 'pro']);
  });

  it('catches every spelling of a dimension comparison', () => {
    for (const line of [
      "uiStore.analysisMode === '3d'", "'3d' === uiStore.analysisMode", 'uiStore.analysisMode === "3d"',
      "uiStore.analysisMode == '3d'", "mode !== '3d'", "case '3d':", "m === '2d'", "mode() != `3d`",
    ]) expect(DIMENSION_COMPARISON.test(line), line).toBe(true);
    for (const line of ["uiStore.analysisMode = '3d';", "setDimension('3d')", "const label = '3d';"]) {
      expect(DIMENSION_COMPARISON.test(line), line).toBe(false);
    }
  });

  it('is made only through is3DWorkspace', () => {
    const found: string[] = [];
    const used = new Set<string>();
    for (const file of sources(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (rel === 'lib/utils/workspace.ts') continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!DIMENSION_COMPARISON.test(line)) return;
        const ok = WHICH_MODE.find((w) => w.file === rel && line.includes(w.snippet));
        if (ok) used.add(ok.snippet); else found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found, 'compare a mode with is3DWorkspace(mode) / uiStore.is3DWorkspace').toEqual([]);
    // An exception whose line is gone (or was reworded) is dropped, not kept as a stale permission.
    expect(WHICH_MODE.filter((w) => !used.has(w.snippet)).map((w) => `${w.file}: ${w.snippet}`)).toEqual([]);
  });
});
