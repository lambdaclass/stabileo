// SVG generators for reinforcement drawings
// Produces technical-style cross-section and elevation views

import type { FlexureResult, ShearResult, ColumnResult } from './codes/argentina/cirsoc201';

// ─── Cross-Section Drawing ──────────────────────────────────────

export interface CrossSectionSvgOpts {
  b: number;       // section width (m)
  h: number;       // section height (m)
  cover: number;   // concrete cover (m)
  flexure: FlexureResult;
  shear: ShearResult;
  column?: ColumnResult;
  isColumn: boolean;
}

export function generateCrossSectionSvg(opts: CrossSectionSvgOpts): string {
  const { b, h, cover, flexure, shear, isColumn, column } = opts;
  const scale = 400 / Math.max(b, h); // fit in ~400px
  const W = b * scale + 100; // extra for annotations
  const H = h * scale + 100;
  const ox = 50; // origin offset
  const oy = 30;

  const bPx = b * scale;
  const hPx = h * scale;
  const coverPx = cover * scale;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 10px; fill: #888; }
    .label { font-size: 11px; fill: #4ecdc4; }
    .bar-label { font-size: 9px; fill: #f0a500; }
  </style>`);

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Cover dashed line
  lines.push(`<rect x="${ox + coverPx}" y="${oy + coverPx}" width="${bPx - 2 * coverPx}" height="${hPx - 2 * coverPx}" fill="none" stroke="#334" stroke-width="0.5" stroke-dasharray="4,3"/>`);

  // Stirrup
  const stPx = (shear.stirrupDia / 1000) * scale;
  const sx = ox + coverPx;
  const sy = oy + coverPx;
  const sw = bPx - 2 * coverPx;
  const sh = hPx - 2 * coverPx;
  lines.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="#f0a500" stroke-width="${Math.max(stPx, 1.5)}" rx="3"/>`);

  if (isColumn && column) {
    // Column: distribute bars around perimeter
    const barR = (column.barDia / 2000) * scale;
    const n = column.barCount;
    const positions = getColumnBarPositions(n, bPx, hPx, coverPx, ox, oy);
    for (const [cx, cy] of positions) {
      lines.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5"/>`);
    }
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">${column.bars}</text>`);
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 48}" text-anchor="middle" class="bar-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)}</text>`);
  } else {
    // Beam: bottom tension bars
    const barR = (flexure.barDia / 2000) * scale;
    const nBot = flexure.barCount;
    const barY = oy + hPx - coverPx - (shear.stirrupDia / 1000) * scale - barR;
    const startX = ox + coverPx + (shear.stirrupDia / 1000) * scale + barR;
    const endX = ox + bPx - coverPx - (shear.stirrupDia / 1000) * scale - barR;
    const spacingX = nBot > 1 ? (endX - startX) / (nBot - 1) : 0;

    for (let i = 0; i < nBot; i++) {
      const cx = nBot === 1 ? ox + bPx / 2 : startX + i * spacingX;
      lines.push(`<circle cx="${cx}" cy="${barY}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5"/>`);
    }

    // Top bars: compression reinforcement (A's) or construction bars (2 Ø10)
    const hasCompSteel = flexure.isDoublyReinforced && flexure.barCountComp && flexure.barDiaComp;
    const topDia = hasCompSteel ? flexure.barDiaComp! : 10;
    const topCount = hasCompSteel ? flexure.barCountComp! : 2;
    const topBarR = (topDia / 2000) * scale;
    const topY = oy + coverPx + (shear.stirrupDia / 1000) * scale + topBarR;
    const topStartX = ox + coverPx + (shear.stirrupDia / 1000) * scale + topBarR;
    const topEndX = ox + bPx - coverPx - (shear.stirrupDia / 1000) * scale - topBarR;
    const topSpacingX = topCount > 1 ? (topEndX - topStartX) / (topCount - 1) : 0;

    // Compression bars: blue fill for A's, gray for construction
    const topFill = hasCompSteel ? '#4a90d9' : '#666';
    const topStroke = hasCompSteel ? '#7ab8ff' : '#888';
    for (let i = 0; i < topCount; i++) {
      const cx = topCount === 1 ? ox + bPx / 2 : topStartX + i * topSpacingX;
      lines.push(`<circle cx="${cx}" cy="${topY}" r="${Math.max(topBarR, 2.5)}" fill="${topFill}" stroke="${topStroke}" stroke-width="0.5"/>`);
    }

    // Labels
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">${flexure.bars} (inf.)</text>`);
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 48}" text-anchor="middle" class="bar-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)}</text>`);
    const topLabel = hasCompSteel ? `${flexure.barsComp} (A's)` : `2 Ø10 (sup.)`;
    lines.push(`<text x="${ox + bPx / 2}" y="${oy - 8}" text-anchor="middle" class="bar-label">${topLabel}</text>`);
  }

  // Dimension lines
  // Width
  lines.push(`<line x1="${ox}" y1="${oy + hPx + 15}" x2="${ox + bPx}" y2="${oy + hPx + 15}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 24}" text-anchor="middle" class="dim">${(b * 100).toFixed(0)} cm</text>`);
  // Height
  lines.push(`<line x1="${ox + bPx + 15}" y1="${oy}" x2="${ox + bPx + 15}" y2="${oy + hPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx + 20}" y="${oy + hPx / 2}" dominant-baseline="middle" class="dim" transform="rotate(90 ${ox + bPx + 20} ${oy + hPx / 2})">${(h * 100).toFixed(0)} cm</text>`);
  // Cover
  lines.push(`<line x1="${ox}" y1="${oy + hPx - coverPx}" x2="${ox - 10}" y2="${oy + hPx - coverPx}" stroke="#555" stroke-width="0.3"/>`);
  lines.push(`<line x1="${ox}" y1="${oy + hPx}" x2="${ox - 10}" y2="${oy + hPx}" stroke="#555" stroke-width="0.3"/>`);
  lines.push(`<text x="${ox - 12}" y="${oy + hPx - coverPx / 2}" text-anchor="end" dominant-baseline="middle" class="dim" style="font-size:8px">r=${(cover * 100).toFixed(1)}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

function getColumnBarPositions(n: number, bPx: number, hPx: number, coverPx: number, ox: number, oy: number): [number, number][] {
  const margin = coverPx + 10; // approximate with stirrup + bar radius
  const positions: [number, number][] = [];

  if (n <= 4) {
    // 4 corners
    positions.push([ox + margin, oy + margin]);
    positions.push([ox + bPx - margin, oy + margin]);
    positions.push([ox + margin, oy + hPx - margin]);
    positions.push([ox + bPx - margin, oy + hPx - margin]);
    return positions.slice(0, n);
  }

  // Distribute around perimeter
  const perSide = Math.ceil((n - 4) / 4);
  // Corners first
  positions.push([ox + margin, oy + margin]);
  positions.push([ox + bPx - margin, oy + margin]);
  positions.push([ox + bPx - margin, oy + hPx - margin]);
  positions.push([ox + margin, oy + hPx - margin]);

  // Fill sides
  let remaining = n - 4;
  const sides = [
    { x1: ox + margin, y1: oy + margin, x2: ox + bPx - margin, y2: oy + margin },             // top
    { x1: ox + bPx - margin, y1: oy + margin, x2: ox + bPx - margin, y2: oy + hPx - margin }, // right
    { x1: ox + bPx - margin, y1: oy + hPx - margin, x2: ox + margin, y2: oy + hPx - margin }, // bottom
    { x1: ox + margin, y1: oy + hPx - margin, x2: ox + margin, y2: oy + margin },             // left
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

// ─── Beam Elevation Drawing ─────────────────────────────────────

export interface ElevationSvgOpts {
  length: number;     // beam length (m)
  h: number;          // section height (m)
  cover: number;      // concrete cover (m)
  flexure: FlexureResult;
  shear: ShearResult;
  supportI: 'fixed' | 'pinned' | 'free';
  supportJ: 'fixed' | 'pinned' | 'free';
}

export function generateBeamElevationSvg(opts: ElevationSvgOpts): string {
  const { length, h, cover, flexure, shear, supportI, supportJ } = opts;
  const scaleX = 500 / length;
  const scaleY = Math.min(200, 300 / h);
  const W = length * scaleX + 100;
  const H = h * scaleY + 120;
  const ox = 50;
  const oy = 40;
  const hPx = h * scaleY;
  const lPx = length * scaleX;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .bar-label { font-size: 9px; fill: #f0a500; }
    .stirrup-label { font-size: 8px; fill: #888; }
  </style>`);

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${lPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Bottom rebar line
  const botY = oy + hPx - cover * scaleY - 5;
  lines.push(`<line x1="${ox + 5}" y1="${botY}" x2="${ox + lPx - 5}" y2="${botY}" stroke="#e94560" stroke-width="2"/>`);

  // Top rebar line (construction)
  const topY = oy + cover * scaleY + 5;
  lines.push(`<line x1="${ox + 5}" y1="${topY}" x2="${ox + lPx - 5}" y2="${topY}" stroke="#666" stroke-width="1.5" stroke-dasharray="6,3"/>`);

  // Stirrups (draw some representative ones)
  const nStirrup = Math.min(Math.floor(length / shear.spacing), 30);
  const stirrupStep = lPx / (nStirrup + 1);
  for (let i = 1; i <= nStirrup; i++) {
    const x = ox + i * stirrupStep;
    lines.push(`<line x1="${x}" y1="${oy + cover * scaleY}" x2="${x}" y2="${oy + hPx - cover * scaleY}" stroke="#f0a500" stroke-width="0.8" opacity="0.5"/>`);
  }

  // Support symbols
  if (supportI === 'fixed' || supportI === 'pinned') {
    drawSupportSymbol(lines, ox, oy + hPx, supportI);
  }
  if (supportJ === 'fixed' || supportJ === 'pinned') {
    drawSupportSymbol(lines, ox + lPx, oy + hPx, supportJ);
  }

  // Labels
  lines.push(`<text x="${ox + lPx / 2}" y="${botY + 15}" text-anchor="middle" class="bar-label">${flexure.bars}</text>`);
  lines.push(`<text x="${ox + lPx / 2}" y="${topY - 8}" text-anchor="middle" class="bar-label" style="fill:#888">2 Ø10</text>`);

  // Stirrup label
  lines.push(`<text x="${ox + lPx / 2}" y="${oy + hPx + 40}" text-anchor="middle" class="stirrup-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)} cm</text>`);

  // Length dimension
  lines.push(`<line x1="${ox}" y1="${oy + hPx + 20}" x2="${ox + lPx}" y2="${oy + hPx + 20}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + lPx / 2}" y="${oy + hPx + 30}" text-anchor="middle" class="dim">L = ${length.toFixed(2)} m</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

function drawSupportSymbol(lines: string[], x: number, y: number, type: 'fixed' | 'pinned') {
  if (type === 'pinned') {
    lines.push(`<polygon points="${x},${y} ${x - 8},${y + 12} ${x + 8},${y + 12}" fill="none" stroke="#4ecdc4" stroke-width="1.2"/>`);
  } else {
    lines.push(`<line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}" stroke="#4ecdc4" stroke-width="2"/>`);
    // Hatching
    for (let i = -8; i <= 8; i += 4) {
      lines.push(`<line x1="${x + i}" y1="${y}" x2="${x + i - 4}" y2="${y + 6}" stroke="#4ecdc4" stroke-width="0.5"/>`);
    }
  }
}

