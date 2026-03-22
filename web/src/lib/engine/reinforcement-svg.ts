// SVG generators for reinforcement drawings
// Produces technical-style cross-section and elevation views

import type { FlexureResult, ShearResult, ColumnResult, DetailingResult } from './codes/argentina/cirsoc201';

// ─── Cross-Section Drawing ──────────────────────────────────────

export interface CrossSectionSvgOpts {
  b: number;       // section width (m)
  h: number;       // section height (m)
  cover: number;   // concrete cover (m)
  flexure: FlexureResult;
  shear: ShearResult;
  column?: ColumnResult;
  isColumn: boolean;
  /** i18n word for "layers", e.g. "layers" or "capas". Used when bars need multiple rows. */
  layerWord?: string;
}

export function generateCrossSectionSvg(opts: CrossSectionSvgOpts): string {
  const { b, h, cover, flexure, shear, isColumn, column, layerWord } = opts;
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
    // Column: distribute bars around perimeter, with interior rows if needed
    const barR = (column.barDia / 2000) * scale;
    const n = column.barCount;
    const stPx = (shear.stirrupDia / 1000) * scale;
    const minGapPx = Math.max(column.barDia / 1000, 0.025) * scale;
    // Max bars that fit along the perimeter (4 corners + bars along each face)
    const faceW = bPx - 2 * coverPx - 2 * stPx - 2 * barR;
    const faceH = hPx - 2 * coverPx - 2 * stPx - 2 * barR;
    const maxBPerFaceH = Math.max(0, Math.floor(faceW / (2 * barR + minGapPx)));
    const maxBPerFaceV = Math.max(0, Math.floor(faceH / (2 * barR + minGapPx)));
    const maxPerimeter = 4 + 2 * maxBPerFaceH + 2 * maxBPerFaceV;

    if (n <= maxPerimeter || n <= 8) {
      // Fits on perimeter — use standard distribution
      const positions = getColumnBarPositions(n, bPx, hPx, coverPx, ox, oy, stPx, barR);
      for (const [cx, cy] of positions) {
        lines.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5"/>`);
      }
    } else {
      // Overflow: fill perimeter, then add interior rows
      const perimPositions = getColumnBarPositions(Math.min(n, maxPerimeter), bPx, hPx, coverPx, ox, oy, stPx, barR);
      for (const [cx, cy] of perimPositions) {
        lines.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5"/>`);
      }
      // Interior bars in a grid — only if there's real interior space
      let remaining = n - perimPositions.length;
      const margin = coverPx + stPx + Math.max(barR, 5);
      const innerStartX = ox + margin + 2 * barR + minGapPx;
      const innerEndX = ox + bPx - margin - 2 * barR - minGapPx;
      const innerStartY = oy + margin + 2 * barR + minGapPx;
      const innerEndY = oy + hPx - margin - 2 * barR - minGapPx;
      const innerW = innerEndX - innerStartX;
      const innerH = innerEndY - innerStartY;
      if (innerW > 2 * barR && innerH > 2 * barR && remaining > 0) {
        const cols = Math.max(1, Math.floor((innerW + minGapPx) / (2 * barR + minGapPx)));
        const maxIntRows = Math.max(1, Math.floor((innerH + minGapPx) / (2 * barR + minGapPx)));
        const rows = Math.min(Math.ceil(remaining / cols), maxIntRows);
        const drawn = Math.min(remaining, rows * cols);
        let idx = 0;
        for (let r = 0; r < rows && idx < drawn; r++) {
          const barsInRow = Math.min(cols, drawn - idx);
          const cy = rows === 1 ? oy + hPx / 2 : innerStartY + r * (innerH / Math.max(rows - 1, 1));
          const colSpacing = barsInRow > 1 ? innerW / (barsInRow - 1) : 0;
          for (let c = 0; c < barsInRow; c++) {
            const cx = barsInRow === 1 ? ox + bPx / 2 : innerStartX + c * colSpacing;
            lines.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5" opacity="0.7"/>`);
            idx++;
          }
        }
      }
    }
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">${column.bars}</text>`);
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 48}" text-anchor="middle" class="bar-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)}</text>`);
  } else {
    // Beam: bottom tension bars — multi-row when spacing is too tight
    const barR = (flexure.barDia / 2000) * scale;
    const nBot = flexure.barCount;
    const stPx = (shear.stirrupDia / 1000) * scale;
    const startX = ox + coverPx + stPx + barR;
    const endX = ox + bPx - coverPx - stPx - barR;
    const availW = endX - startX;
    // Minimum clear gap: max(bar diameter, 25mm) per CIRSOC 201 §7.6
    const minGapPx = Math.max(flexure.barDia / 1000, 0.025) * scale;
    const maxPerRow = Math.max(1, availW > 0 ? Math.floor((availW + minGapPx) / (2 * barR + minGapPx)) : 1);
    const rowGapPx = 2 * barR + minGapPx;
    // Cap rows to available vertical space (leave room for top bars)
    const botBarY0 = oy + hPx - coverPx - stPx - barR; // first row Y
    const topLimit = oy + coverPx + stPx + barR + rowGapPx; // above this = top bar zone
    const maxRows = Math.max(1, Math.floor((botBarY0 - topLimit) / rowGapPx) + 1);
    const nRows = Math.min(Math.ceil(nBot / maxPerRow), maxRows);
    const nDrawn = Math.min(nBot, nRows * maxPerRow);

    let barIdx = 0;
    for (let row = 0; row < nRows; row++) {
      const barsInRow = Math.min(maxPerRow, nDrawn - barIdx);
      const barY = botBarY0 - row * rowGapPx;
      const rowSpacing = barsInRow > 1 ? (endX - startX) / (barsInRow - 1) : 0;
      for (let i = 0; i < barsInRow; i++) {
        const cx = barsInRow === 1 ? ox + bPx / 2 : startX + i * rowSpacing;
        lines.push(`<circle cx="${cx}" cy="${barY}" r="${Math.max(barR, 3)}" fill="#e94560" stroke="#ff8a9e" stroke-width="0.5"/>`);
        barIdx++;
      }
    }

    // Top bars: compression reinforcement (A's) or construction bars (2 Ø10)
    // Multi-row layout using the same spacing rules as bottom bars
    const hasCompSteel = flexure.isDoublyReinforced && flexure.barCountComp && flexure.barDiaComp;
    const topDia = hasCompSteel ? flexure.barDiaComp! : 10;
    const topCount = hasCompSteel ? flexure.barCountComp! : 2;
    const topBarR = (topDia / 2000) * scale;
    const topStartX = ox + coverPx + stPx + topBarR;
    const topEndX = ox + bPx - coverPx - stPx - topBarR;
    const topAvailW = topEndX - topStartX;
    const topMinGapPx = Math.max(topDia / 1000, 0.025) * scale;
    const topMaxPerRow = Math.max(1, topAvailW > 0 ? Math.floor((topAvailW + topMinGapPx) / (2 * topBarR + topMinGapPx)) : 1);
    const topRowGapPx = 2 * topBarR + topMinGapPx;
    const topBarY0 = oy + coverPx + stPx + topBarR; // first row (nearest top face)
    // Cap rows: don't overlap with bottom bar zone
    const topMaxRows = Math.max(1, Math.floor((botBarY0 - topBarY0 - rowGapPx) / topRowGapPx));
    const topNRows = Math.min(Math.ceil(topCount / topMaxPerRow), topMaxRows);
    const topNDrawn = Math.min(topCount, topNRows * topMaxPerRow);

    const topFill = hasCompSteel ? '#4a90d9' : '#666';
    const topStroke = hasCompSteel ? '#7ab8ff' : '#888';
    let topIdx = 0;
    for (let row = 0; row < topNRows; row++) {
      const barsInRow = Math.min(topMaxPerRow, topNDrawn - topIdx);
      const barY = topBarY0 + row * topRowGapPx; // stack downward from top
      const rowSpacing = barsInRow > 1 ? (topEndX - topStartX) / (barsInRow - 1) : 0;
      for (let i = 0; i < barsInRow; i++) {
        const cx = barsInRow === 1 ? ox + bPx / 2 : topStartX + i * rowSpacing;
        lines.push(`<circle cx="${cx}" cy="${barY}" r="${Math.max(topBarR, 2.5)}" fill="${topFill}" stroke="${topStroke}" stroke-width="0.5"/>`);
        topIdx++;
      }
    }

    // Labels
    const rowNote = nRows > 1 ? ` (${nRows} ${layerWord ?? 'rows'})` : '';
    const truncNote = nDrawn < nBot ? ` [max ${nDrawn}]` : '';
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 35}" text-anchor="middle" class="bar-label">${flexure.bars} (inf.)${rowNote}${truncNote}</text>`);
    lines.push(`<text x="${ox + bPx / 2}" y="${oy + hPx + 48}" text-anchor="middle" class="bar-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)}</text>`);
    const topRowNote = topNRows > 1 ? ` (${topNRows} ${layerWord ?? 'rows'})` : '';
    const topLabel = hasCompSteel ? `${flexure.barsComp} (A's)${topRowNote}` : `2 Ø10 (sup.)`;
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

