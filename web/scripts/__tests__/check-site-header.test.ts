import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../check-site-header.mjs', import.meta.url).pathname;
const run = (dir: string) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

describe('check-site-header', () => {
  it('passes the real tree', () => {
    expect(run(new URL('../../src', import.meta.url).pathname).status).toBe(0);
  });

  it('fails a second header and a retired import', () => {
    for (const body of ['<nav class="nav" aria-label="x"></nav>', "<script>import BlogNav from './BlogNav.svelte';</script>"]) {
      const dir = mkdtempSync(join(tmpdir(), 'hdr-'));
      mkdirSync(join(dir, 'components/site'), { recursive: true });
      writeFileSync(join(dir, 'components/site/SiteHeader.svelte'), '<nav class="nav"></nav>');
      writeFileSync(join(dir, 'components/Other.svelte'), body);
      expect(run(dir).status).toBe(1);
    }
  });
});
