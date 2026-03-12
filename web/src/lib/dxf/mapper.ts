// Map parsed DXF entities to Dedaliano model structures

import type {
  DxfParseResult, DxfMappingResult, DxfUnit, DxfPoint,
  MappedNode, MappedElement, MappedSupport, MappedNodalLoad,
  MappedDistributedLoad, MappedPointLoad, MappedHinge,
} from './types';
import { unitScale } from './types';
import { searchProfiles, profileToSection } from '../data/steel-profiles';
import { t } from '../i18n';

export interface MapperOptions {
  unit: DxfUnit;
  snapTolerance: number; // meters (after conversion)
}

// ─── Layer name sets ───────────────────────────────────────────

const ELEMENT_LAYERS = new Set(['BARRAS', 'ELEMENTOS', 'ELEMENTS', 'BARS']);
const TRUSS_LAYERS = new Set(['TRUSS', 'RETICULADO', 'RETICULADOS', 'TRUSS_ELEMENTS']);
const SUPPORT_LAYER = 'APOYOS';
const LOAD_LAYER = 'CARGAS';
const SECTION_LAYER = 'SECCIONES';
const MATERIAL_LAYER = 'MATERIALES';
const HINGE_LAYER = 'ARTICULACIONES';

// ─── Main mapping function ─────────────────────────────────────

