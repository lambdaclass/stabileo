import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { precompress } from '../precompress.mjs';

describe('precompress', () => {
  it('writes a .br that inflates to the exact file, for compressible files only, and drops a stale one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'precompress-'));
    try {
      mkdirSync(join(dir, 'assets'));
      const js = 'export const x = ' + JSON.stringify('stabileo '.repeat(500)) + ';\n';
      const wasm = Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), Buffer.alloc(4096, 7)]);
      writeFileSync(join(dir, 'assets/a.js'), js);
      writeFileSync(join(dir, 'assets/e.wasm'), wasm);
      writeFileSync(join(dir, 'tiny.css'), 'a{}');
      writeFileSync(join(dir, 'photo.png'), Buffer.alloc(4096, 1));
      let state = 2463534242;
      const noise = Buffer.from(Array.from({ length: 4096 }, () => {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        return (state >>> 0) & 255;
      }));
      writeFileSync(join(dir, 'noise.json'), noise);
      writeFileSync(join(dir, 'noise.json.br'), 'stale');

      const { files } = await precompress(dir);

      expect(files).toBe(3);
      expect(brotliDecompressSync(readFileSync(join(dir, 'assets/a.js.br'))).toString()).toBe(js);
      expect(brotliDecompressSync(readFileSync(join(dir, 'assets/e.wasm.br'))).equals(wasm)).toBe(true);
      expect(existsSync(join(dir, 'tiny.css.br'))).toBe(false);
      expect(existsSync(join(dir, 'photo.png.br'))).toBe(false);
      expect(existsSync(join(dir, 'noise.json.br'))).toBe(false);

      writeFileSync(join(dir, 'assets/a.js'), 'export const x = 1;\n');
      await precompress(dir);
      expect(existsSync(join(dir, 'assets/a.js.br')), 'a file that shrank below the threshold keeps no stale .br').toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
