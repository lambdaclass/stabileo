/**
 * Reinforcement Detail DXF Export — "Plano de Despiece"
 * Generates construction-quality DXF drawings with:
 *  - Beam/column elevation views with stirrup zone hatching
 *  - Bar shape diagrams with dimensions
 *  - BBS table (planilla de doblado de barras)
 *  - Title block with project info
 *
 * Uses existing R12 (AC1009) helpers from writer.ts
 * Units: meters (DXF native), displayed as mm/cm in annotations
 */

import type { BBSSummary, BarEntry, StirrupZone, BeamDesignEnvelope } from '../engine/rebar-schedule';
import type { ElementVerification } from '../engine/codes/argentina/cirsoc201';
import { t } from '../i18n';

// ─── DXF Primitives (duplicated from writer.ts to avoid circular imports) ──

function str(n: number): string {
  return n.toFixed(6);
}

function dxfHeader(): string[] {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC'];
}

function dxfLayerTable(layers: Array<{ name: string; color: number }>): string[] {
  const out: string[] = ['0', 'SECTION', '2', 'TABLES'];
  out.push('0', 'TABLE', '2', 'LAYER', '70', layers.length.toString());
  for (const l of layers) {
    out.push('0', 'LAYER', '2', l.name, '70', '0', '62', l.color.toString(), '6', 'CONTINUOUS');
  }
  out.push('0', 'ENDTAB', '0', 'ENDSEC');
  return out;
}

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string[] {
  return [
    '0', 'LINE', '8', layer,
    '10', str(x1), '20', str(y1), '30', '0.000000',
    '11', str(x2), '21', str(y2), '31', '0.000000',
  ];
}

function dxfText(layer: string, x: number, y: number, height: number, text: string): string[] {
  return [
    '0', 'TEXT', '8', layer,
    '10', str(x), '20', str(y), '30', '0.000000',
    '40', str(height),
    '1', text,
  ];
}

/** Right-aligned text via group code 72 = 2 (right) and group 11 for alignment point */
function dxfTextRight(layer: string, x: number, y: number, height: number, text: string): string[] {
  return [
    '0', 'TEXT', '8', layer,
    '10', str(x), '20', str(y), '30', '0.000000',
    '11', str(x), '21', str(y), '31', '0.000000',
    '40', str(height),
    '72', '2',
    '1', text,
  ];
}

/** Center-aligned text */
function dxfTextCenter(layer: string, x: number, y: number, height: number, text: string): string[] {
  return [
    '0', 'TEXT', '8', layer,
    '10', str(x), '20', str(y), '30', '0.000000',
    '11', str(x), '21', str(y), '31', '0.000000',
    '40', str(height),
    '72', '1',
    '1', text,
  ];
}

function dxfPolyline(layer: string, points: Array<{ x: number; y: number }>, closed = false): string[] {
  if (points.length < 2) return [];
  const out: string[] = [
    '0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0',
  ];
  for (const p of points) {
    out.push('0', 'VERTEX', '8', layer, '10', str(p.x), '20', str(p.y), '30', '0.000000');
  }
  out.push('0', 'SEQEND', '8', layer);
  return out;
}

// ─── ACI Color Indices ──────────────────────────────────────────

const COLORS = {
  OUTLINE: 7,      // white — beam outline
  REBAR_MAIN: 1,   // red — longitudinal bars
  REBAR_STIRR: 3,  // green — stirrups
  DIMENSIONS: 4,   // cyan — dimension lines/text
  TABLE: 7,        // white — BBS table
  TABLE_HEADER: 5, // blue — table header
  TITLE: 2,        // yellow — title block
  ZONES: 6,        // magenta — zone labels
} as const;

// ─── Layer names ────────────────────────────────────────────────

const LY = {
  OUTLINE: 'ARMADURA-CONTORNO',
  REBAR: 'ARMADURA-BARRAS',
  STIRRUPS: 'ARMADURA-ESTRIBOS',
  DIM: 'ARMADURA-COTAS',
  TABLE: 'ARMADURA-TABLA',
  TITLE: 'ARMADURA-CARATULA',
  ZONES: 'ARMADURA-ZONAS',
};

// ─── Input Interface ────────────────────────────────────────────

export interface RebarDxfInput {
  bbs: BBSSummary;
  verifications: ElementVerification[];
  elementLengths: Map<number, number>;
  envelopes?: Map<number, BeamDesignEnvelope>;
  projectName?: string;
  projectAuthor?: string;
  projectDate?: string;
}

// ─── Drawing Constants (in DXF units = meters) ─────────────────

const TEXT_H = 0.08;       // general text height
const TEXT_H_SM = 0.06;    // small text (dimensions)
const TEXT_H_LG = 0.12;    // section labels
const TEXT_H_TITLE = 0.20; // title text
const ELEV_HEIGHT = 0.6;   // beam elevation drawing height
const ELEV_GAP = 0.8;      // vertical gap between elevations
const BAR_SHAPE_W = 0.6;   // bar shape diagram width
const BAR_SHAPE_H = 0.3;   // bar shape diagram height
const TABLE_ROW_H = 0.12;  // BBS table row height

