/**
 * The landing's design section shows the reinforcement sheets (a beam line in elevation with its
 * envelopes, on the seven-storey example), not the 3D rebar workspace the RC desk deletion removed:
 * its four derivatives are served, its size is theirs, its caption exists in the six languages and
 * the screenshot script accounts for it.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../../lib/i18n/locales/en';
import es from '../../../lib/i18n/locales/es';
import pt from '../../../lib/i18n/locales/pt';
import de from '../../../lib/i18n/locales/de';
import fr from '../../../lib/i18n/locales/fr';
import tr from '../../../lib/i18n/locales/tr';

const root = process.cwd();
const src = readFileSync(join(root, 'src/components/landing/LandingProDesign.svelte'), 'utf8');

describe('the landing shows the reinforcement sheets', () => {
  it('serves the screenshot at 800 and 1600 px in AVIF and WebP, at the size the page declares', () => {
    expect(src).toContain('<Shot base="pro-rc-sheets"');
    expect(src).not.toContain('pro-rebar-3d');
    for (const w of [800, 1600]) for (const ext of ['avif', 'webp']) expect(existsSync(join(root, `public/screenshots/pro-rc-sheets-${w}.${ext}`)), `${w}.${ext}`).toBe(true);
    const [, w, h] = /SHOT_W = (\d+), SHOT_H = (\d+)/.exec(src)!;
    const webp = readFileSync(join(root, 'public/screenshots/pro-rc-sheets-1600.webp'));
    // VP8X: canvas width and height minus one, 24-bit little endian, at bytes 24 and 27.
    const dim = (o: number) => webp[o]! + (webp[o + 1]! << 8) + (webp[o + 2]! << 16) + 1;
    expect(webp.toString('ascii', 12, 16) === 'VP8X' ? [dim(24), dim(27)] : [webp.readUInt16LE(26) & 0x3fff, webp.readUInt16LE(28) & 0x3fff]).toEqual([Number(w), Number(h)]);
  });

  it('captions it in the six languages', () => {
    for (const [name, dict] of Object.entries({ en, es, pt, de, fr, tr })) {
      const d = dict as Record<string, string>;
      expect(d['landing.shotSheetsAlt'], name).toBeTruthy();
      expect(d['landing.shotSheetsTitle'], name).toBeTruthy();
    }
  });

  it('is listed among the hand-captured shots', () => {
    const script = readFileSync(join(root, 'scripts/take-screenshots.ts'), 'utf8');
    expect(script).toContain("'pro-rc-sheets.png'");
    expect(script).not.toContain("'pro-rebar-3d.png'");
  });
});
