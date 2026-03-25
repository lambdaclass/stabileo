// Render loads on Canvas 2D

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number } | undefined;
}

interface DistLoadInfo {
  elementId: number;
  qI: number; // kN/m at node I (or at position a if partial)
  qJ: number; // kN/m at node J (or at position b if partial)
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
  caseColor?: string;    // color for this load case
  caseName?: string;     // name prefix for labels (e.g. "D", "L")
  labelYOffset?: number; // pixel offset for stacking overlapping labels
  a?: number; // start position from node I (m). Default: 0
  b?: number; // end position from node I (m). Default: element length
}

interface PointLoadOnElemInfo {
  elementId: number;
  a: number; // distance from node I (m)
  p: number; // kN (perpendicular, local coords)
  px?: number; // kN (axial, local coords)
  my?: number; // kN·m (moment at position a)
  mz?: number; // kN·m (moment at position a)
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
  caseColor?: string;    // color for this load case
  caseName?: string;     // name prefix for labels
  labelYOffset?: number; // pixel offset for stacking overlapping labels
}

/**
 * Compute the world-space direction vector for a load with angle/isGlobal settings.
 * Returns the unit direction in which the force acts (world coords).
 * - Local angle=0: perpendicular to element (screen-up for horizontal beams = (-sinθ, cosθ))
 * - Global angle=0: +Z global (vertical up) = screen (0, 1)
 * - With angle: rotate from base direction by angle degrees CCW
 */
function computeLoadDirection(
  angle: number,
  isGlobal: boolean,
  cosTheta: number,
  sinTheta: number,
): { dx: number; dy: number } {
  const angleRad = angle * Math.PI / 180;

  if (isGlobal) {
    // Global: angle=0 → +Z global vertical-up = screen (0, 1); rotate CCW
    return {
      dx: Math.sin(angleRad),
      dy: Math.cos(angleRad),
    };
  } else {
    // Local: angle=0 → element-perpendicular (-sinθ, cosθ); rotate CCW in local frame
    const localPerpDx = -sinTheta;
    const localPerpDy = cosTheta;
    const localAxialDx = cosTheta;
    const localAxialDy = sinTheta;
    // Rotated: cos(a) * perp + sin(a) * axial
    return {
      dx: Math.cos(angleRad) * localPerpDx + Math.sin(angleRad) * localAxialDx,
      dy: Math.cos(angleRad) * localPerpDy + Math.sin(angleRad) * localAxialDy,
    };
  }
}

function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: -1 };
}

/**
 * Draw distributed loads as arrows perpendicular to elements with an envelope line.
 */
