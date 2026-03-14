/**
 * Pure drawing functions for the 2D canvas viewport.
 *
 * Each function receives the canvas context and all needed data as
 * arguments so it never reads from Svelte stores directly.
 */

import { drawMomentSymbol } from '../canvas/draw-loads';

// ── Shared types for draw-entity parameters ──────────────────────────

export interface ScreenPoint {
  x: number;
  y: number;
}

export type WorldToScreenFn = (wx: number, wy: number) => ScreenPoint;
export type ScreenToWorldFn = (sx: number, sy: number) => { x: number; y: number };

// ── Constants ────────────────────────────────────────────────────────

export const ELEMENT_PALETTE = [
  '#4ecdc4', '#e9c46a', '#e76f51', '#2a9d8f',
  '#f4a261', '#264653', '#a8dadc', '#e63946',
];

// ── Grid & Axes ──────────────────────────────────────────────────────

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize: number,
  worldToScreen: WorldToScreenFn,
  screenToWorld: ScreenToWorldFn,
): void {
  ctx.strokeStyle = '#2a2a4e';
  ctx.lineWidth = 1;

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(width, height);

  const startX = Math.floor(topLeft.x / gridSize) * gridSize;
  const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
  const startY = Math.floor(bottomRight.y / gridSize) * gridSize;
  const endY = Math.ceil(topLeft.y / gridSize) * gridSize;

  for (let x = startX; x <= endX; x += gridSize) {
    const sx = worldToScreen(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += gridSize) {
    const sy = worldToScreen(0, y).y;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }
}

export function drawAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldToScreen: WorldToScreenFn,
): void {
  ctx.strokeStyle = '#3a3a6e';
  ctx.lineWidth = 1;

  const axisY = worldToScreen(0, 0).y;
  ctx.beginPath();
  ctx.moveTo(0, axisY);
  ctx.lineTo(width, axisY);
  ctx.stroke();

  const axisX = worldToScreen(0, 0).x;
  ctx.beginPath();
  ctx.moveTo(axisX, 0);
  ctx.lineTo(axisX, height);
  ctx.stroke();
}

// ── Nodes ────────────────────────────────────────────────────────────

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: { id: number; x: number; y: number },
  worldToScreen: WorldToScreenFn,
  isSelected: boolean,
  showNodeLabels: boolean,
): void {
  const screen = worldToScreen(node.x, node.y);

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, isSelected ? 8 : 6, 0, Math.PI * 2);
  ctx.fillStyle = isSelected ? '#ff6b6b' : '#e94560';
  ctx.fill();

  // Node ID
  if (showNodeLabels) {
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText(node.id.toString(), screen.x + 10, screen.y - 10);
  }
}

// ── Element color ────────────────────────────────────────────────────

export function getElementColor(
  elem: { id: number; materialId: number; sectionId: number },
  elementColorMode: string,
): string {
  if (elementColorMode === 'byMaterial') {
    return ELEMENT_PALETTE[(elem.materialId - 1) % ELEMENT_PALETTE.length];
  } else if (elementColorMode === 'bySection') {
    return ELEMENT_PALETTE[(elem.sectionId - 1) % ELEMENT_PALETTE.length];
  }
  return '#4ecdc4';
}

// ── Elements ─────────────────────────────────────────────────────────

