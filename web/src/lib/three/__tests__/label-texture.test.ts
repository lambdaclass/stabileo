/**
 * A label's texture is as big as its text, not a 256 px square.
 *
 * Every reaction, diagram extreme and load value in the 3D view is a sprite
 * with its own canvas. Doubling the square from 128 to 256 px to keep long
 * values sharp and unclipped made each of them four times the memory, for a
 * text that fills a band across the middle of it.
 */
import { describe, it, expect } from 'vitest';

interface FakeCanvas { width: number; height: number; font: string; drawn: Array<{ text: string; font: string }> }
const made: FakeCanvas[] = [];
/** About 0.6 em per character, like a bold sans-serif. */
const em = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: () => {
      const c: FakeCanvas = { width: 300, height: 150, font: '', drawn: [] };
      const ctx = {
        fillStyle: '', textAlign: 'center', textBaseline: 'middle',
        get font() { return c.font; }, set font(f: string) { c.font = f; },
        measureText: (t: string) => ({ width: 0.6 * em(c.font) * t.length }),
        fillText: (text: string) => { c.drawn.push({ text, font: c.font }); },
      };
      made.push(c);
      return Object.assign(c, { getContext: () => ctx });
    },
  },
  configurable: true,
});

const { createTextSprite } = await import('../selection-helpers');

const last = () => made[made.length - 1]!;

describe('a label texture', () => {
  it('for a short value is smaller than the old 128 px square', () => {
    createTextSprite('12', '#fff', 36);
    expect(last().width * last().height).toBeLessThan(128 * 128);
  });
  it('for a long value is at most 256 px wide and the text fits it', () => {
    createTextSprite('Rz = −123.45 kN·m', '#fff', 36);
    const c = last();
    expect(c.width).toBeLessThanOrEqual(256);
    expect(c.height).toBeLessThan(128);
    const d = c.drawn[0]!;
    expect(0.6 * em(d.font) * d.text.length).toBeLessThanOrEqual(c.width);
  });
  it('draws the text at the size it was, centred where it was', () => {
    const s = createTextSprite('5', '#fff', 36);
    // Twice the old 128 px font scale, and a sprite whose shape follows the texture.
    expect(em(last().drawn[0]!.font)).toBe(72);
    expect(s.scale.x).toBeCloseTo(0.6);
  });
});
