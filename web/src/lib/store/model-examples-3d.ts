// 3D Example structures for Dedaliano
import type { ExampleAPI } from './model-examples-2d';
import type { LoadCaseType } from './model.svelte';

/** Extended API for 3D examples (adds 3D load methods) */
export interface ExampleAPI3D extends ExampleAPI {
  addDistributedLoad3D(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number;
  addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number;
}

/** Load a 3D example by name. Returns true if the example was found. */
export function load3DExample(name: string, api: ExampleAPI3D): boolean {
  switch (name) {
    case '3d-portal-frame': {
      api.model.name = 'Pórtico 3D';
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
      api.model.name = 'Reticulado Espacial';
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
      api.model.name = 'Ménsula con carga biaxial';
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
      api.model.name = 'Emparrillado';
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
      api.model.name = 'Torre 3D';
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
      api.model.name = 'Viga con torsión';
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
      // Columnas reticuladas, cabriadas Pratt, viga carrilera,
      // contraviento lateral/frontal, correas y arriostramiento
      // ══════════════════════════════════════════════════════════════
      api.model.name = 'Nave Industrial';

      // ─── Parámetros ───
      const NB = 5;            // vanos longitudinales
      const BL = 6;            // largo de vano (m)
      const SP = 20;           // luz transversal (m)
      const CH = 8;            // altura de columna (m)
      const RH = 10;           // altura de cumbrera (m)
      const CW = 0.5;          // ancho columna reticulada (m)
      const NCS = 4;           // subdivisiones columna → segmento = 2 m
      const NTP = 8;           // paneles de cabriada → panel = 2.5 m
      const CRH = 6;           // altura viga carrilera (m)
      const NF = NB + 1;       // número de pórticos
      const segH = CH / NCS;
      const panW = SP / NTP;
      const crLv = CRH / segH; // nivel de grúa = 3

      // ─── Material ───
      const niMat = api.addMaterial({ name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5 });

      // ─── Secciones ───
      const sCC = api.addSection({ name: 'Col cord 2L75', a: 0.00114, iz: 4.5e-7, iy: 4.5e-7, j: 3e-8 });
      const sCD = api.addSection({ name: 'Col diag L50', a: 0.00048, iz: 1e-7, iy: 1e-7 });
      const sTC = api.addSection({ name: 'Cab cord 2L100', a: 0.0019, iz: 1.2e-6, iy: 1.2e-6, j: 1.5e-7 });
      const sTD = api.addSection({ name: 'Cab diag L60', a: 0.00069, iz: 2e-7, iy: 2e-7 });
      const sCR = api.addSection({
        name: 'Carrilera IPN300', a: 0.00588, iz: 9.8e-5, iy: 4.5e-6,
        j: 1.2e-6, b: 0.125, h: 0.300, shape: 'I',
      });
      const sPR = api.addSection({ name: 'Correa L40', a: 0.0003, iz: 5e-8, iy: 5e-8 });
      const sBR = api.addSection({ name: 'Tirante Ø16', a: 0.000201, iz: 3.2e-9, iy: 3.2e-9 });

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
      const cL: { o: number; i: number }[][] = []; // columna izquierda [frame][level]
      const cR: { o: number; i: number }[][] = []; // columna derecha
      const tB: number[][] = []; // cordón inferior cabriada [frame][panel]
      const tT: number[][] = []; // cordón superior cabriada

      // ═══════════════════════════════════════════════
      // 1. PÓRTICOS (columnas reticuladas + cabriadas)
      // ═══════════════════════════════════════════════
      for (let f = 0; f < NF; f++) {
        const x = f * BL;
        cL[f] = []; cR[f] = [];

        // -- Nodos de columnas --
        for (let lv = 0; lv <= NCS; lv++) {
          const y = lv * segH;
          cL[f][lv] = { o: api.addNode(x, y, 0), i: api.addNode(x, y, CW) };
          cR[f][lv] = { o: api.addNode(x, y, SP), i: api.addNode(x, y, SP - CW) };
        }

        // -- Elementos columnas: cordones (frame=continuos), horizontales, diagonales Warren --
        for (let lv = 0; lv < NCS; lv++) {
          niF(cL[f][lv].o, cL[f][lv + 1].o, sCC); // cordón ext izq
          niF(cL[f][lv].i, cL[f][lv + 1].i, sCC); // cordón int izq
          niF(cR[f][lv].o, cR[f][lv + 1].o, sCC);
          niF(cR[f][lv].i, cR[f][lv + 1].i, sCC);
          niT(cL[f][lv].o, cL[f][lv].i, sCD); // horizontal izq
          niT(cR[f][lv].o, cR[f][lv].i, sCD);
          if (lv % 2 === 0) { // diagonal Warren
            niT(cL[f][lv].o, cL[f][lv + 1].i, sCD);
            niT(cR[f][lv].o, cR[f][lv + 1].i, sCD);
          } else {
            niT(cL[f][lv].i, cL[f][lv + 1].o, sCD);
            niT(cR[f][lv].i, cR[f][lv + 1].o, sCD);
          }
        }
        niT(cL[f][NCS].o, cL[f][NCS].i, sCD); // horizontal tope
        niT(cR[f][NCS].o, cR[f][NCS].i, sCD);

        // -- Cabriada principal (Pratt) --
        tB[f] = []; tT[f] = [];
        // Cordón inferior (Y=CH): extremos compartidos con columna exterior
        tB[f][0] = cL[f][NCS].o;
        for (let p = 1; p < NTP; p++) tB[f][p] = api.addNode(x, CH, p * panW);
        tB[f][NTP] = cR[f][NCS].o;
        // Cordón superior (sigue pendiente del techo)
        tT[f][0] = tB[f][0]; // compartido
        for (let p = 1; p < NTP; p++) tT[f][p] = api.addNode(x, roofY(p * panW), p * panW);
        tT[f][NTP] = tB[f][NTP]; // compartido
        // Elementos: cordones (frame — chords are continuous members)
        for (let p = 0; p < NTP; p++) niF(tB[f][p], tB[f][p + 1], sTC);
        for (let p = 0; p < NTP; p++) niF(tT[f][p], tT[f][p + 1], sTC);
        // Montantes (verticales interiores)
        for (let p = 1; p < NTP; p++) niT(tB[f][p], tT[f][p], sTD);
        // Diagonales — espejadas respecto a la cumbrera (Pratt)
        const mid = NTP / 2;
        for (let p = 1; p < mid; p++) niT(tB[f][p], tT[f][p + 1], sTD);          // izq: ↗ hacia cumbrera
        for (let p = mid; p < NTP - 1; p++) niT(tB[f][p + 1], tT[f][p], sTD);    // der: ↖ hacia cumbrera
      }

      // ═══════════════════════════════════════════════
      // 2. CONEXIONES LONGITUDINALES
      // ═══════════════════════════════════════════════
      for (let f = 0; f < NB; f++) {
        // Montantes de alero (eave struts)
        niT(cL[f][NCS].o, cL[f + 1][NCS].o, sPR);
        niT(cR[f][NCS].o, cR[f + 1][NCS].o, sPR);
        // Correas en cordón superior
        for (let p = 1; p < NTP; p++) niT(tT[f][p], tT[f + 1][p], sPR);
        // Atados en cordón inferior (todos los paneles)
        for (let p = 1; p < NTP; p++) niT(tB[f][p], tB[f + 1][p], sPR);
        // Montantes de pared (wall girts) en niveles intermedios de columnas
        for (let lv = 1; lv < NCS; lv++) {
          niT(cL[f][lv].o, cL[f + 1][lv].o, sPR);
          niT(cR[f][lv].o, cR[f + 1][lv].o, sPR);
        }
        // Vigas carrileras (frame) en cordón interior a nivel de grúa
        niF(cL[f][crLv].i, cL[f + 1][crLv].i, sCR);
        niF(cR[f][crLv].i, cR[f + 1][crLv].i, sCR);
      }

      // ═══════════════════════════════════════════════
      // 3. CONTRAVIENTOS
      // ═══════════════════════════════════════════════
      // Lateral pared (X en primer y último vano, ambos lados)
      for (const bay of [0, NB - 1]) {
        niT(cL[bay][0].o, cL[bay + 1][NCS].o, sBR);
        niT(cL[bay][NCS].o, cL[bay + 1][0].o, sBR);
        niT(cR[bay][0].o, cR[bay + 1][NCS].o, sBR);
        niT(cR[bay][NCS].o, cR[bay + 1][0].o, sBR);
      }
      // Horizontal de cubierta (plano del techo, primer y último vano)
      for (const bay of [0, NB - 1]) {
        niT(tB[bay][0], tB[bay + 1][NTP], sBR);
        niT(tB[bay][NTP], tB[bay + 1][0], sBR);
      }
      // Frontales (hastiales X=0 y X=30): columnas intermedias + riostras
      for (const f of [0, NF - 1]) {
        const x = f * BL;
        const gB: number[] = []; const gM: number[] = [];
        for (let k = 0; k < 3; k++) {
          const z = (k + 1) * SP / 4; // Z = 5, 10, 15
          gB[k] = api.addNode(x, 0, z);
          gM[k] = api.addNode(x, CH / 2, z); // Y = 4
          const pIdx = (k + 1) * NTP / 4;    // panel 2, 4, 6
          niF(gB[k], gM[k], sCC);            // columna inferior (frame)
          niF(gM[k], tB[f][pIdx], sCC);      // columna superior → cordón inf
          api.addSupport(gB[k], 'pinned3d');
        }
        // Dintel horizontal a media altura
        niT(cL[f][NCS / 2].o, gM[0], sPR);
        niT(gM[0], gM[1], sPR);
        niT(gM[1], gM[2], sPR);
        niT(gM[2], cR[f][NCS / 2].o, sPR);
        // X en paneles exteriores del hastial
        niT(cL[f][0].o, gM[0], sBR);
        niT(gB[0], cL[f][NCS / 2].o, sBR);
        niT(cR[f][0].o, gM[2], sBR);
        niT(gB[2], cR[f][NCS / 2].o, sBR);
      }

      // ═══════════════════════════════════════════════
      // 4. APOYOS
      // ═══════════════════════════════════════════════
      for (let f = 0; f < NF; f++) {
        api.addSupport(cL[f][0].o, 'pinned3d');
        api.addSupport(cL[f][0].i, 'pinned3d');
        api.addSupport(cR[f][0].o, 'pinned3d');
        api.addSupport(cR[f][0].i, 'pinned3d');
      }

      // ═══════════════════════════════════════════════
      // 5. CARGAS
      // ═══════════════════════════════════════════════
      // Peso propio cubierta: 0.5 kN/m² → nodal en cordón superior
      for (let f = 0; f < NF; f++) {
        const tribX = f === 0 || f === NF - 1 ? BL / 2 : BL;
        for (let p = 0; p <= NTP; p++) {
          const tribZ = p === 0 || p === NTP ? panW / 2 : panW;
          api.addNodalLoad3D(tT[f][p], 0, -0.5 * tribX * tribZ, 0, 0, 0, 0);
        }
      }
      // Carga de grúa: 50 kN por rueda en pórticos 2 y 3
      for (const f of [2, 3]) {
        api.addNodalLoad3D(cL[f][crLv].i, 0, -50, 0, 0, 0, 0);
        api.addNodalLoad3D(cR[f][crLv].i, 0, -50, 0, 0, 0, 0);
      }
      // Viento lateral: 0.6 kN/m² en fachada Z=0
      for (let f = 0; f < NF; f++) {
        const tribX = f === 0 || f === NF - 1 ? BL / 2 : BL;
        for (let lv = 1; lv <= NCS; lv++) {
          const tribY = lv === NCS ? segH / 2 : segH;
          api.addNodalLoad3D(cL[f][lv].o, 0, 0, 0.6 * tribX * tribY, 0, 0, 0);
        }
      }

      return true;
    }

    case '3d-building': {
      // ======================================================================
      // EDIFICIO 5 PISOS — Estructura mixta H.A./acero con cargas
      // completas: D, L, W, E y combinaciones CIRSOC 201
      // ======================================================================
      api.model.name = 'Edificio 5 Pisos (D+L+W+E)';

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
        { id: 1, type: 'D' as LoadCaseType, name: 'Carga muerta' },
        { id: 2, type: 'L' as LoadCaseType, name: 'Carga viva' },
        { id: 3, type: 'W' as LoadCaseType, name: 'Viento +X' },
        { id: 4, type: 'E' as LoadCaseType, name: 'Sismo +X' },
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

    default:
      return false;
  }
}
