/**
 * Precast joists for joist-and-block floors: a joist type is read from its data sheet (what the
 * maker certifies per joist) or, for one without a sheet, from its geometry (the strands' or bars'
 * area, its height and the topping it works with). Blocks are parametric: ceramic, concrete or
 * expanded polystyrene, their height and width and their weight. The library below is EXAMPLE data,
 * generic and named as such; a project adds its makers' sheets to its own library.
 */

export interface JoistSheet {
  /** Ultimate positive moment of one joist in the finished floor, kN·m. */
  muPos: number;
  /** Cracking moment, kN·m. */
  mcr: number;
  /** Stiffness of the finished floor per joist, uncracked and cracked, kN·m². */
  eiGross: number; eiCracked: number;
  /** Stiffness of the joist alone, before the topping hardens, kN·m². */
  eiJoist: number;
  /** Ultimate shear per joist, kN. */
  vu: number;
  /** Weight of the joist, kN/m. */
  selfWeight: number;
  /** Minimum bearing on each support, m, and the longest span the sheet covers, m. */
  bearing: number; maxSpan: number;
}

export interface JoistGeometry {
  /** Height of the joist, m, and the finished floor's total height, m. */
  height: number; floorHeight: number;
  /** Prestressing or reinforcing steel per joist, mm², its yield (or 0,9·fpu), MPa, its depth from the top, m. */
  steelArea: number; steelFy: number; steelDepth: number;
  /** Web width that carries shear, m. */
  webWidth: number;
  selfWeight: number;
  bearing: number; maxSpan: number;
}

export interface JoistType {
  id: string;
  name: string;
  /** Who it is from, as the project names it. */
  source: string;
  sheet?: JoistSheet;
  geometry?: JoistGeometry;
}

export type BlockKind = 'ceramic' | 'concrete' | 'eps';

export interface BlockType {
  kind: BlockKind;
  /** Height, width across the joists and length along them, m. */
  height: number; width: number; length: number;
  /** Weight of the blocks per square metre of floor, kN/m². */
  weight: number;
}

/** Example joists, generic, for trying the workflow; a project adds the sheets of its own makers. */
export const EXAMPLE_JOISTS: readonly JoistType[] = [
  { id: 'ex-v12', name: 'Vigueta pretensada 12 (ejemplo)', source: 'example', sheet: { muPos: 18, mcr: 9, eiGross: 2100, eiCracked: 900, eiJoist: 160, vu: 22, selfWeight: 0.17, bearing: 0.10, maxSpan: 5.5 } },
  { id: 'ex-v16', name: 'Vigueta pretensada 16 (ejemplo)', source: 'example', sheet: { muPos: 27, mcr: 14, eiGross: 3600, eiCracked: 1500, eiJoist: 320, vu: 28, selfWeight: 0.21, bearing: 0.10, maxSpan: 6.5 } },
  { id: 'ex-v20', name: 'Vigueta pretensada 20 (ejemplo)', source: 'example', sheet: { muPos: 38, mcr: 20, eiGross: 5800, eiCracked: 2400, eiJoist: 560, vu: 34, selfWeight: 0.26, bearing: 0.12, maxSpan: 7.5 } },
];

export const BLOCK_DEFAULTS: Readonly<Record<BlockKind, BlockType>> = {
  ceramic: { kind: 'ceramic', height: 0.12, width: 0.40, length: 0.25, weight: 0.85 },
  concrete: { kind: 'concrete', height: 0.12, width: 0.40, length: 0.25, weight: 1.20 },
  eps: { kind: 'eps', height: 0.12, width: 0.40, length: 1.00, weight: 0.05 },
};

/**
 * A type without a sheet, read from its geometry the way a sheet is made: the finished section as a
 * T of the topping over the joist web, the steel at its depth, φMn = φ·As·fy·(d − a/2) with the
 * block in the topping; Mcr and the stiffnesses of the gross and cracked T; Vc of the web.
 */
export function sheetFromGeometry(g: JoistGeometry, o: { fc: number; spacing: number; topping: number; Ec: number }): JoistSheet {
  const As = g.steelArea / 1e6, fy = g.steelFy;
  const b = o.spacing, d = g.floorHeight - (g.height - g.steelDepth);
  const a = (As * fy) / (0.85 * o.fc * b);
  const muPos = 0.9 * As * fy * 1000 * (d - a / 2);
  // Gross T: topping over a web of the joist's width the floor's height.
  const tf = o.topping, h = g.floorHeight, bw = g.webWidth;
  const Af = b * tf, Aw = bw * (h - tf);
  const yb = (Af * (h - tf / 2) + Aw * (h - tf) / 2) / (Af + Aw);
  const Ig = (b * tf ** 3) / 12 + Af * (h - tf / 2 - yb) ** 2 + (bw * (h - tf) ** 3) / 12 + Aw * ((h - tf) / 2 - yb) ** 2;
  const fr = 0.62 * Math.sqrt(o.fc) * 1000;
  const mcr = (fr * Ig) / yb;
  const n = 200000 / o.Ec;
  const kd = Math.min(tf, (-n * As + Math.sqrt((n * As) ** 2 + 2 * b * n * As * d)) / b);
  const Icr = (b * kd ** 3) / 3 + n * As * (d - kd) ** 2;
  const E = o.Ec * 1000;
  const Ij = (bw * g.height ** 3) / 12;
  return {
    muPos, mcr, eiGross: E * Ig, eiCracked: E * Icr, eiJoist: E * Ij,
    vu: 0.75 * 0.17 * Math.sqrt(o.fc) * bw * d * 1000,
    selfWeight: g.selfWeight, bearing: g.bearing, maxSpan: g.maxSpan,
  };
}