function getColumnBarPositions(n: number, bPx: number, hPx: number, coverPx: number, ox: number, oy: number, stPx: number = 0, barR: number = 0): [number, number][] {
  const margin = coverPx + stPx + Math.max(barR, 5);
  const positions: [number, number][] = [];

  const x0 = ox + margin;
  const x1 = ox + bPx - margin;
  const y0 = oy + margin;
  const y1 = oy + hPx - margin;

  if (n <= 4) {
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    return corners.slice(0, n);
  }

  // 4 corners
  positions.push([x0, y0], [x1, y0], [x1, y1], [x0, y1]);

  // Distribute remaining bars symmetrically: top/bottom pair first, then right/left
  const extra = n - 4;
  const faceCounts = [0, 0, 0, 0]; // top, bottom, right, left
  for (let i = 0; i < extra; i++) {
    faceCounts[i % 4]++;
  }

  // Faces: [start, end] pairs — bars are placed between corners
  const faces: { sx: number; sy: number; ex: number; ey: number }[] = [
    { sx: x0, sy: y0, ex: x1, ey: y0 }, // top
    { sx: x1, sy: y1, ex: x0, ey: y1 }, // bottom (reversed for symmetry with top)
    { sx: x1, sy: y0, ex: x1, ey: y1 }, // right
    { sx: x0, sy: y1, ex: x0, ey: y0 }, // left
  ];

  for (let f = 0; f < 4; f++) {
    const count = faceCounts[f];
    if (count === 0) continue;
    const { sx, sy, ex, ey } = faces[f];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      positions.push([sx + t * (ex - sx), sy + t * (ey - sy)]);
    }
  }

  return positions;
}

// ─── Beam Elevation Drawing ─────────────────────────────────────

/** Framing context: what types of members connect at each end node. */
export interface FramingContext {
  startMembers?: Array<'column' | 'beam'>;
  endMembers?: Array<'column' | 'beam'>;
}

export interface ElevationSvgOpts {
  length: number;     // beam length (m)
  b: number;          // section width (m) — needed for multi-row consistency with cross-section
  h: number;          // section height (m)
  cover: number;      // concrete cover (m)
  flexure: FlexureResult;
  shear: ShearResult;
  supportI: 'fixed' | 'pinned' | 'free';
  supportJ: 'fixed' | 'pinned' | 'free';
  detailing?: DetailingResult;
  context?: FramingContext;
  /** Translated label for splice annotation (default: "splice") */
  spliceLabel?: string;
}

