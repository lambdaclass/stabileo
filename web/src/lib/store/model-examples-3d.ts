// 3D Example structures for Dedaliano
import type { ExampleAPI } from './model-examples-2d';
import type { LoadCaseType } from './model.svelte';
import { t } from '../i18n';

/** Extended API for 3D examples (adds 3D load methods + shells/constraints) */
export interface ExampleAPI3D extends ExampleAPI {
  addDistributedLoad3D(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number;
  addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number;
  addSurfaceLoad3D(quadId: number, q: number, caseId?: number): number;
  addPlate(nodes: [number, number, number], materialId: number, thickness: number): number;
  addQuad(nodes: [number, number, number, number], materialId: number, thickness: number): number;
  addConstraint(c: import('../engine/types-3d').Constraint3D): void;
}

/** Load a 3D example by name. Returns true if the example was found. */
export function load3DExample(name: string, api: ExampleAPI3D): boolean {
  switch (name) {
    case '3d-portal-frame': {
      api.model.name = t('ex.3d-portal-frame');
      // 2 porticos en plano XY separados 4m en Z, conectados por vigas transversales
      // Base nodes (Y=0)
      const pf1 = api.addNode(0, 0, 0);
      const pf2 = api.addNode(6, 0, 0);
      const pf3 = api.addNode(0, 0, 4);
      const pf4 = api.addNode(6, 0, 4);
      // Top nodes (Y=4)
      const pf5 = api.addNode(0, 4, 0);
      const pf6 = api.addNode(6, 4, 0);
      const pf7 = api.addNode(0, 4, 4);
      const pf8 = api.addNode(6, 4, 4);
      // Columns
      api.addElement(pf1, pf5, 'frame');
      api.addElement(pf2, pf6, 'frame');
      api.addElement(pf3, pf7, 'frame');
      api.addElement(pf4, pf8, 'frame');
      // Beams in X direction
      const pfB1 = api.addElement(pf5, pf6, 'frame');
      const pfB2 = api.addElement(pf7, pf8, 'frame');
      // Transverse beams in Z direction
      api.addElement(pf5, pf7, 'frame');
      api.addElement(pf6, pf8, 'frame');
      // Supports — fixed 3D at base
      api.addSupport(pf1, 'fixed3d');
      api.addSupport(pf2, 'fixed3d');
      api.addSupport(pf3, 'fixed3d');
      api.addSupport(pf4, 'fixed3d');
      // Distributed load on beams (gravity -> local Y, ey=(0,1,0) for horizontal bars)
      api.addDistributedLoad3D(pfB1, -10, -10, 0, 0);
      api.addDistributedLoad3D(pfB2, -10, -10, 0, 0);
      // Lateral load
      api.addNodalLoad3D(pf5, 15, 0, 5, 0, 0, 0);
      return true;
    }

    case '3d-space-truss': {
      api.model.name = t('ex.3d-space-truss');
      // Reticulado Warren espacial: cordon inferior y superior con diagonales
      // 4 tramos de 2m en X, ancho 2m en Z, altura 1.5m en Y
      const span = 2;  // largo de cada tramo
      const w = 2;     // ancho en Z
      const h = 1.5;   // altura en Y
      const nSpans = 4;

      // Cordon inferior (y=0): nodos en esquinas
      const bot: number[] = [];
      for (let i = 0; i <= nSpans; i++) {
        bot.push(api.addNode(i * span, 0, 0));
        bot.push(api.addNode(i * span, 0, w));
      }
      // bot[2*i] = lado Z=0, bot[2*i+1] = lado Z=w

      // Cordon superior (y=h): nodos desplazados medio tramo en X
      const top: number[] = [];
      for (let i = 0; i < nSpans; i++) {
        top.push(api.addNode((i + 0.5) * span, h, 0));
        top.push(api.addNode((i + 0.5) * span, h, w));
      }
      // top[2*i] = lado Z=0, top[2*i+1] = lado Z=w

      // Barras cordon inferior longitudinal
      for (let i = 0; i < nSpans; i++) {
        api.addElement(bot[2 * i], bot[2 * (i + 1)], 'truss');         // Z=0
        api.addElement(bot[2 * i + 1], bot[2 * (i + 1) + 1], 'truss'); // Z=w
      }
      // Barras cordon inferior transversal (arriostrado)
      for (let i = 0; i <= nSpans; i++) {
        api.addElement(bot[2 * i], bot[2 * i + 1], 'truss');
      }

      // Barras cordon superior longitudinal
      for (let i = 0; i < nSpans - 1; i++) {
        api.addElement(top[2 * i], top[2 * (i + 1)], 'truss');         // Z=0
        api.addElement(top[2 * i + 1], top[2 * (i + 1) + 1], 'truss'); // Z=w
      }
      // Barras cordon superior transversal
      for (let i = 0; i < nSpans; i++) {
        api.addElement(top[2 * i], top[2 * i + 1], 'truss');
      }

      // Diagonales Warren: cada nodo superior conecta con 2 nodos inferiores (V invertida)
      for (let i = 0; i < nSpans; i++) {
        // Lado Z=0
        api.addElement(bot[2 * i], top[2 * i], 'truss');
        api.addElement(bot[2 * (i + 1)], top[2 * i], 'truss');
        // Lado Z=w
        api.addElement(bot[2 * i + 1], top[2 * i + 1], 'truss');
        api.addElement(bot[2 * (i + 1) + 1], top[2 * i + 1], 'truss');
      }

      // Cruces de San Andres horizontales en cordon superior (arriostrado en planta)
      for (let i = 0; i < nSpans - 1; i++) {
        api.addElement(top[2 * i], top[2 * (i + 1) + 1], 'truss');     // Z=0 -> Z=w diagonal
        api.addElement(top[2 * i + 1], top[2 * (i + 1)], 'truss');     // Z=w -> Z=0 diagonal
      }

      // Cruces de San Andres horizontales en cordon inferior (arriostrado inferior)
      for (let i = 0; i < nSpans; i++) {
        api.addElement(bot[2 * i], bot[2 * (i + 1) + 1], 'truss');     // Z=0 -> Z=w diagonal
        api.addElement(bot[2 * i + 1], bot[2 * (i + 1)], 'truss');     // Z=w -> Z=0 diagonal
      }

      // Apoyos en las 4 esquinas inferiores
      api.addSupport(bot[0], 'pinned3d');
      api.addSupport(bot[1], 'pinned3d');
      api.addSupport(bot[2 * nSpans], 'pinned3d');
      api.addSupport(bot[2 * nSpans + 1], 'pinned3d');
      // Restricción Z en cordón superior (evita mecanismo fuera de plano)
      api.addSupport(top[0], 'rollerXY');

      // Cargas en nodos superiores
      for (let i = 0; i < nSpans; i++) {
        api.addNodalLoad3D(top[2 * i], 0, -20, 0, 0, 0, 0);
        api.addNodalLoad3D(top[2 * i + 1], 0, -20, 0, 0, 0, 0);
      }
      return true;
    }

    case '3d-cantilever-load': {
      api.model.name = t('ex.3d-cantilever-load');
      // Ménsula 3m en dirección X — barra única
      const cl1 = api.addNode(0, 0, 0);
      const cl2 = api.addNode(3, 0, 0);
      api.addElement(cl1, cl2, 'frame');
      // Fixed support at base
      api.addSupport(cl1, 'fixed3d');
      // Biaxial load at tip: Fx=-100kN, Fy=-50kN, Fz=+10kN, Mx=+5kN·m
      api.addNodalLoad3D(cl2, -100, -50, 10, 5, 0, 0);
      return true;
    }

    case '3d-grid-slab': {
      api.model.name = t('ex.gridBeams');
      // Grilla 3x3 de vigas en plano XZ a Y=0
      const gNodes: number[][] = [];
      for (let iz = 0; iz <= 3; iz++) {
        gNodes[iz] = [];
        for (let ix = 0; ix <= 3; ix++) {
          gNodes[iz][ix] = api.addNode(ix * 2, 0, iz * 2);
        }
      }
      // Beams in X direction
      for (let iz = 0; iz <= 3; iz++) {
        for (let ix = 0; ix < 3; ix++) {
          api.addElement(gNodes[iz][ix], gNodes[iz][ix + 1], 'frame');
        }
      }
      // Beams in Z direction
      for (let ix = 0; ix <= 3; ix++) {
        for (let iz = 0; iz < 3; iz++) {
          api.addElement(gNodes[iz][ix], gNodes[iz + 1][ix], 'frame');
        }
      }
      // Supports at 4 corners — pinned 3D
      api.addSupport(gNodes[0][0], 'pinned3d');
      api.addSupport(gNodes[0][3], 'pinned3d');
      api.addSupport(gNodes[3][0], 'pinned3d');
      api.addSupport(gNodes[3][3], 'pinned3d');
      // Loads at interior nodes
      api.addNodalLoad3D(gNodes[1][1], 0, -20, 0, 0, 0, 0);
      api.addNodalLoad3D(gNodes[1][2], 0, -20, 0, 0, 0, 0);
      api.addNodalLoad3D(gNodes[2][1], 0, -20, 0, 0, 0, 0);
      api.addNodalLoad3D(gNodes[2][2], 0, -20, 0, 0, 0, 0);
      return true;
    }

    case '3d-tower': {
      api.model.name = t('ex.tower3D_2');
      // 3 niveles: Y=0, Y=3, Y=6. Base 2m x 2m
      const tw: number[][] = []; // [level][corner 0-3]
      for (let lev = 0; lev < 3; lev++) {
        tw[lev] = [];
        const y = lev * 3;
        tw[lev][0] = api.addNode(0, y, 0);
        tw[lev][1] = api.addNode(2, y, 0);
        tw[lev][2] = api.addNode(2, y, 2);
        tw[lev][3] = api.addNode(0, y, 2);
      }
      // Columns (vertical)
      for (let c = 0; c < 4; c++) {
        for (let lev = 0; lev < 2; lev++) {
          api.addElement(tw[lev][c], tw[lev + 1][c], 'frame');
        }
      }
      // Horizontal beams at each level (skip level 0 base)
      for (let lev = 1; lev < 3; lev++) {
        api.addElement(tw[lev][0], tw[lev][1], 'frame');
        api.addElement(tw[lev][1], tw[lev][2], 'frame');
        api.addElement(tw[lev][2], tw[lev][3], 'frame');
        api.addElement(tw[lev][3], tw[lev][0], 'frame');
      }
      // Diagonal bracing on each face (X-braces between levels)
      // Front face (Z=0): 0-1
      api.addElement(tw[0][0], tw[1][1], 'truss');
      api.addElement(tw[1][0], tw[2][1], 'truss');
      // Back face (Z=2): 3-2
      api.addElement(tw[0][3], tw[1][2], 'truss');
      api.addElement(tw[1][3], tw[2][2], 'truss');
      // Left face (X=0): 0-3
      api.addElement(tw[0][0], tw[1][3], 'truss');
      api.addElement(tw[1][0], tw[2][3], 'truss');
      // Right face (X=2): 1-2
      api.addElement(tw[0][1], tw[1][2], 'truss');
      api.addElement(tw[1][1], tw[2][2], 'truss');
      // Fixed supports at base
      for (let c = 0; c < 4; c++) {
        api.addSupport(tw[0][c], 'fixed3d');
      }
      // Lateral loads at top
      api.addNodalLoad3D(tw[2][0], 10, 0, 5, 0, 0, 0);
      api.addNodalLoad3D(tw[2][1], 10, 0, 5, 0, 0, 0);
      api.addNodalLoad3D(tw[2][2], 10, 0, 5, 0, 0, 0);
      api.addNodalLoad3D(tw[2][3], 10, 0, 5, 0, 0, 0);
      // Gravity on top beams
      api.addNodalLoad3D(tw[2][0], 0, -15, 0, 0, 0, 0);
      api.addNodalLoad3D(tw[2][2], 0, -15, 0, 0, 0, 0);
      return true;
    }

    case '3d-torsion-beam': {
      api.model.name = t('ex.3d-torsion-beam');
      // Viga biapoyada 4m con carga excéntrica que genera torsión
      const tb1 = api.addNode(0, 0, 0);
      const tb2 = api.addNode(2, 0, 0);
      const tb3 = api.addNode(4, 0, 0);
      api.addElement(tb1, tb2, 'frame');
      api.addElement(tb2, tb3, 'frame');
      // Fixed at both ends
      api.addSupport(tb1, 'fixed3d');
      api.addSupport(tb3, 'pinned3d');
      // Eccentric load at midspan: Fy=-20kN + Mx=8kN·m (torsion from eccentricity)
      api.addNodalLoad3D(tb2, 0, -20, 0, 8, 0, 0);
      return true;
    }

    case '3d-nave-industrial': {
      // ══════════════════════════════════════════════════════════════
      // NAVE INDUSTRIAL — Galpón de acero con estructura reticulada
      // 4 pórticos principales (columnas reticuladas + cabriada Pratt)
      // 3 cabriadas secundarias apoyadas en reticulados laterales
      // Correas cada 4m, vigas carrileras, contraviento lat/frontal
      // ══════════════════════════════════════════════════════════════
      api.model.name = t('ex.3d-nave-industrial');

      // ─── Parámetros ───
      const SP = 20;           // luz transversal (m)
      const CH = 8;            // altura columna / cordón inferior (m)
      const RH = 10;           // altura cumbrera (m)
      const CW = 0.5;          // ancho columna reticulada (m)
      const NCS = 4;           // subdivisiones columna → segmento = 2m
      const NTP = 8;           // paneles cabriada → panel = 2.5m
      const CRH = 6;           // altura carrilera / cordón inf reticulado lateral (m)
      const segH = CH / NCS;   // 2m
      const panW = SP / NTP;   // 2.5m
      const crLv = CRH / segH; // nivel de grúa = 3
      // 7 frames totales cada 4m → largo total 24m
      // Principales (con columnas): f=0,2,4,6 → X=0,8,16,24
      // Secundarias (sin columnas, apoyadas en reticulados lat): f=1,3,5 → X=4,12,20
      const NF = 7;
      const fX = (f: number) => f * 4;
      const NMain = 4;

      // ─── Material ───
      const niMat = api.addMaterial({ name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 });

      // ─── Secciones ───
      const sCC = api.addSection({ name: 'Col cord 2L75', a: 0.00114, iz: 4.5e-7, iy: 4.5e-7, j: 3e-8, h: 0.075, b: 0.075, shape: 'L' });
      const sCD = api.addSection({ name: 'Col diag L50', a: 0.00048, iz: 1e-7, iy: 1e-7, h: 0.050, b: 0.050, shape: 'L' });
      const sTC = api.addSection({ name: 'Cab cord 2L100', a: 0.0019, iz: 1.2e-6, iy: 1.2e-6, j: 1.5e-7, h: 0.100, b: 0.100, shape: 'L' });
      const sTD = api.addSection({ name: 'Cab diag L60', a: 0.00069, iz: 2e-7, iy: 2e-7, h: 0.060, b: 0.060, shape: 'L' });
      const sCR = api.addSection({
        name: 'Carrilera IPN500', a: 0.0179, iz: 6.874e-4, iy: 2.48e-5,
        j: 3.3e-6, b: 0.185, h: 0.500, shape: 'I',
      });
      const sPR = api.addSection({ name: 'Correa UPN160', a: 0.00240, iz: 9.25e-6, iy: 8.5e-7, j: 5e-8, h: 0.160, b: 0.065, shape: 'I' });
      const sBR = api.addSection({ name: 'Tirante Ø16', a: 0.000201, iz: 3.2e-9, iy: 3.2e-9, h: 0.016, b: 0.016, shape: 'tube' });
      const sLG = api.addSection({ name: 'Ret lat 2L65', a: 0.00098, iz: 3e-7, iy: 3e-7, j: 2e-8, h: 0.065, b: 0.065, shape: 'L' });

      // ─── Helpers ───
      const niT = (n1: number, n2: number, s: number) => {
        const e = api.addElement(n1, n2, 'truss');
        api.updateElementMaterial(e, niMat); api.updateElementSection(e, s); return e;
      };
      const niF = (n1: number, n2: number, s: number) => {
        const e = api.addElement(n1, n2, 'frame');
        api.updateElementMaterial(e, niMat); api.updateElementSection(e, s); return e;
      };
      const roofY = (z: number) => CH + (RH - CH) * (1 - Math.abs(z - SP / 2) / (SP / 2));

      // ─── Arrays de nodos ───
      const cL: { o: number; i: number }[][] = []; // columna izq [mainIdx][level]
      const cR: { o: number; i: number }[][] = []; // columna der
      const tB: number[][] = [];  // cordón inferior cabriada [frame][panel]
      const tT: number[][] = [];  // cordón superior cabriada
      // Reticulado lateral: cordón sup (Y=CH) e inf (Y=CRH) en Z=0 y Z=SP
      const lgT: number[] = [];   // top chord Z=0
      const lgB: number[] = [];   // bottom chord Z=0
      const rgT: number[] = [];   // top chord Z=SP
      const rgB: number[] = [];   // bottom chord Z=SP

      // ═══════════════════════════════════════════════
      // 1. PÓRTICOS PRINCIPALES (columnas reticuladas + cabriada Pratt)
      // ═══════════════════════════════════════════════
      for (let mi = 0; mi < NMain; mi++) {
        const f = mi * 2; // frame index: 0, 2, 4, 6
        const x = fX(f);
        cL[mi] = []; cR[mi] = [];

        // -- Nodos de columnas --
        for (let lv = 0; lv <= NCS; lv++) {
          const y = lv * segH;
          cL[mi][lv] = { o: api.addNode(x, y, 0), i: api.addNode(x, y, CW) };
          cR[mi][lv] = { o: api.addNode(x, y, SP), i: api.addNode(x, y, SP - CW) };
        }

        // -- Elementos columnas: cordones, horizontales, diagonales Warren --
        for (let lv = 0; lv < NCS; lv++) {
          niF(cL[mi][lv].o, cL[mi][lv + 1].o, sCC);
          niF(cL[mi][lv].i, cL[mi][lv + 1].i, sCC);
          niF(cR[mi][lv].o, cR[mi][lv + 1].o, sCC);
          niF(cR[mi][lv].i, cR[mi][lv + 1].i, sCC);
          niT(cL[mi][lv].o, cL[mi][lv].i, sCD);
          niT(cR[mi][lv].o, cR[mi][lv].i, sCD);
          if (lv % 2 === 0) {
            niT(cL[mi][lv].o, cL[mi][lv + 1].i, sCD);
            niT(cR[mi][lv].o, cR[mi][lv + 1].i, sCD);
          } else {
            niT(cL[mi][lv].i, cL[mi][lv + 1].o, sCD);
            niT(cR[mi][lv].i, cR[mi][lv + 1].o, sCD);
          }
        }
        niT(cL[mi][NCS].o, cL[mi][NCS].i, sCD);
        niT(cR[mi][NCS].o, cR[mi][NCS].i, sCD);

        // Registrar nodos del reticulado lateral (compartidos con columna)
        lgT[f] = cL[mi][NCS].o;    // Y=8, Z=0
        lgB[f] = cL[mi][crLv].o;   // Y=6, Z=0
        rgT[f] = cR[mi][NCS].o;    // Y=8, Z=SP
        rgB[f] = cR[mi][crLv].o;   // Y=6, Z=SP

        // -- Cabriada principal (Pratt) --
        tB[f] = []; tT[f] = [];
        tB[f][0] = cL[mi][NCS].o;
        for (let p = 1; p < NTP; p++) tB[f][p] = api.addNode(x, CH, p * panW);
        tB[f][NTP] = cR[mi][NCS].o;
        tT[f][0] = tB[f][0];
        for (let p = 1; p < NTP; p++) tT[f][p] = api.addNode(x, roofY(p * panW), p * panW);
        tT[f][NTP] = tB[f][NTP];
        for (let p = 0; p < NTP; p++) niF(tB[f][p], tB[f][p + 1], sTC);
        for (let p = 0; p < NTP; p++) niF(tT[f][p], tT[f][p + 1], sTC);
        for (let p = 1; p < NTP; p++) niT(tB[f][p], tT[f][p], sTD);
        const mid = NTP / 2;
        for (let p = 1; p < mid; p++) niT(tB[f][p], tT[f][p + 1], sTD);
        for (let p = mid; p < NTP - 1; p++) niT(tB[f][p + 1], tT[f][p], sTD);
      }

      // ═══════════════════════════════════════════════
      // 2. RETICULADOS LATERALES (Z=0 y Z=SP)
      //    Cordón sup Y=CH, cordón inf Y=CRH, conectan pórticos principales
      //    y sostienen cabriadas secundarias
      // ═══════════════════════════════════════════════
      // Crear nodos en posiciones de cabriadas secundarias
      for (const f of [1, 3, 5]) {
        const x = fX(f);
        lgT[f] = api.addNode(x, CH, 0);
        lgB[f] = api.addNode(x, CRH, 0);
        rgT[f] = api.addNode(x, CH, SP);
        rgB[f] = api.addNode(x, CRH, SP);
      }
      // Elementos del reticulado entre frames consecutivos
      for (let f = 0; f < NF - 1; f++) {
        niF(lgT[f], lgT[f + 1], sLG);  // cordón sup Z=0
        niF(lgB[f], lgB[f + 1], sLG);  // cordón inf Z=0
        niF(rgT[f], rgT[f + 1], sLG);  // cordón sup Z=SP
        niF(rgB[f], rgB[f + 1], sLG);  // cordón inf Z=SP
        // Diagonales Warren
        if (f % 2 === 0) {
          niT(lgT[f], lgB[f + 1], sCD);
          niT(rgT[f], rgB[f + 1], sCD);
        } else {
          niT(lgB[f], lgT[f + 1], sCD);
          niT(rgB[f], rgT[f + 1], sCD);
        }
      }
      // Montantes solo en posiciones secundarias (en principales ya los tiene la columna)
      for (const f of [1, 3, 5]) {
        niT(lgT[f], lgB[f], sCD);
        niT(rgT[f], rgB[f], sCD);
      }

      // ═══════════════════════════════════════════════
      // 3. CABRIADAS SECUNDARIAS (f=1,3,5 — sin columnas)
      //    Apoyadas en reticulados laterales
      // ═══════════════════════════════════════════════
      for (const f of [1, 3, 5]) {
        const x = fX(f);
        tB[f] = []; tT[f] = [];
        tB[f][0] = lgT[f]; // comparte con reticulado lateral
        for (let p = 1; p < NTP; p++) tB[f][p] = api.addNode(x, CH, p * panW);
        tB[f][NTP] = rgT[f];
        tT[f][0] = tB[f][0];
        for (let p = 1; p < NTP; p++) tT[f][p] = api.addNode(x, roofY(p * panW), p * panW);
        tT[f][NTP] = tB[f][NTP];
        for (let p = 0; p < NTP; p++) niF(tB[f][p], tB[f][p + 1], sTC);
        for (let p = 0; p < NTP; p++) niF(tT[f][p], tT[f][p + 1], sTC);
        for (let p = 1; p < NTP; p++) niT(tB[f][p], tT[f][p], sTD);
        const mid = NTP / 2;
        for (let p = 1; p < mid; p++) niT(tB[f][p], tT[f][p + 1], sTD);
        for (let p = mid; p < NTP - 1; p++) niT(tB[f][p + 1], tT[f][p], sTD);
      }

      // ═══════════════════════════════════════════════
      // 4. PARANTES INTERMEDIOS + CONEXIONES LONGITUDINALES
      // ═══════════════════════════════════════════════

      // Parantes verticales en posiciones de cabriadas secundarias (Z=0 y Z=SP)
      // Cortan largueros de 8m en 2×4m y descargan al piso + reticulado lateral
      // postL[sf][lv], postR[sf][lv] — sf=0,1,2 → frames 1,3,5
      const postL: number[][] = [];
      const postR: number[][] = [];
      for (let sf = 0; sf < 3; sf++) {
        const f = sf * 2 + 1; // frame index 1, 3, 5
        const x = fX(f);
        postL[sf] = []; postR[sf] = [];
        // Nodos: Y=0, segH, 2*segH (lv=0,1,2). lv=3 → lgB[f], lv=4 → lgT[f]
        for (let lv = 0; lv < crLv; lv++) {
          const y = lv * segH;
          postL[sf][lv] = api.addNode(x, y, 0);
          postR[sf][lv] = api.addNode(x, y, SP);
        }
        postL[sf][crLv] = lgB[f]; // Y=6, compartido con reticulado lateral
        postR[sf][crLv] = rgB[f];
        // Elementos: frame de base a cordón inf del reticulado (Y=0 → Y=6)
        for (let lv = 0; lv < crLv; lv++) {
          niF(postL[sf][lv], postL[sf][lv + 1], sCC);
          niF(postR[sf][lv], postR[sf][lv + 1], sCC);
        }
        // Apoyos en base
        api.addSupport(postL[sf][0], 'pinned3d');
        api.addSupport(postR[sf][0], 'pinned3d');
      }

      const roofPurlinIds: number[] = [];
      const craneRailIdsL: number[] = [];
      const craneRailIdsR: number[] = [];
      const wallGirtIdsL: number[] = [];
      const wallGirtIdsR: number[] = [];

      // Correas de techo y atados de cordón inferior (entre frames consecutivos, 4m)
      for (let f = 0; f < NF - 1; f++) {
        for (let p = 1; p < NTP; p++) roofPurlinIds.push(niF(tT[f][p], tT[f + 1][p], sPR));
        for (let p = 1; p < NTP; p++) niT(tB[f][p], tB[f + 1][p], sPR);
      }

      // Vigas carrileras entre pórticos principales (8m cada tramo)
      for (let mi = 0; mi < NMain - 1; mi++) {
        craneRailIdsL.push(niF(cL[mi][crLv].i, cL[mi + 1][crLv].i, sCR));
        craneRailIdsR.push(niF(cR[mi][crLv].i, cR[mi + 1][crLv].i, sCR));
      }

      // Largueros de pared — cortados por parantes (2 tramos de 4m por vano)
      for (let mi = 0; mi < NMain - 1; mi++) {
        const sf = mi; // secondary frame index within this bay
        for (let lv = 1; lv < NCS; lv++) {
          // Tramo 1: principal[mi] → parante[sf]
          const postNodeL = lv < crLv ? postL[sf][lv] : lgB[mi * 2 + 1];
          const postNodeR = lv < crLv ? postR[sf][lv] : rgB[mi * 2 + 1];
          wallGirtIdsL.push(niF(cL[mi][lv].o, postNodeL, sPR));
          wallGirtIdsR.push(niF(cR[mi][lv].o, postNodeR, sPR));
          // Tramo 2: parante[sf] → principal[mi+1]
          wallGirtIdsL.push(niF(postNodeL, cL[mi + 1][lv].o, sPR));
          wallGirtIdsR.push(niF(postNodeR, cR[mi + 1][lv].o, sPR));
        }
      }

      // Vigas longitudinales — desde base de columnas principales hasta nodo
      // inferior central del reticulado lateral (lgB/rgB en la secundaria)
      // Forman una V en el primer y último vano de cada lateral
      for (const mi of [0, NMain - 2]) {
        const secF = mi * 2 + 1; // frame index de la secundaria en este vano
        // Z=0: ambas columnas principales del vano → lgB central
        niF(cL[mi][0].o, lgB[secF], sCC);
        niF(cL[mi + 1][0].o, lgB[secF], sCC);
        // Z=SP: ambas columnas principales del vano → rgB central
        niF(cR[mi][0].o, rgB[secF], sCC);
        niF(cR[mi + 1][0].o, rgB[secF], sCC);
      }

      // ═══════════════════════════════════════════════
      // 5. CONTRAVIENTOS
      // ═══════════════════════════════════════════════

      // 5a. Lateral — X horizontal a Y=CH, profundidad Z=0→panW y Z=SP-panW→SP
      //     Ambos laterales, largo completo del edificio
      for (let f = 0; f < NF - 1; f++) {
        // Lado izquierdo: Z=0 ↔ Z=panW
        niT(tB[f][0], tB[f + 1][1], sBR);
        niT(tB[f][1], tB[f + 1][0], sBR);
        // Lado derecho: Z=SP-panW ↔ Z=SP
        niT(tB[f][NTP - 1], tB[f + 1][NTP], sBR);
        niT(tB[f][NTP], tB[f + 1][NTP - 1], sBR);
      }

      // 5b. Frontal — X horizontal entre primera principal y secundaria adyacente
      //     Desfasada un panel respecto al lateral (arranca en panel 1, termina en NTP-1)
      for (const [fa, fb] of [[0, 1], [5, 6]] as [number, number][]) {
        for (let p = 1; p < NTP - 1; p += 2) {
          niT(tB[fa][p], tB[fb][p + 2], sBR);
          niT(tB[fa][p + 2], tB[fb][p], sBR);
        }
      }

      // 5c. Hastiales (X=0 y X=24): columnas intermedias + largueros + riostras
      //     3 columnas intermedias (Z=5,10,15) con nodos cada segH (Y=0,2,4,6,8)
      //     Largueros a Y=2,4,6 (mismas alturas que laterales)
      for (const mi of [0, NMain - 1]) {
        const f = mi * 2;
        const x = fX(f);
        // gN[k][lv]: nodos de columnas intermedias del hastial
        const gN: number[][] = [];
        for (let k = 0; k < 3; k++) {
          gN[k] = [];
          const z = (k + 1) * SP / 4;
          const pIdx = (k + 1) * NTP / 4; // panel 2, 4, 6
          for (let lv = 0; lv < NCS; lv++) gN[k][lv] = api.addNode(x, lv * segH, z);
          gN[k][NCS] = tB[f][pIdx]; // Y=8 compartido con cordón inferior
          // Elementos columna (frame continuo base→techo)
          for (let lv = 0; lv < NCS; lv++) niF(gN[k][lv], gN[k][lv + 1], sCC);
          api.addSupport(gN[k][0], 'pinned3d');
        }
        // Largueros frontales a lv=1,2,3 (Y=2,4,6) — frame para tomar viento
        for (let lv = 1; lv < NCS; lv++) {
          wallGirtIdsL.push(niF(cL[mi][lv].o, gN[0][lv], sPR));
          for (let k = 0; k < 2; k++) wallGirtIdsL.push(niF(gN[k][lv], gN[k + 1][lv], sPR));
          wallGirtIdsL.push(niF(gN[2][lv], cR[mi][lv].o, sPR));
        }
        // X riostras en paños inferiores (base→lv=2, Y=0→4)
        for (let k = -1; k < 3; k++) {
          const nBL = k < 0 ? cL[mi][0].o : gN[k][0];
          const nTL = k < 0 ? cL[mi][NCS / 2].o : gN[k][NCS / 2];
          const nBR = k < 2 ? gN[k + 1][0] : cR[mi][0].o;
          const nTR = k < 2 ? gN[k + 1][NCS / 2] : cR[mi][NCS / 2].o;
          niT(nBL, nTR, sBR);
          niT(nBR, nTL, sBR);
        }
      }

      // ═══════════════════════════════════════════════
      // 6. APOYOS
      // ═══════════════════════════════════════════════
      for (let mi = 0; mi < NMain; mi++) {
        api.addSupport(cL[mi][0].o, 'pinned3d');
        api.addSupport(cL[mi][0].i, 'pinned3d');
        api.addSupport(cR[mi][0].o, 'pinned3d');
        api.addSupport(cR[mi][0].i, 'pinned3d');
      }

      // ═══════════════════════════════════════════════
      // 7. CASOS DE CARGA
      // ═══════════════════════════════════════════════
      api.model.loadCases = [
        { id: 1, type: 'D' as LoadCaseType, name: t('ex.deadLoad') },
        { id: 2, type: 'Lr' as LoadCaseType, name: t('ex.liveLoad') },
        { id: 3, type: 'W' as LoadCaseType, name: t('ex.windX') },
      ];
      api.nextId.loadCase = 4;

      // Tributaria longitudinal por frame (todos equiespaciados a 4m)
      const tribW = (f: number) => f === 0 || f === NF - 1 ? 2 : 4;

      // ─── D (Peso propio): 0.5 kN/m² cubierta → nodal en cordón superior ───
      for (let f = 0; f < NF; f++) {
        const tw = tribW(f);
        for (let p = 0; p <= NTP; p++) {
          const tz = p === 0 || p === NTP ? panW / 2 : panW;
          api.addNodalLoad3D(tT[f][p], 0, -0.5 * tw * tz, 0, 0, 0, 0, 1);
        }
      }
      // Peso propio carrileras (IPN500 ≈ 1.41 kN/m)
      for (const eid of [...craneRailIdsL, ...craneRailIdsR]) {
        api.addDistributedLoad3D(eid, -1.41, -1.41, 0, 0, undefined, undefined, 1);
      }

      // ─── Lr (Sobrecarga cubierta + grúa) ───
      for (let f = 0; f < NF; f++) {
        const tw = tribW(f);
        for (let p = 0; p <= NTP; p++) {
          const tz = p === 0 || p === NTP ? panW / 2 : panW;
          api.addNodalLoad3D(tT[f][p], 0, -0.3 * tw * tz, 0, 0, 0, 0, 2);
        }
      }
      // Carga de grúa: 120 kN por rueda en pórticos principales 1 y 2 (centrales)
      for (const mi of [1, 2]) {
        api.addNodalLoad3D(cL[mi][crLv].i, 0, -120, 0, 0, 0, 0, 2);
        api.addNodalLoad3D(cR[mi][crLv].i, 0, -120, 0, 0, 0, 0, 2);
      }

      // ─── W (Viento transversal +Z) ───
      // Ejes locales elem horizontal en X: ey→+Z global, ez→-Y global
      const qWindWall = 0.25 * segH; // 0.50 kN/m
      for (const eid of wallGirtIdsL) {
        api.addDistributedLoad3D(eid, qWindWall, qWindWall, 0, 0, undefined, undefined, 3);
      }
      const qWindLee = 0.15 * segH;
      for (const eid of wallGirtIdsR) {
        api.addDistributedLoad3D(eid, qWindLee, qWindLee, 0, 0, undefined, undefined, 3);
      }
      // Succión de techo en correas
      const midP = NTP / 2;
      const qRoofWindward = 0.20 * panW;
      const qRoofLeeward  = 0.10 * panW;
      for (let f = 0; f < NF - 1; f++) {
        for (let p = 1; p < NTP; p++) {
          const idx = f * (NTP - 1) + (p - 1);
          const eid = roofPurlinIds[idx];
          const q = p < midP ? qRoofWindward : qRoofLeeward;
          api.addDistributedLoad3D(eid, q, q, 0, 0, undefined, undefined, 3);
        }
      }
      // Viento en aleros (presión en nodos tope de columna)
      for (let mi = 0; mi < NMain; mi++) {
        const f = mi * 2;
        const tw = tribW(f);
        api.addNodalLoad3D(cL[mi][NCS].o, 0, 0, 0.42 * tw * segH / 2, 0, 0, 0, 3);
      }

      return true;
    }

    case '3d-building': {
      // ======================================================================
      // EDIFICIO 5 PISOS — Estructura mixta H.A./acero con cargas
      // completas: D, L, W, E y combinaciones CIRSOC 201
      // ======================================================================
      api.model.name = t('ex.3d-building');

      // -- Geometria --
      const nFloors = 5;
      const storyH = 3.2;       // m por piso (planta baja 3.8)
      const groundH = 3.8;      // PB mas alta (doble altura comercial)
      const bayX = 6;           // vano en X (m) — 2 vanos
      const bayZ = 5;           // vano en Z (m) — 2 vanos
      const nBaysX = 2;
      const nBaysZ = 2;

      // -- Materiales --
      const matHA30 = api.addMaterial({ name: 'H-30', e: 32000, nu: 0.2, rho: 25 });

      // -- Secciones --
      // Columnas: 40x40 en PB-P2, 35x35 en P3-P5
      const secColBig = api.addSection({
        name: 'Col 40×40', a: 0.16, iz: 0.002133, iy: 0.002133, j: 0.003605,
        b: 0.40, h: 0.40, shape: 'rect',
      });
      const secColSmall = api.addSection({
        name: 'Col 35×35', a: 0.1225, iz: 0.001251, iy: 0.001251, j: 0.002117,
        b: 0.35, h: 0.35, shape: 'rect',
      });
      // Vigas principales: 30x60
      const secBeam = api.addSection({
        name: 'Viga 30×60', a: 0.18, iz: 0.0054, iy: 0.00135, j: 0.004,
        b: 0.30, h: 0.60, shape: 'rect',
      });
      // Vigas secundarias: 25x50
      const secBeamSec = api.addSection({
        name: 'Viga 25×50', a: 0.125, iz: 0.002604, iy: 0.000651, j: 0.0018,
        b: 0.25, h: 0.50, shape: 'rect',
      });

      // -- Nodos: nodeGrid[piso][iz][ix] --
      // piso 0 = base, piso 1 = 1er piso, etc.
      const ng: number[][][] = [];
      for (let f = 0; f <= nFloors; f++) {
        ng[f] = [];
        const y = f === 0 ? 0 : groundH + (f - 1) * storyH;
        for (let iz = 0; iz <= nBaysZ; iz++) {
          ng[f][iz] = [];
          for (let ix = 0; ix <= nBaysX; ix++) {
            ng[f][iz][ix] = api.addNode(ix * bayX, y, iz * bayZ);
          }
        }
      }

      // -- Columnas --
      const colIds: number[] = [];
      for (let f = 0; f < nFloors; f++) {
        for (let iz = 0; iz <= nBaysZ; iz++) {
          for (let ix = 0; ix <= nBaysX; ix++) {
            const eid = api.addElement(ng[f][iz][ix], ng[f + 1][iz][ix], 'frame');
            colIds.push(eid);
            api.updateElementMaterial(eid, matHA30);
            api.updateElementSection(eid, f < 2 ? secColBig : secColSmall);
          }
        }
      }

      // -- Vigas en X (principales) --
      const beamXIds: number[] = [];
      for (let f = 1; f <= nFloors; f++) {
        for (let iz = 0; iz <= nBaysZ; iz++) {
          for (let ix = 0; ix < nBaysX; ix++) {
            const eid = api.addElement(ng[f][iz][ix], ng[f][iz][ix + 1], 'frame');
            beamXIds.push(eid);
            api.updateElementMaterial(eid, matHA30);
            api.updateElementSection(eid, secBeam);
          }
        }
      }

      // -- Vigas en Z (secundarias) --
      const beamZIds: number[] = [];
      for (let f = 1; f <= nFloors; f++) {
        for (let ix = 0; ix <= nBaysX; ix++) {
          for (let iz = 0; iz < nBaysZ; iz++) {
            const eid = api.addElement(ng[f][iz][ix], ng[f][iz + 1][ix], 'frame');
            beamZIds.push(eid);
            api.updateElementMaterial(eid, matHA30);
            api.updateElementSection(eid, secBeamSec);
          }
        }
      }

      // -- Apoyos empotrados en base --
      for (let iz = 0; iz <= nBaysZ; iz++) {
        for (let ix = 0; ix <= nBaysX; ix++) {
          api.addSupport(ng[0][iz][ix], 'fixed3d');
        }
      }

      // === CASOS DE CARGA ===
      api.model.loadCases = [
        { id: 1, type: 'D' as LoadCaseType, name: t('ex.deadLoad') },
        { id: 2, type: 'L' as LoadCaseType, name: t('ex.liveLoad') },
        { id: 3, type: 'W' as LoadCaseType, name: t('ex.windX') },
        { id: 4, type: 'E' as LoadCaseType, name: t('ex.seismicX') },
      ];
      api.nextId.loadCase = 5;

      // -- D (Carga muerta): peso propio losa + terminaciones --
      // ~6 kN/m2 repartidas en vigas tributarias
      // Vigas principales (X): cargan ancho tributario = bayZ/2 para bordes, bayZ para interiores
      // Simplificado: 8 kN/m en vigas principales, 6 kN/m en secundarias
      const qDx = 8;   // kN/m sobre vigas principales (X)
      const qDz = 6;   // kN/m sobre vigas secundarias (Z)
      for (const eid of beamXIds) {
        api.addDistributedLoad3D(eid, -qDx, -qDx, 0, 0, undefined, undefined, 1);
      }
      for (const eid of beamZIds) {
        api.addDistributedLoad3D(eid, -qDz, -qDz, 0, 0, undefined, undefined, 1);
      }

      // -- L (Carga viva): sobrecarga de uso --
      // Oficinas ~3 kN/m2, tributaria en vigas
      const qLx = 4;   // kN/m
      const qLz = 3;   // kN/m
      for (const eid of beamXIds) {
        api.addDistributedLoad3D(eid, -qLx, -qLx, 0, 0, undefined, undefined, 2);
      }
      for (const eid of beamZIds) {
        api.addDistributedLoad3D(eid, -qLz, -qLz, 0, 0, undefined, undefined, 2);
      }

      // -- W (Viento +X): presion distribuida sobre fachada --
      // Presion 0.8 kN/m2 barlovento, -0.5 kN/m2 sotavento
      // Fuerzas concentradas en nodos de la fachada
      // Fachada X=0 (barlovento) y X=12 (sotavento)
      for (let f = 1; f <= nFloors; f++) {
        // Area tributaria por nodo: storyH x bayZ/2 (esquinas) o storyH x bayZ (centro)
        const hTrib = f === 1 ? (groundH + storyH) / 2 : (f === nFloors ? storyH / 2 : storyH);
        for (let iz = 0; iz <= nBaysZ; iz++) {
          const zTrib = iz === 0 || iz === nBaysZ ? bayZ / 2 : bayZ;
          const areaTrib = hTrib * zTrib;
          // Barlovento (X=0, empuje en +X): 0.8 kN/m2
          api.addNodalLoad3D(ng[f][iz][0], 0.8 * areaTrib, 0, 0, 0, 0, 0, 3);
          // Sotavento (X=max, succion en +X): 0.5 kN/m2
          api.addNodalLoad3D(ng[f][iz][nBaysX], 0.5 * areaTrib, 0, 0, 0, 0, 0, 3);
        }
      }

      // -- E (Sismo +X): fuerzas laterales equivalentes --
      // Distribucion triangular invertida (mayor arriba)
      // Cortante basal total ~300 kN repartido proporcionalmente a la altura
      const Vbase = 300; // kN cortante basal total
      const heights: number[] = [];
      for (let f = 1; f <= nFloors; f++) {
        heights.push(f === 1 ? groundH : groundH + (f - 1) * storyH);
      }
      const sumWH = heights.reduce((s, h) => s + h, 0);
      for (let f = 1; f <= nFloors; f++) {
        const Ff = Vbase * heights[f - 1] / sumWH; // fuerza sismica en piso f
        const nNodesFloor = (nBaysX + 1) * (nBaysZ + 1);
        const fPerNode = Ff / nNodesFloor;
        for (let iz = 0; iz <= nBaysZ; iz++) {
          for (let ix = 0; ix <= nBaysX; ix++) {
            api.addNodalLoad3D(ng[f][iz][ix], fPerNode, 0, 0, 0, 0, 0, 4);
          }
        }
      }

      // === COMBINACIONES CIRSOC 201 ===
      api.model.combinations = [
        { id: 1, name: '1.4D',
          factors: [{ caseId: 1, factor: 1.4 }] },
        { id: 2, name: '1.2D + 1.6L',
          factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 3, name: '1.2D + L + 1.6W',
          factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
        { id: 4, name: '1.2D + L + E',
          factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
        { id: 5, name: '0.9D + 1.6W',
          factors: [{ caseId: 1, factor: 0.9 }, { caseId: 3, factor: 1.6 }] },
        { id: 6, name: '0.9D + E',
          factors: [{ caseId: 1, factor: 0.9 }, { caseId: 4, factor: 1.0 }] },
      ];
      api.nextId.combination = 7;

      return true;
    }

    case 'pro-edificio-7p': {
      // ══════════════════════════════════════════════════════════════════════
      // EDIFICIO H.A. 7 PISOS — Vivienda multifamiliar con caja de ascensor
      //
      // Peso propio: automático desde material (rho) × sección/espesor
      //   → vigas, columnas, losas y tabiques de la caja de ascensor
      // Cargas D adicionales (contrapiso, terminación, tabiquería) sobre losas
      // Cargas L según destino de local (CIRSOC 101 Tabla 4.1)
      // Viento CIRSOC 102 Zona II
      // ══════════════════════════════════════════════════════════════════════
      api.model.name = 'Edificio H.A. 7 pisos — PRO';

      // ─── Parámetros geométricos ───
      const nFloors = 7;
      const hPB = 3.50;          // PB más alta
      const hTyp = 3.00;         // pisos tipo
      const bayX = [6, 5, 5, 2]; // 4 vanos en X: 6+5+5+2m = 18m (último = balcón voladizo)
      const bayZ = [5, 5];       // 2 vanos en Z: 5+5m = 10m
      const nColX = bayX.length + 1; // 5 ejes en X
      const nColZ = bayZ.length + 1; // 3 ejes en Z
      const slabT = 0.15;        // espesor losa (m)

      // Acumulados en X y Z para posiciones absolutas
      const posX = [0];
      for (const b of bayX) posX.push(posX[posX.length - 1] + b);
      const posZ = [0];
      for (const b of bayZ) posZ.push(posZ[posZ.length - 1] + b);

      function floorY(f: number): number {
        return f === 0 ? 0 : hPB + (f - 1) * hTyp;
      }

      // ─── Materiales ───
      const matH30 = api.addMaterial({ name: 'H-30 (f\'c=30)', e: 32000, nu: 0.2, rho: 25, fy: 30 });
      api.addMaterial({ name: 'ADN 420', e: 200000, nu: 0.3, rho: 78.5, fy: 420 });

      // ─── Secciones ───
      const secCol40 = api.addSection({
        name: 'Col 40×40', a: 0.16, iz: 2.133e-3, iy: 2.133e-3, j: 3.605e-3,
        b: 0.40, h: 0.40, shape: 'rect',
      });
      const secCol35 = api.addSection({
        name: 'Col 35×35', a: 0.1225, iz: 1.251e-3, iy: 1.251e-3, j: 2.117e-3,
        b: 0.35, h: 0.35, shape: 'rect',
      });
      const secVP = api.addSection({
        name: 'VP 30×80', a: 0.24, iz: 1.28e-2, iy: 1.80e-3, j: 5.7e-3,
        b: 0.30, h: 0.80, shape: 'rect',
      });
      const secVS = api.addSection({
        name: 'VS 30×65', a: 0.195, iz: 6.866e-3, iy: 1.463e-3, j: 4.5e-3,
        b: 0.30, h: 0.65, shape: 'rect',
      });
      // (Escalera removida — se modela aparte si es necesario)

      // ─── Nodos: ng[floor][iz][ix] ───
      // Base level (f=0): no node at ix=nColX-1 (balcony edge) — no structure there.
      // Upper floors: all nodes including balcony edge (connected via slab quads).
      const ng: number[][][] = [];
      for (let f = 0; f <= nFloors; f++) {
        ng[f] = [];
        const y = floorY(f);
        for (let iz = 0; iz < nColZ; iz++) {
          ng[f][iz] = [];
          for (let ix = 0; ix < nColX; ix++) {
            if (f === 0 && ix === nColX - 1) continue; // no node at base balcony edge
            ng[f][iz][ix] = api.addNode(posX[ix], y, posZ[iz]);
          }
        }
      }

      // ─── Columnas ───
      for (let f = 0; f < nFloors; f++) {
        for (let iz = 0; iz < nColZ; iz++) {
          for (let ix = 0; ix < nColX; ix++) {
            if (ix === nColX - 1) continue; // borde balcón: sin columna
            const eid = api.addElement(ng[f][iz][ix], ng[f + 1][iz][ix], 'frame');
            api.updateElementMaterial(eid, matH30);
            api.updateElementSection(eid, f < 3 ? secCol40 : secCol35);
          }
        }
      }

      // ─── Vigas en X ───
      // Solo hasta ix=nColX-3 (último vano del edificio). El vano del balcón
      // (ix=3→4) no lleva vigas: la losa en voladizo (quad) transmite las
      // cargas directamente a los nodos del eje ix=3.
      for (let f = 1; f <= nFloors; f++) {
        for (let iz = 0; iz < nColZ; iz++) {
          for (let ix = 0; ix < nColX - 2; ix++) {
            const eid = api.addElement(ng[f][iz][ix], ng[f][iz][ix + 1], 'frame');
            api.updateElementMaterial(eid, matH30);
            api.updateElementSection(eid, secVP);
          }
        }
      }

      // ─── Vigas en Z ───
      for (let f = 1; f <= nFloors; f++) {
        for (let ix = 0; ix < nColX; ix++) {
          for (let iz = 0; iz < nColZ - 1; iz++) {
            if (ix === nColX - 1) continue;
            const eid = api.addElement(ng[f][iz][ix], ng[f][iz + 1][ix], 'frame');
            api.updateElementMaterial(eid, matH30);
            api.updateElementSection(eid, secVS);
          }
        }
      }

      // ─── Apoyos empotrados en base ───
      for (let iz = 0; iz < nColZ; iz++) {
        for (let ix = 0; ix < nColX - 1; ix++) {
          api.addSupport(ng[0][iz][ix], 'fixed3d');
        }
      }

      // ═══════════════════════════════════════════════════════════
      // LOSAS DE PISO — Quads por cada vano en cada planta
      // El peso propio de la losa se calcula automáticamente
      // (matH30.rho × slabT × area) por el solver con includeSelfWeight
      // ═══════════════════════════════════════════════════════════
      // Store slab quad IDs: qg[floor][iz][ix]
      const qg: number[][][] = [];
      for (let f = 1; f <= nFloors; f++) {
        qg[f] = [];
        for (let iz = 0; iz < nColZ - 1; iz++) {
          qg[f][iz] = [];
          for (let ix = 0; ix < nColX - 1; ix++) {
            // 4 nodos esquina del paño
            const n00 = ng[f][iz][ix];
            const n10 = ng[f][iz][ix + 1];
            const n11 = ng[f][iz + 1][ix + 1];
            const n01 = ng[f][iz + 1][ix];
            qg[f][iz][ix] = api.addQuad([n00, n10, n11, n01], matH30, slabT);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // CAJA DE ASCENSOR — Tabiques H.A. e=20cm como quads
      // ═══════════════════════════════════════════════════════════
      const elevW = 2.5;
      const elevD = 2.5;
      const wallT = 0.20;

      const elNd: number[][] = [];
      for (let f = 0; f <= nFloors; f++) {
        const y = floorY(f);
        const nA = ng[f][0][0];
        const nB = api.addNode(elevW, y, 0);
        const nC = api.addNode(elevW, y, elevD);
        const nD = api.addNode(0, y, elevD);
        elNd[f] = [nA, nB, nC, nD];
      }

      for (let f = 0; f < nFloors; f++) {
        const bot = elNd[f];
        const top = elNd[f + 1];
        api.addQuad([bot[0], bot[3], top[3], top[0]], matH30, wallT); // X=0 wall
        api.addQuad([bot[0], bot[1], top[1], top[0]], matH30, wallT); // Z=0 wall
        // Wall B→C (X=2.5) removed — opening towards building interior
        api.addQuad([bot[2], bot[3], top[3], top[2]], matH30, wallT); // Z=2.5 wall
      }

      for (let f = 1; f <= nFloors; f++) {
        api.addConstraint({ type: 'rigidLink', masterNode: ng[f][0][0], slaveNode: elNd[f][1] });
        api.addConstraint({ type: 'rigidLink', masterNode: ng[f][0][0], slaveNode: elNd[f][2] });
        api.addConstraint({ type: 'rigidLink', masterNode: ng[f][0][0], slaveNode: elNd[f][3] });
      }

      // ═══════════════════════════════════════════════════════════
      // DIAFRAGMAS RÍGIDOS — uno por piso
      // ═══════════════════════════════════════════════════════════
      for (let f = 1; f <= nFloors; f++) {
        const slaveNodes: number[] = [];
        for (let iz = 0; iz < nColZ; iz++) {
          for (let ix = 0; ix < nColX; ix++) {
            if (iz === 0 && ix === 0) continue;
            slaveNodes.push(ng[f][iz][ix]);
          }
        }
        slaveNodes.push(elNd[f][1], elNd[f][2], elNd[f][3]);
        api.addConstraint({
          type: 'diaphragm', masterNode: ng[f][0][0], slaveNodes, plane: 'XZ',
        });
      }

      // ═══════════════════════════════════════════════════════════
      // CASOS DE CARGA — CIRSOC 101
      // ═══════════════════════════════════════════════════════════
      //
      // Peso propio (PP): automático con includeSelfWeight
      //   Losa: 0.15m × 25 kN/m³ = 3.75 kN/m²  (desde quads)
      //   Vigas y columnas: desde sección × material
      //
      // D adicional (sobre losas): contrapiso + terminación + tabiquería
      //   Pisos tipo: 1.50 + 1.00 = 2.50 kN/m²
      //   Cubierta (sin tabiques): 1.50 kN/m²
      //
      // CIRSOC 101 Tabla 4.1 — Sobrecargas de uso:
      //   Vivienda (living/comedor/dormitorio/cocina): 2.0 kN/m²
      //   Pasillos y escaleras: 3.0 kN/m²
      //   Balcones voladizos: 3.0 kN/m²
      //   Cubierta no accesible: 1.0 kN/m²

      api.model.loadCases = [
        { id: 1, type: 'D' as LoadCaseType, name: 'D — Carga muerta adicional (contrapiso+term+tabiq)' },
        { id: 2, type: 'L' as LoadCaseType, name: 'L — Vivienda (living/dormitorio/cocina) 2.0 kN/m²' },
        { id: 3, type: 'L' as LoadCaseType, name: 'L — Pasillo y escalera 3.0 kN/m²' },
        { id: 4, type: 'L' as LoadCaseType, name: 'L — Balcón voladizo 3.0 kN/m²' },
        { id: 5, type: 'Lr' as LoadCaseType, name: 'Lr — Cubierta 1.0 kN/m²' },
        { id: 6, type: 'W' as LoadCaseType, name: 'W — Viento +X (CIRSOC 102)' },
        { id: 7, type: 'W' as LoadCaseType, name: 'W — Viento −X' },
      ];
      api.nextId.loadCase = 8;

      // ─── Aplicar cargas superficiales sobre las losas ───
      for (let f = 1; f <= nFloors; f++) {
        const isRoof = f === nFloors;
        for (let iz = 0; iz < nColZ - 1; iz++) {
          for (let ix = 0; ix < nColX - 1; ix++) {
            const quadId = qg[f][iz][ix];
            const isBalcony = ix === nColX - 2;

            // D adicional (contrapiso + terminación + tabiquería)
            const qD = isRoof ? 1.50 : 2.50; // kN/m²
            api.addSurfaceLoad3D(quadId, qD, 1);

            // Carga viva según destino
            if (isBalcony) {
              api.addSurfaceLoad3D(quadId, 3.0, 4);   // Balcón: 3.0 kN/m²
            } else if (isRoof) {
              api.addSurfaceLoad3D(quadId, 1.0, 5);   // Cubierta: 1.0 kN/m²
            } else {
              // Zona pasillo (vanos centrales ix=1,2 en iz=0)
              const isPasillo = (ix === 1 || ix === 2) && iz === 0;
              if (isPasillo) {
                api.addSurfaceLoad3D(quadId, 3.0, 3); // Pasillo: 3.0 kN/m²
              } else {
                api.addSurfaceLoad3D(quadId, 2.0, 2); // Vivienda: 2.0 kN/m²
              }
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // VIENTO — CIRSOC 102
      // Zona II (Buenos Aires): V = 45 m/s
      // q = 0.613 × V² × Kz × Kd (Pa), Kd=0.85, Kzt=1.0
      // Cp barlovento=+0.8, Cp sotavento=−0.5
      // ═══════════════════════════════════════════════════════════
      const V = 45;
      const Kd = 0.85;
      function kzExpB(z: number): number {
        if (z <= 4.6) return 0.57;
        if (z <= 6.1) return 0.62;
        if (z <= 7.6) return 0.66;
        if (z <= 9.1) return 0.70;
        if (z <= 12.2) return 0.76;
        if (z <= 15.2) return 0.81;
        if (z <= 18.3) return 0.85;
        if (z <= 21.3) return 0.89;
        if (z <= 24.4) return 0.93;
        return 0.96;
      }

      for (let f = 1; f <= nFloors; f++) {
        const y = floorY(f);
        const hTrib = f === 1 ? (hPB + hTyp) / 2 : f === nFloors ? hTyp / 2 : hTyp;
        const kz = kzExpB(y);
        const qz = 0.613 * V * V * kz * Kd * 1e-3; // kN/m²

        for (let iz = 0; iz < nColZ; iz++) {
          const zTrib = iz === 0 || iz === nColZ - 1
            ? bayZ[Math.min(iz, bayZ.length - 1)] / 2
            : (bayZ[iz - 1] + bayZ[iz]) / 2;
          const area = hTrib * zTrib;

          const Fbar = 0.8 * qz * area;
          const Fsot = 0.5 * qz * area;
          api.addNodalLoad3D(ng[f][iz][0], +Fbar, 0, 0, 0, 0, 0, 6);
          api.addNodalLoad3D(ng[f][iz][nColX - 2], +Fsot, 0, 0, 0, 0, 0, 6);
          api.addNodalLoad3D(ng[f][iz][nColX - 2], -Fbar, 0, 0, 0, 0, 0, 7);
          api.addNodalLoad3D(ng[f][iz][0], -Fsot, 0, 0, 0, 0, 0, 7);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // COMBINACIONES — CIRSOC 201
      // ═══════════════════════════════════════════════════════════
      api.model.combinations = [
        { id: 1, name: 'U1: 1.4D', factors: [
          { caseId: 1, factor: 1.4 },
        ]},
        { id: 2, name: 'U2: 1.2D + 1.6L + 0.5Lr', factors: [
          { caseId: 1, factor: 1.2 },
          { caseId: 2, factor: 1.6 }, { caseId: 3, factor: 1.6 }, { caseId: 4, factor: 1.6 },
          { caseId: 5, factor: 0.5 },
        ]},
        { id: 3, name: 'U3: 1.2D + L + 1.6Lr', factors: [
          { caseId: 1, factor: 1.2 },
          { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.0 }, { caseId: 4, factor: 1.0 },
          { caseId: 5, factor: 1.6 },
        ]},
        { id: 4, name: 'U4: 1.2D + L + W+X', factors: [
          { caseId: 1, factor: 1.2 },
          { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.0 }, { caseId: 4, factor: 1.0 },
          { caseId: 6, factor: 1.0 },
        ]},
        { id: 5, name: 'U5: 1.2D + L + W−X', factors: [
          { caseId: 1, factor: 1.2 },
          { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.0 }, { caseId: 4, factor: 1.0 },
          { caseId: 7, factor: 1.0 },
        ]},
        { id: 6, name: 'U6: 0.9D + W+X', factors: [
          { caseId: 1, factor: 0.9 }, { caseId: 6, factor: 1.0 },
        ]},
        { id: 7, name: 'U7: 0.9D + W−X', factors: [
          { caseId: 1, factor: 0.9 }, { caseId: 7, factor: 1.0 },
        ]},
      ];
      api.nextId.combination = 8;

      return true;
    }


    case 'pro-sagrada-familia': {
      // ══════════════════════════════════════════════════════════════════════════
      // SAGRADA FAMILIA — Basílica de Barcelona (Antoni Gaudí, 1882–present)
      //
      // Full structural FEM model based on published geometric data from:
      //   - Arup structural analysis reports (Easton, Grant & Hulme 2019)
      //   - Santiago Huerta "Structural Design in the Work of Gaudí" (UPM)
      //   - Mark Burry parametric geometry research (mcburry.net)
      //   - Daniel Davis column geometry studies (danieldavis.com)
      //   - Official Sagrada Familia blog geometry articles
      //   - Josep Gómez Serrano (UPC) — structural director since 1986
      //
      // GEOMETRY:
      //   Module: 7.5m (Gaudí's universal module, 172.5m / 23 = 7.5m)
      //   Plan: Latin cross, 90m × 45m naves + 60m transept
      //   12 bays longitudinal × 6 column lines transverse = 78 column positions
      //   4 column types: porphyry (12-sided star, Ø2.1m), basalt (10-sided, Ø1.75m),
      //                   granite (8-sided, Ø1.4m), sandstone (6-sided, Ø1.05m)
      //   Column height:diameter = 10:1. Branching follows Gaudí's rule:
      //     first section height = N sides (m), subsequent sections halve.
      //   Vault heights: outer 22m, lateral 30m, central 45m, crossing 60m, apse 75m
      //
      // TOWERS (18 total, octagonal with helicoid twist):
      //   12 Bell towers: parabolic profile, helicoid spiral ±12°/level, shell panels
      //     4 Nativity (NE): 98–107.5m, 4 Passion (SW): 107.5–112m, 4 Glory (SE): 112–120m
      //   4 Evangelist towers: 135m, entasis profile (classical bulge)
      //   Virgin Mary tower: 138m, 12-pointed star crown
      //   Jesus Christ tower: 172.5m (= 23 × 7.5m), straight taper
      //
      // LOADS: D + L + Wind (Mediterranean) + Seismic (Barcelona CTE zone)
      // ══════════════════════════════════════════════════════════════════════════
      api.model.name = 'Sagrada Familia — PRO';

      // ─── PARAMETERS ───
      const G = 7.5;           // Gaudí's universal module (m)
      const nBaysLong = 12;    // longitudinal bays (entrance to apse) = 90m
      const totalLength = nBaysLong * G; // 90m
      const totalWidth = 6 * G; // 45m (5 naves)
      // Transverse column line positions (Z)
      // 6 lines: outer walls + 4 internal separating 5 naves
      const colZPos = [0, G, 2 * G, 4 * G, 5 * G, 6 * G]; // 0,7.5,15,30,37.5,45
      // Nave widths: outer(7.5), lateral(7.5), central(15), lateral(7.5), outer(7.5)

      // Vault spring heights by Z-strip
      const vaultH = [22, 30, 45, 45, 30, 22]; // height at each column Z line
      // Vault crown heights between Z-strips (midspan of each nave)
      const crownH = [25, 34, 60, 34, 25]; // crown between zi and zi+1

      // Transept parameters
      const transeptBay = 8;  // bay index where transept crosses
      const transeptExt = G;  // transept extends 7.5m beyond outer naves each side

      // ─── MATERIALS ───
      // 4 stone types (per official blog: columns of the Sagrada Familia)
      // Height:diameter = 10:1 rule (official geometry)
      const matPorph = api.addMaterial({ name: 'Pórfido rojo (12 lados)', e: 70000, nu: 0.25, rho: 27, fy: 20 });
      const matBasalt = api.addMaterial({ name: 'Basalto negro (10 lados)', e: 70000, nu: 0.25, rho: 29, fy: 20 });
      const matGranite = api.addMaterial({ name: 'Granito gris (8 lados)', e: 55000, nu: 0.20, rho: 26, fy: 20 });
      const matSandst = api.addMaterial({ name: 'Arenisca Montjuïc (6 lados)', e: 20000, nu: 0.15, rho: 23, fy: 20 });
      const matHA = api.addMaterial({ name: 'H.A. bóvedas/nervaduras', e: 32000, nu: 0.2, rho: 25, fy: 30 });
      const matSteel = api.addMaterial({ name: 'Acero prestress torres', e: 200000, nu: 0.3, rho: 78.5, fy: 235 });

      // ─── SECTIONS ───
      // Columns: circular equivalents (π/4 × d² for A, π/64 × d⁴ for I)
      const secPorph = api.addSection({ // Ø2.1m, H=21m (10:1 rule, 12 sides)
        name: 'Pórfido Ø2100', a: 3.464, iz: 0.955, iy: 0.955, j: 1.91,
        b: 2.1, h: 2.1, shape: 'rect',
      });
      const secBasalt = api.addSection({ // Ø1.75m, H=17.5m
        name: 'Basalto Ø1750', a: 2.405, iz: 0.460, iy: 0.460, j: 0.92,
        b: 1.75, h: 1.75, shape: 'rect',
      });
      const secGranite = api.addSection({ // Ø1.4m, H=14m
        name: 'Granito Ø1400', a: 1.539, iz: 0.189, iy: 0.189, j: 0.378,
        b: 1.4, h: 1.4, shape: 'rect',
      });
      const secSandst = api.addSection({ // Ø1.05m, H=10.5m
        name: 'Arenisca Ø1050', a: 0.866, iz: 0.060, iy: 0.060, j: 0.120,
        b: 1.05, h: 1.05, shape: 'rect',
      });
      // Branch sections (sub-columns after bifurcation)
      const secBranch1 = api.addSection({ // primary branch Ø900
        name: 'Rama Ø900', a: 0.636, iz: 0.0322, iy: 0.0322, j: 0.0644,
        b: 0.9, h: 0.9, shape: 'rect',
      });
      const secBranch2 = api.addSection({ // secondary branch Ø600
        name: 'Rama Ø600', a: 0.283, iz: 0.00636, iy: 0.00636, j: 0.01272,
        b: 0.6, h: 0.6, shape: 'rect',
      });
      // Vault ribs (nervaduras hiperbólicas)
      const secRibMain = api.addSection({
        name: 'Nervadura principal 50×100', a: 0.50, iz: 0.04167, iy: 0.01042, j: 0.022,
        b: 0.50, h: 1.00, shape: 'rect',
      });
      const secRibSec = api.addSection({
        name: 'Nervadura secundaria 30×60', a: 0.18, iz: 0.0054, iy: 0.00135, j: 0.004,
        b: 0.30, h: 0.60, shape: 'rect',
      });
      const secRibDiag = api.addSection({
        name: 'Nervadura diagonal 35×70', a: 0.245, iz: 0.01001, iy: 0.0025, j: 0.008,
        b: 0.35, h: 0.70, shape: 'rect',
      });
      // Gallery/triforium level beams
      const secGallery = api.addSection({
        name: 'Galería 30×50', a: 0.15, iz: 0.003125, iy: 0.001125, j: 0.003,
        b: 0.30, h: 0.50, shape: 'rect',
      });
      // Tower sections
      const secTwCol = api.addSection({
        name: 'Torre columna 80×80', a: 0.64, iz: 0.03413, iy: 0.03413, j: 0.058,
        b: 0.80, h: 0.80, shape: 'rect',
      });
      const secTwBeam = api.addSection({
        name: 'Torre viga 50×60', a: 0.30, iz: 0.009, iy: 0.00625, j: 0.010,
        b: 0.50, h: 0.60, shape: 'rect',
      });
      const secTwBrace = api.addSection({
        name: 'Torre riostra Ø350', a: 0.0962, iz: 7.37e-4, iy: 7.37e-4,
        h: 0.35, b: 0.35, shape: 'tube',
      });
      // Outer wall section
      const secWall = api.addSection({
        name: 'Muro ext 40×60', a: 0.24, iz: 0.0072, iy: 0.0032, j: 0.006,
        b: 0.40, h: 0.60, shape: 'rect',
      });

      // ─── HELPERS ───
      const addF = (n1: number, n2: number, mat: number, sec: number) => {
        const eid = api.addElement(n1, n2, 'frame');
        api.updateElementMaterial(eid, mat); api.updateElementSection(eid, sec);
        return eid;
      };
      const addT = (n1: number, n2: number, mat: number, sec: number) => {
        const eid = api.addElement(n1, n2, 'truss');
        api.updateElementMaterial(eid, mat); api.updateElementSection(eid, sec);
        return eid;
      };

      // ═══════════════════════════════════════════════════════════════
      // 1. COLUMNS — 78 positions on 7.5m grid (13 × 6)
      //    Column type assignment per Gaudí's hierarchy:
      //    Crossing (4): porphyry 12-sided
      //    Evangelist (8): basalt 10-sided
      //    Nave (central+lateral): granite 8-sided
      //    Outer naves: sandstone 6-sided
      // ═══════════════════════════════════════════════════════════════

      // Column type assignment function
      function getColType(bx: number, zi: number): { mat: number; sec: number; sides: number; branchSec: number } {
        // 4 crossing columns: porphyry (transept × central nave)
        if ((bx === transeptBay || bx === transeptBay + 1) && (zi === 2 || zi === 3)) {
          return { mat: matPorph, sec: secPorph, sides: 12, branchSec: secBranch1 };
        }
        // 8 evangelist columns: basalt (transept × lateral naves)
        if ((bx === transeptBay || bx === transeptBay + 1) && (zi === 1 || zi === 4)) {
          return { mat: matBasalt, sec: secBasalt, sides: 10, branchSec: secBranch1 };
        }
        // Central nave columns: basalt
        if (zi === 2 || zi === 3) {
          return { mat: matBasalt, sec: secBasalt, sides: 10, branchSec: secBranch1 };
        }
        // Lateral nave columns: granite
        if (zi === 1 || zi === 4) {
          return { mat: matGranite, sec: secGranite, sides: 8, branchSec: secBranch2 };
        }
        // Outer nave columns: sandstone
        return { mat: matSandst, sec: secSandst, sides: 6, branchSec: secBranch2 };
      }

      // Node storage
      const cBase: number[][] = [];  // [bx][zi] base node (Y=0)
      const cMid: number[][] = [];   // [bx][zi] gallery level node
      const cBranch: number[][] = []; // [bx][zi] branching point
      const cTop: number[][] = [];   // [bx][zi] vault spring level
      const galleryH = 15;           // gallery/triforium height (m)

      for (let bx = 0; bx <= nBaysLong; bx++) {
        const x = bx * G;
        cBase[bx] = []; cMid[bx] = []; cBranch[bx] = []; cTop[bx] = [];

        for (let zi = 0; zi < 6; zi++) {
          const z = colZPos[zi];
          const ct = getColType(bx, zi);
          const topH = vaultH[zi];

          // Branching height: first section = N sides in meters
          // Then halving. Total trunk = sides + sides/2 + sides/4 + ... ≈ 2×sides
          // But capped at 75% of vault spring height
          const branchH = Math.min(ct.sides * 1.5, topH * 0.65);

          // Create nodes
          cBase[bx][zi] = api.addNode(x, 0, z);
          api.addSupport(cBase[bx][zi], 'fixed3d');

          cMid[bx][zi] = api.addNode(x, galleryH, z);
          cBranch[bx][zi] = api.addNode(x, branchH, z);
          cTop[bx][zi] = api.addNode(x, topH, z);

          // Trunk: base → gallery → branch → top
          if (galleryH < branchH) {
            addF(cBase[bx][zi], cMid[bx][zi], ct.mat, ct.sec);
            addF(cMid[bx][zi], cBranch[bx][zi], ct.mat, ct.sec);
          } else {
            addF(cBase[bx][zi], cBranch[bx][zi], ct.mat, ct.sec);
            cMid[bx][zi] = cBranch[bx][zi]; // gallery at branch level
          }
          addF(cBranch[bx][zi], cTop[bx][zi], ct.mat, ct.branchSec);

          // ─── Tree branching (Gaudí's fractal rule) ───
          // Level 1: 4 primary branches from trunk at branchH
          //   Each curves outward via intermediate knuckle node
          // Level 2: each primary splits into 2 sub-branches (for ≥8-sided columns)
          // Level 3: for ≥10-sided, sub-branches split again (tertiary tips)
          // This creates the forest-canopy effect visible in the real basilica
          const span = topH - branchH;
          const off1 = 3.0;
          const dirs: [number, number][] = [[off1, 0], [-off1, 0], [0, off1], [0, -off1]];
          for (const [dx, dz] of dirs) {
            const tx1 = x + dx * 0.5;
            const tz1 = z + dz * 0.5;
            const ty1 = branchH + span * 0.35;
            if (tx1 < -2 || tx1 > totalLength + 2 || tz1 < -2 || tz1 > totalWidth + 2) continue;
            // Knuckle node (slight curve outward)
            const knuckle = api.addNode(tx1, ty1, tz1);
            addF(cBranch[bx][zi], knuckle, ct.mat, ct.branchSec);

            // Primary tip
            const tx2 = x + dx;
            const tz2 = z + dz;
            const ty2 = branchH + span * 0.65;
            const primTip = api.addNode(tx2, ty2, tz2);
            addF(knuckle, primTip, ct.mat, ct.branchSec);

            // Level 2 sub-branches for ≥8-sided columns
            if (ct.sides >= 8) {
              // Split into 2 sub-tips, perpendicular to primary direction
              const perpX = dz !== 0 ? 1.5 : 0;
              const perpZ = dx !== 0 ? 1.5 : 0;
              const subH = branchH + span * 0.85;
              for (const sign of [-1, 1]) {
                const sx = tx2 + sign * perpX;
                const sz = tz2 + sign * perpZ;
                if (sx < -2 || sx > totalLength + 2 || sz < -2 || sz > totalWidth + 2) continue;
                const subTip = api.addNode(sx, subH, sz);
                addF(primTip, subTip, ct.mat, secBranch2);

                // Level 3 tertiary tips for ≥10-sided (porphyry, basalt)
                if (ct.sides >= 10) {
                  const terH = branchH + span * 0.95;
                  const terX = sx + dx * 0.3;
                  const terZ = sz + dz * 0.3;
                  if (terX >= -2 && terX <= totalLength + 2 && terZ >= -2 && terZ <= totalWidth + 2) {
                    const terTip = api.addNode(terX, terH, terZ);
                    addF(subTip, terTip, ct.mat, secBranch2);
                  }
                }
              }
            }
          }
          // Diagonal branches (45° between primary directions)
          if (ct.sides >= 8) {
            const dOff = 2.2;
            const diagDirs: [number, number][] = [[dOff, dOff], [-dOff, dOff], [dOff, -dOff], [-dOff, -dOff]];
            for (const [dx, dz] of diagDirs) {
              const tx = x + dx;
              const tz = z + dz;
              if (tx < -2 || tx > totalLength + 2 || tz < -2 || tz > totalWidth + 2) continue;
              const diagTip = api.addNode(tx, branchH + span * 0.7, tz);
              addF(cBranch[bx][zi], diagTip, ct.mat, secBranch2);
            }
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 2. GALLERY / TRIFORIUM — Continuous beams at Y=15m
      //    Runs longitudinally and transversally between columns
      // ═══════════════════════════════════════════════════════════════

      // Longitudinal gallery beams
      for (let zi = 0; zi < 6; zi++) {
        for (let bx = 0; bx < nBaysLong; bx++) {
          addF(cMid[bx][zi], cMid[bx + 1][zi], matHA, secGallery);
        }
      }
      // Transverse gallery beams
      for (let bx = 0; bx <= nBaysLong; bx++) {
        for (let zi = 0; zi < 5; zi++) {
          addF(cMid[bx][zi], cMid[bx][zi + 1], matHA, secGallery);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 3. VAULT RIBS — Network of ribs at vault spring level
      //    Main ribs (longitudinal + transverse) + diagonal cross-ribs
      //    Plus crown nodes elevated above spring level
      // ═══════════════════════════════════════════════════════════════

      // Longitudinal ribs (X direction) connecting column tops
      for (let zi = 0; zi < 6; zi++) {
        for (let bx = 0; bx < nBaysLong; bx++) {
          addF(cTop[bx][zi], cTop[bx + 1][zi], matHA, secRibMain);
        }
      }

      // Transverse ribs (Z direction) connecting column tops
      for (let bx = 0; bx <= nBaysLong; bx++) {
        for (let zi = 0; zi < 5; zi++) {
          addF(cTop[bx][zi], cTop[bx][zi + 1], matHA, secRibMain);
        }
      }

      // Crown nodes and cross ribs for each vault bay
      // Each bay gets a crown node at its center, elevated to the proper vault height
      const vCrown: number[][] = []; // [bx][zi] crown node for bay bx, strip zi→zi+1
      for (let bx = 0; bx < nBaysLong; bx++) {
        vCrown[bx] = [];
        const cx = (bx + 0.5) * G;
        for (let zi = 0; zi < 5; zi++) {
          const cz = (colZPos[zi] + colZPos[zi + 1]) / 2;
          const ch = crownH[zi];
          vCrown[bx][zi] = api.addNode(cx, ch, cz);

          // Connect crown to 4 corners of the bay
          addF(cTop[bx][zi], vCrown[bx][zi], matHA, secRibDiag);
          addF(cTop[bx + 1][zi], vCrown[bx][zi], matHA, secRibDiag);
          addF(cTop[bx][zi + 1], vCrown[bx][zi], matHA, secRibDiag);
          addF(cTop[bx + 1][zi + 1], vCrown[bx][zi], matHA, secRibDiag);
        }
      }

      // Secondary ribs connecting adjacent crowns (longitudinal and transverse)
      for (let bx = 0; bx < nBaysLong; bx++) {
        for (let zi = 0; zi < 4; zi++) {
          addF(vCrown[bx][zi], vCrown[bx][zi + 1], matHA, secRibSec);
        }
      }
      for (let zi = 0; zi < 5; zi++) {
        for (let bx = 0; bx < nBaysLong - 1; bx++) {
          addF(vCrown[bx][zi], vCrown[bx + 1][zi], matHA, secRibSec);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 4. VAULT SHELLS — 4 triangular plates per bay (subdivided)
      //    Each bay has crown node + 4 corners → 4 triangles
      //    Total: 12 × 5 × 4 = 240 triangular shells
      // ═══════════════════════════════════════════════════════════════

      // Shell thickness by nave type
      const shellT = [0.15, 0.20, 0.30, 0.20, 0.15]; // outer, lateral, central, lateral, outer

      for (let bx = 0; bx < nBaysLong; bx++) {
        for (let zi = 0; zi < 5; zi++) {
          const t = shellT[zi];
          const cr = vCrown[bx][zi];
          const n00 = cTop[bx][zi];
          const n10 = cTop[bx + 1][zi];
          const n11 = cTop[bx + 1][zi + 1];
          const n01 = cTop[bx][zi + 1];
          // 4 triangular plates
          api.addPlate([n00, n10, cr], matHA, t);
          api.addPlate([n10, n11, cr], matHA, t);
          api.addPlate([n11, n01, cr], matHA, t);
          api.addPlate([n01, n00, cr], matHA, t);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 5. OUTER WALLS — Between exterior column lines
      //    Frame elements at wall lines (Z=0 and Z=45m)
      //    With intermediate vertical struts every half-bay
      // ═══════════════════════════════════════════════════════════════

      // Wall struts at mid-bay between outer columns
      for (const zi of [0, 5]) {
        for (let bx = 0; bx < nBaysLong; bx++) {
          const mx = (bx + 0.5) * G;
          const wallBase = api.addNode(mx, 0, colZPos[zi]);
          const wallMid = api.addNode(mx, galleryH, colZPos[zi]);
          const wallTop = api.addNode(mx, vaultH[zi], colZPos[zi]);
          api.addSupport(wallBase, 'fixed3d');
          addF(wallBase, wallMid, matSandst, secWall);
          addF(wallMid, wallTop, matSandst, secWall);
          // Connect to adjacent column tops and mids
          addF(wallMid, cMid[bx][zi], matHA, secGallery);
          addF(wallMid, cMid[bx + 1][zi], matHA, secGallery);
          addF(wallTop, cTop[bx][zi], matHA, secRibSec);
          addF(wallTop, cTop[bx + 1][zi], matHA, secRibSec);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 6. TRANSEPT — Extended arms beyond nave width
      //    Extends 7.5m on each side (Z<0 and Z>45m)
      //    at bays transeptBay and transeptBay+1
      // ═══════════════════════════════════════════════════════════════

      const transeptH = 30; // transept arm vault height
      const trNodes: number[][] = []; // [side 0=left, 1=right][0=base, 1=mid, 2=top]

      for (let side = 0; side < 2; side++) {
        const tz = side === 0 ? -transeptExt : totalWidth + transeptExt;
        trNodes[side] = [];

        for (let bi = 0; bi < 2; bi++) {
          const bx = transeptBay + bi;
          const x = bx * G;
          const base = api.addNode(x, 0, tz);
          api.addSupport(base, 'fixed3d');
          const mid = api.addNode(x, galleryH, tz);
          const top = api.addNode(x, transeptH, tz);
          addF(base, mid, matGranite, secGranite);
          addF(mid, top, matGranite, secBranch1);

          // Connect to main nave outer columns
          const nearZi = side === 0 ? 0 : 5;
          addF(mid, cMid[bx][nearZi], matHA, secGallery);
          addF(top, cTop[bx][nearZi], matHA, secRibMain);
          trNodes[side].push(top);
        }
        // Transverse rib between transept pair
        if (trNodes[side].length === 2) {
          addF(trNodes[side][0], trNodes[side][1], matHA, secRibMain);
        }
      }

      // Transept vault quads (connecting transept arm to outer nave)
      for (let side = 0; side < 2; side++) {
        const nearZi = side === 0 ? 0 : 5;
        if (trNodes[side].length === 2) {
          api.addQuad([
            cTop[transeptBay][nearZi], cTop[transeptBay + 1][nearZi],
            trNodes[side][1], trNodes[side][0],
          ], matHA, 0.20);
        }
      }

      // Crossing vault — extra shell above the 4 porphyry columns
      // The crossing reaches 60m height (already captured by crownH[2]=60 for central nave)
      // Add a special keystone node at 60m
      const keystoneNode = api.addNode(
        (transeptBay + 0.5) * G, 60,
        (colZPos[2] + colZPos[3]) / 2,
      );
      // Connect to 4 crossing column tops
      addF(cTop[transeptBay][2], keystoneNode, matHA, secRibMain);
      addF(cTop[transeptBay + 1][2], keystoneNode, matHA, secRibMain);
      addF(cTop[transeptBay][3], keystoneNode, matHA, secRibMain);
      addF(cTop[transeptBay + 1][3], keystoneNode, matHA, secRibMain);
      // Crossing shell plates (4 triangles)
      api.addPlate([cTop[transeptBay][2], cTop[transeptBay + 1][2], keystoneNode], matHA, 0.35);
      api.addPlate([cTop[transeptBay + 1][2], cTop[transeptBay + 1][3], keystoneNode], matHA, 0.35);
      api.addPlate([cTop[transeptBay + 1][3], cTop[transeptBay][3], keystoneNode], matHA, 0.35);
      api.addPlate([cTop[transeptBay][3], cTop[transeptBay][2], keystoneNode], matHA, 0.35);

      // ═══════════════════════════════════════════════════════════════
      // 7. APSE — Semicircular ambulatory with 7 radial chapels
      //    Located at X > 90m (east end)
      //    Outer ring: R=22.5m (ambulatory columns)
      //    Inner ring: R=15m (connects to last nave columns)
      // ═══════════════════════════════════════════════════════════════

      const apseCx = totalLength + 5;   // center X of apse
      const apseCz = totalWidth / 2;    // center Z
      const apseRout = 22.5;            // outer ambulatory radius
      const apseRin = 15;               // inner ring radius
      const nApseCol = 9;               // columns in semicircle
      const apseH = 30;                 // ambulatory vault height
      const apseApexH = 75;             // apse apex (highest vault)

      const apseOutBase: number[] = [];
      const apseOutTop: number[] = [];
      const apseInBase: number[] = [];
      const apseInTop: number[] = [];

      for (let i = 0; i < nApseCol; i++) {
        const angle = Math.PI * (0.5 + i / (nApseCol - 1)); // 90° to 270°

        // Outer ring
        const ox = apseCx + apseRout * Math.cos(angle);
        const oz = apseCz + apseRout * Math.sin(angle);
        apseOutBase[i] = api.addNode(ox, 0, oz);
        api.addSupport(apseOutBase[i], 'fixed3d');
        apseOutTop[i] = api.addNode(ox, apseH, oz);
        addF(apseOutBase[i], apseOutTop[i], matSandst, secSandst);

        // Inner ring
        const ix = apseCx + apseRin * Math.cos(angle);
        const iz = apseCz + apseRin * Math.sin(angle);
        apseInBase[i] = api.addNode(ix, 0, iz);
        api.addSupport(apseInBase[i], 'fixed3d');
        apseInTop[i] = api.addNode(ix, apseH + 8, iz);
        addF(apseInBase[i], apseInTop[i], matGranite, secGranite);
      }

      // Ribs between apse columns
      for (let i = 0; i < nApseCol - 1; i++) {
        addF(apseOutTop[i], apseOutTop[i + 1], matHA, secRibMain);
        addF(apseInTop[i], apseInTop[i + 1], matHA, secRibMain);
        addF(apseOutTop[i], apseInTop[i], matHA, secRibSec); // radial ribs
        // Ambulatory shell quads between rings
        api.addQuad([
          apseOutTop[i], apseOutTop[i + 1], apseInTop[i + 1], apseInTop[i],
        ], matHA, 0.20);
      }
      // Last radial rib
      addF(apseOutTop[nApseCol - 1], apseInTop[nApseCol - 1], matHA, secRibSec);

      // Connect apse inner ring to last nave columns
      addF(apseInTop[0], cTop[nBaysLong][5], matHA, secRibMain);
      addF(apseInTop[nApseCol - 1], cTop[nBaysLong][0], matHA, secRibMain);
      // Connect intermediate apse columns to nearest nave columns
      const midApse = Math.floor(nApseCol / 2);
      addF(apseInTop[midApse], cTop[nBaysLong][2], matHA, secRibMain);
      addF(apseInTop[midApse], cTop[nBaysLong][3], matHA, secRibMain);
      // More connections
      if (nApseCol >= 5) {
        addF(apseInTop[2], cTop[nBaysLong][4], matHA, secRibSec);
        addF(apseInTop[nApseCol - 3], cTop[nBaysLong][1], matHA, secRibSec);
      }

      // Apse vault apex
      const apseApex = api.addNode(apseCx, apseApexH, apseCz);
      for (let i = 0; i < nApseCol; i++) {
        addF(apseInTop[i], apseApex, matHA, secRibDiag);
      }
      // Apse crown shells (triangular)
      for (let i = 0; i < nApseCol - 1; i++) {
        api.addPlate([apseInTop[i], apseInTop[i + 1], apseApex], matHA, 0.25);
      }

      // 7 radial chapel niches (small extrusions beyond outer ring)
      const nChapels = 7;
      for (let i = 0; i < nChapels; i++) {
        const angle = Math.PI * (0.6 + i * 0.8 / (nChapels - 1));
        const chapR = apseRout + 4; // 4m deep chapels
        const cx = apseCx + chapR * Math.cos(angle);
        const cz = apseCz + chapR * Math.sin(angle);
        const chapBase = api.addNode(cx, 0, cz);
        api.addSupport(chapBase, 'fixed3d');
        const chapTop = api.addNode(cx, apseH - 5, cz);
        addF(chapBase, chapTop, matSandst, secSandst);
        // Connect to nearest outer apse column
        const nearI = Math.round(i * (nApseCol - 1) / (nChapels - 1));
        addF(chapTop, apseOutTop[Math.min(nearI, nApseCol - 1)], matHA, secRibSec);
      }

      // ═══════════════════════════════════════════════════════════════
      // 8. ALL 18 TOWERS — Octagonal cylinders with helicoid twist
      //    Bell towers (12): octagonal with parabolic profile + helicoid rotation
      //    Evangelist towers (4): octagonal, straight taper, taller
      //    Virgin Mary (1): octagonal with star crown (12-pointed)
      //    Jesus Christ (1): octagonal, tallest at 172.5m (23 × 7.5m module)
      //
      //    Each tower uses 8 nodes per level arranged in a circle.
      //    Helicoid twist: each level rotates by twistPerLevel radians.
      //    Bell tower profile: parabolic bulge (wider at mid-height, pinches at top)
      //    Pinnacle: top 15% narrows rapidly to a spire point.
      // ═══════════════════════════════════════════════════════════════

      // Bell tower profile: radius as function of normalized height t ∈ [0,1]
      // Based on the real Sagrada Familia bell tower silhouette:
      // Flared base → slight narrowing → midheight bulge → rapid taper → pinnacle
      function bellProfile(t: number, baseR: number): number {
        if (t < 0.05) return baseR * (1.0 + 0.1 * (1 - t / 0.05)); // base flare
        if (t < 0.25) return baseR * (1.0 - 0.08 * ((t - 0.05) / 0.20)); // slight narrowing
        if (t < 0.55) return baseR * (0.92 + 0.18 * Math.sin(Math.PI * (t - 0.25) / 0.30)); // midheight bulge
        if (t < 0.75) return baseR * (1.0 - 0.25 * ((t - 0.55) / 0.20)); // upper taper
        if (t < 0.88) return baseR * (0.75 - 0.45 * ((t - 0.75) / 0.13)); // rapid taper to pinnacle neck
        return baseR * (0.30 - 0.25 * ((t - 0.88) / 0.12)); // pinnacle spire
      }
      // Straight taper for central towers
      function straightProfile(t: number, baseR: number): number {
        return baseR * (1.0 - 0.35 * t);
      }
      // Evangelist profile: slight entasis (classical bulge)
      function entasisProfile(t: number, baseR: number): number {
        const entasis = 0.06 * Math.sin(Math.PI * t * 0.7); // subtle bulge in lower half
        return baseR * (1.0 - 0.30 * t + entasis);
      }

      const NSides = 8; // octagonal cross-section for all towers

      // Tower definitions with profile type
      type TowerProfile = 'bell' | 'straight' | 'entasis';
      const allTowers: { x: number; z: number; h: number; r: number; levels: number; twist: number; profile: TowerProfile }[] = [
        // 12 Bell towers — octagonal with parabolic profile + helicoid twist (12°/level)
        // Nativity facade (X=0)
        { x: -5, z: 5.5, h: 98, r: 3.0, levels: 18, twist: 0.21, profile: 'bell' },
        { x: -5, z: 14.5, h: 107.5, r: 3.0, levels: 20, twist: 0.21, profile: 'bell' },
        { x: -5, z: 23, h: 107.5, r: 3.0, levels: 20, twist: -0.21, profile: 'bell' },
        { x: -5, z: 32, h: 98, r: 3.0, levels: 18, twist: -0.21, profile: 'bell' },
        // Passion facade (X=totalLength)
        { x: totalLength + 5, z: 5.5, h: 107.5, r: 3.0, levels: 20, twist: 0.21, profile: 'bell' },
        { x: totalLength + 5, z: 14.5, h: 112, r: 3.0, levels: 20, twist: 0.21, profile: 'bell' },
        { x: totalLength + 5, z: 23, h: 112, r: 3.0, levels: 20, twist: -0.21, profile: 'bell' },
        { x: totalLength + 5, z: 32, h: 107.5, r: 3.0, levels: 20, twist: -0.21, profile: 'bell' },
        // Glory facade (Z=0)
        { x: 20, z: -6, h: 112, r: 3.0, levels: 20, twist: 0.21, profile: 'bell' },
        { x: 32, z: -6, h: 120, r: 3.0, levels: 22, twist: 0.21, profile: 'bell' },
        { x: 44, z: -6, h: 120, r: 3.0, levels: 22, twist: -0.21, profile: 'bell' },
        { x: 56, z: -6, h: 112, r: 3.0, levels: 20, twist: -0.21, profile: 'bell' },
        // 4 Evangelist towers — octagonal with entasis, above the crossing
        { x: transeptBay * G - 4, z: 2 * G - 4, h: 135, r: 3.5, levels: 22, twist: 0.10, profile: 'entasis' },
        { x: (transeptBay + 1) * G + 4, z: 2 * G - 4, h: 135, r: 3.5, levels: 22, twist: -0.10, profile: 'entasis' },
        { x: transeptBay * G - 4, z: 4 * G + 4, h: 135, r: 3.5, levels: 22, twist: -0.10, profile: 'entasis' },
        { x: (transeptBay + 1) * G + 4, z: 4 * G + 4, h: 135, r: 3.5, levels: 22, twist: 0.10, profile: 'entasis' },
        // Virgin Mary tower — above apse
        { x: totalLength + 3, z: totalWidth / 2, h: 138, r: 4.0, levels: 24, twist: 0.08, profile: 'entasis' },
        // Jesus Christ tower — tallest, above crossing, 172.5m = 23 × 7.5m
        { x: (transeptBay + 0.5) * G, z: totalWidth / 2, h: 172.5, r: 5.0, levels: 28, twist: 0.05, profile: 'straight' },
      ];

      for (const tw of allTowers) {
        const profileFn = tw.profile === 'bell' ? bellProfile
          : tw.profile === 'entasis' ? entasisProfile : straightProfile;

        // Generate octagonal nodes at each level with helicoid twist
        const tN: number[][] = []; // [level][vertex 0..NSides-1]
        for (let lv = 0; lv <= tw.levels; lv++) {
          tN[lv] = [];
          const t = lv / tw.levels;
          const y = t * tw.h;
          const r = profileFn(t, tw.r);
          const baseAngle = lv * tw.twist; // helicoid twist accumulates per level

          for (let v = 0; v < NSides; v++) {
            const angle = baseAngle + (2 * Math.PI * v) / NSides;
            const nx = tw.x + r * Math.cos(angle);
            const nz = tw.z + r * Math.sin(angle);
            tN[lv][v] = api.addNode(nx, y, nz);
          }
          // Fixed supports at base
          if (lv === 0) {
            for (let v = 0; v < NSides; v++) api.addSupport(tN[0][v], 'fixed3d');
          }
        }

        // Vertical columns: each vertex connects to the same vertex on next level
        for (let lv = 0; lv < tw.levels; lv++) {
          for (let v = 0; v < NSides; v++) {
            addF(tN[lv][v], tN[lv + 1][v], matHA, secTwCol);
          }
        }

        // Horizontal ring beams: every level (octagonal rings)
        for (let lv = 0; lv <= tw.levels; lv++) {
          // Full ring every 2 levels, partial (4 alternating) on others
          const step = lv % 2 === 0 ? 1 : 2;
          for (let v = 0; v < NSides; v += step) {
            addF(tN[lv][v], tN[lv][(v + step) % NSides], matHA, secTwBeam);
          }
        }

        // Helicoid diagonal bracing: connects vertex v at level lv
        // to vertex (v+1) at level lv+1, creating the spiral staircase effect
        // visible in the real towers' openwork windows
        for (let lv = 0; lv < tw.levels; lv++) {
          for (let v = 0; v < NSides; v++) {
            // Spiral diagonal (helicoid pattern)
            const nextV = (v + 1) % NSides;
            addT(tN[lv][v], tN[lv + 1][nextV], matSteel, secTwBrace);
          }
          // Counter-spiral every other level for stability
          if (lv % 2 === 0) {
            for (let v = 0; v < NSides; v++) {
              const prevV = (v + NSides - 1) % NSides;
              addT(tN[lv][v], tN[lv + 1][prevV], matSteel, secTwBrace);
            }
          }
        }

        // Tower shell panels on lower half (solid masonry skin)
        // Represented as quads between adjacent vertices across 2 levels
        const solidLevels = Math.floor(tw.levels * 0.45);
        for (let lv = 0; lv < solidLevels; lv += 2) {
          for (let v = 0; v < NSides; v++) {
            const vn = (v + 1) % NSides;
            api.addQuad(
              [tN[lv][v], tN[lv][vn], tN[lv + 1][vn], tN[lv + 1][v]],
              matHA, 0.30,
            );
          }
        }

        // Pinnacle cross-ribs at top 3 levels (for bell towers)
        if (tw.profile === 'bell' && tw.levels >= 4) {
          const topLv = tw.levels;
          // Cross-bracing through center at top
          for (let v = 0; v < NSides / 2; v++) {
            addF(tN[topLv][v], tN[topLv][v + NSides / 2], matHA, secTwBeam);
            addF(tN[topLv - 1][v], tN[topLv - 1][v + NSides / 2], matHA, secTwBeam);
          }
        }

        // Connect towers to main structure at gallery and vault levels
        // Find 3 nearest column tops and connect with ribs
        const connections: { bx: number; zi: number; dist: number }[] = [];
        for (let bx = 0; bx <= nBaysLong; bx++) {
          for (let zi = 0; zi < 6; zi++) {
            const dx = bx * G - tw.x;
            const dz = colZPos[zi] - tw.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 15 && dist > 2) connections.push({ bx, zi, dist });
          }
        }
        connections.sort((a, b) => a.dist - b.dist);
        const nConn = Math.min(3, connections.length);
        for (let ci = 0; ci < nConn; ci++) {
          const { bx: cbx, zi: czi } = connections[ci];
          // Connect at gallery level (level ~3) and vault level (level ~5)
          const galleryLv = Math.min(3, tw.levels);
          const vaultLv = Math.min(6, tw.levels);
          addF(tN[galleryLv][0], cMid[cbx][czi], matHA, secRibSec);
          addF(tN[vaultLv][0], cTop[cbx][czi], matHA, secRibSec);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 9. CLOISTER GALLERIES — Covered walkways along outer walls
      //    Running along Z=0 and Z=45m between facade towers
      // ═══════════════════════════════════════════════════════════════

      const cloisterH = 8;  // cloister height
      const cloisterW = 4;  // cloister width (extends outward)

      for (const side of [0, 1]) {
        const baseZ = side === 0 ? -cloisterW : totalWidth + cloisterW;
        const wallZi = side === 0 ? 0 : 5;

        for (let bx = 1; bx < nBaysLong; bx++) { // skip first and last (facades)
          const x = bx * G;
          const clBase = api.addNode(x, 0, baseZ);
          api.addSupport(clBase, 'fixed3d');
          const clTop = api.addNode(x, cloisterH, baseZ);
          addF(clBase, clTop, matSandst, secWall);
          // Connect to main outer column at gallery level
          addF(clTop, cMid[bx][wallZi], matHA, secGallery);
        }
        // Longitudinal beams along cloister
        for (let bx = 1; bx < nBaysLong - 1; bx++) {
          addF(cMid[bx][wallZi], cMid[bx + 1][wallZi], matHA, secGallery);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 10. LOAD CASES — D + L + Wind + Seismic
      // ═══════════════════════════════════════════════════════════════

      api.model.loadCases = [
        { id: 1, type: 'D' as LoadCaseType, name: 'D — Peso propio + acabados (3 kN/m²)' },
        { id: 2, type: 'L' as LoadCaseType, name: 'L — Mantenimiento cubierta (0.5 kN/m²)' },
        { id: 3, type: 'W' as LoadCaseType, name: 'W — Viento +X (Mediterráneo NE)' },
        { id: 4, type: 'W' as LoadCaseType, name: 'W — Viento −X (SW)' },
        { id: 5, type: 'W' as LoadCaseType, name: 'W — Viento +Z (SE)' },
        { id: 6, type: 'E' as LoadCaseType, name: 'E — Sismo +X (CTE Barcelona, ag=0.04g)' },
        { id: 7, type: 'E' as LoadCaseType, name: 'E — Sismo +Z' },
      ];
      api.nextId.loadCase = 8;

      // ─── D: Dead load (finishes, installations) over vault nodes ───
      // 3 kN/m² additional over 90×45 = 4050 m²
      for (let bx = 0; bx <= nBaysLong; bx++) {
        for (let zi = 0; zi < 6; zi++) {
          const tribX = bx === 0 || bx === nBaysLong ? G / 2 : G;
          const tribZ = zi === 0 ? colZPos[1] / 2
            : zi === 5 ? (totalWidth - colZPos[4]) / 2
            : (colZPos[zi + 1] - colZPos[zi - 1]) / 2;
          api.addNodalLoad3D(cTop[bx][zi], 0, -3.0 * tribX * tribZ, 0, 0, 0, 0, 1);
        }
      }

      // ─── L: Maintenance access on vaults ───
      for (let bx = 0; bx <= nBaysLong; bx++) {
        for (let zi = 0; zi < 6; zi++) {
          const tribX = bx === 0 || bx === nBaysLong ? G / 2 : G;
          const tribZ = zi === 0 ? colZPos[1] / 2
            : zi === 5 ? (totalWidth - colZPos[4]) / 2
            : (colZPos[zi + 1] - colZPos[zi - 1]) / 2;
          api.addNodalLoad3D(cTop[bx][zi], 0, -0.5 * tribX * tribZ, 0, 0, 0, 0, 2);
        }
      }

      // ─── W: Wind loads (Barcelona: q=0.5 kN/m², Cp windward=0.8, leeward=0.5) ───
      // W+X (case 3): pressure on X=0 facade, suction on X=last
      for (let zi = 0; zi < 6; zi++) {
        const h = vaultH[zi];
        const tribZ = zi === 0 || zi === 5 ? G / 2 : G;
        // Windward
        api.addNodalLoad3D(cTop[0][zi], 0.5 * 0.8 * h * tribZ, 0, 0, 0, 0, 0, 3);
        // Leeward
        api.addNodalLoad3D(cTop[nBaysLong][zi], 0.5 * 0.5 * h * tribZ, 0, 0, 0, 0, 0, 3);
      }
      // W-X (case 4): reversed
      for (let zi = 0; zi < 6; zi++) {
        const h = vaultH[zi];
        const tribZ = zi === 0 || zi === 5 ? G / 2 : G;
        api.addNodalLoad3D(cTop[nBaysLong][zi], -0.5 * 0.8 * h * tribZ, 0, 0, 0, 0, 0, 4);
        api.addNodalLoad3D(cTop[0][zi], -0.5 * 0.5 * h * tribZ, 0, 0, 0, 0, 0, 4);
      }
      // W+Z (case 5): transverse wind
      for (let bx = 0; bx <= nBaysLong; bx++) {
        const tribX = bx === 0 || bx === nBaysLong ? G / 2 : G;
        const h = vaultH[0]; // outer wall height
        api.addNodalLoad3D(cTop[bx][0], 0, 0, 0.5 * 0.8 * h * tribX, 0, 0, 0, 5);
        api.addNodalLoad3D(cTop[bx][5], 0, 0, 0.5 * 0.5 * h * tribX, 0, 0, 0, 5);
      }

      // ─── E: Seismic (CTE Barcelona zone, ag=0.04g) ───
      // Equivalent lateral force: F = 0.04 × W per floor
      // Approximate total weight ≈ 50,000 tonnes → Vbase ≈ 2000 kN per direction
      // Distributed proportional to height at vault tops
      const sumH = Array.from({ length: 6 }, (_, zi) => vaultH[zi]).reduce((a, b) => a + b, 0);
      for (let bx = 0; bx <= nBaysLong; bx++) {
        for (let zi = 0; zi < 6; zi++) {
          const tribX = bx === 0 || bx === nBaysLong ? G / 2 : G;
          const tribZ = zi === 0 ? colZPos[1] / 2
            : zi === 5 ? (totalWidth - colZPos[4]) / 2
            : (colZPos[zi + 1] - colZPos[zi - 1]) / 2;
          const weight = 25 * 0.25 * tribX * tribZ + 3.0 * tribX * tribZ; // vault + finishes
          const Fx = 0.04 * weight * vaultH[zi] / sumH * 6; // height-proportional
          api.addNodalLoad3D(cTop[bx][zi], Fx, 0, 0, 0, 0, 0, 6);
          api.addNodalLoad3D(cTop[bx][zi], 0, 0, Fx, 0, 0, 0, 7);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 11. LOAD COMBINATIONS — Eurocode / CTE
      // ═══════════════════════════════════════════════════════════════

      api.model.combinations = [
        { id: 1, name: 'ELU 1: 1.35D', factors: [
          { caseId: 1, factor: 1.35 },
        ]},
        { id: 2, name: 'ELU 2: 1.35D + 1.5L', factors: [
          { caseId: 1, factor: 1.35 }, { caseId: 2, factor: 1.5 },
        ]},
        { id: 3, name: 'ELU 3: 1.35D + 1.5W+X', factors: [
          { caseId: 1, factor: 1.35 }, { caseId: 3, factor: 1.5 },
        ]},
        { id: 4, name: 'ELU 4: 1.35D + 1.5W−X', factors: [
          { caseId: 1, factor: 1.35 }, { caseId: 4, factor: 1.5 },
        ]},
        { id: 5, name: 'ELU 5: 1.35D + 1.5W+Z', factors: [
          { caseId: 1, factor: 1.35 }, { caseId: 5, factor: 1.5 },
        ]},
        { id: 6, name: 'ELU 6: 1.0D + L + E+X', factors: [
          { caseId: 1, factor: 1.0 }, { caseId: 2, factor: 0.3 }, { caseId: 6, factor: 1.0 },
        ]},
        { id: 7, name: 'ELU 7: 1.0D + L + E+Z', factors: [
          { caseId: 1, factor: 1.0 }, { caseId: 2, factor: 0.3 }, { caseId: 7, factor: 1.0 },
        ]},
        { id: 8, name: 'ELU 8: 1.35D + 0.7L + 1.5W+X', factors: [
          { caseId: 1, factor: 1.35 }, { caseId: 2, factor: 0.7 }, { caseId: 3, factor: 1.5 },
        ]},
        { id: 9, name: 'ELS: 1.0D + 1.0L + 0.6W+X', factors: [
          { caseId: 1, factor: 1.0 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 0.6 },
        ]},
      ];
      api.nextId.combination = 10;

      return true;
    }

    default:
      return false;
  }
}
