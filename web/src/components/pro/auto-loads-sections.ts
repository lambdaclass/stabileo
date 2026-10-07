/**
 * The load generator dialog's sections as it holds them, and their defaults: the dead load's rows,
 * the roof, the special loads, what the wind blows on, the seismic method, how the loads are laid
 * and where the combinations come from.
 *
 * Kept out of the components that edit them so plain code can read them: what the dialog opens on
 * (`auto-loads-memory.ts`) is built from these, and is tested without a component.
 */
import { parseDecimal } from '../../lib/utils/numeric-input';

/** One row of the dead load's build-up (`ProDeadLoadBuilder`). */
export interface DeadRow {
  /** Tabla 3.1 key, or null for a typed value. */
  entryKey: string | null;
  /** Metres, for a row the table prints per m³. */
  thickness: number;
  /** Tabla 3.1 (*) — laid on battens rather than boarding. */
  onBattens: boolean;
  /** kN/m², for a typed row. */
  q: number;
  /** True when this row is the allowance for interior partitions (§3.1.4). */
  isPartition: boolean;
}

/** How the gravity loads reach the members (`ProAutoLoadsApplying`). */
export type GravityMode = 'panels' | 'width';

/** Where the combinations come from: the regulation, or the project's rules (`ProAutoLoadsCombos`). */
export type ComboSource = 'regulation' | 'project';

/** The roof (`ProRoofLoadSection`). */
export interface RoofConfig {
  enabled: boolean;
  use: 'maintenance' | 'occupancy';
  /** Superimposed dead load of the roof, kN/m²; null: the floors'. */
  dead: number | null;
  /** null: from the roof's structure and dead load (heavy above 0,5 kN/m², `roofWeightOf`). */
  weight: 'heavy' | 'light' | null;
  occupancyKey: string;
  /** Roof slope, degrees; null: the model's roof. */
  slopeDeg: number | null;
}
export const defaultRoofConfig = (): RoofConfig => ({
  enabled: true, use: 'maintenance', dead: null, weight: null, occupancyKey: 'azotea_privada', slopeDeg: null,
});

/**
 * The roof's dead load as typed, in display units, `toSI` taking it to kN/m². Only an empty field
 * means the floors' (null). Text that does not read, or a negative, keeps `previous`, as
 * `QuantityInput` does: any of them used to switch the roof to the floors' dead load unseen.
 */
export function readRoofDead(raw: string, previous: number | null, toSI: (v: number) => number): number | null {
  if (raw.trim() === '') return null;
  const v = parseDecimal(raw);
  return v !== null && v >= 0 ? toSI(v) : previous;
}

/** T, H and F (`ProSpecialLoadsSection`). */
export interface SpecialLoadsConfig {
  thermal: { on: boolean; dt: number; grad: number };
  /** `side`: a plan point in the retained soil; off, the side is read off the plan (`special-loads.ts`). */
  soil: { on: boolean; gradeZ: number; gamma: number; k: number; surcharge: number; permanent: boolean; sideOn: boolean; sideX: number; sideY: number };
  /** `inside`: a plan point inside the fluid; off, the walls that close a region in. */
  fluid: { on: boolean; levelZ: number; gamma: number; insideOn: boolean; insideX: number; insideY: number };
}
export const defaultSpecialLoads = (): SpecialLoadsConfig => ({
  thermal: { on: false, dt: 20, grad: 0 },
  soil: { on: false, gradeZ: 0, gamma: 17.3, k: 0.5, surcharge: 0, permanent: true, sideOn: false, sideX: 0, sideY: 0 },
  fluid: { on: false, levelZ: 3, gamma: 10, insideOn: false, insideX: 0, insideY: 0 },
});

/** What the wind blows on (`ProWindStructure`). */
export interface WindStructureConfig {
  kind: 'building' | 'freeRoof' | 'latticeTower' | 'openSign' | 'solidSign' | 'chimney';
  roof: 'monoslope' | 'pitched' | 'troughed';
  blocked: boolean;
  towerSection: 'square' | 'triangle';
  round: boolean;
  solidity: number;
  diagonal: boolean;
  members: 'flat' | 'roundSmall' | 'roundLarge';
  clearance: number;
  chimney: 'squareNormal' | 'squareDiagonal' | 'hexOct' | 'roundSmooth' | 'roundRough' | 'roundVeryRough';
  /** A lattice's face width and a chimney's D, m, for a stick model whose levels span none; 0: from the nodes. */
  width: number;
  diameter: number;
}
export const defaultWindStructure = (): WindStructureConfig => ({
  kind: 'building', roof: 'pitched', blocked: false, towerSection: 'square', round: false, solidity: 0.2,
  diagonal: true, members: 'flat', clearance: 2, chimney: 'roundRough', width: 0, diameter: 0,
});

/** The seismic method (`ProSeismicMethod`). */
export interface SeismicMethodConfig {
  /** Cap. 6 static method, or Cap. 7 modal response spectrum. */
  method: 'static' | 'modal';
  /** §3.5.2: E = EH ± EV. */
  vertical: boolean;
  /** Tabla 6.3. */
  torsion: 'low' | 'medium' | 'extreme';
  /** §3.2: also at 45°. */
  diagonal: boolean;
}
export const defaultSeismicMethod = (): SeismicMethodConfig => ({ method: 'static', vertical: true, torsion: 'low', diagonal: false });