export interface DrawElementOpts {
  worldToScreen: WorldToScreenFn;
  isSelected: boolean;
  elementColorMode: string;
  showElementLabels: boolean;
  showLengths: boolean;
  zoom: number;
  diagramType: string;
  /** Pre-computed world length of the element */
  worldLength: number;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  elem: {
    id: number;
    type: string;
    nodeI: number;
    nodeJ: number;
    materialId: number;
    sectionId: number;
    hingeStart?: boolean;
    hingeEnd?: boolean;
  },
  ni: { x: number; y: number },
  nj: { x: number; y: number },
  opts: DrawElementOpts,
  colorOverride?: string,
  nodeBarCount?: Map<number, number>,
): void {
  const si = opts.worldToScreen(ni.x, ni.y);
  const sj = opts.worldToScreen(nj.x, nj.y);
  const baseColor = colorOverride ?? getElementColor(elem, opts.elementColorMode);

  ctx.beginPath();
  ctx.moveTo(si.x, si.y);
  ctx.lineTo(sj.x, sj.y);
  ctx.strokeStyle = opts.isSelected ? '#ff6b6b' : baseColor;
  ctx.lineWidth = opts.isSelected ? 4.5 : 3.5;
  if (elem.type === 'truss' && opts.diagramType !== 'axialColor') {
    ctx.setLineDash([8, 4]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw hinges (articulaciones) — offset depends on bar count at node
  const dx = sj.x - si.x;
  const dy = sj.y - si.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const hingeRadius = Math.max(8, 4 / opts.zoom);
  const OFFSET_PX = 12;
  const MAX_OFFSET_FRAC = 0.08;

  const hasHingeStart = elem.hingeStart === true;
  const hasHingeEnd = elem.hingeEnd === true;

  const hingeColor = opts.isSelected ? '#ff6b6b' : baseColor;
  if (hasHingeStart) {
    const count = nodeBarCount?.get(elem.nodeI) ?? 1;
    // <=2 bars: centered on node (offset=0). >=3 bars: small offset along element
    const offsetFrac = count >= 3 ? Math.min(OFFSET_PX / len, MAX_OFFSET_FRAC) : 0;
    const hx = si.x + dx * offsetFrac;
    const hy = si.y + dy * offsetFrac;
    ctx.beginPath();
    ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a1e';
    ctx.fill();
    ctx.strokeStyle = hingeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  if (hasHingeEnd) {
    const count = nodeBarCount?.get(elem.nodeJ) ?? 1;
    const offsetFrac = count >= 3 ? Math.min(OFFSET_PX / len, MAX_OFFSET_FRAC) : 0;
    const hx = sj.x - dx * offsetFrac;
    const hy = sj.y - dy * offsetFrac;
    ctx.beginPath();
    ctx.arc(hx, hy, hingeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a1e';
    ctx.fill();
    ctx.strokeStyle = hingeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Element label
  const midX = (si.x + sj.x) / 2;
  const midY = (si.y + sj.y) / 2;
  // Normal offset to avoid overlapping the line
  const nx = -dy / len * 14;
  const ny = dx / len * 14;

  if (opts.showElementLabels) {
    ctx.fillStyle = '#aaf';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`E${elem.id}`, midX + nx, midY + ny);
    ctx.textAlign = 'left';
  }

  if (opts.showLengths) {
    ctx.fillStyle = '#8c8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const offset = opts.showElementLabels ? 12 : 0;
    ctx.fillText(`${opts.worldLength.toFixed(2)} m`, midX + nx, midY + ny + offset);
    ctx.textAlign = 'left';
  }
}

// ── Support visual angle ─────────────────────────────────────────────

/** Compute the visual rotation angle (radians) for any support with angle/isGlobal.
 *  For rollerX base=0 deg, rollerY base=90 deg. For fixed/pinned/spring base=0 deg.
 *  When isGlobal===false, adds element angle at the node. */
export function getSupportVisualAngle(
  sup: { type: string; nodeId: number; angle?: number; isGlobal?: boolean },
  getElementAngleAtNode: (nodeId: number) => number,
): number {
  const baseAngleDeg = sup.type === 'rollerY' ? 90 : 0;
  let angleDeg = baseAngleDeg;
  if (sup.isGlobal === false) {
    const elemAngle = getElementAngleAtNode(sup.nodeId);
    angleDeg = (elemAngle * 180 / Math.PI) + baseAngleDeg;
  }
  angleDeg += (sup.angle ?? 0);
  return angleDeg * Math.PI / 180;
}

// ── Supports ─────────────────────────────────────────────────────────

export function drawSupport(
  ctx: CanvasRenderingContext2D,
  sup: {
    id: number;
    nodeId: number;
    type: string;
    dx?: number;
    dy?: number;
    drz?: number;
    angle?: number;
    isGlobal?: boolean;
  },
  screen: ScreenPoint,
  isSelected: boolean,
  getElementAngleAtNode: (nodeId: number) => number,
): void {
  const size = 15;

  if (isSelected) {
    ctx.shadowColor = '#4ecdc4';
    ctx.shadowBlur = 12;
  }

  ctx.fillStyle = isSelected ? '#4ecdc4' : '#ffa500';
  ctx.strokeStyle = isSelected ? '#4ecdc4' : '#ffa500';
  ctx.lineWidth = 2;

  if (sup.type === 'fixed') {
    const angle = getSupportVisualAngle(sup, getElementAngleAtNode);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);
    ctx.fillRect(-size, 0, size * 2, size / 2);
    for (let i = -size; i <= size; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, size / 2);
      ctx.lineTo(i - 5, size);
      ctx.stroke();
    }
    ctx.restore();
  } else if (sup.type === 'pinned') {
    const angle = getSupportVisualAngle(sup, getElementAngleAtNode);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  } else if (sup.type === 'rollerX' || sup.type === 'rollerY') {
    // Unified roller drawing with rotation and 2 circles
    const angle = getSupportVisualAngle(sup, getElementAngleAtNode);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(angle);
    // Triangle
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size / 2, size * 0.7);
    ctx.lineTo(size / 2, size * 0.7);
    ctx.closePath();
    ctx.stroke();
    // 2 circles
    const circleR = 3;
    const circleY = size * 0.7 + circleR + 1;
    ctx.beginPath();
    ctx.arc(-4, circleY, circleR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, circleY, circleR, 0, Math.PI * 2);
    ctx.stroke();
    // Ground line
    const groundY = circleY + circleR + 1;
    ctx.beginPath();
    ctx.moveTo(-size, groundY);
    ctx.lineTo(size, groundY);
    ctx.stroke();
    ctx.restore();
  } else if (sup.type === 'spring') {
    // Draw spring symbol: zigzag line going down from node
    const springAngle = getSupportVisualAngle(sup, getElementAngleAtNode);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(springAngle);
    ctx.strokeStyle = isSelected ? '#4ecdc4' : '#44bb88';
    ctx.fillStyle = isSelected ? '#4ecdc4' : '#44bb88';
    ctx.lineWidth = 2;
    const nCoils = 4;
    const springH = size * 1.5;
    const springW = size * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 3); // short lead-in
    for (let i = 0; i < nCoils; i++) {
      const y0 = 3 + (i / nCoils) * springH;
      const y1 = 3 + ((i + 0.5) / nCoils) * springH;
      const y2 = 3 + ((i + 1) / nCoils) * springH;
      ctx.lineTo(springW, y0 + (y1 - y0) * 0.5);
      ctx.lineTo(-springW, y1 + (y2 - y1) * 0.5);
    }
    ctx.lineTo(0, 3 + springH);
    ctx.lineTo(0, 3 + springH + 3); // lead-out
    ctx.stroke();
    // Ground line at bottom
    const groundY = 3 + springH + 3;
    ctx.beginPath();
    ctx.moveTo(-size, groundY);
    ctx.lineTo(size, groundY);
    ctx.stroke();
    ctx.restore();
  }

  // Reset shadow
  if (isSelected) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // Draw prescribed displacement indicators
  drawPrescribedDisp(ctx, screen, sup, size);
}

