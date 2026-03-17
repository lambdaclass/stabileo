// Column Schedule Generator
// Groups columns by identical design (section + reinforcement) and produces
// schedule data for table rendering and SVG generation.

import type { ElementVerification, ColumnResult, ShearResult } from './codes/argentina/cirsoc201';

// ─── Types ──────────────────────────────────────────────────────

/** A "column mark" groups all columns with identical section + reinforcement */
export interface ColumnMark {
  mark: string;            // e.g. "C1", "C2", ...
  b: number;               // section width (m)
  h: number;               // section height (m)
  fc: number;              // concrete strength (MPa)
  fy: number;              // steel yield strength (MPa)
  cover: number;           // concrete cover (m)
  // Longitudinal reinforcement
  barCount: number;
  barDia: number;          // mm
  bars: string;            // e.g. "8 Ø16"
  AsProv: number;          // provided steel area (cm²)
  // Transverse reinforcement
  stirrupDia: number;      // mm
  stirrupSpacing: number;  // m (mid-zone spacing)
  stirrupLegs: number;
  // Utilization
  maxRatio: number;
  worstStatus: 'ok' | 'warn' | 'fail';
  // Elements in this group
  elements: ColumnMarkElement[];
}

export interface ColumnMarkElement {
  elementId: number;
  height: number;          // column height (m)
  Nu: number;              // kN
  Mu: number;              // kN·m
  Vu: number;              // kN
  ratio: number;
  status: 'ok' | 'warn' | 'fail';
}

/** Flat schedule row for rendering in table / report */
export interface ColumnScheduleRow {
  mark: string;
  dimensions: string;      // e.g. "30×40"
  fc: string;              // e.g. "25 MPa"
  longBars: string;        // e.g. "8 Ø16 (16.09 cm²)"
  tieConfig: string;       // e.g. "eØ8 c/15 (mid) c/10 (end)"
  elementCount: number;
  maxRatio: number;
  status: 'ok' | 'warn' | 'fail';
}

// ─── Grouping Logic ─────────────────────────────────────────────

/** Generate a unique key for column design — columns with same key share a mark */
function designKey(v: ElementVerification): string {
  const col = v.column;
  if (!col) return '';
  return [
    (v.b * 100).toFixed(0),    // b in cm
    (v.h * 100).toFixed(0),    // h in cm
    v.fc.toFixed(0),           // f'c in MPa
    col.barCount,
    col.barDia.toFixed(0),
    col.stirrupDia.toFixed(0),
    col.stirrupSpacing.toFixed(3),
  ].join('|');
}

/**
 * Group column verifications into marks.
 * @param verifications All element verifications (beams + columns mixed)
 * @param elementLengths Map of element ID → length in meters
 */
