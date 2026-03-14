// 2D Example structures for Dedaliano
import type { LoadCaseType, LoadCase, LoadCombination, Material, Section, SupportType } from './model.svelte';
import { uiStore } from './index';
import { t } from '../i18n';

/** API surface that example loaders need from the model store */
export interface ExampleAPI {
  addNode(x: number, y: number, z?: number): number;
  addElement(nI: number, nJ: number, type?: 'frame' | 'truss'): number;
  addSupport(nodeId: number, type: SupportType, springK?: { kx?: number; ky?: number; kz?: number }, opts?: { angle?: number }): number;
  updateSupport(id: number, data: Record<string, unknown>): void;
  addMaterial(data: Omit<Material, 'id'>): number;
  addSection(data: Omit<Section, 'id'>): number;
  updateElementMaterial(elemId: number, matId: number): void;
  updateElementSection(elemId: number, secId: number): void;
  addDistributedLoad(elemId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number): number;
  addNodalLoad(nodeId: number, fx: number, fy: number, mz?: number, caseId?: number): number;
  addPointLoadOnElement(elementId: number, a: number, p: number, opts?: { px?: number; mz?: number; angle?: number; isGlobal?: boolean; caseId?: number }): number;
  addThermalLoad(elemId: number, dtUniform: number, dtGradient: number): number;
  toggleHinge(elemId: number, end: 'start' | 'end'): void;
  model: { name: string; loadCases: LoadCase[]; combinations: LoadCombination[] };
  nextId: { loadCase: number; combination: number };
}

