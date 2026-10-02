/**
 * The auxiliary bolt calculator: J.3.7 for tension with shear, and the standard hole of Tabla
 * J.3.3.
 */
import { describe, it, expect } from 'vitest';
import { checkBoltGroup, BOLT_TABLE } from '../connection-design';

const base = { diameter: 20, grade: '8.8' as const, count: 4, shearPlanes: 1, threadsInShear: true, plateThickness: 10, plateFu: 370, edgeDistance: 40, Vu: 0, Tu: 0 };

describe('bolt calculator', () => {
  it('reduces the tension strength by the shear stress, J.3.7', () => {
    // Ab = 314.16 mm²; Vu = 200 kN on 4 bolts: frv = 159.2 MPa.
    // F'nt = 1.3·620 − 620/(0.75·330)·159.2 = 806 − 398.8 = 407.2 MPa.
    // φRnt = 0.75·407.2·314.16·4/1000 = 383.8 kN; Tu = 150 → 0.391.
    const r = checkBoltGroup({ ...base, Vu: 200, Tu: 150 });
    expect(r.ratioInteraction).toBeCloseTo(150 / 383.8, 2);
  });

  it('leaves the tension strength whole under a small shear', () => {
    const r = checkBoltGroup({ ...base, Vu: 10, Tu: 150 });
    expect(r.ratioInteraction).toBeCloseTo(r.ratioTension, 9);
  });

  it('takes the M24 hole as d + 3', () => {
    // Lc = 40 − 27/2 = 26.5 mm; 1.2·Lc·t·Fu = 117.7 kN < 2.4·d·t·Fu = 213.1 kN per bolt.
    const r = checkBoltGroup({ ...base, diameter: 24, count: 1, Vu: 1 });
    expect(r.phiRnBearing).toBeCloseTo(0.75 * 1.2 * 26.5 * 10 * 370 / 1000, 6);
  });

  it('offers only the grades Tabla J.3.2 lists', () => {
    expect(Object.keys(BOLT_TABLE).sort()).toEqual(['10.9', '4.6', '8.8']);
  });
});