export function mapDxfToModel(
  parsed: DxfParseResult,
  options: MapperOptions,
): DxfMappingResult {
  const scale = unitScale(options.unit);
  const tol = options.snapTolerance;
  const warnings: string[] = [];

  // Detect layer convention
  const upperLayers = new Set(parsed.layers.map(l => l.toUpperCase()));
  const hasElementLayer = [...ELEMENT_LAYERS].some(l => upperLayers.has(l)) ||
    [...TRUSS_LAYERS].some(l => upperLayers.has(l));

  // ── Node pool with snap merging ──

  const nodes: MappedNode[] = [];
  function findOrAddNode(rawX: number, rawY: number): number {
    const x = rawX * scale;
    const y = rawY * scale;
    for (const n of nodes) {
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy < tol * tol) return n.id;
    }
    const id = nodes.length;
    nodes.push({ id, x, y });
    return id;
  }

  // ── Elements ──

  const elements: MappedElement[] = [];

  if (hasElementLayer) {
    for (const line of parsed.lines) {
      const isElement = ELEMENT_LAYERS.has(line.layer) || TRUSS_LAYERS.has(line.layer);
      if (!isElement) continue;
      const ni = findOrAddNode(line.start.x, line.start.y);
      const nj = findOrAddNode(line.end.x, line.end.y);
      if (ni === nj) { warnings.push(t('dxf.warnZeroLengthLine')); continue; }
      const type = TRUSS_LAYERS.has(line.layer) ? 'truss' as const : 'frame' as const;
      elements.push({ nodeI: ni, nodeJ: nj, type });
    }
  } else {
    // Fallback: treat all lines as frame elements
    if (parsed.lines.length > 0) {
      warnings.push(t('dxf.warnNoElementLayers'));
    }
    for (const line of parsed.lines) {
      const ni = findOrAddNode(line.start.x, line.start.y);
      const nj = findOrAddNode(line.end.x, line.end.y);
      if (ni === nj) continue;
      elements.push({ nodeI: ni, nodeJ: nj, type: 'frame' });
    }
  }

  // ── Supports ──

  const supports: MappedSupport[] = [];
  const supportTexts = parsed.texts.filter(t => t.layer === SUPPORT_LAYER);
  const supportInserts = parsed.inserts.filter(i => i.layer === SUPPORT_LAYER);

  for (const st of supportTexts) {
    const nodeId = findNearestNode(st.position, nodes, scale, tol);
    if (nodeId < 0) { warnings.push(`${t('dxf.warnSupportNoNode')} "${st.value}"`); continue; }
    supports.push({ nodeId, type: parseSupportType(st.value) });
  }

  for (const si of supportInserts) {
    const nodeId = findNearestNode(si.position, nodes, scale, tol);
    if (nodeId < 0) { warnings.push(`${t('dxf.warnSupportBlockNoNode')} "${si.blockName}"`); continue; }
    supports.push({ nodeId, type: parseSupportType(si.blockName) });
  }

  // ── Loads ──

  const nodalLoads: MappedNodalLoad[] = [];
  const distributedLoads: MappedDistributedLoad[] = [];
  const pointLoads: MappedPointLoad[] = [];

  const loadTexts = parsed.texts.filter(t => t.layer === LOAD_LAYER);
  for (const lt of loadTexts) {
    const val = lt.value.trim();
    const qMatch = val.match(/[Qq]\s*=\s*([-+]?\d*\.?\d+)/);
    const pMatch = val.match(/[Pp]\s*=\s*([-+]?\d*\.?\d+)/);
    const fxMatch = val.match(/[Ff][Xx]\s*=\s*([-+]?\d*\.?\d+)/i);
    const fyMatch = val.match(/[Ff][Yy]\s*=\s*([-+]?\d*\.?\d+)/i);
    const mMatch = val.match(/[Mm]\s*=\s*([-+]?\d*\.?\d+)/);
    let matched = false;

    if (qMatch) {
      const idx = findNearestElement(lt.position, elements, nodes, scale);
      if (idx >= 0) {
        distributedLoads.push({ elementIndex: idx, q: parseFloat(qMatch[1]) });
        matched = true;
      } else {
        warnings.push(`${t('dxf.warnDistLoadNoElement')} q=${qMatch[1]}`);
      }
    }

    if (pMatch && !qMatch) {
      const result = findNearestElementWithProjection(lt.position, elements, nodes, scale);
      if (result) {
        pointLoads.push({ elementIndex: result.elemIdx, a: result.a, p: parseFloat(pMatch[1]) });
        matched = true;
      } else {
        // Try as nodal vertical load
        const nodeId = findNearestNode(lt.position, nodes, scale, tol * 10);
        if (nodeId >= 0) {
          nodalLoads.push({ nodeId, fx: 0, fy: parseFloat(pMatch[1]), mz: 0 });
          matched = true;
        } else {
          warnings.push(`${t('dxf.warnPointLoadNoElement')} P=${pMatch[1]}`);
        }
      }
    }

    if (fxMatch || fyMatch || mMatch) {
      const nodeId = findNearestNode(lt.position, nodes, scale, tol * 10);
      if (nodeId >= 0) {
        nodalLoads.push({
          nodeId,
          fx: fxMatch ? parseFloat(fxMatch[1]) : 0,
          fy: fyMatch ? parseFloat(fyMatch[1]) : 0,
          mz: mMatch ? parseFloat(mMatch[1]) : 0,
        });
        matched = true;
      } else {
        warnings.push(`${t('dxf.warnNodalLoadNoNode')} "${val}"`);
      }
    }

    if (!matched && !qMatch && !pMatch && !fxMatch && !fyMatch && !mMatch) {
      warnings.push(`${t('dxf.warnUnrecognizedLoadText')} "${val}"`);
    }
  }

  // ── Hinges ──

  const hinges: MappedHinge[] = [];
  const hingePoints = parsed.points.filter(p => p.layer === HINGE_LAYER);
  const hingeCircles = parsed.circles.filter(c => c.layer === HINGE_LAYER);

  for (const hp of hingePoints) {
    const h = findHingeEnd(hp.position, elements, nodes, scale, tol);
    if (h) hinges.push(h);
  }
  for (const hc of hingeCircles) {
    const h = findHingeEnd(hc.center, elements, nodes, scale, tol);
    if (h) hinges.push(h);
  }

  // ── Section ──

  let sectionName: string | null = null;
  const sectionTexts = parsed.texts.filter(t => t.layer === SECTION_LAYER);
  if (sectionTexts.length > 0) {
    sectionName = sectionTexts[0].value.trim();
  }

  // ── Material ──

  let materialName: string | null = null;
  const materialTexts = parsed.texts.filter(t => t.layer === MATERIAL_LAYER);
  if (materialTexts.length > 0) {
    materialName = materialTexts[0].value.trim();
  }

  return {
    nodes, elements, supports, nodalLoads, distributedLoads,
    pointLoads, hinges, sectionName, materialName, warnings,
  };
}

// ─── Section text parsing ──────────────────────────────────────

export function parseSectionText(text: string): { name: string; a: number; iz: number; b?: number; h?: number } | null {
  const trimmed = text.trim();

  // Try steel profile lookup: "IPE 300", "HEB200", etc.
  const profiles = searchProfiles(trimmed.replace(/\s+/g, ' '));
  if (profiles.length > 0) {
    const sec = profileToSection(profiles[0]);
    return { name: profiles[0].name, ...sec };
  }

  // Try rectangular "BxH" in cm: "30x50" → 0.30 × 0.50
  const rectMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (rectMatch) {
    const b = parseFloat(rectMatch[1]) / 100; // cm → m
    const h = parseFloat(rectMatch[2]) / 100;
    return {
      name: `${rectMatch[1]}x${rectMatch[2]}`,
      a: b * h,
      iz: (b * h * h * h) / 12,
      b, h,
    };
  }

  // Try circular "ØD" in cm: "Ø20" → diameter 0.20m
  const circMatch = trimmed.match(/[Øø∅]?\s*(\d+(?:\.\d+)?)/);
  if (circMatch && (trimmed.includes('Ø') || trimmed.includes('ø') || trimmed.includes('∅'))) {
    const d = parseFloat(circMatch[1]) / 100; // cm → m
    const r = d / 2;
    return {
      name: `Ø${circMatch[1]}`,
      a: Math.PI * r * r,
      iz: (Math.PI * r * r * r * r) / 4,
    };
  }

  return null;
}

