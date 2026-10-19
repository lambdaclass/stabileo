/**
 * The required-steel sizing the design run reads (`verifyElement`, through `runCirsocDesign`), the
 * slab strip and the axial ceiling, by CIRSOC 201-2025; the CIRSOC FLEX workbook's own calls keep
 * the 2005 rules they are validated against.
 *
 * Clauses, from the 2025 text:
 *   Tabla 21.2.2   φ = 0,90 from εt ≥ εty + 0,003; ties 0,65 + 0,25·(εt − εty)/0,003 below it.
 *   9.3.3.1        non-prestressed beams with Pu < 0,10·f'c·Ag must be tension-controlled
 *                  (7.3.3 and 8.3.3.1 say the same of slabs). The 2005 floor was εt ≥ 0,004.
 *   22.4.2.1       Pn ≤ Pn,max (Tabla 22.4.2.1: 0,80·Po ties, 0,85·Po spirals), with fy in Po
 *                  "limitado a un máximo de 500 MPa".
 */
import { describe, it, expect } from 'vitest';
import { checkFlexure, verifyElement, checkColumn } from '../cirsoc201';
import { designSlab } from '../losas';
import { axialCap } from '../cirsoc201-basis';
import { generateInteractionDiagram } from '../interaction-diagram';
import { computeColumnCapacity, computeColumnLayout } from '../../../station-design-forces';
import { axialRange } from '../cirsoc-flex-surface';
import { shapedBarPositions, outlineOf } from '../../../design/shaped-column';

const fcd = 0.85 * 25 * 1000; // kPa, H-25

/*
 * A 0,25 × 0,50 beam, cover 0,025, stirrups Ø8, H-25, ADN 500, Mu = 262 kN·m.
 *   d = 0,50 − 0,025 − 0,008 − 0,008 = 0,459 m (the assumed Ø16); d' = 0,041 m.
 *   Singly at φ = 0,90 the steel puts εt between 0,005 (2005's tension-controlled limit, so the
 *   2005 rule accepts it) and εty + 0,003 = 0,0055 (2025's, so 9.3.3.1 does not).
 *   2025 design, compression steel with the section anchored at εt = 0,0055, φ = 0,90:
 *     cL = 0,003·d/0,0085; aL = 0,85·cL; CcL = 0,85·f'c·b·aL; Mn* = CcL·(d − aL/2);
 *     ΔM = Mu/0,90 − Mn*; Cs = ΔM/(d − d'); ε's = 0,003·(cL − d')/cL, f's = Es·ε's ≤ fy;
 *     A's = Cs/(f's − 0,85·f'c); As = (CcL + Cs)/fy.
 */
describe('a beam\'s required steel in the design run, ADN 500', () => {
  const b = 0.25, h = 0.5, fy = 500, Mu = 262;
  const d = h - 0.025 - 0.008 - 0.008, dp = 0.025 + 0.008 + 0.008;
  const params = { fc: 25, fy, cover: 0.025, b, h, stirrupDia: 8 };

  // The singly trial, by hand.
  const Rn = Mu / (0.9 * b * d * d);
  const rho = (0.85 * 25 / fy) * (1 - Math.sqrt(1 - 2 * Rn / fcd));
  const aT = rho * d * fy / (0.85 * 25), cT = aT / 0.85, etTrial = 0.003 * (d - cT) / cT;

  const etc = fy / 200000 + 0.003;
  const cL = 0.003 * d / (0.003 + etc), aL = 0.85 * cL;
  const CcL = fcd * b * aL, MnStar = CcL * (d - aL / 2);
  const Cs = (Mu / 0.9 - MnStar) / (d - dp);
  const esp = 0.003 * (cL - dp) / cL;
  const fsp = Math.min(fy, 200000 * esp) * 1000;
  const AsComp = Cs / (fsp - fcd) * 1e4;
  const As = (CcL + Cs) / (fy * 1000) * 1e4;

  it('the trial lands between the two editions\' tension-controlled limits', () => {
    expect(etTrial).toBeGreaterThan(0.005);
    expect(etTrial).toBeLessThan(etc);
  });

  it('verifyElement sizes it by 2025: compression steel, anchored at εty + 0,003', () => {
    const v = verifyElement({ elementId: 1, elementType: 'beam', Mu, Vu: 50, Nu: 0, ...params });
    expect(v.flexure.isDoublyReinforced).toBe(true);
    expect(v.flexure.AsFlexural).toBeCloseTo(As, 3);
    expect(v.flexure.steps.join(' ')).toContain(`A's,req = ${AsComp.toFixed(2)} cm²`);
  });

  it('the workbook\'s checkFlexure, with no edition, keeps 2005: singly and tension-controlled', () => {
    const r = checkFlexure(params, Mu);
    expect(r.isDoublyReinforced).toBe(false);
    expect(r.AsFlexural).toBeCloseTo(rho * b * d * 1e4, 6);
  });
});

/*
 * A one-way slab strip, h 0,10, cover 0,02, H-25, ADN 500, Mu = 29 kN·m/m: the required steel
 * (φ = 0,90, quadratic) gives εt between 0,005 and 0,0055, so the strip's φ is the 2025
 * transition value 0,65 + 0,25·(εt − 0,0025)/0,003 and the reported capacity
 * φ·As,prov·fy·(d − a/2), a = As,prov·fy/(0,85·f'c·1 m).
 */
