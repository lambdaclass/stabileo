// P-M interaction diagram of a rectangular column with bars on two faces — from the engine.
//
// Every point is the Rust section engine's (`engine/src/postprocess/cirsoc201_section.rs`):
// strain compatibility with the concrete the compression bars displace taken out, φ from the
// strain of the most stretched bar (Tabla 21.2.2 of the edition asked for) and the axial cap of
// Tabla 22.4.2.1. This module chooses the neutral-axis depths to plot and draws the SVG; the
// TypeScript that computed the points is the oracle in __tests__/differential/oracle/.

import { prepareSection, type Bar } from './cirsoc201-section';
import { yieldStrain, EPSILON_CU, type Cirsoc201EditionLike } from './cirsoc201-basis';

export interface InteractionPoint {
  phiPn: number;  // kN (+ = compression)
  phiMn: number;  // kN·m
  c: number;      // neutral axis depth (m)
  label?: string;
}

export interface InteractionDiagram {
  points: InteractionPoint[];
  balanced: InteractionPoint;    // balanced failure point
  pureCompression: InteractionPoint;
  pureTension: InteractionPoint;
  // Section info
  b: number;    // m
  h: number;    // m
  fc: number;   // MPa
  fy: number;   // MPa
  AsProv: number; // cm² total
  barCount: number;
  barDia: number; // mm
}

export interface DiagramParams {
  b: number;      // m
  h: number;      // m
  fc: number;     // MPa
  fy: number;     // MPa
  cover: number;  // m (to bar center)
  AsProv: number; // cm² (total, symmetric — half on each face)
  barCount: number;
  barDia: number; // mm
  nPoints?: number; // default 40
  /** CIRSOC 201 edition. Default 2025, the edition PRO designs to. */
  edition?: Cirsoc201EditionLike;
}

/**
 * The diagram about the section's strong axis: half the steel on each face, at `cover` from it,
 * the face at +y compressed (positive moment).
 */
export function generateInteractionDiagram(params: DiagramParams): InteractionDiagram {
  const { b, h, fc, fy, cover, AsProv, barCount, barDia } = params;
  const nPts = params.nPoints ?? 40;
  const half = (AsProv / 2) * 1e-4;
  const bars: Bar[] = [
    { x: 0, y: h / 2 - cover, area: half },
    { x: 0, y: -(h / 2 - cover), area: half },
  ];
  const section = prepareSection({ kind: 'rect', b, h }, bars, { fc, fy, edition: params.edition ?? '2025' });
  try {
    const d = h - cover;
    const cb = (d * EPSILON_CU) / (EPSILON_CU + yieldStrain(fy));
    const cValues: number[] = [10 * h];
    for (let i = 0; i <= nPts; i++) {
      const c = h * 2 * (1 - i / nPts);
      if (c > 0.001) cValues.push(c);
    }
    cValues.push(cb, 0.001);
    cValues.sort((x, y) => y - x);

    const theta = Math.PI / 2;
    const states = section.points(theta, cValues);
    const points: InteractionPoint[] = states.map((p) => ({ phiPn: p.phiPn, phiMn: -p.phiMnx, c: p.c }));
    const balanced = points.find((p) => Math.abs(p.c - cb) < 1e-12) ?? points[Math.floor(points.length / 2)];
    balanced.label = 'Balanceado';
    const info = section.info();
    return {
      points,
      balanced,
      pureCompression: { phiPn: info.phiPnMax, phiMn: 0, c: 999, label: 'Compresión pura' },
      pureTension: { phiPn: info.phiPntMax, phiMn: 0, c: 0, label: 'Tracción pura' },
      b, h, fc, fy, AsProv, barCount, barDia,
    };
  } finally {
    section.free();
  }
}

/**
 * Generate SVG string for a P-M interaction diagram
 */
export function generateInteractionSvg(
  diagram: InteractionDiagram,
  demand?: { Nu: number; Mu: number },
  width: number = 300,
  height: number = 400,
): string {
  const { points, pureCompression, pureTension } = diagram;
  const pureTens = pureTension;

  // Find data bounds
  const allPn = points.map(p => p.phiPn).concat([pureCompression.phiPn, pureTens.phiPn]);
  const allMn = points.map(p => p.phiMn);
  const maxPn = Math.max(...allPn) * 1.1;
  const minPn = Math.min(...allPn) * 1.1;
  const maxMn = Math.max(...allMn) * 1.1;

  const padL = 50, padR = 15, padT = 20, padB = 40;
  const w = width - padL - padR;
  const h = height - padT - padB;

  // Scale: M on X axis, P on Y axis (inverted: compression up)
  const scaleM = maxMn > 0 ? w / maxMn : 1;
  const scaleP = (maxPn - minPn) > 0 ? h / (maxPn - minPn) : 1;

  function toX(mn: number): number { return padL + mn * scaleM; }
  function toY(pn: number): number { return padT + (maxPn - pn) * scaleP; }

  // Build path
  const sortedPts = [...points].sort((a, b) => b.phiPn - a.phiPn);
  const pathData = sortedPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.phiMn).toFixed(1)} ${toY(p.phiPn).toFixed(1)}`)
    .join(' ');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#1a2a40" rx="4"/>`;

  // Grid lines
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#2a4a6a" stroke-width="0.5"/>`;
  svg += `<line x1="${padL}" y1="${toY(0)}" x2="${width - padR}" y2="${toY(0)}" stroke="#2a4a6a" stroke-width="0.5" stroke-dasharray="4,2"/>`;

  // Axes
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#888" stroke-width="1"/>`;
  svg += `<line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#888" stroke-width="1"/>`;

  // Labels
  svg += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle" fill="#888" font-size="10">φMn (kN·m)</text>`;
  svg += `<text x="12" y="${height / 2}" text-anchor="middle" fill="#888" font-size="10" transform="rotate(-90 12 ${height / 2})">φPn (kN)</text>`;

  // Interaction curve
  svg += `<path d="${pathData}" fill="none" stroke="#4ecdc4" stroke-width="2"/>`;

  // Balanced point
  const bp = diagram.balanced;
  svg += `<circle cx="${toX(bp.phiMn)}" cy="${toY(bp.phiPn)}" r="4" fill="#f0a500" stroke="none"/>`;
  svg += `<text x="${toX(bp.phiMn) + 6}" y="${toY(bp.phiPn) - 4}" fill="#f0a500" font-size="8">Bal.</text>`;

  // Demand point
  if (demand) {
    const dx = toX(Math.abs(demand.Mu));
    const dy = toY(demand.Nu);
    svg += `<circle cx="${dx}" cy="${dy}" r="5" fill="#e94560" stroke="#fff" stroke-width="1"/>`;
    svg += `<text x="${dx + 7}" y="${dy + 3}" fill="#e94560" font-size="9" font-weight="bold">(Nu, Mu)</text>`;
  }

  // Scale marks
  const pStep = Math.pow(10, Math.floor(Math.log10(Math.max(maxPn, -minPn))));
  for (let p = Math.ceil(minPn / pStep) * pStep; p <= maxPn; p += pStep) {
    const y = toY(p);
    svg += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="#666" font-size="8">${p.toFixed(0)}</text>`;
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + 3}" y2="${y}" stroke="#666" stroke-width="0.5"/>`;
  }

  const mStep = Math.pow(10, Math.floor(Math.log10(maxMn)));
  for (let m = 0; m <= maxMn; m += mStep) {
    const x = toX(m);
    svg += `<text x="${x}" y="${height - padB + 12}" text-anchor="middle" fill="#666" font-size="8">${m.toFixed(0)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}