// ── Prescribed Displacements ─────────────────────────────────────────

/** Draw small arrows/arcs near the support indicating prescribed displacements */
export function drawPrescribedDisp(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  sup: { dx?: number; dy?: number; drz?: number },
  size: number,
): void {
  const hasDx = sup.dx !== undefined && sup.dx !== 0;
  const hasDy = sup.dy !== undefined && sup.dy !== 0;
  const hasDrz = sup.drz !== undefined && sup.drz !== 0;
  if (!hasDx && !hasDy && !hasDrz) return;

  const arrowLen = 20;
  const headLen = 6;
  const offset = size + 8; // start offset from node

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e9c46a';
  ctx.fillStyle = '#e9c46a';
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'middle';

  // dx: horizontal arrow
  if (hasDx) {
    const dir = sup.dx! > 0 ? 1 : -1;
    const startX = screen.x + dir * 4;
    const endX = startX + dir * arrowLen;
    const ay = screen.y - offset;

    ctx.beginPath();
    ctx.moveTo(startX, ay);
    ctx.lineTo(endX, ay);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(endX, ay);
    ctx.lineTo(endX - dir * headLen, ay - 3);
    ctx.lineTo(endX - dir * headLen, ay + 3);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.fillText(`\u03B4x=${(sup.dx! * 1000).toFixed(1)}mm`, endX + dir * 3, ay);
  }

  // dy: vertical arrow (screen Y inverted: negative dy = down in world = down on screen)
  if (hasDy) {
    const dir = sup.dy! < 0 ? 1 : -1; // screen direction (positive screen Y = down)
    const startY = screen.y + dir * 4;
    const endY = startY + dir * arrowLen;
    const ax = screen.x + offset;

    ctx.beginPath();
    ctx.moveTo(ax, startY);
    ctx.lineTo(ax, endY);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(ax, endY);
    ctx.lineTo(ax - 3, endY - dir * headLen);
    ctx.lineTo(ax + 3, endY - dir * headLen);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.textAlign = 'left';
    ctx.textBaseline = dir > 0 ? 'top' : 'bottom';
    ctx.fillText(`\u03B4y=${(sup.dy! * 1000).toFixed(1)}mm`, ax + 5, endY);
    ctx.textBaseline = 'middle';
  }

  // drz: curved arrow arc
  if (hasDrz) {
    const dir = sup.drz! > 0 ? 1 : -1; // CCW positive
    const r = 14;
    const cx = screen.x - offset - r;
    const cy = screen.y;
    const startAngle = dir > 0 ? -Math.PI * 0.3 : Math.PI * 0.3;
    const endAngle = dir > 0 ? Math.PI * 0.3 : -Math.PI * 0.3;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle, dir < 0);
    ctx.stroke();
    // Arrowhead at end of arc
    const tipX = cx + r * Math.cos(endAngle);
    const tipY = cy + r * Math.sin(endAngle);
    const tangentAngle = endAngle + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(tangentAngle) - 3 * Math.sin(tangentAngle),
               tipY - headLen * Math.sin(tangentAngle) + 3 * Math.cos(tangentAngle));
    ctx.lineTo(tipX - headLen * Math.cos(tangentAngle) + 3 * Math.sin(tangentAngle),
               tipY - headLen * Math.sin(tangentAngle) - 3 * Math.cos(tangentAngle));
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.textAlign = 'right';
    ctx.fillText(`\u03B4\u03B8=${(sup.drz! * 1000).toFixed(2)}mrad`, cx - 3, cy);
  }
}