export function groupColumnsByMark(
  verifications: ElementVerification[],
  elementLengths?: Map<number, number>,
): ColumnMark[] {
  const cols = verifications.filter(v => v.elementType === 'column' && v.column);
  if (cols.length === 0) return [];

  // Group by design key
  const groups = new Map<string, ElementVerification[]>();
  for (const v of cols) {
    const key = designKey(v);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(v);
    groups.set(key, arr);
  }

  // Convert to ColumnMark objects
  const marks: ColumnMark[] = [];
  let markIdx = 1;

  // Sort groups by: most elements first, then by section size
  const sorted = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return (b[0].b * b[0].h) - (a[0].b * a[0].h);
  });

  for (const group of sorted) {
    const ref = group[0];
    const col = ref.column!;

    let maxRatio = 0;
    let worstStatus: 'ok' | 'warn' | 'fail' = 'ok';

    const elements: ColumnMarkElement[] = group.map(v => {
      const r = v.column!.ratio;
      if (r > maxRatio) maxRatio = r;
      if (v.overallStatus === 'fail') worstStatus = 'fail';
      else if (v.overallStatus === 'warn' && worstStatus !== 'fail') worstStatus = 'warn';

      return {
        elementId: v.elementId,
        height: elementLengths?.get(v.elementId) ?? 3.0,
        Nu: v.Nu,
        Mu: v.Mu,
        Vu: v.Vu,
        ratio: r,
        status: v.overallStatus,
      };
    });

    marks.push({
      mark: `C${markIdx}`,
      b: ref.b,
      h: ref.h,
      fc: ref.fc,
      fy: ref.fy,
      cover: ref.cover,
      barCount: col.barCount,
      barDia: col.barDia,
      bars: col.bars,
      AsProv: col.AsProv,
      stirrupDia: col.stirrupDia,
      stirrupSpacing: col.stirrupSpacing,
      stirrupLegs: ref.shear.stirrupLegs,
      maxRatio: maxRatio,
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
export function buildScheduleRows(marks: ColumnMark[]): ColumnScheduleRow[] {
  return marks.map(m => {
    const bCm = (m.b * 100).toFixed(0);
    const hCm = (m.h * 100).toFixed(0);
    const spacingCm = (m.stirrupSpacing * 100).toFixed(0);
    // Seismic end-zone spacing: min(h, b, height/6, 0.15m) per CIRSOC 201 §21.4.4
    const endSpacing = Math.min(m.h, m.b, 0.15);
    const endSpacingCm = (endSpacing * 100).toFixed(0);

    return {
      mark: m.mark,
      dimensions: `${bCm}×${hCm}`,
      fc: `${m.fc} MPa`,
      longBars: `${m.bars} (${m.AsProv.toFixed(1)} cm²)`,
      tieConfig: `eØ${m.stirrupDia} c/${spacingCm}`,
      elementCount: m.elements.length,
      maxRatio: m.maxRatio,
      status: m.worstStatus,
    };
  });
}

// ─── SVG: Column Schedule Cross-Section ────────────────────────

/** Generate a compact cross-section SVG for the column schedule */
export function generateScheduleCrossSectionSvg(mark: ColumnMark): string {
  const scale = 300 / Math.max(mark.b, mark.h);
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
  const ci = coverPx;
  lines.push(`<rect x="${ox + ci}" y="${oy + ci}" width="${bPx - 2 * ci}" height="${hPx - 2 * ci}" fill="none" stroke="#4ecdc466" stroke-width="0.5" stroke-dasharray="4 3"/>`);

  // Stirrup
  const si = coverPx + 2;
  lines.push(`<rect x="${ox + si}" y="${oy + si}" width="${bPx - 2 * si}" height="${hPx - 2 * si}" fill="none" stroke="#f0a500" stroke-width="1.2" rx="3"/>`);

  // Bar positions (reuse same logic as reinforcement-svg.ts)
  const barPositions = getBarPositions(mark.barCount, bPx, hPx, coverPx, ox, oy);
  const barR = Math.max((mark.barDia / 1000) * scale * 0.5, 3);
  for (const [bx, by] of barPositions) {
    lines.push(`<circle cx="${bx}" cy="${by}" r="${barR}" fill="#e94560" stroke="#ff6b80" stroke-width="0.5"/>`);
  }

  // Dimensions
  // Width
  lines.push(`<line x1="${ox}" y1="${oy + hPx + 10}" x2="${ox + bPx}" y2="${oy + hPx + 10}" stroke="#666" stroke-width="0.5" marker-start="url(#arr)" marker-end="url(#arr)"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 22}" text-anchor="middle" class="dim">${(mark.b * 100).toFixed(0)}</text>`);
  // Height
  lines.push(`<line x1="${ox + bPx + 10}" y1="${oy}" x2="${ox + bPx + 10}" y2="${oy + hPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx + 16}" y="${oy + hPx / 2}" dominant-baseline="middle" class="dim">${(mark.h * 100).toFixed(0)}</text>`);

  // Mark label
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 6}" text-anchor="middle" class="mark">${mark.mark}</text>`);

  // Bar description
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">${mark.bars}</text>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 47}" text-anchor="middle" class="bar-label">eØ${mark.stirrupDia} c/${(mark.stirrupSpacing * 100).toFixed(0)}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── SVG: Column Elevation with Tie Zones ──────────────────────

export interface ColumnElevationScheduleOpts {
  mark: ColumnMark;
  height: number;          // representative height (m)
  showSplice?: boolean;    // show splice zone indicator
}

/** Generate elevation SVG showing tie spacing zones (end vs mid) */
export function generateScheduleElevationSvg(opts: ColumnElevationScheduleOpts): string {
  const { mark, height, showSplice = true } = opts;
  const scaleX = 160 / mark.b;
  const scaleY = Math.min(350 / height, 100);
  const bPx = mark.b * scaleX;
  const hPx = height * scaleY;
  const W = bPx + 180;
  const H = hPx + 80;
  const ox = 70;
  const oy = 30;
  const coverPx = mark.cover * scaleX;

  // Seismic end zone length: max(h, b, height/6, 0.45m) per CIRSOC 201 §21.4.4
  const endZoneM = Math.max(mark.h, mark.b, height / 6, 0.45);
  const endZonePx = endZoneM * scaleY;

  // End-zone tie spacing: min(b/4, 6*db_long, 150mm)
  const endSpacingM = Math.min(mark.b / 4, 6 * mark.barDia / 1000, 0.15);
  const midSpacingM = mark.stirrupSpacing;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .zone-label { font-size: 8px; fill: #f0a500; }
    .mark { font-size: 10px; fill: #4ecdc4; font-weight: bold; }
  </style>`);

  // Column outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // End zones (shaded)
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${Math.min(endZonePx, hPx / 2)}" fill="#f0a50015" stroke="none"/>`);
  lines.push(`<rect x="${ox}" y="${oy + hPx - Math.min(endZonePx, hPx / 2)}" width="${bPx}" height="${Math.min(endZonePx, hPx / 2)}" fill="#f0a50015" stroke="none"/>`);

  // End zone boundary lines (dashed)
  if (endZonePx < hPx / 2) {
    lines.push(`<line x1="${ox}" y1="${oy + endZonePx}" x2="${ox + bPx}" y2="${oy + endZonePx}" stroke="#f0a500" stroke-width="0.5" stroke-dasharray="3 2"/>`);
    lines.push(`<line x1="${ox}" y1="${oy + hPx - endZonePx}" x2="${ox + bPx}" y2="${oy + hPx - endZonePx}" stroke="#f0a500" stroke-width="0.5" stroke-dasharray="3 2"/>`);
  }

  // Vertical bars
  const barR = Math.max((mark.barDia / 1000) * scaleX * 0.5, 1.2);
  const xL = ox + coverPx + barR;
  const xR = ox + bPx - coverPx - barR;
  lines.push(`<line x1="${xL}" y1="${oy + 3}" x2="${xL}" y2="${oy + hPx - 3}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);
  lines.push(`<line x1="${xR}" y1="${oy + 3}" x2="${xR}" y2="${oy + hPx - 3}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);

  // Intermediate bars
  if (mark.barCount > 4) {
    const nInter = Math.floor((mark.barCount - 4) / 2);
    for (let i = 1; i <= nInter; i++) {
      const t = i / (nInter + 1);
      const xi = xL + t * (xR - xL);
      lines.push(`<line x1="${xi}" y1="${oy + 3}" x2="${xi}" y2="${oy + hPx - 3}" stroke="#e94560" stroke-width="${Math.max(barR * 0.7, 1)}" opacity="0.5"/>`);
    }
  }

  // Ties — end zones (closer spacing)
  const drawTies = (yStart: number, yEnd: number, spacing: number) => {
    const zonePx = yEnd - yStart;
    const n = Math.min(Math.floor(zonePx / (spacing * scaleY)), 30);
    if (n <= 0) return;
    const step = zonePx / (n + 1);
    for (let i = 1; i <= n; i++) {
      const yi = yStart + i * step;
      lines.push(`<line x1="${ox + coverPx}" y1="${yi}" x2="${ox + bPx - coverPx}" y2="${yi}" stroke="#f0a500" stroke-width="0.7" opacity="0.6"/>`);
    }
  };

  const topEndY = Math.min(oy + endZonePx, oy + hPx / 2);
  const botStartY = Math.max(oy + hPx - endZonePx, oy + hPx / 2);

  drawTies(oy, topEndY, endSpacingM);
  drawTies(topEndY, botStartY, midSpacingM);
  drawTies(botStartY, oy + hPx, endSpacingM);

  // Splice zone indicator
  if (showSplice) {
    const spliceLd = 40 * mark.barDia / 1000; // approximate lap splice = 40·db
    const splicePx = Math.min(spliceLd * scaleY, hPx * 0.3);
    lines.push(`<rect x="${ox - 8}" y="${oy + hPx - splicePx}" width="6" height="${splicePx}" fill="#e9456033" stroke="#e94560" stroke-width="0.5" rx="1"/>`);
    lines.push(`<text x="${ox - 12}" y="${oy + hPx - splicePx / 2}" text-anchor="end" dominant-baseline="middle" class="dim" fill="#e94560">Ls</text>`);
  }

  // Foundation hatching at bottom
  lines.push(`<line x1="${ox - 12}" y1="${oy + hPx}" x2="${ox + bPx + 12}" y2="${oy + hPx}" stroke="#4ecdc4" stroke-width="2"/>`);
  for (let i = -12; i <= bPx + 8; i += 5) {
    lines.push(`<line x1="${ox + i}" y1="${oy + hPx}" x2="${ox + i - 5}" y2="${oy + hPx + 7}" stroke="#4ecdc4" stroke-width="0.5"/>`);
  }

  // Right-side annotations
  const rx = ox + bPx + 12;
  lines.push(`<text x="${rx}" y="${oy + endZonePx / 2}" dominant-baseline="middle" class="zone-label">eØ${mark.stirrupDia} c/${(endSpacingM * 100).toFixed(0)}</text>`);
  if (endZonePx < hPx / 2) {
    lines.push(`<text x="${rx}" y="${oy + hPx / 2}" dominant-baseline="middle" class="zone-label">eØ${mark.stirrupDia} c/${(midSpacingM * 100).toFixed(0)}</text>`);
    lines.push(`<text x="${rx}" y="${oy + hPx - endZonePx / 2}" dominant-baseline="middle" class="zone-label">eØ${mark.stirrupDia} c/${(endSpacingM * 100).toFixed(0)}</text>`);
  }

  // Left-side: height dimension
  lines.push(`<line x1="${ox - 20}" y1="${oy}" x2="${ox - 20}" y2="${oy + hPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox - 24}" y="${oy + hPx / 2}" text-anchor="end" dominant-baseline="middle" class="dim" transform="rotate(-90 ${ox - 24} ${oy + hPx / 2})">H=${height.toFixed(2)}m</text>`);

  // Width dimension at top
  lines.push(`<line x1="${ox}" y1="${oy - 8}" x2="${ox + bPx}" y2="${oy - 8}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 12}" text-anchor="middle" class="dim">${(mark.b * 100).toFixed(0)}×${(mark.h * 100).toFixed(0)}</text>`);

  // Mark label top-right
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 22}" text-anchor="middle" class="mark">${mark.mark}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Helper: Bar positions (same algorithm as reinforcement-svg.ts) ──

function getBarPositions(n: number, bPx: number, hPx: number, coverPx: number, ox: number, oy: number): [number, number][] {
  const margin = coverPx + 10;
  const positions: [number, number][] = [];

  if (n <= 4) {
    positions.push([ox + margin, oy + margin]);
    positions.push([ox + bPx - margin, oy + margin]);
    positions.push([ox + margin, oy + hPx - margin]);
    positions.push([ox + bPx - margin, oy + hPx - margin]);
    return positions.slice(0, n);
  }

  const perSide = Math.ceil((n - 4) / 4);
  positions.push([ox + margin, oy + margin]);
  positions.push([ox + bPx - margin, oy + margin]);
  positions.push([ox + bPx - margin, oy + hPx - margin]);
  positions.push([ox + margin, oy + hPx - margin]);

  let remaining = n - 4;
  const sides = [
    { x1: ox + margin, y1: oy + margin, x2: ox + bPx - margin, y2: oy + margin },
    { x1: ox + bPx - margin, y1: oy + margin, x2: ox + bPx - margin, y2: oy + hPx - margin },
    { x1: ox + bPx - margin, y1: oy + hPx - margin, x2: ox + margin, y2: oy + hPx - margin },
    { x1: ox + margin, y1: oy + hPx - margin, x2: ox + margin, y2: oy + margin },
  ];

  for (const side of sides) {
    if (remaining <= 0) break;
    const count = Math.min(perSide, remaining);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      positions.push([
        side.x1 + t * (side.x2 - side.x1),
        side.y1 + t * (side.y2 - side.y1),
      ]);
    }
    remaining -= count;
  }

  return positions;
}

// ─── CSV Export ─────────────────────────────────────────────────

/** Export column schedule to CSV */
export function columnScheduleToCSV(marks: ColumnMark[]): string {
  const header = 'Mark,b (cm),h (cm),f\'c (MPa),Longitudinal,As prov (cm²),Ties,Elements,Max Ratio,Status';
  const rows = marks.map(m => {
    const ids = m.elements.map(e => e.elementId).join(';');
    const spacingCm = (m.stirrupSpacing * 100).toFixed(0);
    return `${m.mark},${(m.b * 100).toFixed(0)},${(m.h * 100).toFixed(0)},${m.fc},${m.bars},${m.AsProv.toFixed(1)},eØ${m.stirrupDia} c/${spacingCm},${ids},${(m.maxRatio * 100).toFixed(1)}%,${m.worstStatus}`;
  });
  return [header, ...rows].join('\n');
}
