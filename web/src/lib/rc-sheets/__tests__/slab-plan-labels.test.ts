/** The level plan as drawn: the three layers toggled one at a time, every leg's length beside its leg, and the package labels clear of each other. */
import { describe, it, expect } from 'vitest';
import { planDrawing } from '../slab-plan';
import { legLabelBox, placePlanLabels, segmentHitsBox, type Box } from '../slab-plan-labels';
import { level, fmt } from '../plans/__tests__/fixtures';

const overlap = (a: Box, b: Box) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
const size = { char: 0.07, height: 0.11, gap: 0.04, legChar: 0.06, legHeight: 0.1 };

describe('the level plan\'s layers', () => {
  const { plan } = level();

  it('draws the base mesh, the other bottom bars and the top bars each by its own toggle', () => {
    const ids = (show: { base: boolean; bottom: boolean; top: boolean }) => new Set(planDrawing(plan, show, fmt).map((b) => b.id));
    const base = ids({ base: true, bottom: false, top: false }), bottom = ids({ base: false, bottom: true, top: false }), top = ids({ base: false, bottom: false, top: true });
    const all = ids({ base: true, bottom: true, top: true });
    expect(base.size + bottom.size + top.size).toBe(all.size);
    for (const id of base) expect(plan.packages.find((p) => p.id === id)!.base).toBe(true);
    for (const id of bottom) { const p = plan.packages.find((q) => q.id === id)!; expect(p.layer).toBe('bottom'); expect(p.base).not.toBe(true); }
    for (const id of top) expect(plan.packages.find((p) => p.id === id)!.layer).toBe('top');
    expect(top.size).toBeGreaterThan(0);
    if (plan.baseMesh) expect(base.size).toBeGreaterThan(0);
  });

  it('writes every leg\'s length beside its leg, the bottom bars\' turned-up legs too, off the bar', () => {
    const bars = planDrawing(plan, { base: true, bottom: true, top: true }, fmt);
    const bottom = bars.filter((b) => b.layer === 'bottom' && b.legs.length > 1);
    expect(bottom.length).toBeGreaterThan(0);
    for (const b of bars) {
      const main = b.legs.reduce((m, l, j) => (l.length > b.legs[m]!.length ? j : m), 0);
      b.legs.forEach((l, j) => {
        if (j === main) return;
        const { box } = legLabelBox(l, String(Math.round(l.length * 100)), size);
        expect(segmentHitsBox(b.pts[j]!, b.pts[j + 1]!, box), `${b.mark} leg ${j}`).toBe(false);
      });
    }
  });

  it('keeps each package label beside its own bar and clear of every other label and leg length', () => {
    const bars = planDrawing(plan, { base: true, bottom: true, top: true }, fmt);
    const places = placePlanLabels(bars, (b) => `${b.mark} · ${b.label}`, (m) => String(Math.round(m * 100)), size);
    const boxes = bars.map((b) => places.get(b.id)!.box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${bars[i]!.mark} / ${bars[j]!.mark}`).toBe(false);
    for (const b of bars) {
      const { box } = places.get(b.id)!;
      const main = b.legs.reduce((m, l, j) => (l.length > b.legs[m]!.length ? j : m), 0);
      const [p, q] = [b.pts[main]!, b.pts[main + 1]!];
      const dist = b.dir === 'x' ? Math.min(Math.abs(box.y0 - p[1]), Math.abs(box.y1 - p[1])) : Math.min(Math.abs(box.x0 - p[0]), Math.abs(box.x1 - p[0]));
      expect(dist).toBeCloseTo(size.gap, 9);
      expect(segmentHitsBox(p, q, box)).toBe(false);
      for (const c of bars) c.legs.forEach((l, j) => {
        const main2 = c.legs.reduce((m, x, k) => (x.length > c.legs[m]!.length ? k : m), 0);
        if (j !== main2) expect(overlap(box, legLabelBox(l, String(Math.round(l.length * 100)), size).box)).toBe(false);
      });
    }
  });

  it('slides a label along its bar off a crossing rod when there is room', () => {
    const bars = planDrawing(plan, { base: true, bottom: true, top: true }, fmt);
    const x = bars.find((b) => b.dir === 'x')!;
    const main = x.legs.reduce((m, l, j) => (l.length > x.legs[m]!.length ? j : m), 0);
    const [p, q] = [x.pts[main]!, x.pts[main + 1]!], mid = (p[0] + q[0]) / 2;
    const crossing = { ...x, id: 'cross', dir: 'y' as const, pts: [[mid, p[1] - 1], [mid, p[1] + 1]] as Array<[number, number]>, legs: [{ at: [mid, p[1]] as [number, number], length: 2, out: [1, 0] as [number, number] }], band: [[mid - 9, p[1] + 5], [mid - 9.1, p[1] + 5]] as [[number, number], [number, number]] };
    const places = placePlanLabels([x, crossing], () => 'X · Ø8 c/18 L=1,00', () => '', size);
    const box = places.get(x.id)!.box;
    expect(segmentHitsBox(crossing.pts[0]!, crossing.pts[1]!, box)).toBe(false);
  });
});
