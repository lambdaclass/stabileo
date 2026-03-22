/**
 * Bar-mark assignment and cutting-length estimation for RC elements.
 *
 * v1: approximate cutting lengths from element length + detailing allowances.
 * Not envelope-based or stock-length-aware yet.
 */

import type { ElementVerification, DetailingResult } from './codes/argentina/cirsoc201';

export interface BarMark {
  mark: string;
  diameter: number;        // mm
  shape: 'straight' | 'hooked' | 'stirrup';
  cuttingLength: number;   // m
  count: number;           // total bars
  elementsUsing: number[];
  totalLength: number;     // m
  weight: number;          // kg
  overStock: boolean;      // cutting length > 12m
}

const STEEL_DENSITY = 7850; // kg/m³

function barArea(dia: number): number {
  return Math.PI * (dia / 2000) ** 2; // m²
}

/**
 * Assign bar marks and compute estimated cutting lengths from verification results.
 */
export function computeBarMarks(
  verifications: ElementVerification[],
  elementLengths: Map<number, number>,
): BarMark[] {
  const marks: BarMark[] = [];
  let beamIdx = 1;
  let colIdx = 1;
  let stirIdx = 1;

  // Group verifications by identical reinforcement (same as schedule grouping)
  interface Group {
    type: 'beam' | 'column' | 'wall';
    elementIds: number[];
    representative: ElementVerification;
    avgLength: number;
  }

  const groupMap = new Map<string, Group>();
  for (const v of verifications) {
    const mainBars = v.column ? v.column.bars : v.flexure.bars;
    const stirrups = `eØ${v.shear.stirrupDia} c/${(v.shear.spacing * 100).toFixed(0)}`;
    const key = `${v.elementType}_${(v.b * 100).toFixed(0)}x${(v.h * 100).toFixed(0)}_${mainBars}_${stirrups}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.elementIds.push(v.elementId);
    } else {
      groupMap.set(key, { type: v.elementType, elementIds: [v.elementId], representative: v, avgLength: 0 });
    }
  }

  // Compute average element length per group
  for (const g of groupMap.values()) {
    const lengths = g.elementIds.map(id => elementLengths.get(id) ?? 0).filter(l => l > 0);
    g.avgLength = lengths.length > 0 ? lengths.reduce((s, l) => s + l, 0) / lengths.length : 3;
  }

  for (const g of groupMap.values()) {
    const v = g.representative;
    const det = v.detailing;
    const isCol = v.elementType === 'column' || v.elementType === 'wall';
    const prefix = isCol ? 'C' : 'B';
    const idx = isCol ? colIdx++ : beamIdx++;

    // ── Longitudinal bottom/main bars ──
    const mainBarDia = v.column ? v.column.barDia : v.flexure.barDia;
    const mainBarCount = v.column ? v.column.barCount : v.flexure.barCount;
    const detBar = det?.bars.find(b => b.diameter === mainBarDia);

    let mainCutLen: number;
    let mainShape: 'straight' | 'hooked';
    if (isCol) {
      // Column: story height + lap splice above
      const splice = detBar?.lapSplice ?? 0.5;
      mainCutLen = g.avgLength + splice;
      mainShape = 'straight';
    } else {
      // Beam: element length + hooks at both ends (conservative)
      const ldh = detBar?.ldh ?? 0.3;
      mainCutLen = g.avgLength + 2 * ldh;
      mainShape = 'hooked';
    }

    marks.push({
      mark: `${prefix}${idx}`,
      diameter: mainBarDia,
      shape: mainShape,
      cuttingLength: Math.round(mainCutLen * 100) / 100,
      count: mainBarCount * g.elementIds.length,
      elementsUsing: [...g.elementIds],
      totalLength: Math.round(mainCutLen * mainBarCount * g.elementIds.length * 100) / 100,
      weight: Math.round(mainCutLen * mainBarCount * g.elementIds.length * barArea(mainBarDia) * STEEL_DENSITY * 10) / 10,
      overStock: mainCutLen > 12,
    });

    // ── Top/compression bars (beams only, if doubly reinforced) ──
    if (!isCol && v.flexure.isDoublyReinforced && v.flexure.barCountComp && v.flexure.barDiaComp) {
      const topDia = v.flexure.barDiaComp;
      const topCount = v.flexure.barCountComp;
      const topDetBar = det?.bars.find(b => b.diameter === topDia);
      const topLdh = topDetBar?.ldh ?? 0.3;
      const topCutLen = g.avgLength + 2 * topLdh;
      marks.push({
        mark: `${prefix}${idx}t`,
        diameter: topDia,
        shape: 'hooked',
        cuttingLength: Math.round(topCutLen * 100) / 100,
        count: topCount * g.elementIds.length,
        elementsUsing: [...g.elementIds],
        totalLength: Math.round(topCutLen * topCount * g.elementIds.length * 100) / 100,
        weight: Math.round(topCutLen * topCount * g.elementIds.length * barArea(topDia) * STEEL_DENSITY * 10) / 10,
        overStock: topCutLen > 12,
      });
    }

    // ── Stirrups ──
    const stDia = v.shear.stirrupDia;
    const spacing = v.shear.spacing;
    const legs = v.shear.stirrupLegs ?? 2;
    const hookExt = (stDia <= 16 ? 6 : 8) * stDia / 1000; // m
    const perimeter = 2 * (v.b - 2 * v.cover) + 2 * (v.h - 2 * v.cover) + 2 * hookExt + 0.1; // + overlaps
    const nStirrups = Math.ceil(g.avgLength / spacing) * g.elementIds.length;

    marks.push({
      mark: `S${stirIdx++}`,
      diameter: stDia,
      shape: 'stirrup',
      cuttingLength: Math.round(perimeter * 100) / 100,
      count: nStirrups,
      elementsUsing: [...g.elementIds],
      totalLength: Math.round(perimeter * nStirrups * 100) / 100,
      weight: Math.round(perimeter * nStirrups * barArea(stDia) * STEEL_DENSITY * 10) / 10,
      overStock: false, // stirrups never exceed stock length
    });
  }

  return marks;
}
