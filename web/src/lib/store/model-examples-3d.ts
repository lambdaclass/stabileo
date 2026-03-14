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
      // Distributed load on beams (gravity -> local Z, since ez=(0,-1,0) for horizontal bars)
      api.addDistributedLoad3D(pfB1, 0, 0, 10, 10);
      api.addDistributedLoad3D(pfB2, 0, 0, 10, 10);
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
      const niMat = api.addMaterial({ name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5 });

      // ─── Secciones ───
      const sCC = api.addSection({ name: 'Col cord 2L75', a: 0.00114, iz: 4.5e-7, iy: 4.5e-7, j: 3e-8 });
      const sCD = api.addSection({ name: 'Col diag L50', a: 0.00048, iz: 1e-7, iy: 1e-7 });
      const sTC = api.addSection({ name: 'Cab cord 2L100', a: 0.0019, iz: 1.2e-6, iy: 1.2e-6, j: 1.5e-7 });
      const sTD = api.addSection({ name: 'Cab diag L60', a: 0.00069, iz: 2e-7, iy: 2e-7 });
      const sCR = api.addSection({
        name: 'Carrilera IPN500', a: 0.0179, iz: 6.874e-4, iy: 2.48e-5,
        j: 3.3e-6, b: 0.185, h: 0.500, shape: 'I',
      });
      const sPR = api.addSection({ name: 'Correa UPN160', a: 0.00240, iz: 9.25e-6, iy: 8.5e-7, j: 5e-8 });
      const sBR = api.addSection({ name: 'Tirante Ø16', a: 0.000201, iz: 3.2e-9, iy: 3.2e-9 });
      const sLG = api.addSection({ name: 'Ret lat 2L65', a: 0.00098, iz: 3e-7, iy: 3e-7, j: 2e-8 });

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
        api.addDistributedLoad3D(eid, 0, 0, 1.41, 1.41, undefined, undefined, 1);
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
          api.addDistributedLoad3D(eid, 0, 0, -q, -q, undefined, undefined, 3);
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
        api.addDistributedLoad3D(eid, 0, 0, qDx, qDx, undefined, undefined, 1);
      }
      for (const eid of beamZIds) {
        api.addDistributedLoad3D(eid, 0, 0, qDz, qDz, undefined, undefined, 1);
      }

      // -- L (Carga viva): sobrecarga de uso --
      // Oficinas ~3 kN/m2, tributaria en vigas
      const qLx = 4;   // kN/m
      const qLz = 3;   // kN/m
      for (const eid of beamXIds) {
        api.addDistributedLoad3D(eid, 0, 0, qLx, qLx, undefined, undefined, 2);
      }
      for (const eid of beamZIds) {
        api.addDistributedLoad3D(eid, 0, 0, qLz, qLz, undefined, undefined, 2);
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

    default:
      return false;
  }
}