export function drawDistributedLoads(
  loads: DistLoadInfo[],
  dc: DrawContext,
): void {
  const { ctx } = dc;
  if (loads.length === 0) return;

  // Find max |q| for scaling
  let maxQ = 0;
  for (const l of loads) {
    maxQ = Math.max(maxQ, Math.abs(l.qI), Math.abs(l.qJ));
  }
  if (maxQ < 1e-10) return;

  const ARROW_MAX_PX = 22; // max arrow length in screen px (shorter than point loads to visually distinguish)

  for (const load of loads) {
    const elem = dc.getElement(load.elementId);
    if (!elem) continue;
    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-10) continue;

    const cosTheta = dx / length;
    const sinTheta = dy / length;

    // Compute force direction in world coords based on angle/isGlobal
    const loadAngle = load.angle ?? 0;
    const loadIsGlobal = load.isGlobal ?? false;
    const forceDir = computeLoadDirection(loadAngle, loadIsGlobal, cosTheta, sinTheta);

    // Determine dominant direction (use the sign of the larger magnitude end)
    const dominantQ = Math.abs(load.qI) >= Math.abs(load.qJ) ? load.qI : load.qJ;
    // Arrow points in force direction when q > 0, opposite when q < 0
    const arrowDirX = dominantQ > 0 ? -forceDir.dx : forceDir.dx;
    const arrowDirY = dominantQ > 0 ? -forceDir.dy : forceDir.dy;

    // Partial load range (default: full element)
    const loadA = load.a ?? 0;
    const loadB = load.b ?? length;
    const tStart = loadA / length;
    const tEnd = loadB / length;

    // Number of arrows: ~1 every 30px over the load span
    const sI = dc.worldToScreen(nodeI.x, nodeI.y);
    const sJ = dc.worldToScreen(nodeJ.x, nodeJ.y);
    const elemScreenLen = Math.sqrt((sJ.x - sI.x) ** 2 + (sJ.y - sI.y) ** 2);
    const loadScreenLen = elemScreenLen * (tEnd - tStart);
    const nArrows = Math.max(3, Math.round(loadScreenLen / 30));

    const loadColor = load.caseColor ?? '#ff6644';
    ctx.strokeStyle = loadColor;
    ctx.fillStyle = loadColor;
    ctx.lineWidth = 1.5;

    const arrowTips: { x: number; y: number }[] = [];

    for (let i = 0; i <= nArrows; i++) {
      const tLocal = i / nArrows; // 0..1 within the load span
      const qAtT = load.qI + (load.qJ - load.qI) * tLocal;
      const t = tStart + (tEnd - tStart) * tLocal; // position on element
      const wx = nodeI.x + t * dx;
      const wy = nodeI.y + t * dy;
      const base = dc.worldToScreen(wx, wy);

      // Arrow length proportional to q at this position
      const arrowLen = ARROW_MAX_PX * Math.abs(qAtT) / maxQ;

      // Skip drawing arrow if essentially zero
      if (arrowLen < 2) {
        arrowTips.push(base);
        continue;
      }

      const tipWorld = dc.worldToScreen(
        wx + arrowDirX * 0.01,
        wy + arrowDirY * 0.01,
      );
      const sPerpX = tipWorld.x - base.x;
      const sPerpY = tipWorld.y - base.y;
      const sPerpLen = Math.sqrt(sPerpX ** 2 + sPerpY ** 2);
      const snX = sPerpLen > 0 ? sPerpX / sPerpLen : 0;
      const snY = sPerpLen > 0 ? sPerpY / sPerpLen : -1;

      const fromX = base.x + snX * arrowLen;
      const fromY = base.y + snY * arrowLen;

      arrowTips.push({ x: fromX, y: fromY });

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(base.x, base.y);
      ctx.stroke();

      // Arrowhead — perpendicular to arrow direction
      const headLen = 6;
      // Use a direction orthogonal to the arrow shaft for wings
      const wingX = -snY;
      const wingY = snX;

      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + snX * headLen + wingX * 3, base.y + snY * headLen + wingY * 3);
      ctx.lineTo(base.x + snX * headLen - wingX * 3, base.y + snY * headLen - wingY * 3);
      ctx.closePath();
      ctx.fill();
    }

    // Draw envelope line connecting arrow tips
    if (arrowTips.length > 1) {
      ctx.beginPath();
      ctx.moveTo(arrowTips[0].x, arrowTips[0].y);
      for (let i = 1; i < arrowTips.length; i++) {
        ctx.lineTo(arrowTips[i].x, arrowTips[i].y);
      }
      ctx.strokeStyle = loadColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw end-cap lines for partial loads (vertical bars at start/end of load span)
    const isPartial = tStart > 0.01 || tEnd < 0.99;
    if (isPartial && arrowTips.length > 0) {
      ctx.strokeStyle = loadColor;
      ctx.lineWidth = 1.5;
      // Start cap
      const startBase = dc.worldToScreen(nodeI.x + tStart * dx, nodeI.y + tStart * dy);
      ctx.beginPath();
      ctx.moveTo(startBase.x, startBase.y);
      ctx.lineTo(arrowTips[0].x, arrowTips[0].y);
      ctx.stroke();
      // End cap
      const endBase = dc.worldToScreen(nodeI.x + tEnd * dx, nodeI.y + tEnd * dy);
      ctx.beginPath();
      ctx.moveTo(endBase.x, endBase.y);
      ctx.lineTo(arrowTips[arrowTips.length - 1].x, arrowTips[arrowTips.length - 1].y);
      ctx.stroke();
    }

    // Value labels — positioned at load span, not element span
    const tMid = (tStart + tEnd) / 2;
    const maxArrowLen = ARROW_MAX_PX * Math.max(Math.abs(load.qI), Math.abs(load.qJ)) / maxQ;
    const isUniform = Math.abs(load.qI - load.qJ) < 1e-6;

    const labelColor = loadColor;
    const casePrefix = load.caseName ? `${load.caseName}: ` : '';
    const yOff = load.labelYOffset ?? 0;
    const coordLabel = loadIsGlobal ? ' [Y]' : (loadAngle !== 0 ? ` [⊥ ${loadAngle}°]` : '');

    if (isUniform) {
      // Single label at midpoint of load span
      const midScreen = dc.worldToScreen(nodeI.x + tMid * dx, nodeI.y + tMid * dy);
      const tipW = dc.worldToScreen(
        nodeI.x + tMid * dx + arrowDirX * 0.01,
        nodeI.y + tMid * dy + arrowDirY * 0.01,
      );
      const sn = normalize(tipW.x - midScreen.x, tipW.y - midScreen.y);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = labelColor;
      ctx.fillText(`${casePrefix}${Math.abs(load.qI).toFixed(1)} kN/m${coordLabel}`, midScreen.x + sn.x * (maxArrowLen + 12), midScreen.y + sn.y * (maxArrowLen + 12) + yOff);
    } else {
      // Labels at both ends of load span
      ctx.font = '11px sans-serif';
      ctx.fillStyle = labelColor;
      for (const [t, q] of [[tStart, load.qI], [tEnd, load.qJ]] as [number, number][]) {
        const wx = nodeI.x + t * dx;
        const wy = nodeI.y + t * dy;
        const s = dc.worldToScreen(wx, wy);
        const tipW = dc.worldToScreen(wx + arrowDirX * 0.01, wy + arrowDirY * 0.01);
        const sn = normalize(tipW.x - s.x, tipW.y - s.y);
        const aLen = ARROW_MAX_PX * Math.abs(q) / maxQ;
        ctx.fillText(`${casePrefix}${Math.abs(q).toFixed(1)} kN/m${coordLabel}`, s.x + sn.x * (aLen + 10), s.y + sn.y * (aLen + 10) + yOff);
      }
    }
  }
}

