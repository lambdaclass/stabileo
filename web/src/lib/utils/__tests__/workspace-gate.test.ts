/**
 * One answer to "is this a space workspace?": `is3DWorkspace` (Basic 3D and PRO).
 *
 * A check for '3d' alone treats PRO — always a space workspace — as a plane one. It was written that
 * way 36 times beside 39 that remembered PRO, and the ones that did not were bugs wherever PRO could
 * reach them (#245: the kinematic panel counted PRO frames as their XY projection). This gate keeps
 * the comparison in one place. Asking WHICH mode it is (the Basic 3D mode button) is the one
 * exception, listed below.
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

/** A mode compared with '3d' (either side, === or !==). */
const MODE_VS_3D = /(?:[Mm]ode|\bv)\s*[!=]==\s*'3d'|'3d'\s*[!=]==\s*\w*(?:[Mm]ode|\bv)\b/;

/** Where a mode is compared with '3d' to ask which mode it is, not which dimension. */
const WHICH_MODE = new Set([
  'components/Toolbar.svelte: <button class:active={uiStore.analysisMode === \'3d\'}',
]);

describe('the space-workspace check', () => {
  it('is Basic 3D and PRO, nothing else', () => {
    expect(['2d', '3d', 'pro', 'edu'].filter(is3DWorkspace)).toEqual(['3d', 'pro']);
  });

  it('is made only through is3DWorkspace', () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (rel === 'lib/utils/workspace.ts') continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!MODE_VS_3D.test(line)) return;
        const allowed = [...WHICH_MODE].some((w) => { const [f, snippet] = w.split(': '); return f === rel && line.includes(snippet!); });
        if (!allowed) found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found, 'compare a mode with is3DWorkspace(mode) / uiStore.is3DWorkspace').toEqual([]);
  });
});