export function parseMaterialText(text: string): { name: string; e: number; nu: number; rho: number; fy?: number } | null {
  const txt = text.trim().toUpperCase();

  if (txt.includes('HA') || txt.includes('HORMIG') || txt.includes('CONCRET')) {
    return { name: t('dxf.materialConcrete'), e: 30000, nu: 0.2, rho: 25 };
  }
  if (txt.includes('ACERO') || txt.includes('STEEL') || txt.includes('A36')) {
    return { name: t('dxf.materialSteelA36'), e: 200000, nu: 0.3, rho: 78.5, fy: 250 };
  }
  if (txt.includes('MADERA') || txt.includes('WOOD')) {
    return { name: t('dxf.materialWood'), e: 12000, nu: 0.3, rho: 6 };
  }

  // Try explicit E=X (MPa)
  const eMatch = text.match(/[Ee]\s*=\s*(\d+(?:\.\d+)?)/);
  if (eMatch) {
    return { name: `E=${eMatch[1]} MPa`, e: parseFloat(eMatch[1]), nu: 0.3, rho: 78.5 };
  }

  return null;
}

// ─── Helpers ───────────────────────────────────────────────────

function parseSupportType(text: string): MappedSupport['type'] {
  const txt = text.toUpperCase();
  if (txt.includes('EMPOT') || txt.includes('FIXED') || txt === 'E') return 'fixed';
  if (txt.includes('MOVIL') || txt.includes('ROLLER')) {
    return txt.includes('Y') ? 'rollerY' : 'rollerX';
  }
  if (txt === 'R' || txt === 'RX') return 'rollerX';
  if (txt === 'RY') return 'rollerY';
  // Default: pinned
  return 'pinned';
}

function findNearestNode(pos: DxfPoint, nodes: MappedNode[], scale: number, tolerance: number): number {
  const px = pos.x * scale;
  const py = pos.y * scale;
  let bestDist = tolerance * 10; // wider search for labels
  let bestId = -1;
  for (const n of nodes) {
    const dx = n.x - px;
    const dy = n.y - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) { bestDist = d; bestId = n.id; }
  }
  return bestId;
}

function findNearestElement(
  pos: DxfPoint,
  elements: MappedElement[],
  nodes: MappedNode[],
  scale: number,
): number {
  const px = pos.x * scale;
  const py = pos.y * scale;
  let bestDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < elements.length; i++) {
    const ni = nodes[elements[i].nodeI];
    const nj = nodes[elements[i].nodeJ];
    const d = pointToSegmentDist(px, py, ni.x, ni.y, nj.x, nj.y);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }

  return bestIdx;
}

function findNearestElementWithProjection(
  pos: DxfPoint,
  elements: MappedElement[],
  nodes: MappedNode[],
  scale: number,
): { elemIdx: number; a: number } | null {
  const px = pos.x * scale;
  const py = pos.y * scale;
  let bestDist = Infinity;
  let bestIdx = -1;
  let bestA = 0;

  for (let i = 0; i < elements.length; i++) {
    const ni = nodes[elements[i].nodeI];
    const nj = nodes[elements[i].nodeJ];
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) continue;
    let t = ((px - ni.x) * dx + (py - ni.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = ni.x + t * dx;
    const cy = ni.y + t * dy;
    const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      bestA = t * Math.sqrt(L2);
    }
  }

  return bestIdx >= 0 ? { elemIdx: bestIdx, a: bestA } : null;
}

function findHingeEnd(
  pos: DxfPoint,
  elements: MappedElement[],
  nodes: MappedNode[],
  scale: number,
  tolerance: number,
): MappedHinge | null {
  const px = pos.x * scale;
  const py = pos.y * scale;
  let bestDist = tolerance * 5;
  let bestHinge: MappedHinge | null = null;

  for (let i = 0; i < elements.length; i++) {
    const ni = nodes[elements[i].nodeI];
    const nj = nodes[elements[i].nodeJ];
    const diI = Math.sqrt((px - ni.x) ** 2 + (py - ni.y) ** 2);
    const diJ = Math.sqrt((px - nj.x) ** 2 + (py - nj.y) ** 2);
    if (diI < bestDist) { bestDist = diI; bestHinge = { elementIndex: i, end: 'start' }; }
    if (diJ < bestDist) { bestDist = diJ; bestHinge = { elementIndex: i, end: 'end' }; }
  }

  return bestHinge;
}

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