// ─── Main Export Function ───────────────────────────────────────

export function exportRebarDxf(input: RebarDxfInput): string {
  const lines: string[] = [];
  const { bbs, verifications, elementLengths, envelopes, projectName, projectAuthor, projectDate } = input;

  // Header
  lines.push(...dxfHeader());

  // Layers
  lines.push(...dxfLayerTable([
    { name: LY.OUTLINE, color: COLORS.OUTLINE },
    { name: LY.REBAR, color: COLORS.REBAR_MAIN },
    { name: LY.STIRRUPS, color: COLORS.REBAR_STIRR },
    { name: LY.DIM, color: COLORS.DIMENSIONS },
    { name: LY.TABLE, color: COLORS.TABLE },
    { name: LY.TITLE, color: COLORS.TITLE },
    { name: LY.ZONES, color: COLORS.ZONES },
  ]));

  // Begin entities
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // ── 1. Beam/Column Elevation Views ──
  // Group verifications by unique design (same grouping as BBS)
  const groups = groupVerifications(verifications);
  let cursorY = 0;

  for (const group of groups) {
    const v = group.verifs[0];
    const L = averageLength(group.elementIds, elementLengths);
    if (L <= 0) continue;

    const isColumn = v.elementType === 'column' || v.elementType === 'wall';
    const x0 = 0;
    const y0 = cursorY;

    // Draw beam/column elevation
    lines.push(...drawElevation(x0, y0, L, v, isColumn));

    // Draw stirrup zones if available
    const repEnv = envelopes?.get(v.elementId);
    if (repEnv && repEnv.stirrupZones.length > 0) {
      lines.push(...drawStirrupZones(x0, y0, L, v.h, repEnv.stirrupZones));
    } else {
      // Uniform stirrups
      lines.push(...drawUniformStirrups(x0, y0, L, v));
    }

    // Section label
    const label = isColumn
      ? `${v.elementType.toUpperCase()} ${v.b * 100}×${v.h * 100} — ${group.elementIds.length} elem.`
      : `VIGA ${v.b * 100}×${v.h * 100} — ${group.elementIds.length} elem.`;
    lines.push(...dxfText(LY.OUTLINE, x0, y0 + ELEV_HEIGHT + 0.15, TEXT_H_LG, label));

    // Dimension line: total length
    lines.push(...drawDimensionH(x0, y0 - 0.15, L, `L = ${(L * 100).toFixed(0)} cm`));

    cursorY -= (ELEV_HEIGHT + ELEV_GAP + 0.3);
  }

  // ── 2. Bar Shape Diagrams ──
  // Place to the right of elevations
  const shapesX0 = Math.max(
    ...groups.map(g => averageLength(g.elementIds, elementLengths)),
    3,
  ) + 1.5;
  let shapeY = 0;

  // Collect unique bar shapes from BBS
  const uniqueShapes = getUniqueBarShapes(bbs.bars);
  for (const bar of uniqueShapes) {
    lines.push(...drawBarShape(shapesX0, shapeY, bar));
    shapeY -= (BAR_SHAPE_H + 0.25);
  }

  // ── 3. BBS Table ──
  const tableX0 = 0;
  const tableY0 = cursorY - 0.5;
  lines.push(...drawBBSTable(tableX0, tableY0, bbs));

  // ── 4. Title Block ──
  const titleY = tableY0 - (bbs.bars.length + 4) * TABLE_ROW_H - 1.0;
  lines.push(...drawTitleBlock(tableX0, titleY, projectName, projectAuthor, projectDate));

  // End entities
  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ─── Elevation Drawing ──────────────────────────────────────────

function drawElevation(x0: number, y0: number, L: number, v: ElementVerification, isColumn: boolean): string[] {
  const out: string[] = [];
  const h = v.h;
  const cover = v.cover;

  // Outer rectangle (beam cross-section elevation = side view)
  out.push(...dxfPolyline(LY.OUTLINE, [
    { x: x0, y: y0 },
    { x: x0 + L, y: y0 },
    { x: x0 + L, y: y0 + h },
    { x: x0, y: y0 + h },
  ], true));

  // Top rebar line (tension for beams at supports)
  const rebarTop = y0 + h - cover;
  out.push(...dxfLine(LY.REBAR, x0 + cover, rebarTop, x0 + L - cover, rebarTop));

  // Bottom rebar line
  const rebarBot = y0 + cover;
  out.push(...dxfLine(LY.REBAR, x0 + cover, rebarBot, x0 + L - cover, rebarBot));

  // Bar labels
  const mainDia = v.column ? v.column.barDia : v.flexure.barDia;
  const mainCount = v.column ? v.column.barCount : v.flexure.barCount;
  const mainLabel = `${mainCount}Ø${mainDia}`;
  out.push(...dxfText(LY.REBAR, x0 + L + 0.05, rebarBot, TEXT_H_SM, mainLabel));

  if (!isColumn && v.flexure.isDoublyReinforced && v.flexure.barCountComp) {
    const compLabel = `${v.flexure.barCountComp}Ø${v.flexure.barDiaComp}`;
    out.push(...dxfText(LY.REBAR, x0 + L + 0.05, rebarTop, TEXT_H_SM, compLabel));
  }

  // Section height dimension
  out.push(...drawDimensionV(x0 - 0.15, y0, h, `${(h * 100).toFixed(0)}`));

  return out;
}

// ─── Stirrup Zone Drawing ───────────────────────────────────────

function drawStirrupZones(x0: number, y0: number, L: number, h: number, zones: StirrupZone[]): string[] {
  const out: string[] = [];

  for (const zone of zones) {
    const zx0 = x0 + zone.tStart * L;
    const zx1 = x0 + zone.tEnd * L;
    const zLen = zx1 - zx0;
    if (zLen < 0.01) continue;

    // Draw representative stirrups within the zone
    const nVisible = Math.min(Math.ceil(zLen / zone.spacing), 20); // cap visual count
    const actualSpacing = zLen / nVisible;

    for (let i = 0; i <= nVisible; i++) {
      const sx = zx0 + i * actualSpacing;
      if (sx > zx1 + 0.001) break;
      // Stirrup = vertical line inside the section
      out.push(...dxfLine(LY.STIRRUPS, sx, y0 + 0.01, sx, y0 + h - 0.01));
    }

    // Zone label below
    const labelX = (zx0 + zx1) / 2;
    out.push(...dxfTextCenter(LY.ZONES, labelX, y0 - 0.08, TEXT_H_SM, zone.label));

    // Zone boundary markers (dashed-style vertical ticks)
    if (zone.tStart > 0.001) {
      out.push(...dxfLine(LY.ZONES, zx0, y0 - 0.03, zx0, y0 + h + 0.03));
    }
    if (zone.tEnd < 0.999) {
      out.push(...dxfLine(LY.ZONES, zx1, y0 - 0.03, zx1, y0 + h + 0.03));
    }

    // Zone length dimension
    out.push(...drawDimensionH(zx0, y0 + h + 0.08, zLen, `${(zLen * 100).toFixed(0)}`));
  }

  return out;
}

function drawUniformStirrups(x0: number, y0: number, L: number, v: ElementVerification): string[] {
  const out: string[] = [];
  const spacing = v.shear.spacing;
  const h = v.h;
  const n = Math.min(Math.ceil(L / spacing), 30);

  for (let i = 0; i <= n; i++) {
    const sx = x0 + i * spacing;
    if (sx > x0 + L + 0.001) break;
    out.push(...dxfLine(LY.STIRRUPS, sx, y0 + 0.01, sx, y0 + h - 0.01));
  }

  // Stirrup label
  const label = `eØ${v.shear.stirrupDia} c/${(spacing * 100).toFixed(0)}`;
  out.push(...dxfTextCenter(LY.ZONES, x0 + L / 2, y0 - 0.08, TEXT_H_SM, label));

  return out;
}

// ─── Bar Shape Diagrams ─────────────────────────────────────────

function drawBarShape(x0: number, y0: number, bar: BarEntry): string[] {
  const out: string[] = [];
  const w = BAR_SHAPE_W;
  const h = BAR_SHAPE_H;

  // Mark label
  out.push(...dxfText(LY.TABLE, x0, y0 + h + 0.05, TEXT_H, `${bar.mark} — ${bar.label}`));

  switch (bar.shape) {
    case 'straight':
      out.push(...dxfLine(LY.REBAR, x0, y0 + h / 2, x0 + w, y0 + h / 2));
      out.push(...dxfTextCenter(LY.DIM, x0 + w / 2, y0 + h / 2 - 0.1, TEXT_H_SM,
        `${(bar.lengthEach * 100).toFixed(0)} cm`));
      break;

    case 'L-hook-90':
      // Horizontal bar + 90° hook down at right end
      {
        const hookLen = Math.min(0.15, w * 0.25);
        out.push(...dxfPolyline(LY.REBAR, [
          { x: x0, y: y0 + h },
          { x: x0 + w - hookLen, y: y0 + h },
          { x: x0 + w - hookLen, y: y0 + h - hookLen },
        ]));
        out.push(...dxfTextCenter(LY.DIM, x0 + (w - hookLen) / 2, y0 + h + 0.05, TEXT_H_SM,
          `${(bar.lengthEach * 100).toFixed(0)} cm`));
      }
      break;

    case 'U-hook-180':
      // Horizontal bar with 180° hook (semicircle) at right end
      {
        const hookR = 0.06;
        out.push(...dxfPolyline(LY.REBAR, [
          { x: x0, y: y0 + h / 2 },
          { x: x0 + w - hookR * 2, y: y0 + h / 2 },
          { x: x0 + w - hookR, y: y0 + h / 2 + hookR },
          { x: x0 + w - hookR * 2, y: y0 + h / 2 },
        ]));
        out.push(...dxfTextCenter(LY.DIM, x0 + w / 2, y0 + h / 2 - 0.1, TEXT_H_SM,
          `${(bar.lengthEach * 100).toFixed(0)} cm`));
      }
      break;

    case 'stirrup-closed':
      // Rectangular closed stirrup
      {
        const margin = 0.04;
        out.push(...dxfPolyline(LY.STIRRUPS, [
          { x: x0 + margin, y: y0 + margin },
          { x: x0 + w - margin, y: y0 + margin },
          { x: x0 + w - margin, y: y0 + h - margin },
          { x: x0 + margin, y: y0 + h - margin },
        ], true));
        // 135° hooks at top corners (small diagonal ticks)
        const hk = 0.04;
        out.push(...dxfLine(LY.STIRRUPS,
          x0 + margin, y0 + h - margin,
          x0 + margin + hk, y0 + h - margin - hk));
        out.push(...dxfLine(LY.STIRRUPS,
          x0 + w - margin, y0 + h - margin,
          x0 + w - margin - hk, y0 + h - margin - hk));
        // Dimensions
        out.push(...dxfTextCenter(LY.DIM, x0 + w / 2, y0 - 0.05, TEXT_H_SM,
          `${(bar.lengthEach * 100).toFixed(0)} cm`));
      }
      break;

    default:
      // Fallback: straight line
      out.push(...dxfLine(LY.REBAR, x0, y0 + h / 2, x0 + w, y0 + h / 2));
      break;
  }

  return out;
}

// ─── BBS Table ──────────────────────────────────────────────────

function drawBBSTable(x0: number, y0: number, bbs: BBSSummary): string[] {
  const out: string[] = [];
  const hasZones = bbs.bars.some(b => b.zone);
  const cols = hasZones
    ? [0.25, 0.30, 0.20, 0.15, 0.25, 0.25, 0.25]  // +zone col
    : [0.25, 0.20, 0.15, 0.25, 0.25, 0.25];
  const headers = hasZones
    ? [t('pro.bbsMark'), t('pro.bbsZone'), t('pro.bbsDia'), t('pro.bbsQty'), t('pro.bbsLength'), t('pro.bbsWeightEach'), t('pro.bbsWeightTotal')]
    : [t('pro.bbsMark'), t('pro.bbsDia'), t('pro.bbsQty'), t('pro.bbsLength'), t('pro.bbsWeightEach'), t('pro.bbsWeightTotal')];

  const totalW = cols.reduce((s, c) => s + c, 0);
  const rowH = TABLE_ROW_H;

  // Table title
  out.push(...dxfText(LY.TABLE, x0, y0 + rowH + 0.05, TEXT_H_LG, t('pro.bbsTitle')));

  // Header row
  let cx = x0;
  for (let i = 0; i < headers.length; i++) {
    out.push(...dxfText(LY.TABLE, cx + 0.02, y0, TEXT_H_SM, headers[i]));
    cx += cols[i];
  }
  // Header underline
  out.push(...dxfLine(LY.TABLE, x0, y0 - 0.02, x0 + totalW, y0 - 0.02));

  // Data rows
  let ry = y0 - rowH;
  for (const bar of bbs.bars) {
    cx = x0;
    const values = hasZones
      ? [bar.mark, bar.zone ?? '—', bar.label, bar.count.toString(), `${bar.lengthEach.toFixed(2)} m`, `${bar.weightEach.toFixed(2)} kg`, `${bar.weightTotal.toFixed(1)} kg`]
      : [bar.mark, bar.label, bar.count.toString(), `${bar.lengthEach.toFixed(2)} m`, `${bar.weightEach.toFixed(2)} kg`, `${bar.weightTotal.toFixed(1)} kg`];

    for (let i = 0; i < values.length; i++) {
      out.push(...dxfText(LY.TABLE, cx + 0.02, ry, TEXT_H_SM, values[i]));
      cx += cols[i];
    }
    ry -= rowH;
  }

  // Separator line
  out.push(...dxfLine(LY.TABLE, x0, ry + rowH - 0.02, x0 + totalW, ry + rowH - 0.02));

  // Summary: weight by diameter
  ry -= 0.05;
  out.push(...dxfText(LY.TABLE, x0, ry, TEXT_H, t('pro.bbsByDia')));
  ry -= rowH;
  for (const d of bbs.weightByDia) {
    out.push(...dxfText(LY.TABLE, x0 + 0.02, ry, TEXT_H_SM,
      `${d.label}: ${d.totalCount} u. — ${d.totalWeight.toFixed(1)} kg`));
    ry -= rowH;
  }

  // Total
  out.push(...dxfLine(LY.TABLE, x0, ry + rowH - 0.02, x0 + totalW * 0.6, ry + rowH - 0.02));
  out.push(...dxfText(LY.TABLE, x0 + 0.02, ry, TEXT_H,
    `${t('pro.bbsTotalSteel')}: ${bbs.totalWeight.toFixed(1)} kg (${bbs.totalCount} u.)`));

  // Table border
  const tableTop = y0 + rowH + 0.02;
  const tableBot = ry - 0.05;
  out.push(...dxfPolyline(LY.TABLE, [
    { x: x0 - 0.02, y: tableBot },
    { x: x0 + totalW + 0.02, y: tableBot },
    { x: x0 + totalW + 0.02, y: tableTop },
    { x: x0 - 0.02, y: tableTop },
  ], true));

  return out;
}

// ─── Title Block ────────────────────────────────────────────────

function drawTitleBlock(x0: number, y0: number, name?: string, author?: string, date?: string): string[] {
  const out: string[] = [];
  const w = 2.5;
  const h = 0.8;

  // Border
  out.push(...dxfPolyline(LY.TITLE, [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ], true));

  // Horizontal dividers
  out.push(...dxfLine(LY.TITLE, x0, y0 + h * 0.5, x0 + w, y0 + h * 0.5));

  // Project name
  out.push(...dxfText(LY.TITLE, x0 + 0.05, y0 + h * 0.6, TEXT_H_TITLE,
    name || t('pro.reportProject')));

  // Author & date
  out.push(...dxfText(LY.TITLE, x0 + 0.05, y0 + h * 0.15, TEXT_H,
    `${author || ''}`));
  out.push(...dxfTextRight(LY.TITLE, x0 + w - 0.05, y0 + h * 0.15, TEXT_H,
    date || new Date().toISOString().slice(0, 10)));

  // Software credit
  out.push(...dxfTextCenter(LY.TITLE, x0 + w / 2, y0 - 0.12, TEXT_H_SM, 'stabileo.com'));

  return out;
}

// ─── Dimension Helpers ──────────────────────────────────────────

/** Horizontal dimension line with centered text above */
function drawDimensionH(x0: number, y0: number, length: number, label: string): string[] {
  const out: string[] = [];
  const tickH = 0.04;

  // Dimension line
  out.push(...dxfLine(LY.DIM, x0, y0, x0 + length, y0));
  // End ticks
  out.push(...dxfLine(LY.DIM, x0, y0 - tickH, x0, y0 + tickH));
  out.push(...dxfLine(LY.DIM, x0 + length, y0 - tickH, x0 + length, y0 + tickH));
  // Label
  out.push(...dxfTextCenter(LY.DIM, x0 + length / 2, y0 + 0.02, TEXT_H_SM, label));

  return out;
}

/** Vertical dimension line with rotated-label approximation (text placed to the left) */
function drawDimensionV(x0: number, y0: number, height: number, label: string): string[] {
  const out: string[] = [];
  const tickW = 0.04;

  out.push(...dxfLine(LY.DIM, x0, y0, x0, y0 + height));
  out.push(...dxfLine(LY.DIM, x0 - tickW, y0, x0 + tickW, y0));
  out.push(...dxfLine(LY.DIM, x0 - tickW, y0 + height, x0 + tickW, y0 + height));
  out.push(...dxfText(LY.DIM, x0 - 0.3, y0 + height / 2, TEXT_H_SM, label));

  return out;
}

// ─── Grouping Helpers ───────────────────────────────────────────

interface VerifGroup {
  verifs: ElementVerification[];
  elementIds: number[];
}

function groupVerifications(verifications: ElementVerification[]): VerifGroup[] {
  const groups = new Map<string, VerifGroup>();
  for (const v of verifications) {
    const mainBars = v.column ? v.column.bars : v.flexure.bars;
    const stirrups = `${v.shear.stirrupDia}_${(v.shear.spacing * 100).toFixed(0)}`;
    const key = `${v.elementType}_${(v.b * 100).toFixed(0)}x${(v.h * 100).toFixed(0)}_${mainBars}_${stirrups}`;
    const existing = groups.get(key);
    if (existing) {
      existing.verifs.push(v);
      existing.elementIds.push(v.elementId);
    } else {
      groups.set(key, { verifs: [v], elementIds: [v.elementId] });
    }
  }
  return Array.from(groups.values());
}

function averageLength(elementIds: number[], lengths: Map<number, number>): number {
  let sum = 0;
  let count = 0;
  for (const id of elementIds) {
    const L = lengths.get(id);
    if (L && L > 0) { sum += L; count++; }
  }
  return count > 0 ? sum / count : 0;
}

/** De-duplicate bar entries by shape + diameter for shape diagram section */
function getUniqueBarShapes(bars: BarEntry[]): BarEntry[] {
  const seen = new Set<string>();
  const unique: BarEntry[] = [];
  for (const bar of bars) {
    const key = `${bar.shape}_${bar.diameter}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(bar);
    }
  }
  return unique;
}

// ═══════════════════════════════════════════════════════════════════
// PDF Export (print-ready HTML with SVG drawings)
// ═══════════════════════════════════════════════════════════════════

const PDF_CSS = `
  @page { size: A3 landscape; margin: 10mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10px;
    color: #222;
    background: #fff;
    padding: 10mm;
  }
  h1 { font-size: 18px; color: #0a3060; margin-bottom: 8px; border-bottom: 2px solid #0a3060; padding-bottom: 4px; }
  h2 { font-size: 14px; color: #1a5090; margin: 16px 0 6px; }
  h3 { font-size: 11px; color: #333; margin: 10px 0 4px; }
  .print-btn {
    position: fixed; top: 10px; right: 10px; padding: 10px 24px;
    background: #1a5090; color: #fff; border: none; border-radius: 6px;
    cursor: pointer; font-size: 14px; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .print-btn:hover { background: #2a6ab0; }
  .elevations { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0; }
  .elev-card {
    border: 1px solid #ddd; border-radius: 4px; padding: 8px;
    background: #fafbfd; break-inside: avoid;
  }
  .elev-card h3 { margin: 0 0 4px; }
  .elev-card svg { display: block; }
  table { border-collapse: collapse; width: auto; margin: 8px 0; font-size: 10px; }
  th, td { padding: 4px 8px; border: 1px solid #ccc; text-align: left; }
  th { background: #eef3f9; font-weight: 600; font-size: 9px; text-transform: uppercase; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .summary-grid { display: flex; gap: 24px; margin: 8px 0; }
  .summary-block { border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; background: #fafbfd; }
  .summary-block h3 { margin-bottom: 4px; }
  .summary-row { display: flex; justify-content: space-between; gap: 16px; font-size: 10px; padding: 2px 0; }
  .summary-label { color: #666; }
  .summary-value { font-weight: 600; }
  .title-block {
    display: flex; justify-content: space-between; align-items: flex-end;
    border: 2px solid #0a3060; padding: 8px 12px; margin-top: 16px;
    border-radius: 4px; background: #f4f7fb;
  }
  .title-block .project { font-size: 16px; font-weight: 700; color: #0a3060; }
  .title-block .meta { font-size: 10px; color: #666; text-align: right; }
  .shapes { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0; }
  .shape-card { border: 1px solid #ddd; border-radius: 4px; padding: 6px 10px; background: #fafbfd; text-align: center; }
  .shape-card svg { display: block; margin: 4px auto; }
  .shape-card .mark { font-weight: 600; font-size: 11px; color: #1a5090; }
`;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate a print-ready HTML page for the reinforcement detail.
 * Opens in a new window — user prints to PDF via Ctrl+P.
 */
export function openRebarPdf(input: RebarDxfInput): void {
  const html = generateRebarHtml(input);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function generateRebarHtml(input: RebarDxfInput): string {
  const { bbs, verifications, elementLengths, envelopes, projectName, projectAuthor, projectDate } = input;
  const groups = groupVerifications(verifications);
  const h: string[] = [];

  h.push(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(projectName || t('pro.bbsTitle'))}</title>`);
  h.push(`<style>${PDF_CSS}</style></head><body>`);
  h.push(`<button class="print-btn no-print" onclick="window.print()">🖨 ${escHtml(t('report.printBtn') || 'Print / PDF')}</button>`);

  // Title
  h.push(`<h1>${escHtml(t('pro.bbsTitle'))}</h1>`);

  // ── Elevation drawings as SVG ──
  h.push(`<h2>${escHtml(t('pro.rebarElevations') || 'Elevation Views')}</h2>`);
  h.push(`<div class="elevations">`);

  for (const group of groups) {
    const v = group.verifs[0];
    const L = averageLength(group.elementIds, elementLengths);
    if (L <= 0) continue;

    const isColumn = v.elementType === 'column' || v.elementType === 'wall';
    const label = isColumn
      ? `${v.elementType.toUpperCase()} ${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)} — ${group.elementIds.length} elem.`
      : `VIGA ${(v.b * 100).toFixed(0)}×${(v.h * 100).toFixed(0)} — ${group.elementIds.length} elem.`;

    const repEnv = envelopes?.get(v.elementId);

    // SVG drawing
    const svgW = Math.max(L * 100, 200); // px (1m = 100px scale)
    const hPx = v.h * 100;
    const svgH = hPx + 60; // extra space for labels/dimensions
    const ox = 30; // left offset
    const oy = 20; // top offset

    h.push(`<div class="elev-card">`);
    h.push(`<h3>${escHtml(label)}</h3>`);
    h.push(`<svg width="${svgW + 80}" height="${svgH + 20}" viewBox="0 0 ${svgW + 80} ${svgH + 20}" xmlns="http://www.w3.org/2000/svg">`);

    // Beam outline
    const lPx = L * 100;
    h.push(`<rect x="${ox}" y="${oy}" width="${lPx}" height="${hPx}" fill="none" stroke="#333" stroke-width="1.5"/>`);

    // Rebar lines
    const coverPx = v.cover * 100;
    h.push(`<line x1="${ox + coverPx}" y1="${oy + coverPx}" x2="${ox + lPx - coverPx}" y2="${oy + coverPx}" stroke="#c00" stroke-width="2"/>`);
    h.push(`<line x1="${ox + coverPx}" y1="${oy + hPx - coverPx}" x2="${ox + lPx - coverPx}" y2="${oy + hPx - coverPx}" stroke="#c00" stroke-width="2"/>`);

    // Bar labels
    const mainDia = v.column ? v.column.barDia : v.flexure.barDia;
    const mainCount = v.column ? v.column.barCount : v.flexure.barCount;
    h.push(`<text x="${ox + lPx + 4}" y="${oy + hPx - coverPx + 3}" font-size="9" fill="#c00">${mainCount}Ø${mainDia}</text>`);
    if (!isColumn && v.flexure.isDoublyReinforced && v.flexure.barCountComp) {
      h.push(`<text x="${ox + lPx + 4}" y="${oy + coverPx + 3}" font-size="9" fill="#c00">${v.flexure.barCountComp}Ø${v.flexure.barDiaComp}</text>`);
    }

    // Stirrups
    if (repEnv && repEnv.stirrupZones.length > 0) {
      for (const zone of repEnv.stirrupZones) {
        const zx0 = ox + zone.tStart * lPx;
        const zx1 = ox + zone.tEnd * lPx;
        const zLen = zx1 - zx0;
        if (zLen < 1) continue;

        const nVis = Math.min(Math.ceil(zLen / (zone.spacing * 100)), 30);
        const sp = zLen / Math.max(nVis, 1);
        for (let i = 0; i <= nVis; i++) {
          const sx = zx0 + i * sp;
          if (sx > zx1 + 0.5) break;
          h.push(`<line x1="${sx.toFixed(1)}" y1="${oy + 1}" x2="${sx.toFixed(1)}" y2="${oy + hPx - 1}" stroke="#0a0" stroke-width="0.7"/>`);
        }

        // Zone label
        const mid = (zx0 + zx1) / 2;
        h.push(`<text x="${mid.toFixed(1)}" y="${oy + hPx + 12}" font-size="8" fill="#606" text-anchor="middle">${escHtml(zone.label)}</text>`);

        // Zone boundaries
        if (zone.tStart > 0.001) {
          h.push(`<line x1="${zx0.toFixed(1)}" y1="${oy - 3}" x2="${zx0.toFixed(1)}" y2="${oy + hPx + 3}" stroke="#606" stroke-width="0.5" stroke-dasharray="3,2"/>`);
        }
        if (zone.tEnd < 0.999) {
          h.push(`<line x1="${zx1.toFixed(1)}" y1="${oy - 3}" x2="${zx1.toFixed(1)}" y2="${oy + hPx + 3}" stroke="#606" stroke-width="0.5" stroke-dasharray="3,2"/>`);
        }

        // Zone length
        h.push(`<text x="${mid.toFixed(1)}" y="${oy - 6}" font-size="7" fill="#069" text-anchor="middle">${(zLen / 100 * 100).toFixed(0)} cm</text>`);
      }
    } else {
      // Uniform stirrups
      const spacing = v.shear.spacing;
      const spPx = spacing * 100;
      const n = Math.min(Math.ceil(lPx / spPx), 40);
      for (let i = 0; i <= n; i++) {
        const sx = ox + i * spPx;
        if (sx > ox + lPx + 0.5) break;
        h.push(`<line x1="${sx.toFixed(1)}" y1="${oy + 1}" x2="${sx.toFixed(1)}" y2="${oy + hPx - 1}" stroke="#0a0" stroke-width="0.7"/>`);
      }
      h.push(`<text x="${(ox + lPx / 2).toFixed(1)}" y="${oy + hPx + 12}" font-size="8" fill="#606" text-anchor="middle">eØ${v.shear.stirrupDia} c/${(spacing * 100).toFixed(0)}</text>`);
    }

    // Dimension: total length
    const dimY = oy + hPx + 25;
    h.push(`<line x1="${ox}" y1="${dimY}" x2="${ox + lPx}" y2="${dimY}" stroke="#069" stroke-width="0.5"/>`);
    h.push(`<line x1="${ox}" y1="${dimY - 3}" x2="${ox}" y2="${dimY + 3}" stroke="#069" stroke-width="0.5"/>`);
    h.push(`<line x1="${ox + lPx}" y1="${dimY - 3}" x2="${ox + lPx}" y2="${dimY + 3}" stroke="#069" stroke-width="0.5"/>`);
    h.push(`<text x="${(ox + lPx / 2).toFixed(1)}" y="${dimY + 12}" font-size="8" fill="#069" text-anchor="middle">L = ${(L * 100).toFixed(0)} cm</text>`);

    // Height dimension
    h.push(`<line x1="${ox - 8}" y1="${oy}" x2="${ox - 8}" y2="${oy + hPx}" stroke="#069" stroke-width="0.5"/>`);
    h.push(`<text x="${ox - 12}" y="${(oy + hPx / 2).toFixed(1)}" font-size="7" fill="#069" text-anchor="end">${(v.h * 100).toFixed(0)}</text>`);

    // Stirrup label at right
    h.push(`<text x="${ox + lPx + 4}" y="${(oy + hPx / 2).toFixed(1)}" font-size="8" fill="#0a0">eØ${v.shear.stirrupDia}</text>`);

    h.push(`</svg></div>`);
  }
  h.push(`</div>`);

  // ── Bar Shape Diagrams ──
  const uniqueShapes = getUniqueBarShapes(bbs.bars);
  if (uniqueShapes.length > 0) {
    h.push(`<h2>${escHtml(t('pro.rebarShapes') || 'Bar Shapes')}</h2>`);
    h.push(`<div class="shapes">`);
    for (const bar of uniqueShapes) {
      h.push(`<div class="shape-card">`);
      h.push(`<div class="mark">${escHtml(bar.mark)} — ${escHtml(bar.label)}</div>`);
      h.push(renderBarShapeSvg(bar));
      h.push(`<div>${(bar.lengthEach * 100).toFixed(0)} cm</div>`);
      h.push(`</div>`);
    }
    h.push(`</div>`);
  }

  // ── BBS Table ──
  h.push(`<h2>${escHtml(t('pro.bbsTitle'))}</h2>`);
  const hasZones = bbs.bars.some(b => b.zone);
  h.push(`<table><thead><tr>`);
  h.push(`<th>${escHtml(t('pro.bbsMark'))}</th>`);
  if (hasZones) h.push(`<th>${escHtml(t('pro.bbsZone'))}</th>`);
  h.push(`<th>${escHtml(t('pro.bbsDia'))}</th>`);
  h.push(`<th>${escHtml(t('pro.bbsQty'))}</th>`);
  h.push(`<th>${escHtml(t('pro.bbsLength'))} (m)</th>`);
  h.push(`<th>${escHtml(t('pro.bbsWeightEach'))} (kg)</th>`);
  h.push(`<th>${escHtml(t('pro.bbsWeightTotal'))} (kg)</th>`);
  h.push(`</tr></thead><tbody>`);
  for (const bar of bbs.bars) {
    h.push(`<tr>`);
    h.push(`<td style="font-weight:600;color:#1a5090">${escHtml(bar.mark)}</td>`);
    if (hasZones) h.push(`<td>${escHtml(bar.zone ?? '—')}</td>`);
    h.push(`<td>${escHtml(bar.label)}</td>`);
    h.push(`<td class="num">${bar.count}</td>`);
    h.push(`<td class="num">${bar.lengthEach.toFixed(2)}</td>`);
    h.push(`<td class="num">${bar.weightEach.toFixed(2)}</td>`);
    h.push(`<td class="num">${bar.weightTotal.toFixed(1)}</td>`);
    h.push(`</tr>`);
  }
  // Total row
  h.push(`<tr style="font-weight:bold;border-top:2px solid #333">`);
  h.push(`<td colspan="${hasZones ? 3 : 2}">${escHtml(t('pro.bbsTotalSteel'))}</td>`);
  h.push(`<td class="num">${bbs.totalCount}</td>`);
  h.push(`<td></td><td></td>`);
  h.push(`<td class="num">${bbs.totalWeight.toFixed(1)}</td>`);
  h.push(`</tr></tbody></table>`);

  // ── Weight by diameter summary ──
  h.push(`<div class="summary-grid">`);
  h.push(`<div class="summary-block"><h3>${escHtml(t('pro.bbsByDia'))}</h3>`);
  for (const d of bbs.weightByDia) {
    h.push(`<div class="summary-row"><span class="summary-label">${escHtml(d.label)}</span><span class="summary-value">${d.totalCount} u. — ${d.totalWeight.toFixed(1)} kg</span></div>`);
  }
  h.push(`</div></div>`);

  // ── Title block ──
  h.push(`<div class="title-block">`);
  h.push(`<div><div class="project">${escHtml(projectName || '')}</div><div style="font-size:9px;color:#888;margin-top:2px">stabileo.com</div></div>`);
  h.push(`<div class="meta">`);
  if (projectAuthor) h.push(`<div>${escHtml(projectAuthor)}</div>`);
  h.push(`<div>${escHtml(projectDate || new Date().toISOString().slice(0, 10))}</div>`);
  h.push(`</div></div>`);

  h.push(`</body></html>`);
  return h.join('\n');
}

/** Render a small SVG for a bar shape */
function renderBarShapeSvg(bar: BarEntry): string {
  const w = 80;
  const h = 40;
  const s: string[] = [];
  s.push(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);

  switch (bar.shape) {
    case 'straight':
      s.push(`<line x1="5" y1="${h / 2}" x2="${w - 5}" y2="${h / 2}" stroke="#c00" stroke-width="2"/>`);
      break;
    case 'L-hook-90': {
      const hk = 12;
      s.push(`<polyline points="5,${h / 2} ${w - hk},${h / 2} ${w - hk},${h / 2 + hk}" fill="none" stroke="#c00" stroke-width="2"/>`);
      break;
    }
    case 'U-hook-180': {
      const r = 6;
      s.push(`<line x1="5" y1="${h / 2}" x2="${w - r * 3}" y2="${h / 2}" stroke="#c00" stroke-width="2"/>`);
      s.push(`<path d="M${w - r * 3},${h / 2} A${r},${r} 0 1,1 ${w - r * 3},${h / 2 - r * 2}" fill="none" stroke="#c00" stroke-width="2"/>`);
      break;
    }
    case 'stirrup-closed': {
      const m = 6;
      const hk = 8;
      s.push(`<rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#0a0" stroke-width="1.5"/>`);
      // 135° hooks
      s.push(`<line x1="${m}" y1="${m}" x2="${m + hk}" y2="${m + hk}" stroke="#0a0" stroke-width="1.5"/>`);
      s.push(`<line x1="${w - m}" y1="${m}" x2="${w - m - hk}" y2="${m + hk}" stroke="#0a0" stroke-width="1.5"/>`);
      break;
    }
    default:
      s.push(`<line x1="5" y1="${h / 2}" x2="${w - 5}" y2="${h / 2}" stroke="#c00" stroke-width="2"/>`);
  }

  s.push(`</svg>`);
  return s.join('');
}