export function generateBeamElevationSvg(opts: ElevationSvgOpts): string {
  const { length, b, h, cover, flexure, shear, supportI, supportJ, detailing, context, spliceLabel: _spliceLabel } = opts;
  const spliceWord = _spliceLabel ?? 'splice';
  const scaleX = 500 / length;
  const scaleY = Math.min(200, 300 / h);

  // Compute anchorage tail length in pixels (capped at 20% of beam length for readability)
  const maxLd = detailing ? Math.max(...detailing.bars.map(b => b.ld)) : 0;
  const ldDrawM = Math.min(maxLd, length * 0.2);
  const ldPx = ldDrawM * scaleX;
  const tailPx = detailing ? Math.max(ldPx, 20) : 0;

  // Extra horizontal space for framing context stubs
  const contextPad = context ? 20 : 0;

  const ox = 50 + tailPx + contextPad;
  const oy = 40;
  const hPx = h * scaleY;
  const lPx = length * scaleX;
  const W = lPx + 100 + (tailPx + contextPad) * 2;
  const H = h * scaleY + 120;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .bar-label { font-size: 9px; fill: #f0a500; }
    .stirrup-label { font-size: 8px; fill: #888; }
    .detail-dim { font-size: 8px; fill: #5a9; }
    .context-label { font-size: 7px; fill: #556; }
  </style>`);

  // ── Framing context stubs (drawn first, behind the beam) ──
  if (context) {
    const stubW = 16;
    const stubH = hPx * 1.3;
    const stubY = oy - (stubH - hPx) / 2;
    // Start node (node I)
    if (context.startMembers?.includes('column')) {
      lines.push(`<rect x="${ox - stubW}" y="${stubY}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.8" rx="1"/>`);
    }
    // End node (node J)
    if (context.endMembers?.includes('column')) {
      lines.push(`<rect x="${ox + lPx}" y="${stubY}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.8" rx="1"/>`);
    }
  }

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${lPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // ── Bottom bars (main tension reinforcement — positive moment assumption) ──
  // In real-world section coords: 0 = bottom face, h = top face
  // Bottom bar center: cover + stirrup + barR from the bottom face
  // Top bar center: h - cover - stirrup - barR from the bottom face
  const barDiaMm = flexure.barDia;
  const barR_m = barDiaMm / 2000;
  const stThick_m = shear.stirrupDia / 1000;
  const minGap_m = Math.max(barDiaMm / 1000, 0.025);
  const availW_m = b - 2 * cover - 2 * stThick_m - 2 * barR_m;
  const maxPerRow = Math.max(1, availW_m > 0 ? Math.floor((availW_m + minGap_m) / (2 * barR_m + minGap_m)) : 1);
  const rowGap_m = 2 * barR_m + minGap_m;
  const botBarY_m = cover + stThick_m + barR_m;  // near bottom face
  const topBarY_m = h - cover - stThick_m - barR_m; // near top face
  const maxRows = Math.max(1, Math.floor((topBarY_m - botBarY_m - rowGap_m) / rowGap_m) + 1);
  const nBot = flexure.barCount;
  const nRows = Math.min(Math.ceil(nBot / maxPerRow), maxRows);
  // SVG Y: oy = top of beam, oy + hPx = bottom of beam
  // Map real-world y to SVG: svgY = oy + (h - y_m) * (hPx / h)
  const botBarYPx = oy + (h - botBarY_m) * (hPx / h); // near SVG bottom

  // Draw bottom bar rows — solid, visually dominant
  const barExtL = (detailing && (supportI === 'fixed' || supportI === 'pinned')) ? tailPx : 0;
  const barExtR = (detailing && (supportJ === 'fixed' || supportJ === 'pinned')) ? tailPx : 0;
  for (let row = 0; row < nRows; row++) {
    const y_m = botBarY_m + row * rowGap_m; // stack upward from bottom
    const yPx = oy + (h - y_m) * (hPx / h);
    const sw = row === 0 ? 2.5 : 2;
    lines.push(`<line x1="${ox + 5}" y1="${yPx}" x2="${ox + lPx - 5}" y2="${yPx}" stroke="#e94560" stroke-width="${sw}"/>`);
    // Anchorage tails (first row only)
    if (row === 0 && detailing) {
      if (barExtL > 0) lines.push(`<line x1="${ox - barExtL}" y1="${yPx}" x2="${ox + 5}" y2="${yPx}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
      if (barExtR > 0) lines.push(`<line x1="${ox + lPx - 5}" y1="${yPx}" x2="${ox + lPx + barExtR}" y2="${yPx}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
    }
  }

  // ── Top bars (compression steel or minimum continuous) — always visible ──
  const hasCompSteel = flexure.isDoublyReinforced && flexure.barCountComp && flexure.barDiaComp;
  const topY = oy + (h - topBarY_m) * (hPx / h); // near SVG top
  if (hasCompSteel) {
    // Compression steel: solid, blue, thinner than bottom
    lines.push(`<line x1="${ox + 5}" y1="${topY}" x2="${ox + lPx - 5}" y2="${topY}" stroke="#4a90d9" stroke-width="1.8"/>`);
  } else {
    // Minimum continuous top bars (2 Ø10): solid thin line, lighter color — always shown
    lines.push(`<line x1="${ox + 5}" y1="${topY}" x2="${ox + lPx - 5}" y2="${topY}" stroke="#7a8a9a" stroke-width="1.2"/>`);
  }

  // Stirrups
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

  // ── Labels — both zones clearly labeled ──
  const rowNote = nRows > 1 ? ` (${nRows}r)` : '';
  // Bottom: main tension reinforcement (red label, below bottom bars)
  lines.push(`<text x="${ox + lPx / 2}" y="${oy + hPx - cover * scaleY + 15}" text-anchor="middle" class="bar-label">${flexure.bars}${rowNote} (As)</text>`);
  // Top: compression or minimum bars (above top bars)
  const topLabel = hasCompSteel ? `${flexure.barsComp ?? '2 Ø10'} (A's)` : '2 Ø10 min';
  const topLabelColor = hasCompSteel ? '#4a90d9' : '#7a8a9a';
  lines.push(`<text x="${ox + lPx / 2}" y="${topY - 8}" text-anchor="middle" class="bar-label" style="fill:${topLabelColor}">${topLabel}</text>`);
  // Stirrup label
  lines.push(`<text x="${ox + lPx / 2}" y="${oy + hPx + 40}" text-anchor="middle" class="stirrup-label">eØ${shear.stirrupDia} c/${(shear.spacing * 100).toFixed(0)} cm</text>`);

  // Length dimension
  lines.push(`<line x1="${ox}" y1="${oy + hPx + 20}" x2="${ox + lPx}" y2="${oy + hPx + 20}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + lPx / 2}" y="${oy + hPx + 30}" text-anchor="middle" class="dim">L = ${length.toFixed(2)} m</text>`);

  // ── Detailing annotations ──
  if (detailing) {
    const ldCm = (maxLd * 100).toFixed(0);
    const maxSplice = Math.max(...detailing.bars.map(b => b.lapSplice));
    const spliceCm = (maxSplice * 100).toFixed(0);

    // Anchorage dimension lines at supports
    if (barExtL > 0) {
      const yDim = botBarYPx + 12;
      lines.push(`<line x1="${ox - barExtL}" y1="${yDim}" x2="${ox}" y2="${yDim}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${ox - barExtL}" y1="${yDim - 3}" x2="${ox - barExtL}" y2="${yDim + 3}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${ox}" y1="${yDim - 3}" x2="${ox}" y2="${yDim + 3}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<text x="${ox - barExtL / 2}" y="${yDim + 11}" text-anchor="middle" class="detail-dim">ld=${ldCm}</text>`);
    }
    if (barExtR > 0) {
      const yDim = botBarYPx + 12;
      lines.push(`<line x1="${ox + lPx}" y1="${yDim}" x2="${ox + lPx + barExtR}" y2="${yDim}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${ox + lPx}" y1="${yDim - 3}" x2="${ox + lPx}" y2="${yDim + 3}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${ox + lPx + barExtR}" y1="${yDim - 3}" x2="${ox + lPx + barExtR}" y2="${yDim + 3}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<text x="${ox + lPx + barExtR / 2}" y="${yDim + 11}" text-anchor="middle" class="detail-dim">ld=${ldCm}</text>`);
    }

    // Splice zone indicator at ~0.25L (where moment is typically low for simply-supported)
    const spliceDrawM = Math.min(maxSplice, length * 0.3);
    const splicePx = spliceDrawM * scaleX;
    const spliceX = ox + lPx * 0.25 - splicePx / 2;
    const spliceY1 = botBarYPx - 6;
    const spliceY2 = botBarYPx + 3;
    lines.push(`<rect x="${spliceX}" y="${spliceY1}" width="${splicePx}" height="${spliceY2 - spliceY1}" fill="#5a9" opacity="0.15" rx="2"/>`);
    lines.push(`<line x1="${spliceX}" y1="${spliceY1}" x2="${spliceX}" y2="${spliceY2}" stroke="#5a9" stroke-width="0.5"/>`);
    lines.push(`<line x1="${spliceX + splicePx}" y1="${spliceY1}" x2="${spliceX + splicePx}" y2="${spliceY2}" stroke="#5a9" stroke-width="0.5"/>`);
    lines.push(`<text x="${spliceX + splicePx / 2}" y="${spliceY1 - 3}" text-anchor="middle" class="detail-dim">${spliceWord}=${spliceCm}</text>`);
  }

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
  detailing?: DetailingResult;
  context?: FramingContext;
  /** Translated label for splice annotation (default: "splice") */
  spliceLabel?: string;
}

export function generateColumnElevationSvg(opts: ColumnElevationSvgOpts): string {
  const { height, b, h, cover, column, shear, detailing, context, spliceLabel: _spliceLabel } = opts;
  const spliceWord = _spliceLabel ?? 'splice';
  const scaleX = 200 / b;
  const scaleY = Math.min(400 / height, 120);
  const bPx = b * scaleX;
  const hPx = height * scaleY;
  const coverPx = cover * scaleX;

  // Detailing: development below foundation + splice zone
  const maxLd = detailing ? Math.max(...detailing.bars.map(b => b.ld)) : 0;
  const ldDrawM = Math.min(maxLd, height * 0.25); // cap at 25% of column height
  const ldPx = detailing ? Math.max(ldDrawM * scaleY, 15) : 0;
  const maxSplice = detailing ? Math.max(...detailing.bars.map(b => b.lapSplice)) : 0;
  const spliceDrawM = Math.min(maxSplice, height * 0.4);
  const splicePx = detailing ? spliceDrawM * scaleY : 0;

  const ox = 60;
  const oy = 30;
  const W = bPx + 140;
  const H = hPx + 100 + ldPx;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 9px; fill: #888; }
    .bar-label { font-size: 9px; fill: #f0a500; }
    .detail-dim { font-size: 8px; fill: #5a9; }
  </style>`);

  // ── Framing context stubs (drawn behind column) ──
  if (context) {
    const stubH = 8;
    const stubW = bPx * 0.7;
    // Top: beams framing in
    if (context.endMembers?.includes('beam')) {
      lines.push(`<rect x="${ox - stubW * 0.3}" y="${oy - stubH}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
      lines.push(`<rect x="${ox + bPx - stubW * 0.7}" y="${oy - stubH}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
    }
    // Bottom: beams framing in (above foundation)
    if (context.startMembers?.includes('beam')) {
      lines.push(`<rect x="${ox - stubW * 0.3}" y="${oy + hPx}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
      lines.push(`<rect x="${ox + bPx - stubW * 0.7}" y="${oy + hPx}" width="${stubW}" height="${stubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
    }
  }

  // Concrete outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${hPx}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Vertical bars (left and right faces) — extend below foundation if detailing
  const barR = Math.max((column.barDia / 1000) * scaleX * 0.5, 1);
  const xL = ox + coverPx + barR;
  const xR = ox + bPx - coverPx - barR;
  const barTopY = oy + 5;
  const barBotY = oy + hPx - 5;
  const barExtY = detailing ? barBotY + ldPx : barBotY;
  lines.push(`<line x1="${xL}" y1="${barTopY}" x2="${xL}" y2="${barBotY}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);
  lines.push(`<line x1="${xR}" y1="${barTopY}" x2="${xR}" y2="${barBotY}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}"/>`);
  // Development tails below foundation (dashed)
  if (detailing && ldPx > 0) {
    lines.push(`<line x1="${xL}" y1="${barBotY}" x2="${xL}" y2="${barExtY}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}" stroke-dasharray="4,3" opacity="0.7"/>`);
    lines.push(`<line x1="${xR}" y1="${barBotY}" x2="${xR}" y2="${barExtY}" stroke="#e94560" stroke-width="${Math.max(barR, 1.5)}" stroke-dasharray="4,3" opacity="0.7"/>`);
  }

  // Intermediate vertical bars
  if (column.barCount > 4) {
    const extra = column.barCount - 4;
    const faceCounts = [0, 0, 0, 0];
    for (let i = 0; i < extra; i++) faceCounts[i % 4]++;
    const nInter = Math.max(faceCounts[0], faceCounts[1]);
    for (let i = 1; i <= nInter; i++) {
      const t = i / (nInter + 1);
      const xi = xL + t * (xR - xL);
      lines.push(`<line x1="${xi}" y1="${barTopY}" x2="${xi}" y2="${barBotY}" stroke="#e94560" stroke-width="${Math.max(barR * 0.7, 1)}" opacity="0.6"/>`);
      if (detailing && ldPx > 0) {
        lines.push(`<line x1="${xi}" y1="${barBotY}" x2="${xi}" y2="${barExtY}" stroke="#e94560" stroke-width="${Math.max(barR * 0.5, 0.8)}" stroke-dasharray="4,3" opacity="0.5"/>`);
      }
    }
  }

  // Ties/stirrups — hooks proportional to computed hook length
  const spacing = shear.spacing;
  const nTies = Math.min(Math.floor(height / spacing), 40);
  const tieStepPx = hPx / (nTies + 1);
  // Hook size: proportional to stirrup diameter and hook rule
  const hookLen = detailing
    ? Math.min((shear.stirrupDia <= 16 ? 6 : 8) * shear.stirrupDia / 1000 * scaleX, 12)
    : 4;
  const hookRise = hookLen * 0.75;
  for (let i = 1; i <= nTies; i++) {
    const yi = oy + i * tieStepPx;
    lines.push(`<line x1="${ox + coverPx}" y1="${yi}" x2="${ox + bPx - coverPx}" y2="${yi}" stroke="#f0a500" stroke-width="0.8" opacity="0.5"/>`);
    lines.push(`<line x1="${ox + coverPx}" y1="${yi}" x2="${ox + coverPx + hookLen}" y2="${yi - hookRise}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
    lines.push(`<line x1="${ox + bPx - coverPx}" y1="${yi}" x2="${ox + bPx - coverPx - hookLen}" y2="${yi - hookRise}" stroke="#f0a500" stroke-width="0.6" opacity="0.5"/>`);
  }

  // Foundation hatching at bottom
  const foundY = oy + hPx;
  lines.push(`<line x1="${ox - 15}" y1="${foundY}" x2="${ox + bPx + 15}" y2="${foundY}" stroke="#4ecdc4" stroke-width="2"/>`);
  for (let i = -15; i <= bPx + 10; i += 5) {
    lines.push(`<line x1="${ox + i}" y1="${foundY}" x2="${ox + i - 5}" y2="${foundY + 8}" stroke="#4ecdc4" stroke-width="0.5"/>`);
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

  // ── Detailing annotations ──
  if (detailing) {
    const ldCm = (maxLd * 100).toFixed(0);
    const spliceCm = (maxSplice * 100).toFixed(0);

    // Development length dimension below foundation
    if (ldPx > 0) {
      const dimX = ox + bPx + 10;
      lines.push(`<line x1="${dimX}" y1="${foundY}" x2="${dimX}" y2="${barExtY}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${dimX - 3}" y1="${foundY}" x2="${dimX + 3}" y2="${foundY}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<line x1="${dimX - 3}" y1="${barExtY}" x2="${dimX + 3}" y2="${barExtY}" stroke="#5a9" stroke-width="0.5"/>`);
      lines.push(`<text x="${dimX + 5}" y="${foundY + ldPx / 2}" dominant-baseline="middle" class="detail-dim">ld=${ldCm}</text>`);
    }

    // Splice zone near base (above foundation)
    if (splicePx > 0) {
      const spliceTop = foundY - splicePx;
      lines.push(`<rect x="${ox + 1}" y="${spliceTop}" width="${bPx - 2}" height="${splicePx}" fill="#5a9" opacity="0.08" rx="2"/>`);
      lines.push(`<line x1="${ox}" y1="${spliceTop}" x2="${ox + bPx}" y2="${spliceTop}" stroke="#5a9" stroke-width="0.5" stroke-dasharray="3,2"/>`);
      lines.push(`<text x="${ox + bPx + 10}" y="${spliceTop + splicePx / 2}" dominant-baseline="middle" class="detail-dim">${spliceWord}=${spliceCm}</text>`);
    }
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Beam Frame-Line Continuity Elevation ────────────────────────

export interface FrameLineSpan {
  length: number;
  bottomBars: string;
  topBars: string;
  hasCompSteel: boolean;
  stirrupSpacing: number;
  stirrupDia: number;
  detailing?: DetailingResult;
  /** Signed moment envelope at stations along this span. */
  momentStations?: {
    t: number[];       // normalized positions 0..1 along span
    posM: number[];    // max positive moment (sagging / bottom tension) at each station
    negM: number[];    // max |negative moment| (hogging / top tension) at each station
  };
}

export interface FrameLineNode {
  hasColumn: boolean;
  hasSupport: boolean;
  supportType?: string;
}

export interface FrameLineElevationOpts {
  spans: FrameLineSpan[];
  nodes: FrameLineNode[];
  labels?: { splice?: string };
  /** Principal axis label for grouping (X / Y / other). */
  axis?: 'X' | 'Y' | 'other';
}

export function generateFrameLineElevationSvg(opts: FrameLineElevationOpts): string {
  const { spans, nodes, labels } = opts;
  if (spans.length === 0) return '';
  const spliceWord = labels?.splice ?? 'splice';

  // Geometry
  const totalLength = spans.reduce((s, sp) => s + sp.length, 0);
  const maxSpans = Math.min(spans.length, 8);
  const drawnSpans = spans.slice(0, maxSpans);
  const drawnNodes = nodes.slice(0, maxSpans + 1);
  const drawnLength = drawnSpans.reduce((s, sp) => s + sp.length, 0);
  const truncated = maxSpans < spans.length;

  const scaleX = Math.min(800 / drawnLength, 120);
  const beamH = 30; // px height of beam outline
  const pad = 40;
  const anchorPad = 25; // space for end anchorage tails
  const totalW = drawnLength * scaleX + 2 * pad + 2 * anchorPad;
  const totalH = beamH + 140; // room for labels, dims, column stubs
  const ox = pad + anchorPad;
  const oy = 50;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .bar-label { font-size: 8px; fill: #f0a500; }
    .span-dim { font-size: 8px; fill: #aaa; }
    .detail-dim { font-size: 7px; fill: #5a9; }
    .section-title { font-size: 9px; fill: #4ecdc4; font-weight: bold; }
  </style>`);

  // Accumulate X positions for each node
  const nodeX: number[] = [ox];
  for (let i = 0; i < drawnSpans.length; i++) {
    nodeX.push(nodeX[i] + drawnSpans[i].length * scaleX);
  }
  const beamLeft = nodeX[0];
  const beamRight = nodeX[nodeX.length - 1];

  // ── Column stubs (behind beam) ──
  const colStubW = 14;
  const colStubH = beamH * 1.6;
  const colStubY = oy - (colStubH - beamH) / 2;
  for (let i = 0; i < drawnNodes.length; i++) {
    if (drawnNodes[i].hasColumn) {
      lines.push(`<rect x="${nodeX[i] - colStubW / 2}" y="${colStubY}" width="${colStubW}" height="${colStubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.7" rx="1"/>`);
    }
  }

  // ── Beam concrete outline ──
  lines.push(`<rect x="${beamLeft}" y="${oy}" width="${beamRight - beamLeft}" height="${beamH}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // ── Support/span boundary lines ──
  for (let i = 0; i < drawnNodes.length; i++) {
    if (i > 0 && i < drawnNodes.length - 1) {
      // Internal support: solid thin line
      lines.push(`<line x1="${nodeX[i]}" y1="${oy - 4}" x2="${nodeX[i]}" y2="${oy + beamH + 4}" stroke="#4ecdc4" stroke-width="0.6" opacity="0.5"/>`);
    }
  }

  // ── Support symbols at ends ──
  if (drawnNodes[0].hasSupport) {
    const sType = drawnNodes[0].supportType;
    if (sType === 'fixed' || sType === 'fixed3d') {
      lines.push(`<line x1="${beamLeft - 6}" y1="${oy + beamH}" x2="${beamLeft + 6}" y2="${oy + beamH}" stroke="#4ecdc4" stroke-width="1.5"/>`);
    } else {
      lines.push(`<polygon points="${beamLeft},${oy + beamH} ${beamLeft - 6},${oy + beamH + 8} ${beamLeft + 6},${oy + beamH + 8}" fill="none" stroke="#4ecdc4" stroke-width="0.8"/>`);
    }
  }
  if (drawnNodes[drawnNodes.length - 1].hasSupport) {
    const sType = drawnNodes[drawnNodes.length - 1].supportType;
    if (sType === 'fixed' || sType === 'fixed3d') {
      lines.push(`<line x1="${beamRight - 6}" y1="${oy + beamH}" x2="${beamRight + 6}" y2="${oy + beamH}" stroke="#4ecdc4" stroke-width="1.5"/>`);
    } else {
      lines.push(`<polygon points="${beamRight},${oy + beamH} ${beamRight - 6},${oy + beamH + 8} ${beamRight + 6},${oy + beamH + 8}" fill="none" stroke="#4ecdc4" stroke-width="0.8"/>`);
    }
  }

  // Bar Y positions within the beam outline
  const botBarY = oy + beamH - 6;
  const topBarY = oy + 6;

  // Check if envelope moment data is available for any span
  const hasEnvelopeData = drawnSpans.some(sp => sp.momentStations && sp.momentStations.t.length > 0);

  if (hasEnvelopeData) {
    // ══════ MOMENT-ENVELOPE-AWARE BAR PLACEMENT ══════

    // Continuous minimum bar set: thin line at bottom through all spans
    lines.push(`<line x1="${beamLeft + 3}" y1="${botBarY}" x2="${beamRight - 3}" y2="${botBarY}" stroke="#e94560" stroke-width="1" opacity="0.5"/>`);
    // Continuous minimum bar set: thin line at top through all spans
    lines.push(`<line x1="${beamLeft + 3}" y1="${topBarY}" x2="${beamRight - 3}" y2="${topBarY}" stroke="#7a8a9a" stroke-width="0.8" opacity="0.4"/>`);

    // Per-span: draw demand bars and find inflection points
    let firstSpliceLabeled = false;
    for (let i = 0; i < drawnSpans.length; i++) {
      const sp = drawnSpans[i];
      const ms = sp.momentStations;
      if (!ms || ms.t.length === 0) {
        // Fallback: full-span bottom bar
        lines.push(`<line x1="${nodeX[i] + 3}" y1="${botBarY}" x2="${nodeX[i + 1] - 3}" y2="${botBarY}" stroke="#e94560" stroke-width="2.5"/>`);
        continue;
      }

      const spanLeft = nodeX[i];
      const spanPx = nodeX[i + 1] - spanLeft;

      // ── Support-anchored three-zone model ──
      // Find inflection points from envelope: where posM first exceeds negM (left→right)
      // and where posM last exceeds negM (right→left)
      const leftHasCol = drawnNodes[i].hasColumn || drawnNodes[i].hasSupport;
      const rightHasCol = drawnNodes[i + 1].hasColumn || drawnNodes[i + 1].hasSupport;

      // Scan for left inflection (first station where pos > neg, scanning from left)
      let tInflL = 0.25; // default for interior spans
      for (let j = 0; j < ms.t.length; j++) {
        if (ms.posM[j] > ms.negM[j] * 1.2) { // pos clearly dominates (20% margin)
          tInflL = ms.t[j];
          break;
        }
      }
      // Scan for right inflection (first station where pos > neg, scanning from right)
      let tInflR = 0.75;
      for (let j = ms.t.length - 1; j >= 0; j--) {
        if (ms.posM[j] > ms.negM[j] * 1.2) {
          tInflR = ms.t[j];
          break;
        }
      }

      // Clamp: inflection points must be at least 0.15L from supports
      tInflL = Math.max(tInflL, 0.15);
      tInflR = Math.min(tInflR, 0.85);
      // Ensure left < right
      if (tInflL >= tInflR) { tInflL = 0.3; tInflR = 0.7; }

      const overlap = 0.08; // bottom bars extend 8% of span into support zones

      // Left support zone: top bar from t=0 to tInflL (if support/column exists)
      if (leftHasCol) {
        const x0 = spanLeft;
        const x1 = spanLeft + tInflL * spanPx;
        lines.push(`<line x1="${x0 + 2}" y1="${topBarY}" x2="${x1}" y2="${topBarY}" stroke="#4a90d9" stroke-width="2"/>`);
      }

      // Right support zone: top bar from tInflR to t=1 (if support/column exists)
      if (rightHasCol) {
        const x0 = spanLeft + tInflR * spanPx;
        const x1 = spanLeft + spanPx;
        lines.push(`<line x1="${x0}" y1="${topBarY}" x2="${x1 - 2}" y2="${topBarY}" stroke="#4a90d9" stroke-width="2"/>`);
      }

      // Midspan zone: bottom bar with overlap into support zones
      const botStart = leftHasCol ? Math.max(0, tInflL - overlap) : 0;
      const botEnd = rightHasCol ? Math.min(1, tInflR + overlap) : 1;
      const bx0 = spanLeft + botStart * spanPx;
      const bx1 = spanLeft + botEnd * spanPx;
      lines.push(`<line x1="${bx0 + 2}" y1="${botBarY}" x2="${bx1 - 2}" y2="${botBarY}" stroke="#e94560" stroke-width="2.5"/>`);

      // Splice at the transition zone (best location: average of inflection points)
      const spliceT = (tInflL + tInflR) / 2; // midway between transitions ≈ midspan low-demand
      // Find actual lowest-demand station near midspan for splice placement
      let bestSpliceT = spliceT;
      let bestSpliceDemand = Infinity;
      const maxPos = Math.max(...ms.posM, 1);
      const maxNeg = Math.max(...ms.negM, 1);
      for (let j = 0; j < ms.t.length; j++) {
        if (ms.t[j] < 0.15 || ms.t[j] > 0.85) continue;
        const d = ms.posM[j] / maxPos + ms.negM[j] / maxNeg;
        if (d < bestSpliceDemand) { bestSpliceDemand = d; bestSpliceT = ms.t[j]; }
      }

      if (bestSpliceT >= 0.15 && bestSpliceT <= 0.85 && sp.detailing) {
        const xSplice = spanLeft + bestSpliceT * spanPx;
        const maxSplice = Math.max(...sp.detailing.bars.map(b => b.lapSplice));
        const splicePx = Math.min(maxSplice * scaleX, spanPx * 0.15);
        if (splicePx >= 4) {
          // Splice indicator
          lines.push(`<rect x="${xSplice - splicePx / 2}" y="${botBarY - 4}" width="${splicePx}" height="5" fill="#5a9" opacity="0.15" rx="1"/>`);
          // Low-demand marker
          lines.push(`<circle cx="${xSplice}" cy="${oy + beamH / 2}" r="2" fill="none" stroke="#5a9" stroke-width="0.6"/>`);
          if (!firstSpliceLabeled) {
            lines.push(`<text x="${xSplice}" y="${botBarY - 7}" text-anchor="middle" class="detail-dim">${spliceWord}=${(maxSplice * 100).toFixed(0)}</text>`);
            firstSpliceLabeled = true;
          }
        }
      }
    }

    // End anchorage tails
    const firstDet = drawnSpans[0]?.detailing;
    const lastDet = drawnSpans[drawnSpans.length - 1]?.detailing;
    if (firstDet && drawnNodes[0].hasSupport) {
      const ld = Math.max(...firstDet.bars.map(b => b.ld));
      const ldPx = Math.min(ld * scaleX, anchorPad - 2);
      lines.push(`<line x1="${beamLeft - ldPx}" y1="${botBarY}" x2="${beamLeft + 3}" y2="${botBarY}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
      lines.push(`<text x="${beamLeft - ldPx / 2}" y="${botBarY + 11}" text-anchor="middle" class="detail-dim">ld=${(ld * 100).toFixed(0)}</text>`);
    }
    if (lastDet && drawnNodes[drawnNodes.length - 1].hasSupport) {
      const ld = Math.max(...lastDet.bars.map(b => b.ld));
      const ldPx = Math.min(ld * scaleX, anchorPad - 2);
      lines.push(`<line x1="${beamRight - 3}" y1="${botBarY}" x2="${beamRight + ldPx}" y2="${botBarY}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
      lines.push(`<text x="${beamRight + ldPx / 2}" y="${botBarY + 11}" text-anchor="middle" class="detail-dim">ld=${(ld * 100).toFixed(0)}</text>`);
    }

    // Labels
    lines.push(`<text x="${beamLeft + 5}" y="${botBarY + 12}" class="bar-label">${drawnSpans[0].bottomBars} (As+)</text>`);
    if (drawnNodes.length > 2) {
      lines.push(`<text x="${nodeX[1]}" y="${topBarY - 5}" text-anchor="middle" class="bar-label" style="fill:#4a90d9">${drawnSpans[0].topBars} (As-)</text>`);
    }

  } else {
    // ══════ SCHEMATIC FALLBACK (no envelope data) ══════

    // Bottom continuous bars
    lines.push(`<line x1="${beamLeft + 3}" y1="${botBarY}" x2="${beamRight - 3}" y2="${botBarY}" stroke="#e94560" stroke-width="2.5"/>`);

    // End anchorage tails
    const firstDetailing = drawnSpans[0]?.detailing;
    const lastDetailing = drawnSpans[drawnSpans.length - 1]?.detailing;
    if (firstDetailing && drawnNodes[0].hasSupport) {
      const ld = Math.max(...firstDetailing.bars.map(b => b.ld));
      const ldPx = Math.min(ld * scaleX, anchorPad - 2);
      lines.push(`<line x1="${beamLeft - ldPx}" y1="${botBarY}" x2="${beamLeft + 3}" y2="${botBarY}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
    }
    if (lastDetailing && drawnNodes[drawnNodes.length - 1].hasSupport) {
      const ld = Math.max(...lastDetailing.bars.map(b => b.ld));
      const ldPx = Math.min(ld * scaleX, anchorPad - 2);
      lines.push(`<line x1="${beamRight - 3}" y1="${botBarY}" x2="${beamRight + ldPx}" y2="${botBarY}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
    }

    // Top bars over internal supports (schematic 0.25L)
    for (let i = 1; i < drawnNodes.length - 1; i++) {
      const leftSpan = drawnSpans[i - 1];
      const rightSpan = drawnSpans[i];
      const extL = leftSpan.length * 0.25 * scaleX;
      const extR = rightSpan.length * 0.25 * scaleX;
      lines.push(`<line x1="${nodeX[i] - extL}" y1="${topBarY}" x2="${nodeX[i] + extR}" y2="${topBarY}" stroke="#7a8a9a" stroke-width="1.2"/>`);
    }

    // Labels
    lines.push(`<text x="${beamLeft + 5}" y="${botBarY + 12}" class="bar-label">${drawnSpans[0].bottomBars} (As)</text>`);
    if (drawnNodes.length > 2) {
      const topLabel = drawnSpans[0].hasCompSteel ? `${drawnSpans[0].topBars} (A's)` : drawnSpans[0].topBars + ' min';
      lines.push(`<text x="${nodeX[1]}" y="${topBarY - 5}" text-anchor="middle" class="bar-label" style="fill:#7a8a9a">${topLabel}</text>`);
    }
  }

  // ── Stirrups (representative per span) ──
  for (let i = 0; i < drawnSpans.length; i++) {
    const sp = drawnSpans[i];
    const spanLeft = nodeX[i];
    const spanRight = nodeX[i + 1];
    const spanPx = spanRight - spanLeft;
    const nStir = Math.min(Math.floor(sp.length / sp.stirrupSpacing), Math.floor(spanPx / 8));
    const step = spanPx / (nStir + 1);
    for (let j = 1; j <= nStir; j++) {
      const x = spanLeft + j * step;
      lines.push(`<line x1="${x}" y1="${oy + 3}" x2="${x}" y2="${oy + beamH - 3}" stroke="#f0a500" stroke-width="0.5" opacity="0.35"/>`);
    }
  }

  // ── Splice zones (schematic fallback only — moment-aware path handles splices above) ──
  if (!hasEnvelopeData) {
    for (let i = 0; i < drawnSpans.length; i++) {
      const sp = drawnSpans[i];
      if (!sp.detailing) continue;
      const maxSplice = Math.max(...sp.detailing.bars.map(b => b.lapSplice));
      const spanLeft = nodeX[i];
      const spanPx = nodeX[i + 1] - spanLeft;
      const splicePx = Math.min(maxSplice * scaleX, spanPx * 0.2);
      if (splicePx < 5) continue;
      const spliceX = spanLeft + spanPx * 0.25 - splicePx / 2;
      lines.push(`<rect x="${spliceX}" y="${botBarY - 4}" width="${splicePx}" height="5" fill="#5a9" opacity="0.15" rx="1"/>`);
      if (i === 0) {
        lines.push(`<text x="${spliceX + splicePx / 2}" y="${botBarY - 7}" text-anchor="middle" class="detail-dim">${spliceWord}=${(maxSplice * 100).toFixed(0)}</text>`);
      }
    }
  }

  // ── Span dimensions ──
  const dimY = oy + beamH + 18;
  for (let i = 0; i < drawnSpans.length; i++) {
    const x1 = nodeX[i];
    const x2 = nodeX[i + 1];
    const cx = (x1 + x2) / 2;
    lines.push(`<line x1="${x1}" y1="${dimY}" x2="${x2}" y2="${dimY}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<line x1="${x1}" y1="${dimY - 2}" x2="${x1}" y2="${dimY + 2}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<line x1="${x2}" y1="${dimY - 2}" x2="${x2}" y2="${dimY + 2}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<text x="${cx}" y="${dimY + 10}" text-anchor="middle" class="span-dim">${drawnSpans[i].length.toFixed(2)} m</text>`);
  }

  // Truncation indicator
  if (truncated) {
    lines.push(`<text x="${beamRight + 8}" y="${oy + beamH / 2}" dominant-baseline="middle" class="dim">...</text>`);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Column Stack Continuity Elevation ────────────────────────────

export interface ColumnStackSegment {
  height: number;
  bars: string;
  barCount: number;
  barDia: number;
  stirrupSpacing: number;
  stirrupDia: number;
  detailing?: DetailingResult;
}

export interface ColumnStackNode {
  hasBeam: boolean;
  hasSupport: boolean;
  supportType?: string;
}

export interface ColumnStackElevationOpts {
  segments: ColumnStackSegment[];
  nodes: ColumnStackNode[];
  sectionB: number;
  sectionH: number;
  cover: number;
  labels?: { splice?: string };
}

export function generateColumnStackElevationSvg(opts: ColumnStackElevationOpts): string {
  const { segments, nodes, sectionB, cover, labels } = opts;
  if (segments.length === 0) return '';
  const spliceWord = labels?.splice ?? 'splice';

  const maxSegs = Math.min(segments.length, 8);
  const drawnSegs = segments.slice(0, maxSegs);
  const drawnNodes = nodes.slice(0, maxSegs + 1);
  const truncated = maxSegs < segments.length;
  const totalH = drawnSegs.reduce((s, seg) => s + seg.height, 0);

  const scaleY = Math.min(400 / totalH, 80);
  const colW = 50; // px width of column outline
  const pad = 40;
  const anchorPad = 20;
  const W = colW + 200; // room for labels and dimensions
  const H = totalH * scaleY + 2 * pad + anchorPad;
  const ox = 80; // left margin for dimension labels
  const oy = pad;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .bar-label { font-size: 8px; fill: #f0a500; }
    .detail-dim { font-size: 7px; fill: #5a9; }
    .level-label { font-size: 7px; fill: #556; }
  </style>`);

  // Accumulate Y positions for each node (top = oy, bottom = oy + totalH*scaleY)
  const nodeY: number[] = [oy];
  for (let i = 0; i < drawnSegs.length; i++) {
    nodeY.push(nodeY[i] + drawnSegs[i].height * scaleY);
  }
  const colTop = nodeY[0];
  const colBot = nodeY[nodeY.length - 1];

  // ── Beam stubs at floor levels (behind column) ──
  const beamStubW = 30;
  const beamStubH = 8;
  for (let i = 0; i < drawnNodes.length; i++) {
    if (drawnNodes[i].hasBeam && i > 0 && i < drawnNodes.length - 1) {
      // Beam stubs on both sides
      lines.push(`<rect x="${ox - beamStubW}" y="${nodeY[i] - beamStubH / 2}" width="${beamStubW}" height="${beamStubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
      lines.push(`<rect x="${ox + colW}" y="${nodeY[i] - beamStubH / 2}" width="${beamStubW}" height="${beamStubH}" fill="#222e44" stroke="#3a4a6a" stroke-width="0.6" rx="1"/>`);
    }
  }

  // ── Column concrete outline ──
  lines.push(`<rect x="${ox}" y="${colTop}" width="${colW}" height="${colBot - colTop}" fill="#1a2a40" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // ── Floor level lines ──
  for (let i = 1; i < drawnNodes.length - 1; i++) {
    lines.push(`<line x1="${ox - 5}" y1="${nodeY[i]}" x2="${ox + colW + 5}" y2="${nodeY[i]}" stroke="#4ecdc4" stroke-width="0.5" opacity="0.5"/>`);
  }

  // ── Foundation at base ──
  if (drawnNodes[drawnNodes.length - 1].hasSupport) {
    lines.push(`<line x1="${ox - 12}" y1="${colBot}" x2="${ox + colW + 12}" y2="${colBot}" stroke="#4ecdc4" stroke-width="2"/>`);
    for (let i = -12; i <= colW + 8; i += 5) {
      lines.push(`<line x1="${ox + i}" y1="${colBot}" x2="${ox + i - 4}" y2="${colBot + 6}" stroke="#4ecdc4" stroke-width="0.5"/>`);
    }
  }

  // ── Continuous vertical bars ──
  const coverPx = Math.max(cover / sectionB * colW, 3);
  const barR = 2;
  const xL = ox + coverPx + barR;
  const xR = ox + colW - coverPx - barR;

  // Main bars — full height
  lines.push(`<line x1="${xL}" y1="${colTop + 3}" x2="${xL}" y2="${colBot - 3}" stroke="#e94560" stroke-width="2"/>`);
  lines.push(`<line x1="${xR}" y1="${colTop + 3}" x2="${xR}" y2="${colBot - 3}" stroke="#e94560" stroke-width="2"/>`);

  // Foundation anchorage tails (dashed below base)
  const baseDetailing = drawnSegs[drawnSegs.length - 1]?.detailing;
  if (baseDetailing && drawnNodes[drawnNodes.length - 1].hasSupport) {
    const ld = Math.max(...baseDetailing.bars.map(b => b.ld));
    const ldPx = Math.min(ld * scaleY, anchorPad - 2);
    lines.push(`<line x1="${xL}" y1="${colBot}" x2="${xL}" y2="${colBot + ldPx}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
    lines.push(`<line x1="${xR}" y1="${colBot}" x2="${xR}" y2="${colBot + ldPx}" stroke="#e94560" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`);
    // ld dimension
    const dimX = ox + colW + 8;
    lines.push(`<line x1="${dimX}" y1="${colBot}" x2="${dimX}" y2="${colBot + ldPx}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${colBot}" x2="${dimX + 2}" y2="${colBot}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${colBot + ldPx}" x2="${dimX + 2}" y2="${colBot + ldPx}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<text x="${dimX + 4}" y="${colBot + ldPx / 2}" dominant-baseline="middle" class="detail-dim">ld=${(ld * 100).toFixed(0)}</text>`);
  }

  // ── Splice zones above each floor level ──
  for (let i = 1; i < drawnNodes.length - 1; i++) {
    const seg = drawnSegs[i]; // segment above this floor
    if (!seg || !seg.detailing) continue;
    const maxSplice = Math.max(...seg.detailing.bars.map(b => b.lapSplice));
    const splicePx = Math.min(maxSplice * scaleY, (nodeY[i + 1] - nodeY[i]) * 0.4);
    if (splicePx < 4) continue;
    const spliceTop = nodeY[i];
    lines.push(`<rect x="${ox + 1}" y="${spliceTop}" width="${colW - 2}" height="${splicePx}" fill="#5a9" opacity="0.1" rx="2"/>`);
    lines.push(`<line x1="${ox}" y1="${spliceTop + splicePx}" x2="${ox + colW}" y2="${spliceTop + splicePx}" stroke="#5a9" stroke-width="0.5" stroke-dasharray="3,2"/>`);
    // Only label first splice
    if (i === 1) {
      lines.push(`<text x="${ox + colW + 8}" y="${spliceTop + splicePx / 2}" dominant-baseline="middle" class="detail-dim">${spliceWord}=${(maxSplice * 100).toFixed(0)}</text>`);
    }
  }

  // ── Ties per segment ──
  for (let i = 0; i < drawnSegs.length; i++) {
    const seg = drawnSegs[i];
    const segTop = nodeY[i];
    const segBot = nodeY[i + 1];
    const segH = segBot - segTop;
    const nTies = Math.min(Math.floor(seg.height / seg.stirrupSpacing), Math.floor(segH / 6));
    const step = segH / (nTies + 1);
    for (let j = 1; j <= nTies; j++) {
      const ty = segTop + j * step;
      lines.push(`<line x1="${ox + coverPx}" y1="${ty}" x2="${ox + colW - coverPx}" y2="${ty}" stroke="#f0a500" stroke-width="0.6" opacity="0.4"/>`);
    }
  }

  // ── Labels ──
  // Bar description (use first segment)
  lines.push(`<text x="${ox + colW + 8}" y="${colTop + 15}" class="bar-label">${drawnSegs[0].bars}</text>`);
  // Stirrup description
  lines.push(`<text x="${ox + colW + 8}" y="${colTop + 27}" class="dim">eØ${drawnSegs[0].stirrupDia} c/${(drawnSegs[0].stirrupSpacing * 100).toFixed(0)}</text>`);
  // Section dimension
  lines.push(`<text x="${ox + colW / 2}" y="${colTop - 6}" text-anchor="middle" class="dim">${(opts.sectionB * 100).toFixed(0)}×${(opts.sectionH * 100).toFixed(0)}</text>`);

  // ── Story height dimensions ──
  for (let i = 0; i < drawnSegs.length; i++) {
    const yTop = nodeY[i];
    const yBot = nodeY[i + 1];
    const dimX = ox - 20;
    lines.push(`<line x1="${dimX}" y1="${yTop}" x2="${dimX}" y2="${yBot}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${yTop}" x2="${dimX + 2}" y2="${yTop}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${yBot}" x2="${dimX + 2}" y2="${yBot}" stroke="#666" stroke-width="0.4"/>`);
    lines.push(`<text x="${dimX - 4}" y="${(yTop + yBot) / 2}" text-anchor="end" dominant-baseline="middle" class="dim">${drawnSegs[i].height.toFixed(2)}</text>`);
  }

  if (truncated) {
    lines.push(`<text x="${ox + colW / 2}" y="${colTop - 14}" text-anchor="middle" class="dim">...</text>`);
  }

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
  /** Beam detailing: used for hook dimensioning */
  beamDetailing?: DetailingResult;
  /** Column detailing: used for splice zone */
  colDetailing?: DetailingResult;
  /** Translated labels */
  labels?: {
    title?: string;       // joint detail title
    beam?: string;        // "Beam"
    column?: string;      // "Column"
    joint?: string;       // "joint"
    splice?: string;      // "splice"
  };
  /** Node ID for identification */
  nodeId?: number;
}

export function generateJointDetailSvg(opts: JointDetailSvgOpts): string {
  const { beamB, beamH, colB, colH, cover, beamBars, colBars, stirrupDia, stirrupSpacing, beamDetailing, colDetailing, labels, nodeId } = opts;
  const scale = 300 / Math.max(colH + beamH * 2, colB + 1);
  const W = 460;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2;

  const colWPx = colB * scale;
  const colHPx = colH * scale;
  const beamHPx = beamH * scale;
  const beamExtPx = 100;
  const coverPx = cover * scale;

  const titleText = labels?.title ?? 'Beam-column joint detail';
  const beamWord = labels?.beam ?? 'Beam';
  const colWord = labels?.column ?? 'Col';
  const spliceWord = labels?.splice ?? 'splice';

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .bar-label { font-size: 8px; fill: #f0a500; }
    .title { font-size: 10px; fill: #4ecdc4; font-weight: bold; }
    .detail-dim { font-size: 7px; fill: #5a9; }
  </style>`);

  // Title
  const nodeLabel = nodeId != null ? ` (N${nodeId})` : '';
  lines.push(`<text x="${cx}" y="15" text-anchor="middle" class="title">${titleText}${nodeLabel}</text>`);

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

  // Joint zone hatching
  lines.push(`<rect x="${colX}" y="${beamTop}" width="${colWPx}" height="${beamHPx}" fill="rgba(78,205,196,0.08)" stroke="#4ecdc4" stroke-width="0.5" stroke-dasharray="3,2"/>`);

  // Column splice zone (above beam, below next floor — typical location)
  if (colDetailing && colDetailing.bars.length > 0) {
    const maxSplice = Math.max(...colDetailing.bars.map(b => b.lapSplice));
    const splicePx = Math.min(maxSplice * scale, (beamTop - colTop) * 0.7);
    if (splicePx > 8) {
      const spliceBot = beamTop - 4;
      const spliceTop = spliceBot - splicePx;
      lines.push(`<rect x="${colX + 1}" y="${spliceTop}" width="${colWPx - 2}" height="${splicePx}" fill="#5a9" opacity="0.1" rx="2"/>`);
      lines.push(`<line x1="${colX}" y1="${spliceTop}" x2="${colX + colWPx}" y2="${spliceTop}" stroke="#5a9" stroke-width="0.5" stroke-dasharray="3,2"/>`);
      lines.push(`<text x="${colX - 4}" y="${spliceTop + splicePx / 2}" text-anchor="end" dominant-baseline="middle" class="detail-dim">${spliceWord}=${(maxSplice * 100).toFixed(0)}</text>`);
    }
  }

  // Column vertical bars (continuous through joint)
  const barR = 2;
  const cxL = colX + coverPx + barR;
  const cxR = colX + colWPx - coverPx - barR;
  lines.push(`<line x1="${cxL}" y1="${colTop + 5}" x2="${cxL}" y2="${colBot - 5}" stroke="#e94560" stroke-width="2"/>`);
  lines.push(`<line x1="${cxR}" y1="${colTop + 5}" x2="${cxR}" y2="${colBot - 5}" stroke="#e94560" stroke-width="2"/>`);

  // Beam bars (with hooks into joint — dimensioned if detailing available)
  const bbTop = beamTop + coverPx + 3;
  const bbBot = beamTop + beamHPx - coverPx - 3;
  // Compute hook height from detailing or default to 60% of beam height
  const maxLdh = beamDetailing ? Math.max(...beamDetailing.bars.map(b => b.ldh)) : 0;
  const hookDrawPx = maxLdh > 0 ? Math.min(maxLdh * scale, beamHPx * 0.8) : beamHPx * 0.6;

  // Left beam bottom bar → hooks up inside column
  lines.push(`<line x1="${beamLeft + 5}" y1="${bbBot}" x2="${cxR - 3}" y2="${bbBot}" stroke="#e94560" stroke-width="1.5"/>`);
  lines.push(`<line x1="${cxR - 3}" y1="${bbBot}" x2="${cxR - 3}" y2="${bbBot - hookDrawPx}" stroke="#e94560" stroke-width="1.5"/>`);
  // Right beam bottom bar → hooks up inside column
  lines.push(`<line x1="${beamRight - 5}" y1="${bbBot}" x2="${cxL + 3}" y2="${bbBot}" stroke="#e94560" stroke-width="1.5"/>`);
  lines.push(`<line x1="${cxL + 3}" y1="${bbBot}" x2="${cxL + 3}" y2="${bbBot - hookDrawPx}" stroke="#e94560" stroke-width="1.5"/>`);

  // Hook dimension (ldh) on the right hook
  if (beamDetailing && maxLdh > 0) {
    const dimX = cxL + 3 + 8;
    lines.push(`<line x1="${dimX}" y1="${bbBot}" x2="${dimX}" y2="${bbBot - hookDrawPx}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${bbBot}" x2="${dimX + 2}" y2="${bbBot}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<line x1="${dimX - 2}" y1="${bbBot - hookDrawPx}" x2="${dimX + 2}" y2="${bbBot - hookDrawPx}" stroke="#5a9" stroke-width="0.4"/>`);
    lines.push(`<text x="${dimX + 3}" y="${bbBot - hookDrawPx / 2}" dominant-baseline="middle" class="detail-dim">ldh=${(maxLdh * 100).toFixed(0)}</text>`);
  }

  // Top bars (continuous through joint — representing minimum or negative moment steel)
  lines.push(`<line x1="${beamLeft + 5}" y1="${bbTop}" x2="${beamRight - 5}" y2="${bbTop}" stroke="#7a8a9a" stroke-width="1.2"/>`);

  // Joint stirrups
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
  lines.push(`<text x="${beamLeft + 5}" y="${bbBot + 12}" class="bar-label">${beamBars} (As)</text>`);
  lines.push(`<text x="${colX + colWPx + 5}" y="${cy - 40}" class="bar-label">${colBars}</text>`);
  lines.push(`<text x="${cx}" y="${H - 8}" text-anchor="middle" class="dim">eØ${stirrupDia} c/${(stirrupSpacing * 100).toFixed(0)} (${labels?.joint ?? 'joint'})</text>`);

  // Dimension annotations
  lines.push(`<text x="${beamLeft}" y="${beamTop - 5}" class="dim">${beamWord} ${(beamB * 100).toFixed(0)}×${(beamH * 100).toFixed(0)}</text>`);
  lines.push(`<text x="${colX}" y="${colTop - 5}" class="dim">${colWord} ${(colB * 100).toFixed(0)}×${(colH * 100).toFixed(0)}</text>`);

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
      // AsProv = rb.area / sp * 0.01; // cm²/m (area per bar / spacing in m * 100cm/m)
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
