// Draw influence line diagram on Canvas 2D

import type { InfluenceLineResult } from '../store/model.svelte';
import { t } from '../i18n';

interface DrawContext {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getNode: (id: number) => { x: number; y: number } | undefined;
  getElement: (id: number) => { nodeI: number; nodeJ: number } | undefined;
}

const FILL_POS = 'rgba(50, 205, 50, 0.2)';
const FILL_NEG = 'rgba(255, 99, 71, 0.2)';
const STROKE_COLOR = '#ff6b6b';
const TEXT_COLOR = '#ff9999';

export function drawInfluenceLine(
  il: InfluenceLineResult,
  dc: DrawContext,
  _zoom: number,
  progressT?: number,
): void {
  const { ctx } = dc;
  if (il.points.length === 0) return;

  // Find max absolute value for scaling
  let maxAbs = 0;
  for (const p of il.points) {
    if (Math.abs(p.value) > maxAbs) maxAbs = Math.abs(p.value);
  }
  if (maxAbs < 1e-10) return;

  // Target: 60px screen height for max value
  const targetPx = 60;
  const scale = targetPx / maxAbs;

  // Compute cumulative length for global progress (animation support)
  // Build element order and cumulative lengths
  const elemIds: number[] = [];
  const elemLengths = new Map<number, number>();
  let totalLength = 0;
  const seen = new Set<number>();
  for (const p of il.points) {
    if (!seen.has(p.elementId)) {
      seen.add(p.elementId);
      elemIds.push(p.elementId);
      const elem = dc.getElement(p.elementId);
      if (elem) {
        const ni = dc.getNode(elem.nodeI);
        const nj = dc.getNode(elem.nodeJ);
        if (ni && nj) {
          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const L = Math.sqrt(dx * dx + dy * dy);
          elemLengths.set(p.elementId, L);
          totalLength += L;
        }
      }
    }
  }

  // Compute cumulative start for each element
  const elemCumStart = new Map<number, number>();
  let cumLen = 0;
  for (const eid of elemIds) {
    elemCumStart.set(eid, cumLen);
    cumLen += elemLengths.get(eid) ?? 0;
  }

  // Unit load marker position for animation
  let unitLoadWorldX = 0, unitLoadWorldY = 0;
  let unitLoadFound = false;
  let unitLoadElemId = -1;

  // Group points by element
  const byElement = new Map<number, typeof il.points>();
  for (const p of il.points) {
    let arr = byElement.get(p.elementId);
    if (!arr) {
      arr = [];
      byElement.set(p.elementId, arr);
    }
    arr.push(p);
  }

  // Draw influence line per element
  for (const [elemId, pts] of byElement) {
    const elem = dc.getElement(elemId);
    if (!elem) continue;
    const ni = dc.getNode(elem.nodeI);
    const nj = dc.getNode(elem.nodeJ);
    if (!ni || !nj) continue;

    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) continue;

    // Perpendicular direction (always draw "up" relative to element)
    const perpX = -dy / L;
    const perpY = dx / L;

    // Compute global t for each point (for animation filtering)
    const cumStart = elemCumStart.get(elemId) ?? 0;

    // Filter points by animation progress
    let filteredPts = pts;
    if (progressT !== undefined && totalLength > 0) {
      filteredPts = pts.filter(p => {
        const globalT = (cumStart + p.t * L) / totalLength;
        return globalT <= progressT;
      });
      if (filteredPts.length < 2) continue; // not enough points to draw

      // Check if the unit load is on this element
      const elemStartT = cumStart / totalLength;
      const elemEndT = (cumStart + L) / totalLength;
      if (progressT >= elemStartT && progressT <= elemEndT) {
        const localT = (progressT * totalLength - cumStart) / L;
        unitLoadWorldX = ni.x + localT * dx;
        unitLoadWorldY = ni.y + localT * dy;
        unitLoadFound = true;
        unitLoadElemId = elemId;
      }
    }

    // Build screen-space baseline and offset points
    const baseline: { x: number; y: number }[] = [];
    const offset: { x: number; y: number }[] = [];

    for (const p of filteredPts) {
      const s = dc.worldToScreen(p.x, p.y);
      baseline.push(s);

      // Offset along perpendicular by value * scale (screen pixels)
      const off = p.value * scale;
      const sx = s.x + perpX * off;
      const sy = s.y - perpY * off;
      offset.push({ x: sx, y: sy });
    }

    if (baseline.length < 2) continue;

    // Fill polygon (baseline → forward, offset → backward)
    ctx.beginPath();
    ctx.moveTo(baseline[0].x, baseline[0].y);
    for (let i = 1; i < baseline.length; i++) {
      ctx.lineTo(baseline[i].x, baseline[i].y);
    }
    for (let i = offset.length - 1; i >= 0; i--) {
      ctx.lineTo(offset[i].x, offset[i].y);
    }
    ctx.closePath();

    // Use a single semi-transparent fill
    const hasPositive = filteredPts.some(p => p.value > 1e-10);
    const hasNegative = filteredPts.some(p => p.value < -1e-10);
    ctx.fillStyle = hasPositive && !hasNegative ? FILL_POS :
                    !hasPositive && hasNegative ? FILL_NEG :
                    'rgba(255, 165, 0, 0.15)';
    ctx.fill();

    // Stroke the offset line
    ctx.beginPath();
    ctx.moveTo(offset[0].x, offset[0].y);
    for (let i = 1; i < offset.length; i++) {
      ctx.lineTo(offset[i].x, offset[i].y);
    }
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw unit load marker (arrow perpendicular to element) during animation
  if (progressT !== undefined && unitLoadFound && unitLoadElemId !== -1) {
    const elem = dc.getElement(unitLoadElemId);
    const s = dc.worldToScreen(unitLoadWorldX, unitLoadWorldY);
    const arrowLen = 30;
    ctx.strokeStyle = '#ffdd57';
    ctx.fillStyle = '#ffdd57';
    ctx.lineWidth = 2;

    if (elem) {
      const ni = dc.getNode(elem.nodeI);
      const nj = dc.getNode(elem.nodeJ);
      if (ni && nj) {
        const edx = nj.x - ni.x;
        const edy = nj.y - ni.y;
        const eL = Math.sqrt(edx * edx + edy * edy);
        if (eL > 1e-6) {
          // Perpendicular in world coords (local +y)
          const perpWx = -edy / eL;
          const perpWy = edx / eL;
          // Screen-space perpendicular
          const tipW = dc.worldToScreen(unitLoadWorldX + perpWx * 0.01, unitLoadWorldY + perpWy * 0.01);
          const spx = tipW.x - s.x;
          const spy = tipW.y - s.y;
          const spLen = Math.sqrt(spx * spx + spy * spy);
          const snx = spLen > 0 ? spx / spLen : 0;
          const sny = spLen > 0 ? spy / spLen : -1;
          // Tangent in screen coords
          const tanW = dc.worldToScreen(unitLoadWorldX + edx / eL * 0.01, unitLoadWorldY + edy / eL * 0.01);
          const txn = tanW.x - s.x;
          const tyn = tanW.y - s.y;
          const tl = Math.sqrt(txn * txn + tyn * tyn);
          const tnx = tl > 0 ? txn / tl : 1;
          const tny = tl > 0 ? tyn / tl : 0;
          // Arrow from offset to base (perpendicular to element)
          const fromX = s.x + snx * arrowLen;
          const fromY = s.y + sny * arrowLen;
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + snx * 8 + tnx * 4, s.y + sny * 8 + tny * 4);
          ctx.lineTo(s.x + snx * 8 - tnx * 4, s.y + sny * 8 - tny * 4);
          ctx.closePath();
          ctx.fill();
          // Label
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(t('influence.unitLoad'), fromX + snx * 8, fromY + sny * 8);
        }
      }
    }
  }

  // Draw zero line indicators (where influence line crosses zero)
  // and draw peak values
  let maxPt = il.points[0];
  let minPt = il.points[0];
  for (const p of il.points) {
    if (p.value > maxPt.value) maxPt = p;
    if (p.value < minPt.value) minPt = p;
  }

  ctx.font = '11px sans-serif';
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';

  // Position labels along the element perpendicular so they work for inclined bars
  for (const pt of [maxPt, minPt]) {
    if (pt === minPt && minPt === maxPt) continue;
    if (Math.abs(pt.value) < 1e-10) continue;
    const elem = dc.getElement(pt.elementId);
    if (!elem) continue;
    const eni = dc.getNode(elem.nodeI);
    const enj = dc.getNode(elem.nodeJ);
    if (!eni || !enj) continue;
    const edx = enj.x - eni.x;
    const edy = enj.y - eni.y;
    const eL = Math.sqrt(edx * edx + edy * edy);
    if (eL < 1e-6) continue;

    const ePerpX = -edy / eL;
    const ePerpY = edx / eL;
    const s = dc.worldToScreen(pt.x, pt.y);
    // Offset in screen perpendicular direction
    const tipW = dc.worldToScreen(pt.x + ePerpX * 0.01, pt.y + ePerpY * 0.01);
    const spx = tipW.x - s.x;
    const spy = tipW.y - s.y;
    const spLen = Math.sqrt(spx * spx + spy * spy);
    const snx = spLen > 0 ? spx / spLen : 0;
    const sny = spLen > 0 ? spy / spLen : -1;
    // Position label on the side of the value
    const sign = pt.value > 0 ? 1 : -1;
    const offset = 18;
    const label = pt.value.toFixed(4);
    ctx.fillText(label, s.x + snx * offset * sign, s.y + sny * offset * sign);
  }

  // Draw label
  ctx.fillStyle = '#ff6b6b';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  const labelText = `${t('influence.label')}: ${il.quantity}` +
    (il.targetNodeId !== undefined ? ` (${t('influence.node')} ${il.targetNodeId})` : '') +
    (il.targetElementId !== undefined ? ` (${t('influence.elem')} ${il.targetElementId}, t=${(il.targetPosition ?? 0.5).toFixed(1)})` : '');
  ctx.fillText(labelText, 10, 20);
}