/**
 * Draw a force arrow at a screen position.
 * snX, snY = normalized screen direction from tip to tail.
 */
function drawForceArrow(
  ctx: CanvasRenderingContext2D,
  baseX: number, baseY: number,
  snX: number, snY: number,
  arrowPx: number,
  color: string,
) {
  const fromX = baseX + snX * arrowPx;
  const fromY = baseY + snY * arrowPx;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // Arrow line
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();

  // Arrowhead
  const headLen = 8;
  const wingX = -snY;
  const wingY = snX;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(baseX + snX * headLen + wingX * 4, baseY + snY * headLen + wingY * 4);
  ctx.lineTo(baseX + snX * headLen - wingX * 4, baseY + snY * headLen - wingY * 4);
  ctx.closePath();
  ctx.fill();

  return { fromX, fromY };
}

/**
 * Draw a moment symbol (curved arrow) at screen position.
 * Exported so drawNodalLoad can reuse the same visual style.
 *
 * Convention: mz > 0 → CCW visually (screen), mz < 0 → CW visually.
 * In canvas coords (y down), visual CCW = canvas CCW (angle decreasing).
 */
export function drawMomentSymbol(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  mz: number,
  color: string,
  radius: number = 14,
) {
  const R = radius;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // 270° arc.
  // Canvas: ccw=false → angle increasing (CW on screen); ccw=true → angle decreasing (CCW on screen).
  // mz > 0 → visual CCW = canvas ccw=true: sweep -45° → 45° long way (270° CCW) ✓
  // mz < 0 → visual CW  = canvas ccw=false: sweep -135° → 135° (270° CW) ✓
  const startAngle = mz > 0 ? -Math.PI * 0.25 : -Math.PI * 0.75;
  const endAngle = mz > 0 ? Math.PI * 0.25 : Math.PI * 0.75;
  const ccw = mz > 0;
  ctx.beginPath();
  ctx.arc(cx, cy, R, startAngle, endAngle, ccw);
  ctx.stroke();

  // Arrowhead at end of arc — tip extends beyond arc end in travel direction
  const arcEndX = cx + R * Math.cos(endAngle);
  const arcEndY = cy + R * Math.sin(endAngle);
  // Tangent = velocity at arc end, in the direction the arc was being drawn.
  // ccw=true  (mz>0): angle decreasing → velocity = (sinθ, -cosθ)
  // ccw=false (mz<0): angle increasing → velocity = (-sinθ, cosθ)
  const tx = mz > 0 ? Math.sin(endAngle) : -Math.sin(endAngle);
  const ty = mz > 0 ? -Math.cos(endAngle) : Math.cos(endAngle);
  const headLen = 7;
  const nx = -ty, ny = tx; // normal to tangent
  // Tip of arrowhead is ahead of arc end; base sits on the arc end
  const pointX = arcEndX + tx * headLen;
  const pointY = arcEndY + ty * headLen;
  ctx.beginPath();
  ctx.moveTo(pointX, pointY);
  ctx.lineTo(arcEndX + nx * 3, arcEndY + ny * 3);
  ctx.lineTo(arcEndX - nx * 3, arcEndY - ny * 3);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw point loads on elements as single arrows positioned along the element.
 * Supports perpendicular (p), axial (px), and moment (mz) components.
 */
export function drawPointLoadsOnElements(
  loads: PointLoadOnElemInfo[],
  dc: DrawContext,
): void {
  const { ctx } = dc;
  if (loads.length === 0) return;

  const ARROW_PX = 40;

  for (const load of loads) {
    const elem = dc.getElement(load.elementId);
    if (!elem) continue;
    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-10) continue;

    const t = load.a / length;
    const wx = nodeI.x + t * dx;
    const wy = nodeI.y + t * dy;

    const cosTheta = dx / length;
    const sinTheta = dy / length;

    const loadAngle = load.angle ?? 0;
    const loadIsGlobal = load.isGlobal ?? false;

    const base = dc.worldToScreen(wx, wy);
    const ptColor = load.caseColor ?? '#ff4444';
    const ptCasePrefix = load.caseName ? `${load.caseName}: ` : '';
    const ptYOff = load.labelYOffset ?? 0;
    const coordLabel = loadIsGlobal ? ' [Y]' : (loadAngle !== 0 ? ` [⊥ ${loadAngle}°]` : '');

    // 1) Draw perpendicular force (p)
    if (Math.abs(load.p) > 1e-10) {
      const forceDir = computeLoadDirection(loadAngle, loadIsGlobal, cosTheta, sinTheta);
      const arrowDirX = load.p > 0 ? -forceDir.dx : forceDir.dx;
      const arrowDirY = load.p > 0 ? -forceDir.dy : forceDir.dy;

      const tipWorld = dc.worldToScreen(wx + arrowDirX * 0.01, wy + arrowDirY * 0.01);
      const sPerpX = tipWorld.x - base.x;
      const sPerpY = tipWorld.y - base.y;
      const sPerpLen = Math.sqrt(sPerpX ** 2 + sPerpY ** 2);
      const snX = sPerpLen > 0 ? sPerpX / sPerpLen : 0;
      const snY = sPerpLen > 0 ? sPerpY / sPerpLen : -1;

      const { fromX, fromY } = drawForceArrow(ctx, base.x, base.y, snX, snY, ARROW_PX, ptColor);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = ptColor;
      ctx.fillText(
        `${ptCasePrefix}${Math.abs(load.p).toFixed(1)} kN${coordLabel}`,
        fromX + 5,
        fromY - 5 + ptYOff,
      );
    }

    // 2) Draw axial force (px)
    const px = load.px ?? 0;
    if (Math.abs(px) > 1e-10) {
      // Axial direction: along element axis (I→J)
      const axialDirX = px > 0 ? cosTheta : -cosTheta;
      const axialDirY = px > 0 ? sinTheta : -sinTheta;

      const tipWorld = dc.worldToScreen(wx + axialDirX * 0.01, wy + axialDirY * 0.01);
      const sAx = tipWorld.x - base.x;
      const sAy = tipWorld.y - base.y;
      const sALen = Math.sqrt(sAx ** 2 + sAy ** 2);
      // Arrow goes OPPOSITE to force direction (arrow points toward base = application point)
      const snX = sALen > 0 ? -sAx / sALen : 0;
      const snY = sALen > 0 ? -sAy / sALen : 0;

      const { fromX, fromY } = drawForceArrow(ctx, base.x, base.y, snX, snY, ARROW_PX, ptColor);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = ptColor;
      const axLabel = loadIsGlobal ? 'Fx' : 'Fi';
      ctx.fillText(
        `${ptCasePrefix}${axLabel}=${Math.abs(px).toFixed(1)} kN`,
        fromX + 5,
        fromY - 5 + ptYOff + (Math.abs(load.p) > 1e-10 ? 14 : 0),
      );
    }

    // 3) Draw moment (My in the Z-up 2D contract; keep mz as legacy alias)
    const my = load.my ?? load.mz ?? 0;
    if (Math.abs(my) > 1e-10) {
      drawMomentSymbol(ctx, base.x, base.y, my, ptColor);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = ptColor;
      const yOff = (Math.abs(load.p) > 1e-10 ? 14 : 0) + (Math.abs(px) > 1e-10 ? 14 : 0);
      ctx.fillText(
        `${ptCasePrefix}My=${Math.abs(my).toFixed(1)} kN·m`,
        base.x + 18,
        base.y - 18 + ptYOff + yOff,
      );
    }
  }
}

