import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPERIMENTS } from '../src/components/research/experiments';

export function webpSize(file: Buffer): { width: number; height: number } {
  const chunk = file.toString('ascii', 12, 16);
  if (file.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  if (chunk === 'VP8 ') return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8X') return { width: 1 + file.readUIntLE(24, 3), height: 1 + file.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = file.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
  }
  throw new Error(`not a WebP file (${chunk})`);
}

const attribute = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** A research paper with a WebP thumbnail gets it as its social card; every other page keeps the head it has. */
export function withResearchCard(head: string, path: string, dist: string): string {
  const experiment = EXPERIMENTS.find((e) => e.path === path);
  if (!experiment?.thumbnail.endsWith('.webp')) return head;
  const { width, height } = webpSize(readFileSync(join(dist, experiment.thumbnail)));
  const url = `https://stabileo.com/${experiment.thumbnail}`;
  const tags: [string, string, string][] = [
    ['property', 'og:image', url],
    ['name', 'twitter:image', url],
    ['property', 'og:image:alt', experiment.thumbnailAlt],
    ['name', 'twitter:image:alt', experiment.thumbnailAlt],
    ['property', 'og:image:type', 'image/webp'],
    ['property', 'og:image:width', String(width)],
    ['property', 'og:image:height', String(height)],
  ];
  return tags.reduce((out, [attr, key, value]) => {
    const tag = new RegExp(`<meta\\b[^>]*\\b${attr}="${key}"[^>]*>`);
    if (!tag.test(out)) throw new Error(`research card: ${path} has no ${key} tag to replace`);
    return out.replace(tag, () => `<meta ${attr}="${key}" content="${attribute(value)}">`);
  }, head);
}
