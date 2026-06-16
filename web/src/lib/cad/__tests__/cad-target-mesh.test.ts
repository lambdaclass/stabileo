// Target-size structured meshing (PR [9]): uniform cell size across panels of
// any size, mesh lines forced through structural geometry + opening edges,
// near lines snapped to avoid slivers.
import { describe, it, expect } from 'vitest';
import { generateStructuredMesh, structuredBreakpoints, makeOpeningPoly, meshRectWithOpenings } from '../geometry';

const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
const outline = (minX: number, minY: number, maxX: number, maxY: number) =>
  [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];

function cellSizes(cells: Array<{ minX: number; maxX: number; minY: number; maxY: number }>) {
  const w = cells.map((c) => c.maxX - c.minX);
  const h = cells.map((c) => c.maxY - c.minY);
  return { w, h, maxW: Math.max(...w), minW: Math.min(...w), maxH: Math.max(...h), minH: Math.min(...h) };
}

describe('structuredBreakpoints — degenerate target (crash regression)', () => {
  // REGRESSION for the "Generate Draft" crash: a cleared/zeroed mesh-target
  // field reached here as target 0 → round(gap/0)=Infinity → the subdivision
  // loop ran unbounded, exhausting memory and crashing the tab. The function
  // must terminate (and fall back to the 1 m default) for any bad target.
  it('target 0 terminates and falls back to the 1 m default (no infinite loop)', () => {
    const { lines } = structuredBreakpoints(0, 10, { mode: 'targetSize', target: 0 });
    expect(lines[0]).toBe(0);
    expect(lines[lines.length - 1]).toBe(10);
    expect(lines.length).toBe(11);              // 1 m default applied
    expect(Number.isFinite(lines.length)).toBe(true);
  });

  it('negative / NaN / Infinity targets terminate with a sane finite mesh', () => {
    for (const bad of [-2, NaN, Infinity, -Infinity]) {
      const { lines } = structuredBreakpoints(0, 10, { mode: 'targetSize', target: bad });
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThan(1000);
      expect(lines[0]).toBe(0);
      expect(lines[lines.length - 1]).toBe(10);
    }
  });

  it('a pathologically tiny target is capped (no memory blow-up)', () => {
    // 10 m / 0.0005 = 20000 cells uncapped; the per-gap cap holds it to 256.
    const { lines } = structuredBreakpoints(0, 10, { mode: 'targetSize', target: 0.0005 });
    expect(lines.length).toBeLessThanOrEqual(257);
  });
});

describe('structuredBreakpoints — target size', () => {
  it('10 m span at target 1 m → ~1 m spacing', () => {
    const { lines } = structuredBreakpoints(0, 10, { mode: 'targetSize', target: 1 });
    expect(lines[0]).toBe(0);
    expect(lines[lines.length - 1]).toBe(10);
    for (let i = 1; i < lines.length; i++) expect(lines[i] - lines[i - 1]).toBeCloseTo(1, 6);
    expect(lines.length).toBe(11);
  });

  it('forced line at x=3.0 is included exactly', () => {
    const { lines } = structuredBreakpoints(0, 6, { mode: 'targetSize', target: 1, forced: [3.0] });
    expect(lines.some((v) => Math.abs(v - 3.0) < 1e-9)).toBe(true);
  });

  it('a near line (2.98) snaps to the forced structural line (3.0), no 2 cm strip', () => {
    // An opening edge at 2.98 sits 2 cm from a forced beam line at 3.0; with
    // snapTol 3 cm they merge, keeping the higher-priority forced line 3.0.
    const { lines, slivers } = structuredBreakpoints(0, 6, {
      mode: 'targetSize', target: 1, forced: [3.0], openingEdges: [2.98], snapTol: 0.03,
    });
    const near3 = lines.filter((v) => Math.abs(v - 3) < 0.05);
    expect(near3.length).toBe(1);               // merged to a single line
    expect(near3[0]).toBeCloseTo(3.0, 6);        // structural line kept
    expect(slivers).toBe(0);                     // no 2 cm strip created
  });

  it('two forced lines genuinely closer than target*minRatio are flagged as slivers', () => {
    // 3.0 and 3.4 (0.4 m) with target 1, minRatio 0.75 → 0.4 < 0.75 → sliver.
    const { slivers } = structuredBreakpoints(0, 6, {
      mode: 'targetSize', target: 1, forced: [3.0, 3.4], snapTol: 0.03, minRatio: 0.75,
    });
    expect(slivers).toBeGreaterThan(0);
  });
});