// ── Nodal Loads ──────────────────────────────────────────────────────

export function drawNodalLoad(
  ctx: CanvasRenderingContext2D,
  screen: ScreenPoint,
  loadData: { fx: number; fy: number; mz: number },
  caseColor?: string,
  caseName?: string,
  labelYOffset?: number,
): void {
  const arrowLen = 40;
  const color = caseColor ?? '#ff4444';
  const prefix = caseName ? `${caseName}: ` : '';
  const yOff = labelYOffset ?? 0;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  if (Math.abs(loadData.fy) > 0.001) {
    const dir = loadData.fy < 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y - arrowLen * dir);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screen.x - 5, screen.y - 10 * dir);
    ctx.lineTo(screen.x + 5, screen.y - 10 * dir);
    ctx.closePath();
    ctx.fill();

    ctx.font = '12px sans-serif';
    ctx.fillText(`${prefix}${Math.abs(loadData.fy)} kN`, screen.x + 10, screen.y - arrowLen / 2 * dir + yOff);
  }

  if (Math.abs(loadData.fx) > 0.001) {
    const dir = loadData.fx > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(screen.x - arrowLen * dir, screen.y);
    ctx.lineTo(screen.x, screen.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screen.x - 10 * dir, screen.y - 5);
    ctx.lineTo(screen.x - 10 * dir, screen.y + 5);
    ctx.closePath();
    ctx.fill();

    ctx.font = '12px sans-serif';
    ctx.fillText(`${prefix}${Math.abs(loadData.fx)} kN`, screen.x - arrowLen * dir, screen.y - 10 + yOff);
  }

  // Moment (curved arrow) — reuses drawMomentSymbol for consistent visuals
  if (Math.abs(loadData.mz) > 0.001) {
    const r = 18;
    drawMomentSymbol(ctx, screen.x, screen.y, loadData.mz, color, r);

    // Label
    ctx.font = '12px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`${prefix}${Math.abs(loadData.mz)} kN\u00B7m`, screen.x + r + 5, screen.y - r + yOff);
  }
}

// ── Reactions ────────────────────────────────────────────────────────

export interface ReactionData {
  nodeId: number;
  rx: number;
  ry: number;
  mz: number;
}