// ─── Column Elevation Drawing ───────────────────────────────────

export interface ColumnElevationSvgOpts {
  height: number;     // column height (m)
  b: number;          // section width (m)
  h: number;          // section depth (m)
  cover: number;      // concrete cover (m)
  column: ColumnResult;
  shear: ShearResult;
}

export function generateColumnElevationSvg(opts: ColumnElevationSvgOpts): string {
  const { height, b, h, cover, column, shear } = opts;
  const scaleX = 200 / b;
  const scaleY = Math.min(400 / height, 120);
  const bPx = b * scaleX;
  const hPx = height * scaleY;
  const W = bPx + 120;
  const H = hPx + 100;
  const ox = 60;
  const oy = 30;
  const coverPx = cover * scaleX;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .bar-label { font-size: 9px; fill: #f0a500; }
  </style>`);

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Vertical bars (left and right faces)
  const barR = Math.max((column.barDia / 1000) * scaleX * 0.5, 1);
  const xL = ox + coverPx + barR;
  const xR = ox + bPx - coverPx - barR;
  lines.push(`<line x1="${xL}" y1="${oy + 5}" x2="${xL}" y2="${oy + hPx - 5}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);
  lines.push(`<line x1="${xR}" y1="${oy + 5}" x2="${xR}" y2="${oy + hPx - 5}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);

  // Intermediate vertical bars (if > 4 bars total)
  if (column.barCount > 4) {
    const nInter = Math.floor((column.barCount - 4) / 2);
    for (let i = 1; i <= nInter; i++) {
      const t = i / (nInter + 1);
      const xi = xL + t * (xR - xL);
      lines.push(`<line x1="${xi}" y1="${oy + 5}" x2="${xi}" y2="${oy + hPx - 5}" stroke="#e94560" stroke-width="${Math.max(barR * 0.7, 1)}" opacity="0.6"/>`);
    }
  }

  // Ties/stirrups (horizontal)
  const spacing = shear.spacing;
  const nTies = Math.min(Math.floor(height / spacing), 40);
  const tieStepPx = hPx / (nTies + 1);
  for (let i = 1; i <= nTies; i++) {
    const yi = oy + i * tieStepPx;
    lines.push(`<line x1="${ox + coverPx}" y1="${yi}" x2="${ox + bPx - coverPx}" y2="${yi}" stroke="#f0a500" stroke-width="0.8" opacity="0.5"/>`);
    // Small hooks at ends
    lines.push(`<line x1="${ox + coverPx}" y1="${yi}" x2="${ox + coverPx + 4}" y2="${yi - 3}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
    lines.push(`<line x1="${ox + bPx - coverPx}" y1="${yi}" x2="${ox + bPx - coverPx - 4}" y2="${yi - 3}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }

  // Foundation hatching at bottom
  lines.push(`<line x1="${ox - 15}" y1="${oy + hPx}" x2="${ox + bPx + 15}" y2="${oy + hPx}" stroke="#4ecdc4" stroke-width="2"/>`);
  for (let i = -15; i <= bPx + 10; i += 5) {
    lines.push(`<line x1="${ox + i}" y1="${oy + hPx}" x2="${ox + i - 5}" y2="${oy + hPx + 8}" stroke="#4ecdc4" stroke-width="0.5"/>`);
  }

  // Labels
  lines.push(`<text x="${ox + bPx + 10}" y="${oy + hPx / 2}" dominant-baseline="middle" class="bar-label">${column.bars}</text>`);
  lines.push(`<text x="${ox - 5}" y="${oy + hPx / 2}" text-anchor="end" dominant-baseline="middle" class="bar-label">eØ${shear.stirrupDia} c/${(spacing * 100).toFixed(0)}</text>`);

  // Height dimension
  lines.push(`<line x1="${ox - 30}" y1="${oy}" x2="${ox - 30}" y2="${oy + hPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox - 35}" y="${oy + hPx / 2}" text-anchor="end" dominant-baseline="middle" class="dim" transform="rotate(-90 ${ox - 35} ${oy + hPx / 2})">H = ${height.toFixed(2)} m</text>`);

  // Section dimension at top
  lines.push(`<line x1="${ox}" y1="${oy - 10}" x2="${ox + bPx}" y2="${oy - 10}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 14}" text-anchor="middle" class="dim">${(b * 100).toFixed(0)}×${(h * 100).toFixed(0)}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Beam-Column Joint Detail ───────────────────────────────────

export interface JointDetailSvgOpts {
  beamB: number;    // beam width (m)
  beamH: number;    // beam height (m)
  colB: number;     // column width (m)
  colH: number;     // column depth (m)
  cover: number;    // concrete cover (m)
  beamBars: string; // e.g. "4 Ø16"
  colBars: string;  // e.g. "8 Ø16"
  stirrupDia: number;
  stirrupSpacing: number; // m
}

export function generateJointDetailSvg(opts: JointDetailSvgOpts): string {
  const { beamB, beamH, colB, colH, cover, beamBars, colBars, stirrupDia, stirrupSpacing } = opts;
  const scale = 300 / Math.max(colH + beamH * 2, colB + 1);
  const W = 420;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2;

  const colWPx = colB * scale;
  const colHPx = colH * scale;
  const beamHPx = beamH * scale;
  const beamExtPx = 100; // beam extends beyond joint
  const coverPx = cover * scale;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .bar-label { font-size: 8px; fill: #f0a500; }
    .title { font-size: 10px; fill: #4ecdc4; font-weight: bold; }
  </style>`);

  // Title
  lines.push(`<text x="${cx}" y="15" text-anchor="middle" class="title">Detalle de nudo viga-columna</text>`);

  // Column (vertical, centered)
  const colX = cx - colWPx / 2;
  const colTop = cy - colHPx / 2 - 60;
  const colBot = cy + colHPx / 2 + 60;
  lines.push(`<rect x="${colX}" y="${colTop}" width="${colWPx}" height="${colBot - colTop}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // Beam (horizontal, at mid-height)
  const beamTop = cy - beamHPx / 2;
  const beamLeft = colX - beamExtPx;
  const beamRight = colX + colWPx + beamExtPx;
  lines.push(`<rect x="${beamLeft}" y="${beamTop}" width="${beamRight - beamLeft}" height="${beamHPx}" fill="#152538" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // Joint zone hatching (intersection area)
  const jx = colX;
  const jy = beamTop;
  const jw = colWPx;
  const jh = beamHPx;
  lines.push(`<rect x="${jx}" y="${jy}" width="${jw}" height="${jh}" fill="rgba(78,205,196,0.08)" stroke="#4ecdc4" stroke-width="0.5" stroke-dasharray="3,2"/>`);

  // Column vertical bars (pass through joint)
  const barR = 2;
  const cxL = colX + coverPx + barR;
  const cxR = colX + colWPx - coverPx - barR;
  lines.push(`<line x1="${cxL}" y1="${colTop + 5}" x2="${cxL}" y2="${colBot - 5}" stroke="#e94560" stroke-width="2"/>`);
  lines.push(`<line x1="${cxR}" y1="${colTop + 5}" x2="${cxR}" y2="${colBot - 5}" stroke="#e94560" stroke-width="2"/>`);

  // Beam bars (with hooks into joint)
  const bbTop = beamTop + coverPx + 3;
  const bbBot = beamTop + beamHPx - coverPx - 3;
  // Left beam bottom bar → hooks up inside column
  lines.push(`<line x1="${beamLeft + 5}" y1="${bbBot}" x2="${cxR - 3}" y2="${bbBot}" stroke="#e94560" stroke-width="1.5"/>`);
  lines.push(`<line x1="${cxR - 3}" y1="${bbBot}" x2="${cxR - 3}" y2="${bbBot - beamHPx * 0.6}" stroke="#e94560" stroke-width="1.5"/>`);
  // Right beam bottom bar → hooks up inside column
  lines.push(`<line x1="${beamRight - 5}" y1="${bbBot}" x2="${cxL + 3}" y2="${bbBot}" stroke="#e94560" stroke-width="1.5"/>`);
  lines.push(`<line x1="${cxL + 3}" y1="${bbBot}" x2="${cxL + 3}" y2="${bbBot - beamHPx * 0.6}" stroke="#e94560" stroke-width="1.5"/>`);
  // Top construction bars (through)
  lines.push(`<line x1="${beamLeft + 5}" y1="${bbTop}" x2="${beamRight - 5}" y2="${bbTop}" stroke="#666" stroke-width="1" stroke-dasharray="4,2"/>`);

  // Joint stirrups (horizontal ties in the joint zone)
  const nJointTies = Math.max(2, Math.floor(beamHPx / (stirrupSpacing * scale)));
  for (let i = 1; i <= nJointTies; i++) {
    const ty = beamTop + (i / (nJointTies + 1)) * beamHPx;
    lines.push(`<line x1="${colX + coverPx}" y1="${ty}" x2="${colX + colWPx - coverPx}" y2="${ty}" stroke="#f0a500" stroke-width="0.8"/>`);
  }

  // Column ties above/below joint
  const tieSpacePx = stirrupSpacing * scale;
  for (let y = beamTop - tieSpacePx; y > colTop + 10; y -= tieSpacePx) {
    lines.push(`<line x1="${colX + coverPx}" y1="${y}" x2="${colX + colWPx - coverPx}" y2="${y}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }
  for (let y = beamTop + beamHPx + tieSpacePx; y < colBot - 10; y += tieSpacePx) {
    lines.push(`<line x1="${colX + coverPx}" y1="${y}" x2="${colX + colWPx - coverPx}" y2="${y}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }

  // Beam stirrups
  for (let x = beamLeft + 15; x < colX - 5; x += Math.max(tieSpacePx, 12)) {
    lines.push(`<line x1="${x}" y1="${beamTop + coverPx}" x2="${x}" y2="${beamTop + beamHPx - coverPx}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }
  for (let x = colX + colWPx + 15; x < beamRight - 5; x += Math.max(tieSpacePx, 12)) {
    lines.push(`<line x1="${x}" y1="${beamTop + coverPx}" x2="${x}" y2="${beamTop + beamHPx - coverPx}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }

  // Labels
  lines.push(`<text x="${beamLeft + 5}" y="${bbBot + 12}" class="bar-label">${beamBars}</text>`);
  lines.push(`<text x="${colX + colWPx + 5}" y="${cy - 40}" class="bar-label">${colBars}</text>`);
  lines.push(`<text x="${cx}" y="${H - 8}" text-anchor="middle" class="dim">eØ${stirrupDia} c/${(stirrupSpacing * 100).toFixed(0)} (nudo)</text>`);

  // Dimension annotations
  lines.push(`<text x="${beamLeft}" y="${beamTop - 5}" class="dim">Viga ${(beamB * 100).toFixed(0)}×${(beamH * 100).toFixed(0)}</text>`);
  lines.push(`<text x="${colX}" y="${colTop - 5}" class="dim">Col ${(colB * 100).toFixed(0)}×${(colH * 100).toFixed(0)}</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Slab Reinforcement Plan ────────────────────────────────────

export interface SlabReinforcementSvgOpts {
  spanX: number;     // slab span in X (m)
  spanZ: number;     // slab span in Z (m)
  thickness: number; // slab thickness (m)
  mxDesign: number;  // design moment about X per unit width (kN·m/m)
  mzDesign: number;  // design moment about Z per unit width (kN·m/m)
  barsX: string;     // e.g. "Ø10 c/20"
  barsZ: string;     // e.g. "Ø10 c/15"
  asxProv: number;   // cm²/m provided in X dir
  aszProv: number;   // cm²/m provided in Z dir
}

export function generateSlabReinforcementSvg(opts: SlabReinforcementSvgOpts): string {
  const { spanX, spanZ, thickness, mxDesign, mzDesign, barsX, barsZ } = opts;
  const maxSpan = Math.max(spanX, spanZ);
  const scale = 300 / maxSpan;
  const xPx = spanX * scale;
  const zPx = spanZ * scale;
  const W = xPx + 140;
  const H = zPx + 140;
  const ox = 70;
  const oy = 50;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .bar-label { font-size: 9px; fill: #f0a500; }
    .title { font-size: 10px; fill: #4ecdc4; font-weight: bold; }
    .moment { font-size: 8px; fill: #ff8a9e; }
  </style>`);

  // Slab outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${xPx}" height="${zPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Support hatching on edges
  for (let i = 0; i < xPx; i += 6) {
    lines.push(`<line x1="${ox + i}" y1="${oy}" x2="${ox + i + 4}" y2="${oy - 5}" stroke="#4ecdc4" stroke-width="0.4"/>`);
    lines.push(`<line x1="${ox + i}" y1="${oy + zPx}" x2="${ox + i + 4}" y2="${oy + zPx + 5}" stroke="#4ecdc4" stroke-width="0.4"/>`);
  }
  for (let i = 0; i < zPx; i += 6) {
    lines.push(`<line x1="${ox}" y1="${oy + i}" x2="${ox - 5}" y2="${oy + i + 4}" stroke="#4ecdc4" stroke-width="0.4"/>`);
    lines.push(`<line x1="${ox + xPx}" y1="${oy + i}" x2="${ox + xPx + 5}" y2="${oy + i + 4}" stroke="#4ecdc4" stroke-width="0.4"/>`);
  }

  // Reinforcement bars in X direction (horizontal lines)
  const nBarsX = Math.min(Math.floor(spanZ / 0.15), 20);
  const spacingXPx = zPx / (nBarsX + 1);
  for (let i = 1; i <= nBarsX; i++) {
    const yi = oy + i * spacingXPx;
    lines.push(`<line x1="${ox + 8}" y1="${yi}" x2="${ox + xPx - 8}" y2="${yi}" stroke="#e94560" stroke-width="1" opacity="0.6"/>`);
  }

  // Reinforcement bars in Z direction (vertical lines)
  const nBarsZ = Math.min(Math.floor(spanX / 0.15), 20);
  const spacingZPx = xPx / (nBarsZ + 1);
  for (let i = 1; i <= nBarsZ; i++) {
    const xi = ox + i * spacingZPx;
    lines.push(`<line x1="${xi}" y1="${oy + 8}" x2="${xi}" y2="${oy + zPx - 8}" stroke="#ff8a9e" stroke-width="0.8" opacity="0.5"/>`);
  }

  // Dimension lines
  lines.push(`<line x1="${ox}" y1="${oy + zPx + 15}" x2="${ox + xPx}" y2="${oy + zPx + 15}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + xPx / 2}" y="${oy + zPx + 26}" text-anchor="middle" class="dim">${spanX.toFixed(2)} m</text>`);
  lines.push(`<line x1="${ox - 15}" y1="${oy}" x2="${ox - 15}" y2="${oy + zPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox - 20}" y="${oy + zPx / 2}" text-anchor="end" dominant-baseline="middle" class="dim" transform="rotate(-90 ${ox - 20} ${oy + zPx / 2})">${spanZ.toFixed(2)} m</text>`);

  // Bar labels
  lines.push(`<text x="${ox + xPx / 2}" y="${oy - 12}" text-anchor="middle" class="bar-label">→ ${barsX}</text>`);
  lines.push(`<text x="${ox + xPx + 10}" y="${oy + zPx / 2}" dominant-baseline="middle" class="bar-label">↓ ${barsZ}</text>`);

  // Moment values
  lines.push(`<text x="${ox + xPx / 2}" y="${oy + zPx / 2 - 8}" text-anchor="middle" class="moment">mx = ${mxDesign.toFixed(2)} kN·m/m</text>`);
  lines.push(`<text x="${ox + xPx / 2}" y="${oy + zPx / 2 + 8}" text-anchor="middle" class="moment">mz = ${mzDesign.toFixed(2)} kN·m/m</text>`);

  // Thickness label
  lines.push(`<text x="${ox + xPx / 2}" y="${oy + zPx + 38}" text-anchor="middle" class="dim">e = ${(thickness * 100).toFixed(0)} cm</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Slab reinforcement design helper ───────────────────────────

export interface SlabDesignResult {
  direction: 'X' | 'Z';
  Mu: number;         // kN·m/m
  d: number;          // effective depth (m)
  AsReq: number;      // cm²/m
  AsMin: number;      // cm²/m
  AsProv: number;     // cm²/m
  barDia: number;     // mm
  spacing: number;    // m
  bars: string;       // e.g. "Ø10 c/15"
}

/** Design slab reinforcement for a 1m-wide strip per CIRSOC 201 */
export function designSlabReinforcement(
  Mu: number, thickness: number, fc: number, fy: number, cover: number, direction: 'X' | 'Z',
): SlabDesignResult {
  const d = thickness - cover - 0.005; // effective depth (approx bar center)
  const b = 1.0; // 1m strip
  const phi = 0.9;

  // Min reinforcement for slabs: 0.0018 × b × h (shrinkage/temperature)
  const AsMin = 0.0018 * b * thickness * 1e4; // cm²/m

  // Required As from flexure: Rn = Mu / (φ·b·d²)
  const MuAbs = Math.abs(Mu);
  let AsReq = AsMin;
  if (MuAbs > 0.001) {
    const Rn = (MuAbs / phi) / (b * d * d * 1000); // MPa
    const rho = (0.85 * fc / fy) * (1 - Math.sqrt(1 - 2 * Rn / (0.85 * fc)));
    AsReq = Math.max(rho * b * d * 1e4, AsMin); // cm²/m
  }

  // Select bar and spacing
  const rebarOptions: { dia: number; area: number }[] = [
    { dia: 6, area: 0.283 }, { dia: 8, area: 0.503 }, { dia: 10, area: 0.785 },
    { dia: 12, area: 1.131 }, { dia: 16, area: 2.011 },
  ];
  let bestDia = 8;
  let bestSpacing = 0.20;
  let bestAs = 0;

  for (const rb of rebarOptions) {
    // Try spacings from 10cm to 25cm
    for (const sp of [0.10, 0.125, 0.15, 0.175, 0.20, 0.225, 0.25]) {
      const AsProv = rb.area / sp * 0.01; // cm²/m (area per bar / spacing in m * 100cm/m)
      const asProvCm2 = rb.area * (1 / sp) ; // bars per meter × area each
      if (asProvCm2 >= AsReq && (bestAs === 0 || asProvCm2 < bestAs * 1.3)) {
        bestDia = rb.dia;
        bestSpacing = sp;
        bestAs = asProvCm2;
      }
    }
  }

  if (bestAs < AsReq) {
    // Fallback: use Ø12 c/10
    bestDia = 12;
    bestSpacing = 0.10;
    bestAs = 1.131 * 10;
  }

  return {
    direction,
    Mu: MuAbs,
    d,
    AsReq,
    AsMin,
    AsProv: bestAs,
    barDia: bestDia,
    spacing: bestSpacing,
    bars: `Ø${bestDia} c/${(bestSpacing * 100).toFixed(0)}`,
  };
}
