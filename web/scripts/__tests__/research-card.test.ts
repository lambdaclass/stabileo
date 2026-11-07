import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPERIMENTS } from '../../src/components/research/experiments';
import { webpSize, withResearchCard } from '../research-card';

const PUBLIC = join(import.meta.dirname, '../../public');
const SITE_HEAD = [
  '<meta property="og:image" content="https://stabileo.com/og/stabileo-social.png">',
  '<meta property="og:image:type" content="image/png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta property="og:image:alt" content="Stabileo">',
  '<meta name="twitter:image" content="https://stabileo.com/og/stabileo-social.png">',
  '<meta name="twitter:image:alt" content="Stabileo">',
  '<meta property="og:title" content="A paper">',
].join('');
const content = (head: string, attr: string, key: string) => head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`))?.[1];

describe('the social card of a prerendered research page', () => {
  const webp = EXPERIMENTS.filter((e) => e.thumbnail.endsWith('.webp'));

  it('is the WebP thumbnail, declared at the size the file has', () => {
    expect(webp.length).toBeGreaterThan(0);
    for (const e of webp) {
      const head = withResearchCard(SITE_HEAD, e.path, PUBLIC);
      const file = readFileSync(join(PUBLIC, e.thumbnail));
      const size = webpSize(file);
      expect(size.width, e.thumbnail).toBeGreaterThan(0);
      expect(size.height, e.thumbnail).toBeGreaterThan(0);
      const alt = e.thumbnailAlt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      expect([
        content(head, 'property', 'og:image'),
        content(head, 'name', 'twitter:image'),
        content(head, 'property', 'og:image:alt'),
        content(head, 'name', 'twitter:image:alt'),
        content(head, 'property', 'og:image:type'),
        content(head, 'property', 'og:image:width'),
        content(head, 'property', 'og:image:height'),
      ], e.path).toEqual([
        `https://stabileo.com/${e.thumbnail}`, `https://stabileo.com/${e.thumbnail}`, alt, alt, 'image/webp', String(size.width), String(size.height),
      ]);
      expect(head).toContain('<meta property="og:title" content="A paper">');
      expect(head.match(/<meta /g)?.length).toBe(8);
    }
  });

  it('stays the site card for a vector thumbnail and for any page that is not a paper', () => {
    const vector = EXPERIMENTS.find((e) => !e.thumbnail.endsWith('.webp'))!;
    expect(withResearchCard(SITE_HEAD, vector.path, PUBLIC)).toBe(SITE_HEAD);
    expect(withResearchCard(SITE_HEAD, '/research', PUBLIC)).toBe(SITE_HEAD);
    expect(withResearchCard(SITE_HEAD, '/blog/bars-or-finite-elements', PUBLIC)).toBe(SITE_HEAD);
  });

  it('refuses a head that lost one of the tags it replaces', () => {
    const head = SITE_HEAD.replace('<meta property="og:image:width" content="1200">', '');
    expect(() => withResearchCard(head, webp[0].path, PUBLIC)).toThrow(/og:image:width/);
  });

  it('reads the size from each WebP header layout', () => {
    const riff = (chunk: string, body: Buffer) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP' + chunk, 'ascii'), body]);
    const lossy = Buffer.alloc(18);
    lossy.writeUInt16LE(640, 10);
    lossy.writeUInt16LE(400, 12);
    expect(webpSize(riff('VP8 ', lossy))).toEqual({ width: 640, height: 400 });
    const extended = Buffer.alloc(18);
    extended.writeUIntLE(1199, 8, 3);
    extended.writeUIntLE(629, 11, 3);
    expect(webpSize(riff('VP8X', extended))).toEqual({ width: 1200, height: 630 });
    const lossless = Buffer.alloc(18);
    lossless.writeUInt32LE((320 - 1) | ((200 - 1) << 14), 5);
    expect(webpSize(riff('VP8L', lossless))).toEqual({ width: 320, height: 200 });
    expect(() => webpSize(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'ascii'))).toThrow(/not a WebP/);
  });
});