/** Load a 2D example by name. Returns true if the example was found. */
export function load2DExample(name: string, api: ExampleAPI): boolean {
  switch (name) {
    case 'simply-supported': {
      api.model.name = t('ex.simply-supported');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(6, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addDistributedLoad(e1, -10);
      break;
    }
    case 'cantilever': {
      api.model.name = t('ex.cantilever');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(5, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'fixed', undefined, { angle: 90 });
      api.addDistributedLoad(e1, -10);
      break;
    }
    case 'portal-frame': {
      api.model.name = t('ex.portal-frame');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      // Secciones de hormigón
      const secCol = api.addSection({ name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.30, h: 0.30, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 20×50', a: 0.10, iz: 0.000333, iy: 0.002083, b: 0.20, h: 0.50, shape: 'rect' });
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 4);
      const n3 = api.addNode(6, 4);
      const n4 = api.addNode(6, 0);
      const c1 = api.addElement(n1, n2); // columna izq
      const beam = api.addElement(n2, n3); // viga
      const c2 = api.addElement(n4, n3); // columna der
      api.updateElementMaterial(c1, matHA); api.updateElementSection(c1, secCol);
      api.updateElementMaterial(beam, matHA); api.updateElementSection(beam, secViga);
      api.updateElementMaterial(c2, matHA); api.updateElementSection(c2, secCol);
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      api.addDistributedLoad(beam, -15);
      api.addNodalLoad(n2, 10, 0); // lateral load
      break;
    }
    case 'continuous-beam': {
      api.model.name = t('ex.continuous-beam');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(4, 0);
      const n3 = api.addNode(8, 0);
      const n4 = api.addNode(12, 0);
      const e1 = api.addElement(n1, n2);
      const e2 = api.addElement(n2, n3);
      const e3 = api.addElement(n3, n4);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addSupport(n3, 'rollerX');
      api.addSupport(n4, 'rollerX');
      api.addDistributedLoad(e1, -10);
      api.addDistributedLoad(e2, -15);
      api.addDistributedLoad(e3, -10);
      break;
    }
    case 'truss': {
      api.model.name = t('ex.truss');
      // Bottom chord
      const b1 = api.addNode(0, 0);
      const b2 = api.addNode(3, 0);
      const b3 = api.addNode(6, 0);
      const b4 = api.addNode(9, 0);
      const b5 = api.addNode(12, 0);
      // Top chord
      const t2 = api.addNode(3, 3);
      const t3 = api.addNode(6, 3);
      const t4 = api.addNode(9, 3);
      // Bottom chord elements
      api.addElement(b1, b2, 'truss');
      api.addElement(b2, b3, 'truss');
      api.addElement(b3, b4, 'truss');
      api.addElement(b4, b5, 'truss');
      // Top chord elements
      api.addElement(t2, t3, 'truss');
      api.addElement(t3, t4, 'truss');
      // Verticals
      api.addElement(b2, t2, 'truss');
      api.addElement(b3, t3, 'truss');
      api.addElement(b4, t4, 'truss');
      // Diagonals
      api.addElement(b1, t2, 'truss');
      api.addElement(t2, b3, 'truss');
      api.addElement(b3, t4, 'truss');
      api.addElement(t4, b5, 'truss');
      // Supports
      api.addSupport(b1, 'pinned');
      api.addSupport(b5, 'rollerX');
      // Loads at top chord joints
      api.addNodalLoad(t2, 0, -20);
      api.addNodalLoad(t3, 0, -30);
      api.addNodalLoad(t4, 0, -20);
      // Fix para 3D: agregar restricción Z en un nodo del cordón superior
      if (uiStore.analysisMode === '3d') {
        api.addSupport(t2, 'rollerXY');
      }
      break;
    }
    case 'two-story-frame': {
      api.model.name = t('ex.two-story-frame');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.30, h: 0.30, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 20×50', a: 0.10, iz: 0.000333, iy: 0.002083, b: 0.20, h: 0.50, shape: 'rect' });
      // Nodes
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 3.5);
      const n3 = api.addNode(0, 7);
      const n4 = api.addNode(6, 0);
      const n5 = api.addNode(6, 3.5);
      const n6 = api.addNode(6, 7);
      // Columns
      const c1 = api.addElement(n1, n2);
      const c2 = api.addElement(n2, n3);
      const c3 = api.addElement(n4, n5);
      const c4 = api.addElement(n5, n6);
      [c1, c2, c3, c4].forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      // Beams
      const beam1 = api.addElement(n2, n5);
      const beam2 = api.addElement(n3, n6);
      [beam1, beam2].forEach(v => { api.updateElementMaterial(v, matHA); api.updateElementSection(v, secViga); });
      // Supports
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      // Loads
      api.addDistributedLoad(beam1, -12);
      api.addDistributedLoad(beam2, -10);
      api.addNodalLoad(n2, 8, 0); // wind 1st floor
      api.addNodalLoad(n3, 5, 0); // wind 2nd floor
      break;
    }
    case 'spring-support': {
      api.model.name = t('ex.spring-support');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(3, 0);
      const n3 = api.addNode(6, 0);
      const e1 = api.addElement(n1, n2);
      const e2 = api.addElement(n2, n3);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'spring', { kx: 0, ky: 5000, kz: 0 });
      api.addSupport(n3, 'rollerX');
      api.addDistributedLoad(e1, -20);
      api.addDistributedLoad(e2, -10);
      break;
    }
    case 'point-loads': {
      api.model.name = t('ex.point-loads');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(8, 0);
      const e1 = api.addElement(n1, n2);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addPointLoadOnElement(e1, 2, -25);
      api.addPointLoadOnElement(e1, 5, -40);
      api.addNodalLoad(n2, 10, 0);
      break;
    }
    case 'thermal': {
      api.model.name = t('ex.thermal');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.30, h: 0.30, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 20×50', a: 0.10, iz: 0.000333, iy: 0.002083, b: 0.20, h: 0.50, shape: 'rect' });
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 4);
      const n3 = api.addNode(5, 4);
      const n4 = api.addNode(5, 0);
      const c1 = api.addElement(n1, n2);
      const beam = api.addElement(n2, n3);
      const c2 = api.addElement(n4, n3);
      [c1, c2].forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      api.updateElementMaterial(beam, matHA); api.updateElementSection(beam, secViga);
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'pinned');
      api.addThermalLoad(beam, 30, 10); // ΔT=30°C uniform, ΔTg=10°C gradient
      break;
    }
    case 'settlement': {
      api.model.name = t('ex.settlement');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(4, 0);
      const n3 = api.addNode(8, 0);
      api.addElement(n1, n2);
      api.addElement(n2, n3);
      api.addSupport(n1, 'fixed', undefined, { angle: 90 });
      const s2 = api.addSupport(n2, 'rollerX');
      api.updateSupport(s2, { dy: -0.01 }); // 10mm downward settlement
      api.addSupport(n3, 'rollerX');
      break;
    }
    case 'cantilever-point': {
      api.model.name = t('ex.cantilever-point');
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(3, 0);
      api.addElement(n1, n2);
      api.addSupport(n1, 'fixed', undefined, { angle: 90 });
      api.addNodalLoad(n2, 0, -15);
      break;
    }
    case 'gerber-beam': {
      api.model.name = t('ex.gerber-beam');
      // Two main spans with overhang, connected by a hinged link
      // Span 1: fixed at 0, roller at 5, overhang to 6.5
      // Link: 6.5 to 7.5 (hinges at both ends → only shear transfer)
      // Span 2: overhang from 7.5, roller at 9, fixed at 14
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(5, 0);
      const n3 = api.addNode(6.5, 0);
      const n4 = api.addNode(7.5, 0);
      const n5 = api.addNode(9, 0);
      const n6 = api.addNode(14, 0);
      // Span 1
      const e1 = api.addElement(n1, n2);
      const e2 = api.addElement(n2, n3);
      // Hinged link (hinges at both ends)
      const eLink = api.addElement(n3, n4);
      api.toggleHinge(eLink, 'start');
      api.toggleHinge(eLink, 'end');
      // Span 2
      const e4 = api.addElement(n4, n5);
      const e5 = api.addElement(n5, n6);
      // Supports
      api.addSupport(n1, 'fixed', undefined, { angle: 90 });
      api.addSupport(n2, 'rollerX');
      api.addSupport(n5, 'rollerX');
      api.addSupport(n6, 'fixed', undefined, { angle: 270 });
      // Uniform load on all spans
      api.addDistributedLoad(e1, -10);
      api.addDistributedLoad(e2, -10);
      api.addDistributedLoad(eLink, -10);
      api.addDistributedLoad(e4, -10);
      api.addDistributedLoad(e5, -10);
      break;
    }
    case 'multi-section-frame': {
      api.model.name = t('ex.portal-frame');
      // Columnas: HEB 300 (sección robusta)
      const secCol = api.addSection({ name: 'HEB 300', a: 0.01491, iz: 0.00008563, iy: 0.0002517, b: 0.30, h: 0.30, shape: 'H' });
      // Vigas: IPN 300 (default sec 1)
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 4);
      const n3 = api.addNode(6, 4);
      const n4 = api.addNode(6, 0);
      const n5 = api.addNode(0, 8);
      const n6 = api.addNode(6, 8);
      // Columns (HEB 300)
      const c1 = api.addElement(n1, n2);
      const c2 = api.addElement(n4, n3);
      const c3 = api.addElement(n2, n5);
      const c4 = api.addElement(n3, n6);
      [c1, c2, c3, c4].forEach(c => api.updateElementSection(c, secCol));
      // Beams (IPN 300 — default sec 1)
      const b1 = api.addElement(n2, n3);
      const b2 = api.addElement(n5, n6);
      // Supports
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      // Loads
      api.addDistributedLoad(b1, -25);
      api.addDistributedLoad(b2, -18);
      api.addNodalLoad(n2, 15, 0);
      api.addNodalLoad(n5, 10, 0);
      break;
    }
    case 'warren-truss': {
      api.model.name = t('ex.warren-truss');
      // 12m span, 3m height, 4 panels
      const b1 = api.addNode(0, 0);
      const b2 = api.addNode(3, 0);
      const b3 = api.addNode(6, 0);
      const b4 = api.addNode(9, 0);
      const b5 = api.addNode(12, 0);
      const t1 = api.addNode(1.5, 3);
      const t2 = api.addNode(4.5, 3);
      const t3 = api.addNode(7.5, 3);
      const t4 = api.addNode(10.5, 3);
      // Bottom chord
      api.addElement(b1, b2, 'truss');
      api.addElement(b2, b3, 'truss');
      api.addElement(b3, b4, 'truss');
      api.addElement(b4, b5, 'truss');
      // Top chord
      api.addElement(t1, t2, 'truss');
      api.addElement(t2, t3, 'truss');
      api.addElement(t3, t4, 'truss');
      // Diagonals (alternating up/down = Warren pattern)
      api.addElement(b1, t1, 'truss');
      api.addElement(t1, b2, 'truss');
      api.addElement(b2, t2, 'truss');
      api.addElement(t2, b3, 'truss');
      api.addElement(b3, t3, 'truss');
      api.addElement(t3, b4, 'truss');
      api.addElement(b4, t4, 'truss');
      api.addElement(t4, b5, 'truss');
      // Supports
      api.addSupport(b1, 'pinned');
      api.addSupport(b5, 'rollerX');
      // Loads at top chord
      api.addNodalLoad(t1, 0, -15);
      api.addNodalLoad(t2, 0, -25);
      api.addNodalLoad(t3, 0, -25);
      api.addNodalLoad(t4, 0, -15);
      // Fix para 3D: agregar restricción Z en un nodo del cordón superior
      if (uiStore.analysisMode === '3d') {
        api.addSupport(t1, 'rollerXY');
      }
      break;
    }
    case 'howe-truss': {
      api.model.name = t('ex.howe-truss');
      // 16m span, 4m height, 4 panels
      const b1 = api.addNode(0, 0);
      const b2 = api.addNode(4, 0);
      const b3 = api.addNode(8, 0);
      const b4 = api.addNode(12, 0);
      const b5 = api.addNode(16, 0);
      const t1 = api.addNode(0, 4);
      const t2 = api.addNode(4, 4);
      const t3 = api.addNode(8, 4);
      const t4 = api.addNode(12, 4);
      const t5 = api.addNode(16, 4);
      // Bottom chord
      api.addElement(b1, b2, 'truss');
      api.addElement(b2, b3, 'truss');
      api.addElement(b3, b4, 'truss');
      api.addElement(b4, b5, 'truss');
      // Top chord
      api.addElement(t1, t2, 'truss');
      api.addElement(t2, t3, 'truss');
      api.addElement(t3, t4, 'truss');
      api.addElement(t4, t5, 'truss');
      // Verticals
      api.addElement(b1, t1, 'truss');
      api.addElement(b2, t2, 'truss');
      api.addElement(b3, t3, 'truss');
      api.addElement(b4, t4, 'truss');
      api.addElement(b5, t5, 'truss');
      // Diagonals (Howe: diags point toward center from top)
      api.addElement(t1, b2, 'truss');
      api.addElement(t2, b3, 'truss');
      api.addElement(t5, b4, 'truss');
      api.addElement(t4, b3, 'truss');
      // Supports
      api.addSupport(b1, 'pinned');
      api.addSupport(b5, 'rollerX');
      // Loads at bottom chord joints
      api.addNodalLoad(b2, 0, -20);
      api.addNodalLoad(b3, 0, -30);
      api.addNodalLoad(b4, 0, -20);
      // Fix para 3D: agregar restricción Z en un nodo del cordón superior
      if (uiStore.analysisMode === '3d') {
        api.addSupport(t2, 'rollerXY');
      }
      break;
    }
    case 'three-hinge-arch': {
      api.model.name = t('ex.three-hinge-arch');
      // Parabolic arch: 10m span, 4m rise, approximated with segments
      const pts: [number, number][] = [];
      const nSeg = 8;
      for (let i = 0; i <= nSeg; i++) {
        const x = (i / nSeg) * 10;
        const y = 4 * (1 - ((x - 5) / 5) ** 2); // parabola: y = 4*(1 - ((x-5)/5)²)
        pts.push([x, y]);
      }
      const nodes = pts.map(([x, y]) => api.addNode(x, y));
      // Create elements — frame type so they carry moment
      const midIdx = nSeg / 2; // index 4 = crown
      for (let i = 0; i < nSeg; i++) {
        const eid = api.addElement(nodes[i], nodes[i + 1]);
        // Hinges at crown (right end of left half, left end of right half)
        if (i === midIdx - 1) api.toggleHinge(eid, 'end');
        if (i === midIdx) api.toggleHinge(eid, 'start');
      }
      // Supports: pinned at both ends
      api.addSupport(nodes[0], 'pinned');
      api.addSupport(nodes[nSeg], 'pinned');
      // Uniform vertical load on top
      for (let i = 1; i < nSeg; i++) {
        api.addNodalLoad(nodes[i], 0, -10);
      }
      break;
    }
    case 'color-map-demo': {
      api.model.name = t('ex.continuous-beam');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 35×35', a: 0.1225, iz: 0.001251, iy: 0.001251, b: 0.35, h: 0.35, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 25×55', a: 0.1375, iz: 0.000716, iy: 0.003466, b: 0.25, h: 0.55, shape: 'rect' });
      // 3-bay 2-story frame with varied loading → shows gradient nicely
      // Ground floor columns
      const g1 = api.addNode(0, 0);
      const g2 = api.addNode(5, 0);
      const g3 = api.addNode(11, 0);
      const g4 = api.addNode(16, 0);
      // First floor
      const f1 = api.addNode(0, 4);
      const f2 = api.addNode(5, 4);
      const f3 = api.addNode(11, 4);
      const f4 = api.addNode(16, 4);
      // Second floor
      const r1 = api.addNode(0, 7.5);
      const r2 = api.addNode(5, 7.5);
      const r3 = api.addNode(11, 7.5);
      const r4 = api.addNode(16, 7.5);
      // Ground floor columns
      const cols = [
        api.addElement(g1, f1), api.addElement(g2, f2),
        api.addElement(g3, f3), api.addElement(g4, f4),
      ];
      // First floor beams
      const b1 = api.addElement(f1, f2);
      const b2 = api.addElement(f2, f3);
      const b3 = api.addElement(f3, f4);
      // Upper columns
      cols.push(
        api.addElement(f1, r1), api.addElement(f2, r2),
        api.addElement(f3, r3), api.addElement(f4, r4),
      );
      // Roof beams
      const rb1 = api.addElement(r1, r2);
      const rb2 = api.addElement(r2, r3);
      const rb3 = api.addElement(r3, r4);
      // Assign materials and sections
      cols.forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      [b1, b2, b3, rb1, rb2, rb3].forEach(v => { api.updateElementMaterial(v, matHA); api.updateElementSection(v, secViga); });
      // Supports
      api.addSupport(g1, 'fixed');
      api.addSupport(g2, 'fixed');
      api.addSupport(g3, 'fixed');
      api.addSupport(g4, 'fixed');
      // Varied loading for interesting color gradients
      api.addDistributedLoad(b1, -15);        // heavy load left bay
      api.addDistributedLoad(b2, -25);         // heavier center bay
      api.addDistributedLoad(b3, -10);         // lighter right bay
      api.addDistributedLoad(rb1, -8);          // roof loads
      api.addDistributedLoad(rb2, -12);
      api.addDistributedLoad(rb3, -5);
      api.addNodalLoad(f1, 20, 0);             // lateral wind
      api.addNodalLoad(r1, 15, 0);
      break;
    }
    case 'bridge-moving-load': {
      api.model.name = t('ex.bridge-moving-load');
      // Viga continua 3 tramos: 4m + 6m + 4m = 14m
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(4, 0);
      const n3 = api.addNode(10, 0);
      const n4 = api.addNode(14, 0);
      const e1 = api.addElement(n1, n2);
      const e2 = api.addElement(n2, n3);
      const e3 = api.addElement(n3, n4);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      api.addSupport(n3, 'rollerX');
      api.addSupport(n4, 'rollerX');
      // Peso propio ligero
      api.addDistributedLoad(e1, -3);
      api.addDistributedLoad(e2, -3);
      api.addDistributedLoad(e3, -3);
      break;
    }
    case 'bridge-highway': {
      api.model.name = t('ex.bridge-moving-load');
      // Material: Hormigón H-30
      const matHA = api.addMaterial({ name: 'H.A. H-30', e: 32000, nu: 0.2, rho: 25 });
      // Viga de puente: sección rectangular 40×80 cm
      const secPuente = api.addSection({ name: 'H.A. 40×80', a: 0.32, iz: 0.004267, iy: 0.01707, b: 0.40, h: 0.80, shape: 'rect' });
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(10, 0);
      const e1 = api.addElement(n1, n2);
      api.updateElementMaterial(e1, matHA);
      api.updateElementSection(e1, secPuente);
      api.addSupport(n1, 'pinned');
      api.addSupport(n2, 'rollerX');
      // Carga muerta distribuida (peso propio + pavimento)
      api.addDistributedLoad(e1, -5);
      break;
    }
    case 'frame-cirsoc-dl': {
      api.model.name = t('ex.frame-cirsoc-dl');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 30×30', a: 0.09, iz: 0.000675, iy: 0.000675, b: 0.30, h: 0.30, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 20×50', a: 0.10, iz: 0.000333, iy: 0.002083, b: 0.20, h: 0.50, shape: 'rect' });
      // Pórtico 1 piso, 1 vano: 6m × 4m
      const n1 = api.addNode(0, 0);
      const n2 = api.addNode(0, 4);
      const n3 = api.addNode(6, 4);
      const n4 = api.addNode(6, 0);
      const c1 = api.addElement(n1, n2); // columna izq
      const beam = api.addElement(n2, n3); // viga
      const c2 = api.addElement(n4, n3); // columna der
      [c1, c2].forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      api.updateElementMaterial(beam, matHA); api.updateElementSection(beam, secViga);
      api.addSupport(n1, 'fixed');
      api.addSupport(n4, 'fixed');
      // Casos de carga
      api.model.loadCases = [{ id: 1, type: 'D' as LoadCaseType, name: 'Dead Load' }, { id: 2, type: 'L' as LoadCaseType, name: 'Live Load' }];
      // D: q = -8 kN/m en viga
      api.addDistributedLoad(beam, -8, undefined, undefined, undefined, 1);
      // L: q = -5 kN/m en viga
      api.addDistributedLoad(beam, -5, undefined, undefined, undefined, 2);
      // Combinaciones CIRSOC 101
      api.model.combinations = [
        { id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
        { id: 2, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 3, name: '0.9D', factors: [{ caseId: 1, factor: 0.9 }] },
      ];
      api.nextId.loadCase = 3;
      api.nextId.combination = 4;
      break;
    }
    case 'building-3story-dlw': {
      api.model.name = t('ex.building-3story-dlw');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 35×35', a: 0.1225, iz: 0.001251, iy: 0.001251, b: 0.35, h: 0.35, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 25×55', a: 0.1375, iz: 0.000716, iy: 0.003466, b: 0.25, h: 0.55, shape: 'rect' });
      // Pórtico 1 vano × 3 pisos: 6m ancho, 3.5m por piso
      const n1 = api.addNode(0, 0);    // base izq
      const n2 = api.addNode(6, 0);    // base der
      const n3 = api.addNode(0, 3.5);  // piso 1 izq
      const n4 = api.addNode(6, 3.5);  // piso 1 der
      const n5 = api.addNode(0, 7);    // piso 2 izq
      const n6 = api.addNode(6, 7);    // piso 2 der
      const n7 = api.addNode(0, 10.5); // piso 3 izq
      const n8 = api.addNode(6, 10.5); // piso 3 der
      // Columnas
      const cols = [
        api.addElement(n1, n3), api.addElement(n2, n4),
        api.addElement(n3, n5), api.addElement(n4, n6),
        api.addElement(n5, n7), api.addElement(n6, n8),
      ];
      cols.forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      // Vigas
      const v1 = api.addElement(n3, n4);
      const v2 = api.addElement(n5, n6);
      const v3 = api.addElement(n7, n8);
      [v1, v2, v3].forEach(v => { api.updateElementMaterial(v, matHA); api.updateElementSection(v, secViga); });
      // Apoyos
      api.addSupport(n1, 'fixed');
      api.addSupport(n2, 'fixed');
      // Casos de carga
      api.model.loadCases = [{ id: 1, type: 'D' as LoadCaseType, name: 'Dead Load' }, { id: 2, type: 'L' as LoadCaseType, name: 'Live Load' }, { id: 3, type: 'W' as LoadCaseType, name: 'Wind' }];
      // D: cargas distribuidas en vigas
      api.addDistributedLoad(v1, -12, undefined, undefined, undefined, 1);
      api.addDistributedLoad(v2, -12, undefined, undefined, undefined, 1);
      api.addDistributedLoad(v3, -10, undefined, undefined, undefined, 1);
      // L: cargas vivas menores
      api.addDistributedLoad(v1, -5, undefined, undefined, undefined, 2);
      api.addDistributedLoad(v2, -5, undefined, undefined, undefined, 2);
      api.addDistributedLoad(v3, -3, undefined, undefined, undefined, 2);
      // W: viento lateral
      api.addNodalLoad(n3, 8, 0, 0, 3);
      api.addNodalLoad(n5, 12, 0, 0, 3);
      api.addNodalLoad(n7, 6, 0, 0, 3);
      // Combinaciones CIRSOC
      api.model.combinations = [
        { id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
        { id: 2, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
        { id: 4, name: '0.9D + 1.6W', factors: [{ caseId: 1, factor: 0.9 }, { caseId: 3, factor: 1.6 }] },
      ];
      api.nextId.loadCase = 4;
      api.nextId.combination = 5;
      break;
    }
    case 'frame-seismic': {
      api.model.name = t('ex.frame-seismic');
      // Material: Hormigón H-25
      const matHA = api.addMaterial({ name: 'H.A. H-25', e: 30000, nu: 0.2, rho: 25 });
      const secCol = api.addSection({ name: 'H.A. 35×35', a: 0.1225, iz: 0.001251, iy: 0.001251, b: 0.35, h: 0.35, shape: 'rect' });
      const secViga = api.addSection({ name: 'H.A. 25×55', a: 0.1375, iz: 0.000716, iy: 0.003466, b: 0.25, h: 0.55, shape: 'rect' });
      // Pórtico 1 vano × 2 pisos: 5m ancho, 3.5m por piso
      const n1 = api.addNode(0, 0);    // base izq
      const n2 = api.addNode(5, 0);    // base der
      const n3 = api.addNode(0, 3.5);  // piso 1 izq
      const n4 = api.addNode(5, 3.5);  // piso 1 der
      const n5 = api.addNode(0, 7);    // piso 2 izq
      const n6 = api.addNode(5, 7);    // piso 2 der
      // Columnas
      const cols = [
        api.addElement(n1, n3), api.addElement(n2, n4),
        api.addElement(n3, n5), api.addElement(n4, n6),
      ];
      cols.forEach(c => { api.updateElementMaterial(c, matHA); api.updateElementSection(c, secCol); });
      // Vigas
      const v1 = api.addElement(n3, n4);
      const v2 = api.addElement(n5, n6);
      [v1, v2].forEach(v => { api.updateElementMaterial(v, matHA); api.updateElementSection(v, secViga); });
      // Apoyos
      api.addSupport(n1, 'fixed');
      api.addSupport(n2, 'fixed');
      // Casos de carga
      api.model.loadCases = [{ id: 1, type: 'D' as LoadCaseType, name: 'Dead Load' }, { id: 2, type: 'L' as LoadCaseType, name: 'Live Load' }, { id: 3, type: 'E' as LoadCaseType, name: 'Earthquake' }];
      // D
      api.addDistributedLoad(v1, -15, undefined, undefined, undefined, 1);
      api.addDistributedLoad(v2, -12, undefined, undefined, undefined, 1);
      // L
      api.addDistributedLoad(v1, -5, undefined, undefined, undefined, 2);
      api.addDistributedLoad(v2, -3, undefined, undefined, undefined, 2);
      // E: fuerzas laterales sísmicas equivalentes
      api.addNodalLoad(n3, 15, 0, 0, 3);
      api.addNodalLoad(n5, 25, 0, 0, 3);
      // Combinaciones CIRSOC
      api.model.combinations = [
        { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 2, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.0 }] },
        { id: 3, name: '0.9D + E', factors: [{ caseId: 1, factor: 0.9 }, { caseId: 3, factor: 1.0 }] },
      ];
      api.nextId.loadCase = 4;
      api.nextId.combination = 4;
      break;
    }
    default:
      return false;
  }
  return true;
}
