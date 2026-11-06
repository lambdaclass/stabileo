import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { COLORS } from '../../../lib/three/selection-helpers';

const viewer = readFileSync(new URL('../ScalarFieldViewer.svelte', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../../../styles/tokens.css', import.meta.url), 'utf8');

function resolve(name: string): string {
  const value = tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`no token ${name}`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(ref[1]) : value;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

it('draws the viewer mark in a colour that reaches 4.5:1 on the scene background', () => {
  const rule = viewer.slice(viewer.indexOf('.sfv-mark {'), viewer.indexOf('}', viewer.indexOf('.sfv-mark {')));
  const token = rule.match(/color:\s*var\((--[\w-]+)\)/)![1];
  const scene = `#${COLORS.background.toString(16).padStart(6, '0')}`;
  expect(contrast(resolve(token), scene)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(resolve('--st-text-3'), scene)).toBeLessThan(4.5);
});