describe('a slab strip, ADN 500', () => {
  it('reads φ from Tabla 21.2.2', () => {
    const fy = 500, Mu = 29;
    const r = designSlab({ type: 'unidirectional', h: 0.1, fc: 25, fy, cover: 0.02, Mu_x: Mu });
    expect(r.primary.layout.As).toBeGreaterThanOrEqual(r.primary.As_req);
    const d = r.d;
    const Rn = Mu / (0.9 * d * d);
    const rho = (0.85 * 25 / fy) * (1 - Math.sqrt(1 - 2 * Rn / fcd));
    const a = rho * d * fy / (0.85 * 25), c = a / 0.85, et = 0.003 * (d - c) / c;
    expect(et).toBeGreaterThan(0.005);
    expect(et).toBeLessThan(0.0055);
    const phi = 0.65 + 0.25 * (et - 0.0025) / 0.003;
    const AsProv = r.primary.layout.As * 1e-4;
    const aProv = AsProv * fy * 1000 / fcd;
    expect(r.primary.Md).toBeCloseTo(phi * AsProv * fy * 1000 * (d - aProv / 2), 6);
  });
});

/*
 * fy = 550 MPa, above 22.4.2.1's 500. 0,30 × 0,30 tied, 4Ø20 (Ast = 4·3,1416 = 12,566 cm²):
 *   Po = 0,85·25 000·(0,09 − 0,0012566) + 500 000·0,0012566 = 1 885,8 + 628,3 = 2 514,1 kN;
 *   φPn,max = 0,65·0,80·Po = 1 307,3 kN (with 550 it would read 1 340,0).
 * A spiral: 0,75·0,85·Po = 1 602,7 kN.
 */
describe('fy in Po is limited to 500 MPa (22.4.2.1)', () => {
  const Ag = 0.09, Ast = 4 * Math.PI * 0.02 ** 2 / 4;
  const Po = fcd * (Ag - Ast) + 500 * 1000 * Ast;

  it('the 2025 axial cap, tied and spiral; the workbook\'s 2005 one is unchanged', () => {
    expect(axialCap(25, 550, Ag, Ast, 'ties', '2025')).toBeCloseTo(0.65 * 0.8 * Po, 6);
    expect(axialCap(25, 550, Ag, Ast, 'spiral', '2025')).toBeCloseTo(0.75 * 0.85 * Po, 6);
    expect(axialCap(25, 550, Ag, Ast, 'ties')).toBeCloseTo(0.65 * 0.8 * (fcd * (Ag - Ast) + 550 * 1000 * Ast), 6);
  });

  it('the rectangular verifier', () => {
    const lay = computeColumnLayout(4, 20, 0.3, 0.3, 0.04, 8);
    const AsCm2 = 4 * 3.142; // REBAR_DB's Ø20
    const v = computeColumnCapacity(AsCm2, 0.3, 0.3, 25, 550, 0.04, 8, 1200, 1, lay.bars, 'z');
    const PoDb = fcd * (Ag - AsCm2 * 1e-4) + 500 * 1000 * AsCm2 * 1e-4;
    expect(v.phiPn).toBeCloseTo(0.65 * 0.8 * PoDb, 0);
  });

  it('the general section (shaped columns, walls, the plot) and the detail\'s rectangular diagram', () => {
    const circle = { kind: 'circle' as const, D: 0.5 };
    const a16 = Math.PI * 0.016 ** 2 / 4;
    const bars = shapedBarPositions(circle, 8, 16, 0.04, 8).map((p) => ({ ...p, area: a16 }));
    // The engine's circle is a 360-gon: Ag = 180·R²·sin(1°).
    const AgC = 180 * 0.25 ** 2 * Math.sin(Math.PI / 180);
    const PoC = fcd * (AgC - 8 * a16) + 500 * 1000 * 8 * a16;
    expect(axialRange(outlineOf(circle), bars, { fc: 25, fy: 550, edition: '2025' }).max).toBeCloseTo(0.65 * 0.8 * PoC, 3);
    const diag = generateInteractionDiagram({ b: 0.3, h: 0.3, fc: 25, fy: 550, cover: 0.05, AsProv: Ast * 1e4, barCount: 4, barDia: 20, edition: '2025' });
    expect(Math.max(...diag.points.map((p) => p.phiPn))).toBeCloseTo(0.65 * 0.8 * Po, 6);
  });

  it('the design run\'s column sizing', () => {
    const v = verifyElement({ elementId: 2, elementType: 'column', Mu: 20, Vu: 10, Nu: 800, b: 0.3, h: 0.3, fc: 25, fy: 550, cover: 0.04, stirrupDia: 8 });
    const AsP = v.column!.AsProv * 1e-4;
    expect(v.column!.phiPn).toBeCloseTo(0.65 * 0.8 * (fcd * (Ag - AsP) + 500 * 1000 * AsP), 6);
    // The workbook's checkColumn, with no edition, keeps fy as given.
    const w = checkColumn({ fc: 25, fy: 550, cover: 0.04, b: 0.3, h: 0.3, stirrupDia: 8 }, 800, 20);
    const AsW = w.AsProv * 1e-4;
    expect(w.phiPn).toBeCloseTo(0.65 * 0.8 * (fcd * (Ag - AsW) + 550 * 1000 * AsW), 6);
  });
});