interface ThermalLoadInfo {
  elementId: number;
  dtUniform: number; // °C uniform ΔT
  dtGradient: number; // °C gradient ΔTg
  caseName?: string;     // name prefix for labels
  labelYOffset?: number; // pixel offset for stacking overlapping labels
}

/**
 * Draw thermal loads as +/- symbols along elements.
 *
 * ΔT uniform: + on both sides (positive = expansion) or - on both sides (negative = contraction)
 * ΔTg gradient: + on one side, - on other side (top/bottom temperature difference → bending)
 */
export function drawThermalLoads(
  loads: ThermalLoadInfo[],
  dc: DrawContext,
): void {
  const { ctx } = dc;
  if (loads.length === 0) return;

  const OFFSET_PX = 14; // offset from element axis
  const SYMBOL_SIZE = 5; // half-size of + or - symbol
  const SYMBOL_SPACING_PX = 25; // screen px between symbols

  for (const load of loads) {
    const elem = dc.getElement(load.elementId);
    if (!elem) continue;
    const nodeI = dc.getNode(elem.nodeI);
    const nodeJ = dc.getNode(elem.nodeJ);
    if (!nodeI || !nodeJ) continue;

    const sI = dc.worldToScreen(nodeI.x, nodeI.y);
    const sJ = dc.worldToScreen(nodeJ.x, nodeJ.y);
    const sDx = sJ.x - sI.x;
    const sDy = sJ.y - sI.y;
    const sLen = Math.sqrt(sDx * sDx + sDy * sDy);
    if (sLen < 10) continue;

    // Unit tangent and perpendicular in screen coords
    const tx = sDx / sLen;
    const ty = sDy / sLen;
    const nx = -ty; // perpendicular (screen left side of element direction)
    const ny = tx;

    const nSymbols = Math.max(2, Math.round(sLen / SYMBOL_SPACING_PX));

    ctx.lineWidth = 1.5;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw uniform ΔT: same sign on both sides
    if (Math.abs(load.dtUniform) > 0.01) {
      const sign = load.dtUniform > 0 ? '+' : '−';
      ctx.fillStyle = load.dtUniform > 0 ? '#ff6b35' : '#4ea8de';
      ctx.strokeStyle = ctx.fillStyle;

      for (let i = 0; i <= nSymbols; i++) {
        const t = i / nSymbols;
        const bx = sI.x + t * sDx;
        const by = sI.y + t * sDy;

        // Top side
        const topX = bx + nx * OFFSET_PX;
        const topY = by + ny * OFFSET_PX;
        drawSymbol(ctx, topX, topY, sign, SYMBOL_SIZE);

        // Bottom side
        const botX = bx - nx * OFFSET_PX;
        const botY = by - ny * OFFSET_PX;
        drawSymbol(ctx, botX, botY, sign, SYMBOL_SIZE);
      }

      // Label at midpoint
      const midX = sI.x + 0.5 * sDx + nx * (OFFSET_PX + 14);
      const midY = sI.y + 0.5 * sDy + ny * (OFFSET_PX + 14);
      ctx.font = '11px sans-serif';
      const thermPrefix = load.caseName ? `${load.caseName}: ` : '';
      const thermYOff = load.labelYOffset ?? 0;
      ctx.fillText(`${thermPrefix}ΔT=${load.dtUniform > 0 ? '+' : ''}${load.dtUniform}°C`, midX, midY + thermYOff);
    }

    // Draw gradient ΔTg: + on one side, - on other
    if (Math.abs(load.dtGradient) > 0.01) {
      const topSign = load.dtGradient > 0 ? '+' : '−';
      const botSign = load.dtGradient > 0 ? '−' : '+';
      const topColor = load.dtGradient > 0 ? '#ff6b35' : '#4ea8de';
      const botColor = load.dtGradient > 0 ? '#4ea8de' : '#ff6b35';

      const gradOffset = Math.abs(load.dtUniform) > 0.01 ? OFFSET_PX + 12 : OFFSET_PX;

      for (let i = 0; i <= nSymbols; i++) {
        const t = i / nSymbols;
        const bx = sI.x + t * sDx;
        const by = sI.y + t * sDy;

        // Top side (+ for positive gradient)
        ctx.fillStyle = topColor;
        ctx.strokeStyle = topColor;
        const topX = bx + nx * gradOffset;
        const topY = by + ny * gradOffset;
        drawSymbol(ctx, topX, topY, topSign, SYMBOL_SIZE);

        // Bottom side (- for positive gradient)
        ctx.fillStyle = botColor;
        ctx.strokeStyle = botColor;
        const botX = bx - nx * gradOffset;
        const botY = by - ny * gradOffset;
        drawSymbol(ctx, botX, botY, botSign, SYMBOL_SIZE);
      }

      // Label
      const labelOffset = Math.abs(load.dtUniform) > 0.01 ? gradOffset + 14 : OFFSET_PX + 14;
      const midX = sI.x + 0.5 * sDx - nx * labelOffset;
      const midY = sI.y + 0.5 * sDy - ny * labelOffset;
      ctx.fillStyle = '#b366ff';
      ctx.font = '11px sans-serif';
      const gradPrefix = load.caseName ? `${load.caseName}: ` : '';
      const gradYOff = load.labelYOffset ?? 0;
      ctx.fillText(`${gradPrefix}ΔTg=${load.dtGradient > 0 ? '+' : ''}${load.dtGradient}°C`, midX, midY + gradYOff);
    }
  }
}

