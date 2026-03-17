// Beam Schedule Generator
// Groups beams by identical design (section + reinforcement) and produces
// schedule data for table rendering and SVG generation.

import type { ElementVerification } from './codes/argentina/cirsoc201';

// ─── Types ──────────────────────────────────────────────────────

/** A "beam mark" groups all beams with identical section + reinforcement */
export interface BeamMark {
  mark: string;              // e.g. "B1", "B2", ...
  b: number;                 // section width (m)
  h: number;                 // section height (m)
  fc: number;                // concrete strength (MPa)
  fy: number;                // steel yield strength (MPa)
  cover: number;             // concrete cover (m)
  // Bottom (tension) reinforcement
  barCount: number;
  barDia: number;            // mm
  bars: string;              // e.g. "4 Ø16"
  AsProv: number;            // provided steel area (cm²)
  // Top (compression) reinforcement — may be absent
  isDoublyReinforced: boolean;
  barCountComp: number;
  barDiaComp: number;        // mm
  barsComp: string;          // e.g. "2 Ø12"
  AsComp: number;            // cm²
  // Transverse reinforcement
  stirrupDia: number;        // mm
  stirrupSpacing: number;    // m
  stirrupLegs: number;
  // Utilization
  maxRatio: number;
  worstStatus: 'ok' | 'warn' | 'fail';
  // Elements in this group
  elements: BeamMarkElement[];
}

export interface BeamMarkElement {
  elementId: number;
  span: number;              // beam span (m)
  Mu: number;                // kN·m
  Vu: number;                // kN
  Nu: number;                // kN
  ratio: number;
  status: 'ok' | 'warn' | 'fail';
}

/** Flat schedule row for rendering in table / report */
export interface BeamScheduleRow {
  mark: string;
  dimensions: string;        // e.g. "25×50"
  fc: string;
  bottomBars: string;        // e.g. "4 Ø16 (8.04 cm²)"
  topBars: string;           // e.g. "2 Ø12 (2.26 cm²)" or "—"
  stirrupConfig: string;     // e.g. "eØ8 c/15"
  elementCount: number;
  maxRatio: number;
  status: 'ok' | 'warn' | 'fail';
}

// ─── Grouping Logic ─────────────────────────────────────────────

/** Generate a unique key for beam design — beams with same key share a mark */
function designKey(v: ElementVerification): string {
  const f = v.flexure;
  return [
    (v.b * 100).toFixed(0),
    (v.h * 100).toFixed(0),
    v.fc.toFixed(0),
    f.barCount,
    f.barDia.toFixed(0),
    f.isDoublyReinforced ? `${f.barCountComp ?? 0}-${(f.barDiaComp ?? 0).toFixed(0)}` : '0-0',
    v.shear.stirrupDia.toFixed(0),
    v.shear.spacing.toFixed(3),
  ].join('|');
}

/**
 * Group beam verifications into marks.
 * @param verifications All element verifications (beams + columns mixed)
 * @param elementLengths Map of element ID → length in meters
 */
export function groupBeamsByMark(
  verifications: ElementVerification[],
  elementLengths?: Map<number, number>,
): BeamMark[] {
  const beams = verifications.filter(v => v.elementType === 'beam');
  if (beams.length === 0) return [];

  // Group by design key
  const groups = new Map<string, ElementVerification[]>();
  for (const v of beams) {
    const key = designKey(v);
    const arr = groups.get(key) ?? [];
    arr.push(v);
    groups.set(key, arr);
  }

  // Convert to BeamMark objects
  const marks: BeamMark[] = [];
  let markIdx = 1;

  // Sort groups by: most elements first, then by section size
  const sorted = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return (b[0].b * b[0].h) - (a[0].b * a[0].h);
  });

  for (const group of sorted) {
    const ref = group[0];
    const f = ref.flexure;
    const s = ref.shear;

    let maxRatio = 0;
    let worstStatus: 'ok' | 'warn' | 'fail' = 'ok';

    const elements: BeamMarkElement[] = group.map(v => {
      const r = Math.max(v.flexure.ratio, v.shear.ratio);
      if (r > maxRatio) maxRatio = r;
      if (v.overallStatus === 'fail') worstStatus = 'fail';
      else if (v.overallStatus === 'warn' && worstStatus !== 'fail') worstStatus = 'warn';

      return {
        elementId: v.elementId,
        span: elementLengths?.get(v.elementId) ?? 5.0,
        Mu: v.Mu,
        Vu: v.Vu,
        Nu: v.Nu,
        ratio: r,
        status: v.overallStatus,
      };
    });

    marks.push({
      mark: `B${markIdx}`,
      b: ref.b,
      h: ref.h,
      fc: ref.fc,
      fy: ref.fy,
      cover: ref.cover,
      barCount: f.barCount,
      barDia: f.barDia,
      bars: f.bars,
      AsProv: f.AsProv,
      isDoublyReinforced: f.isDoublyReinforced,
      barCountComp: f.barCountComp ?? 0,
      barDiaComp: f.barDiaComp ?? 0,
      barsComp: f.barsComp ?? '—',
      AsComp: f.AsComp ?? 0,
      stirrupDia: s.stirrupDia,
      stirrupSpacing: s.spacing,
      stirrupLegs: s.stirrupLegs,
      maxRatio,
      worstStatus,
      elements,
    });
    markIdx++;
  }

  return marks;
}

