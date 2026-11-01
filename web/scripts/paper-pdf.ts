/**
 * Typesets the paper (`src/lib/paper/latex.ts`) into public/papers/jaie-2026/stabileo-jaie-2026.pdf
 * with Tectonic, from the page's own figures. Run with `make paper.pdf`, which provides Tectonic and
 * dwebp; it also refreshes `src/lib/paper/jaie-2026.tex`, which a test compares with the text.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { paperLatex } from '../src/lib/paper/latex';

const WEB = resolve(import.meta.dirname, '..');
const ASSETS = join(WEB, 'public/papers/jaie-2026');
const tex = paperLatex();
writeFileSync(join(WEB, 'src/lib/paper/jaie-2026.tex'), tex);

const work = mkdtempSync(join(tmpdir(), 'stabileo-paper-'));
try {
  writeFileSync(join(work, 'paper.tex'), tex);
  for (const f of readdirSync(ASSETS).filter((f) => /^figura-\d+\.webp$/.test(f))) {
    execFileSync('dwebp', ['-quiet', join(ASSETS, f), '-o', join(work, f.replace('.webp', '.png'))]);
  }
  execFileSync('tectonic', ['--keep-logs', 'paper.tex'], { cwd: work, stdio: 'inherit' });
  copyFileSync(join(work, 'paper.pdf'), join(ASSETS, 'stabileo-jaie-2026.pdf'));
} finally {
  rmSync(work, { recursive: true, force: true });
}