// ─── Moving Load Axle Visualization ──────────────────────────────

export interface MovingLoadAxleInfo {
  x: number;        // world X
  y: number;        // world Y
  weight: number;   // kN (positive = downward)
  /** Element direction cosine (dx/L) — needed to draw arrow perpendicular to element */
  cosTheta: number;
  /** Element direction sine (dy/L) */
  sinTheta: number;
}

const AXLE_COLOR = '#ffaa00';      // amber/orange — distinct from regular load red
const AXLE_LABEL_COLOR = '#ffcc44';

/**
 * Draw moving load axles as amber arrows perpendicular to their host element.
 * The arrow represents the transverse component of the gravitational load
 * (weight × cos θ), drawn perpendicular to the element (toward +Z for horizontal beams).
 * For purely axial loads on vertical bars, arrows are not drawn.
 */
export function drawMovingLoadAxles(
  axles: MovingLoadAxleInfo[],
  dc: DrawContext,
): void {
  const { ctx } = dc;
  if (axles.length === 0) return;

  const ARROW_PX = 48;
  const HEAD_LEN = 10;
  const HEAD_HALF = 5;

  for (const axle of axles) {
    // Perpendicular component of gravitational load (weight × cosθ)
    const pPerp = axle.weight * Math.abs(axle.cosTheta);
    if (pPerp < 0.1) continue; // Skip purely axial loads (vertical bars)

    const base = dc.worldToScreen(axle.x, axle.y);

    // Perpendicular direction in world coords: (-sinθ, cosθ) is element-perpendicular
    // Arrow should point toward the element (like gravity pressing on it)
    // For a horizontal beam, perpendicular is +Z (up), arrow points down (toward beam)
    // So arrow goes FROM offset position TO base (application point)
    const perpWx = -axle.sinTheta;
    const perpWy = axle.cosTheta;

    // Compute screen-space perpendicular via worldToScreen
    const tipWorld = dc.worldToScreen(
      axle.x + perpWx * 0.01,
      axle.y + perpWy * 0.01,
    );
    const sPerpX = tipWorld.x - base.x;
    const sPerpY = tipWorld.y - base.y;
    const sPerpLen = Math.sqrt(sPerpX ** 2 + sPerpY ** 2);
    const snX = sPerpLen > 0 ? sPerpX / sPerpLen : 0;
    const snY = sPerpLen > 0 ? sPerpY / sPerpLen : -1;

    // Arrow starts from offset and points toward base
    const fromX = base.x + snX * ARROW_PX;
    const fromY = base.y + snY * ARROW_PX;
    const toX = base.x;
    const toY = base.y;

    // Arrow shaft
    ctx.strokeStyle = AXLE_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead (filled triangle) — perpendicular to arrow direction
    // Use element tangent direction in screen space for arrowhead wings
    const tangentWorld = dc.worldToScreen(
      axle.x + axle.cosTheta * 0.01,
      axle.y + axle.sinTheta * 0.01,
    );
    const tDx = tangentWorld.x - base.x;
    const tDy = tangentWorld.y - base.y;
    const tLen = Math.sqrt(tDx ** 2 + tDy ** 2);
    const txN = tLen > 0 ? tDx / tLen : 1;
    const tyN = tLen > 0 ? tDy / tLen : 0;

    ctx.fillStyle = AXLE_COLOR;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX + snX * HEAD_LEN + txN * HEAD_HALF, toY + snY * HEAD_LEN + tyN * HEAD_HALF);
    ctx.lineTo(toX + snX * HEAD_LEN - txN * HEAD_HALF, toY + snY * HEAD_LEN - tyN * HEAD_HALF);
    ctx.closePath();
    ctx.fill();

    // Small circle at application point
    ctx.beginPath();
    ctx.arc(toX, toY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Weight label (perpendicular component)
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = AXLE_LABEL_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${axle.weight.toFixed(0)} kN`, fromX + snX * 10, fromY + snY * 10);
    ctx.textAlign = 'start'; // reset
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, sign: string, size: number) {
  ctx.beginPath();
  // Horizontal line (always drawn for both + and -)
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.stroke();

  if (sign === '+') {
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
}