export function drawReactions(
  ctx: CanvasRenderingContext2D,
  reactions: ReactionData[],
  getNodeScreen: (nodeId: number) => ScreenPoint | null,
): void {
  for (const r of reactions) {
    const s = getNodeScreen(r.nodeId);
    if (!s) continue;

    const arrowLen = 35;
    const headSize = 7;

    // Draw Ry (vertical reaction) — arrow shows force FROM support ON structure
    if (Math.abs(r.ry) > 0.001) {
      const dir = r.ry > 0 ? 1 : -1; // positive Ry = upward arrow (screen y-axis inverted)
      const x = s.x;
      const y1 = s.y + dir * arrowLen;
      const y2 = s.y;

      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();

      // Arrowhead pointing toward the node
      ctx.fillStyle = '#00e676';
      ctx.beginPath();
      ctx.moveTo(x, y2);
      ctx.lineTo(x - headSize * 0.5, y2 + dir * headSize);
      ctx.lineTo(x + headSize * 0.5, y2 + dir * headSize);
      ctx.closePath();
      ctx.fill();

      // Label — absolute value + unit (direction given by arrow)
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(r.ry).toFixed(2)} kN`, x, y1 + dir * 12);
    }

    // Draw Rx (horizontal reaction) — arrow shows force FROM support ON structure
    if (Math.abs(r.rx) > 0.001) {
      const dir = r.rx > 0 ? 1 : -1; // positive Rx = rightward arrow (support pushes right)
      const y = s.y;
      const x1 = s.x - dir * arrowLen;
      const x2 = s.x;

      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      ctx.fillStyle = '#00e676';
      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - dir * headSize, y - headSize * 0.5);
      ctx.lineTo(x2 - dir * headSize, y + headSize * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(r.rx).toFixed(2)} kN`, x1 - dir * 5, y - 8);
    }

    // Draw Mz (moment reaction) as arc arrow — shows moment FROM support ON structure
    if (Math.abs(r.mz) > 0.001) {
      const radius = 18;
      const startAngle = -Math.PI * 0.7;
      const endAngle = Math.PI * 0.2;
      const ccw = r.mz < 0;

      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, startAngle, endAngle, ccw);
      ctx.stroke();

      // Small arrowhead at end of arc
      const tipAngle = ccw ? startAngle : endAngle;
      const tx = s.x + radius * Math.cos(tipAngle);
      const ty = s.y + radius * Math.sin(tipAngle);
      ctx.fillStyle = '#00e676';
      ctx.beginPath();
      ctx.arc(tx, ty, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#00e676';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(r.mz).toFixed(2)} kN\u00B7m`, s.x, s.y - radius - 5);
    }
  }
  ctx.textAlign = 'left'; // reset
}

// ── Constraint Forces (2D) ────────────────────────────────────────────

export interface ConstraintForceData {
  nodeId: number;
  dof: string;
  force: number;
}

export function drawConstraintForces(
  ctx: CanvasRenderingContext2D,
  forces: ConstraintForceData[],
  getNodeScreen: (nodeId: number) => ScreenPoint | null,
): void {
  if (!forces || forces.length === 0) return;
  const arrowLen = 35;
  const headSize = 7;
  const C = '#f0a500';
  for (const cf of forces) {
    if (Math.abs(cf.force) < 0.001) continue;
    const s = getNodeScreen(cf.nodeId);
    if (!s) continue;
    if (cf.dof === 'uy') {
      const dir = cf.force > 0 ? 1 : -1;
      const y1 = s.y + dir * arrowLen;
      ctx.strokeStyle = C; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, y1); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.fillStyle = C; ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - headSize * 0.5, s.y + dir * headSize); ctx.lineTo(s.x + headSize * 0.5, s.y + dir * headSize);
      ctx.closePath(); ctx.fill();
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(cf.force).toFixed(2)} kN`, s.x, y1 + dir * 12);
    } else if (cf.dof === 'ux') {
      const dir = cf.force > 0 ? 1 : -1;
      const x1 = s.x - dir * arrowLen;
      ctx.strokeStyle = C; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, s.y); ctx.lineTo(s.x, s.y); ctx.stroke();
      ctx.fillStyle = C; ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dir * headSize, s.y - headSize * 0.5); ctx.lineTo(s.x - dir * headSize, s.y + headSize * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(cf.force).toFixed(2)} kN`, x1 - dir * 5, s.y - 8);
    } else if (cf.dof === 'rz') {
      const radius = 18;
      ctx.strokeStyle = C; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, -Math.PI * 0.7, Math.PI * 0.2, cf.force < 0); ctx.stroke();
      const tipAngle = cf.force < 0 ? -Math.PI * 0.7 : Math.PI * 0.2;
      ctx.fillStyle = C; ctx.beginPath(); ctx.arc(s.x + radius * Math.cos(tipAngle), s.y + radius * Math.sin(tipAngle), 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.abs(cf.force).toFixed(2)} kN\u00B7m`, s.x, s.y - radius - 5);
    }
  }
  ctx.textAlign = 'left';
}

// ── Tooltip ──────────────────────────────────────────────────────────

export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  lines: string[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.font = '11px monospace';
  const padding = 6;
  const lineH = 15;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const w = maxW + padding * 2;
  const h = lines.length * lineH + padding * 2;

  // Keep tooltip inside canvas
  let x = sx;
  let y = sy;
  if (x + w > canvasWidth) x = sx - w - 20;
  if (y + h > canvasHeight) y = canvasHeight - h;
  if (y < 0) y = 0;

  ctx.fillStyle = 'rgba(22, 33, 62, 0.92)';
  ctx.strokeStyle = '#0f3460';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eee';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + padding, y + padding + (i + 1) * lineH - 3);
  }
}
