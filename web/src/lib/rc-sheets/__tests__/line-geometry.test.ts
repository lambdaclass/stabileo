/**
 * What the workspace's elevation and the exported drawing both read off a beam line: each bar's
 * pieces span by span, every stirrup the schedule counts, extra bars set out from their axes, and
 * the sections cut once each.
 */
import { describe, it, expect } from 'vitest';
import { barTrace, hookLegOf, lineSections, lineSupports, markPlaces, placeLabels, setOut, stirrupPositions } from '../line-geometry';
import { stirrupsOver } from '../schedule/pieces';
import { fmt, twoSpanLine } from '../plans/__tests__/fixtures';

describe('beam line geometry', () => {
  const { line, rows } = twoSpanLine();

  it('splits a continuous bar at the spans and lets the end spans reach into the end supports', () => {
    const bar = line.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!;
    const t = barTrace(line, bar);
    expect(t.map((g) => g.span)).toEqual([0, 1]);
    expect(t[0]!.from).toBeCloseTo(bar.from, 9);
    expect(t[0]!.to).toBeCloseTo(line.spans[0]!.x1, 9);
    expect(t[1]!.to).toBeCloseTo(bar.to, 9);
    expect(hookLegOf(bar)).toBeGreaterThan(0.1);
  });

  it('places as many stirrups as the schedule counts, the first at min(5 cm; s/2) into each zone, and thins them on asking', () => {
    const all = stirrupPositions(line);
    expect(all.length).toBe(line.zones.reduce((s, z) => s + stirrupsOver(z.from, z.to, z.stirrups.spacing), 0));
    const z = line.zones[0]!;
    expect(all[0]!.x).toBeCloseTo(z.from + Math.min(0.05, z.stirrups.spacing / 2), 9);
    expect(all.every((p) => line.zones[p.zone]!.from - 1e-9 <= p.x && p.x <= line.zones[p.zone]!.to + 1e-9)).toBe(true);
    expect(stirrupPositions(line, () => 2).length).toBeLessThan(all.length);
  });

  it('sets a support bar out from its axis and a span bar from its span\'s axes; a continuous bar from neither', () => {
    const sup = line.bars.find((b) => b.kind === 'support');
    if (sup) {
      const so = setOut(line, sup)!;
      expect(lineSupports(line)).toContain(so.axes[0]);
      expect(so.d[0] + so.d[1]).toBeCloseTo(sup.to - sup.from, 9);
    }
    expect(setOut(line, line.bars.find((b) => b.kind === 'continuous')!)).toBeNull();
  });

  it('numbers each distinct section once with every place it is cut', () => {
    const secs = lineSections(line, rows, fmt, true);
    expect(secs.map((s) => s.label)).toEqual(secs.map((_, i) => String(i + 1)));
    expect(secs.reduce((n, s) => n + s.at.length, 0)).toBe(3 * line.spans.length);
    expect(secs[0]!.title.startsWith('1–1 · V1-1 · i')).toBe(true);
  });

  it('keeps labels of a row apart and off the fixed things on it, each as near its place as it can stand', () => {
    expect(placeLabels([1, 1, 3], 0.5)).toEqual([1, 1.5, 3]);
    const [x] = placeLabels([2], 0.5, [2.1], 0.4);
    expect(Math.abs(x! - 2.1)).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(x).toBeCloseTo(1.7, 9);
    const marks = markPlaces(line, 0.3);
    for (const face of ['top', 'bottom'] as const) {
      const xs = line.bars.filter((b) => b.face === face).map((b) => marks.get(b.mark)!).sort((p, q) => p - q);
      xs.slice(1).forEach((v, i) => expect(v - xs[i]!).toBeGreaterThanOrEqual(0.3 - 1e-9));
    }
  });
});