/**
 * Build flat schedule rows for table rendering.
 */
export function buildBeamScheduleRows(marks: BeamMark[]): BeamScheduleRow[] {
  return marks.map(m => {
    const bCm = (m.b * 100).toFixed(0);
    const hCm = (m.h * 100).toFixed(0);
    const spacingCm = (m.stirrupSpacing * 100).toFixed(0);

    return {
      mark: m.mark,
      dimensions: `${bCm}×${hCm}`,
      fc: `${m.fc} MPa`,
      bottomBars: `${m.bars} (${m.AsProv.toFixed(1)} cm²)`,
      topBars: m.isDoublyReinforced
        ? `${m.barsComp} (${m.AsComp.toFixed(1)} cm²)`
        : '—',
      stirrupConfig: `eØ${m.stirrupDia} c/${spacingCm}`,
      elementCount: m.elements.length,
      maxRatio: m.maxRatio,
      status: m.worstStatus,
    };
  });
}

// ─── SVG: Beam Schedule Cross-Section ───────────────────────────

/** Generate a compact cross-section SVG for the beam schedule */
export function generateBeamCrossSectionSvg(mark: BeamMark): string {
  const scale = 280 / Math.max(mark.b, mark.h);
  const bPx = mark.b * scale;
  const hPx = mark.h * scale;
  const coverPx = mark.cover * scale;
  const W = bPx + 80;
  const H = hPx + 60;
  const ox = 40;
  const oy = 20;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .mark { font-size: 11px; fill: #4ecdc4; font-weight: bold; }
    .bar-label { font-size: 8px; fill: #f0a500; }
  </style>`);

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5" rx="2"/>`);

  // Cover line (dashed)
  lines.push(`<rect x="${ox + coverPx}" y="${oy + coverPx}" width="${bPx - 2 * coverPx}" height="${hPx - 2 * coverPx}" fill="none" stroke="#4ecdc466" stroke-width="0.5" stroke-dasharray="4 3"/>`);

  // Stirrup
  const si = coverPx + 2;
  lines.push(`<rect x="${ox + si}" y="${oy + si}" width="${bPx - 2 * si}" height="${hPx - 2 * si}" fill="none" stroke="#f0a500" stroke-width="1.2" rx="3"/>`);

  // Bottom (tension) bars
  const margin = coverPx + 10;
  const barR = Math.max((mark.barDia / 1000) * scale * 0.5, 3);
  const bottomY = oy + hPx - margin;
  for (let i = 0; i < mark.barCount; i++) {
    const t = mark.barCount === 1 ? 0.5 : i / (mark.barCount - 1);
    const bx = ox + margin + t * (bPx - 2 * margin);
    lines.push(`<circle cx="${bx}" cy="${bottomY}" r="${barR}" fill="#e94560" stroke="#ff6b80" stroke-width="0.5"/>`);
  }

  // Top (compression) bars
  if (mark.isDoublyReinforced && mark.barCountComp > 0) {
    const topY = oy + margin;
    const barRComp = Math.max((mark.barDiaComp / 1000) * scale * 0.5, 2.5);
    for (let i = 0; i < mark.barCountComp; i++) {
      const t = mark.barCountComp === 1 ? 0.5 : i / (mark.barCountComp - 1);
      const bx = ox + margin + t * (bPx - 2 * margin);
      lines.push(`<circle cx="${bx}" cy="${topY}" r="${barRComp}" fill="#e94560" stroke="#ff6b80" stroke-width="0.5" opacity="0.7"/>`);
    }
  }

  // Dimensions
  lines.push(`<line x1="${ox}" y1="${oy + hPx + 10}" x2="${ox + bPx}" y2="${oy + hPx + 10}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 22}" text-anchor="middle" class="dim">${(mark.b * 100).toFixed(0)}</text>`);
  lines.push(`<line x1="${ox + bPx + 10}" y1="${oy}" x2="${ox + bPx + 10}" y2="${oy + hPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx + 16}" y="${oy + hPx / 2}" dominant-baseline="middle" class="dim">${(mark.h * 100).toFixed(0)}</text>`);

  // Mark label
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 6}" text-anchor="middle" class="mark">${mark.mark}</text>`);

  // Bar description labels
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">↓ ${mark.bars}</text>`);
  if (mark.isDoublyReinforced) {
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 47}" text-anchor="middle" class="bar-label">↑ ${mark.barsComp}</text>`);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── SVG: Beam Longitudinal Section ─────────────────────────────

export interface BeamLongSectionOpts {
  mark: BeamMark;
  span: number;              // representative span (m)
}

/** Generate longitudinal section SVG showing bars + stirrup zones along span */
export function generateBeamLongSectionSvg(opts: BeamLongSectionOpts): string {
  const { mark, span } = opts;
  const W = 420;
  const beamH = 80; // px height of beam section
  const ox = 50;
  const oy = 35;
  const beamW = W - 100;
  const H = beamH + 100;
  const coverFrac = mark.cover / mark.h;
  const coverPx = coverFrac * beamH;

  // Seismic end zone: 2h from each support face (CIRSOC 201 §21.3.3)
  const endZoneM = 2 * mark.h;
  const endZoneFrac = Math.min(endZoneM / span, 0.35);
  const endZonePx = endZoneFrac * beamW;

  // End zone stirrup spacing: min(d/4, 8·db_long, 24·db_stirrup, 300mm)
  const dEff = mark.h - mark.cover - mark.barDia / 2000;
  const endSpacingM = Math.min(
    dEff / 4,
    8 * mark.barDia / 1000,
    24 * mark.stirrupDia / 1000,
    0.30,
  );
  const midSpacingM = mark.stirrupSpacing;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .zone-label { font-size: 7.5px; fill: #f0a500; }
    .mark { font-size: 10px; fill: #4ecdc4; font-weight: bold; }
    .bar-label { font-size: 7.5px; fill: #e94560; }
  </style>`);

  // Support triangles at each end
  const triH = 10;
  const triW = 8;
  lines.push(`<polygon points="${ox},${oy + beamH} ${ox - triW},${oy + beamH + triH} ${ox + triW},${oy + beamH + triH}" fill="none" stroke="#4ecdc4" stroke-width="1"/>`);
  lines.push(`<polygon points="${ox + beamW},${oy + beamH} ${ox + beamW - triW},${oy + beamH + triH} ${ox + beamW + triW},${oy + beamH + triH}" fill="none" stroke="#4ecdc4" stroke-width="1"/>`);

  // Foundation lines under supports
  lines.push(`<line x1="${ox - triW - 3}" y1="${oy + beamH + triH}" x2="${ox + triW + 3}" y2="${oy + beamH + triH}" stroke="#4ecdc4" stroke-width="1.5"/>`);
  lines.push(`<line x1="${ox + beamW - triW - 3}" y1="${oy + beamH + triH}" x2="${ox + beamW + triW + 3}" y2="${oy + beamH + triH}" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Beam outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${beamW}" height="${beamH}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // End zones (shaded)
  lines.push(`<rect x="${ox}" y="${oy}" width="${endZonePx}" height="${beamH}" fill="#f0a50010" stroke="none"/>`);
  lines.push(`<rect x="${ox + beamW - endZonePx}" y="${oy}" width="${endZonePx}" height="${beamH}" fill="#f0a50010" stroke="none"/>`);

  // End zone boundary lines
  lines.push(`<line x1="${ox + endZonePx}" y1="${oy}" x2="${ox + endZonePx}" y2="${oy + beamH}" stroke="#f0a500" stroke-width="0.5" stroke-dasharray="3 2"/>`);
  lines.push(`<line x1="${ox + beamW - endZonePx}" y1="${oy}" x2="${ox + beamW - endZonePx}" y2="${oy + beamH}" stroke="#f0a500" stroke-width="0.5" stroke-dasharray="3 2"/>`);

  // Bottom longitudinal bars (tension)
  const barY = oy + beamH - coverPx - 3;
  const barThick = Math.max((mark.barDia / 1000) / mark.h * beamH * 0.4, 1.5);
  lines.push(`<line x1="${ox + 4}" y1="${barY}" x2="${ox + beamW - 4}" y2="${barY}" stroke="#e94560" stroke-width="${barThick}"/>`);

  // Top bars (compression) if doubly reinforced
  if (mark.isDoublyReinforced && mark.barCountComp > 0) {
    const topBarY = oy + coverPx + 3;
    const barThickComp = Math.max((mark.barDiaComp / 1000) / mark.h * beamH * 0.4, 1.2);
    lines.push(`<line x1="${ox + 4}" y1="${topBarY}" x2="${ox + beamW - 4}" y2="${topBarY}" stroke="#e94560" stroke-width="${barThickComp}" opacity="0.7"/>`);
  }

  // Stirrups along the beam
  const drawStirrups = (xStart: number, xEnd: number, spacingM: number) => {
    const zonePx = xEnd - xStart;
    const spacingFrac = spacingM / span;
    const spacingPx = spacingFrac * beamW;
    const n = Math.min(Math.max(Math.floor(zonePx / spacingPx), 1), 40);
    const step = zonePx / (n + 1);
    for (let i = 1; i <= n; i++) {
      const xi = xStart + i * step;
      lines.push(`<line x1="${xi}" y1="${oy + coverPx}" x2="${xi}" y2="${oy + beamH - coverPx}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
    }
  };

  drawStirrups(ox, ox + endZonePx, endSpacingM);
  drawStirrups(ox + endZonePx, ox + beamW - endZonePx, midSpacingM);
  drawStirrups(ox + beamW - endZonePx, ox + beamW, endSpacingM);

  // Zone annotations (below beam)
  const annY = oy + beamH + triH + 16;
  const endSpCm = (endSpacingM * 100).toFixed(0);
  const midSpCm = (midSpacingM * 100).toFixed(0);
  lines.push(`<text x="${ox + endZonePx / 2}" y="${annY}" text-anchor="middle" class="zone-label">eØ${mark.stirrupDia} c/${endSpCm}</text>`);
  lines.push(`<text x="${ox + beamW / 2}" y="${annY}" text-anchor="middle" class="zone-label">eØ${mark.stirrupDia} c/${midSpCm}</text>`);
  lines.push(`<text x="${ox + beamW - endZonePx / 2}" y="${annY}" text-anchor="middle" class="zone-label">eØ${mark.stirrupDia} c/${endSpCm}</text>`);

  // Bar annotations (right side)
  const rx = ox + beamW + 8;
  lines.push(`<text x="${rx}" y="${barY + 3}" class="bar-label">${mark.bars}</text>`);
  if (mark.isDoublyReinforced && mark.barCountComp > 0) {
    const topBarY = oy + coverPx + 3;
    lines.push(`<text x="${rx}" y="${topBarY + 3}" class="bar-label">${mark.barsComp}</text>`);
  }

  // Span dimension
  lines.push(`<line x1="${ox}" y1="${oy - 8}" x2="${ox + beamW}" y2="${oy - 8}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + beamW / 2}" y="${oy - 12}" text-anchor="middle" class="dim">L = ${span.toFixed(2)} m</text>`);

  // Mark label
  lines.push(`<text x="${ox + beamW / 2}" y="${oy - 22}" text-anchor="middle" class="mark">${mark.mark}</text>`);

  // Section dims at left side
  lines.push(`<text x="${ox - 6}" y="${oy + beamH / 2}" text-anchor="end" dominant-baseline="middle" class="dim">${(mark.b * 100).toFixed(0)}×${(mark.h * 100).toFixed(0)}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── CSV Export ─────────────────────────────────────────────────

/** Export beam schedule to CSV */
export function beamScheduleToCSV(marks: BeamMark[]): string {
  const header = 'Mark,b (cm),h (cm),f\'c (MPa),Bottom bars,As bot (cm²),Top bars,As top (cm²),Stirrups,Elements,Max Ratio,Status';
  const rows = marks.map(m => {
    const ids = m.elements.map(e => e.elementId).join(';');
    const spacingCm = (m.stirrupSpacing * 100).toFixed(0);
    const topBars = m.isDoublyReinforced ? m.barsComp : '—';
    const topAs = m.isDoublyReinforced ? m.AsComp.toFixed(1) : '0';
    return `${m.mark},${(m.b * 100).toFixed(0)},${(m.h * 100).toFixed(0)},${m.fc},${m.bars},${m.AsProv.toFixed(1)},${topBars},${topAs},eØ${m.stirrupDia} c/${spacingCm},${ids},${(m.maxRatio * 100).toFixed(1)}%,${m.worstStatus}`;
  });
  return [header, ...rows].join('\n');
}