describe('generateStructuredMesh — target size', () => {
  it('1: 10×6 slab at target 1 m → cell widths/heights close to 1 m', () => {
    const r = generateStructuredMesh({ panel: rect(0, 0, 10, 6), containment: outline(0, 0, 10, 6), openings: [], mode: 'targetSize', targetSize: 1 });
    const s = cellSizes(r.cells);
    expect(s.maxW).toBeCloseTo(1, 6); expect(s.minW).toBeCloseTo(1, 6);
    expect(s.maxH).toBeCloseTo(1, 6); expect(s.minH).toBeCloseTo(1, 6);
    expect(r.cells.length).toBe(60);
  });

  it('2: small 2×2 slab at target 1 m → ~2×2 cells (not a fixed 4×4/8×8)', () => {
    const r = generateStructuredMesh({ panel: rect(0, 0, 2, 2), containment: outline(0, 0, 2, 2), openings: [], mode: 'targetSize', targetSize: 1 });
    expect(r.cells.length).toBe(4);
  });

  it('3: large and small panels get comparable element sizes at the same target', () => {
    const big = generateStructuredMesh({ panel: rect(0, 0, 12, 8), containment: outline(0, 0, 12, 8), openings: [], mode: 'targetSize', targetSize: 1 });
    const small = generateStructuredMesh({ panel: rect(0, 0, 3, 2), containment: outline(0, 0, 3, 2), openings: [], mode: 'targetSize', targetSize: 1 });
    const bs = cellSizes(big.cells), ss = cellSizes(small.cells);
    // Average cell areas within a factor of ~1.5 of each other.
    const avg = (s: ReturnType<typeof cellSizes>) => (s.w.reduce((a, b) => a + b, 0) / s.w.length) * (s.h.reduce((a, b) => a + b, 0) / s.h.length);
    const ratio = avg(bs) / avg(ss);
    expect(ratio).toBeGreaterThan(0.66);
    expect(ratio).toBeLessThan(1.5);
  });

  it('4/6: opening edges remain breakpoints; no cell centroid inside the opening', () => {
    const op = makeOpeningPoly([{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 4 }, { x: 4, y: 4 }])!;
    const r = generateStructuredMesh({ panel: rect(0, 0, 10, 6), containment: outline(0, 0, 10, 6), openings: [op], mode: 'targetSize', targetSize: 1 });
    expect(r.droppedByOpening).toBeGreaterThan(0);
    for (const c of r.cells) {
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
      expect(cx > 4 && cx < 6 && cy > 2 && cy < 4).toBe(false);
    }
    // Opening edges (x=4,6 / y=2,4) are exact mesh lines.
    expect(r.cells.some((c) => Math.abs(c.maxX - 4) < 1e-9)).toBe(true);
    expect(r.cells.some((c) => Math.abs(c.minY - 4) < 1e-9)).toBe(true);
  });

  it('forced interior beam line splits the panel exactly at the beam', () => {
    const r = generateStructuredMesh({ panel: rect(0, 0, 10, 6), containment: outline(0, 0, 10, 6), openings: [], mode: 'targetSize', targetSize: 5, forcedX: [3] });
    // With target 5, span 10 would give ~2 cells; forcing x=3 guarantees a line there.
    expect(r.cells.some((c) => Math.abs(c.maxX - 3) < 1e-9 || Math.abs(c.minX - 3) < 1e-9)).toBe(true);
  });
});

describe('generateStructuredMesh — fixed divisions backward-compat', () => {
  it('fixed 4×4 on a 10×6 panel → 16 cells regardless of target', () => {
    const r = generateStructuredMesh({ panel: rect(0, 0, 10, 6), containment: outline(0, 0, 10, 6), openings: [], mode: 'fixedDivisions', fixedNx: 4, fixedNy: 4 });
    expect(r.cells.length).toBe(16);
  });

  it('legacy meshRectWithOpenings stays a pure N×N grid (no forced lines passed)', () => {
    // The draft/ProShellTab fixed-mode path passes no forced lines, so the
    // legacy wrapper produces exactly N×N — backward compatible.
    const r = meshRectWithOpenings(rect(0, 0, 8, 4), outline(0, 0, 8, 4), 2, []);
    expect(r.cells.length).toBe(4);
    expect(r.cells.some((c) => Math.abs(c.maxX - 3) < 1e-9)).toBe(false);
  });
});
