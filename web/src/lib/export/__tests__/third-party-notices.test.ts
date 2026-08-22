/**
 * The notices that ship with the bundle say what is actually in the bundle.
 *
 * ── Why this is a test and not a release checklist ─────────────────
 *
 * Every licence in the runtime tree attaches its condition to DISTRIBUTION, and a browser app
 * distributes to every visitor. MIT wants its copyright and permission notice carried with the
 * copy; Apache-2.0 §4 wants the notices retained and the licence supplied; MPL-2.0 §3.2 wants
 * recipients told where the covered source is. `vite build` minifies all of it away — the built
 * `dist/assets/*.js` contains zero `Copyright (c)` strings — so the obligation is met by a
 * document that accompanies the distribution, and a document is only as good as whatever keeps
 * it current.
 *
 * A checklist does not keep it current. Adding one runtime dependency and forgetting is a
 * compliance gap that nothing reports. This makes it a red test.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(__dirname, '../../../..');
const REPO = path.resolve(WEB, '..');
const NOTICES = path.join(REPO, 'THIRD_PARTY_NOTICES.md');
const PUBLIC_COPY = path.join(WEB, 'public', 'third-party-notices.txt');

describe('third-party notices', () => {
  it('exist at the repository root', () => {
    expect(fs.existsSync(NOTICES), 'THIRD_PARTY_NOTICES.md is missing').toBe(true);
  });

  it('are reproduced verbatim in what the site serves', () => {
    // The repo copy is for readers of the source; `public/` is the one that reaches a visitor,
    // which is the one the licences are actually about.
    expect(fs.existsSync(PUBLIC_COPY), 'web/public/third-party-notices.txt is missing').toBe(true);
    expect(fs.readFileSync(PUBLIC_COPY, 'utf8')).toBe(fs.readFileSync(NOTICES, 'utf8'));
  });

  it('match the current runtime dependency tree', () => {
    /**
     * Runs the generator in check mode. A non-zero exit means a runtime dependency was added,
     * removed or bumped without regenerating — the failure this file exists to produce.
     */
    let failed = false;
    let output = '';
    try {
      output = execFileSync('node', ['scripts/third-party-notices.mjs'], {
        cwd: WEB, encoding: 'utf8',
      });
    } catch (err: unknown) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(failed, `notices are stale — run \`node scripts/third-party-notices.mjs --write\`\n${output}`)
      .toBe(false);
  });

  it('carry every licence family that reaches the bundle, and name the copyleft one', () => {
    const text = fs.readFileSync(NOTICES, 'utf8');
    // Named individually rather than counted: a count passes when MPL silently becomes MIT.
    expect(text, 'MIT packages').toContain('| MIT |');
    expect(text, 'Apache-2.0 packages').toContain('| Apache-2.0 |');
    expect(text, 'web-ifc is MPL-2.0, not MIT — the one file-level copyleft in the bundle')
      .toContain('| MPL-2.0 |');
    // MPL §3.2 is the only clause here that needs a sentence rather than a licence dump.
    expect(text).toContain('MPL-2.0 note:');
  });

  it('reproduce real copyright lines, not a summary of them', () => {
    const text = fs.readFileSync(NOTICES, 'utf8');
    // Three spot checks across the three licence families. If minification or a generator
    // change ever reduces this file to a table, these are what notice.
    expect(text).toContain('three.js authors');
    expect(text).toContain('Copyright (c) 2013 pieroxy');       // lz-string, MIT
    expect(text).toContain('Apache License');                    // the xlsx family, in full
  });

  it('do not list build tooling, which is not distributed', () => {
    const text = fs.readFileSync(NOTICES, 'utf8');
    // Listing it is not harmless: obligations that do not exist make the real ones easier to
    // miss, and a reader cannot tell which of a hundred entries binds anybody.
    for (const dev of ['| `vite` |', '| `vitest` |', '| `svelte` |', '| `typescript` |']) {
      expect(text, `${dev} is a build tool and must not be listed`).not.toContain(dev);
    }
  });
});
