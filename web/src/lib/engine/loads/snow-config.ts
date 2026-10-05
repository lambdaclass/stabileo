/**
 * The snow block of the regulation load generator, as the dialog holds it, and the p_g it
 * reads: a locality of Tablas 1.1 a 1.15 or a site value.
 */
import { GROUND_SNOW_TABLES } from '../../codes/cirsoc104/ground-snow';
import { roofSnow, type RoofExposure, type SnowCategory, type SnowResult, type SnowTerrain, type ThermalCondition } from '../../codes/cirsoc104/snow';

/** A separate higher structure beside the model (§7.2), as the dialog holds it. */
export interface AdjacentStructure { side: '+x' | '-x' | '+y' | '-y'; topZ: number; separation: number; length: number }

export interface SnowConfig {
  enabled: boolean;
  fromTable: boolean;
  table: string;
  locality: number;
  sitePg: number;
  terrain: SnowTerrain;
  exposure: RoofExposure;
  thermal: ThermalCondition;
  category: SnowCategory;
  roofKind: 'mono' | 'gable' | 'curved' | 'multiple' | 'dome';
  slippery: boolean;
  /** A curved roof abutting the ground or another roof at its eaves (§6.2). */
  abutting: boolean;
  /** The partial loads of Cap. 5. */
  partial: boolean;
  /** Height of a parapet around the roofs, m; 0: none (Cap. 8). */
  parapet: number;
  adjacent: AdjacentStructure[];
}

export function defaultSnowConfig(): SnowConfig {
  const first = GROUND_SNOW_TABLES[0]!;
  return {
    enabled: false, fromTable: true, table: first.table, locality: first.rows[0]!.n, sitePg: 0,
    terrain: 'B', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false, abutting: false,
    partial: true, parapet: 0, adjacent: [],
  };
}

/** p_g and where it came from, for the derivation. */
export function snowPg(c: SnowConfig): { pg: number; source: string } {
  if (!c.fromTable) return { pg: c.sitePg, source: 'site' };
  const tb = GROUND_SNOW_TABLES.find((x) => x.table === c.table) ?? GROUND_SNOW_TABLES[0]!;
  const r = tb.rows.find((x) => x.n === c.locality) ?? tb.rows[0]!;
  return { pg: r.pg, source: `${r.locality}, ${tb.province}, Tabla ${tb.table}` };
}

/**
 * p_f, C_s and p_s for the roof as the model has it, before anything is generated. A shaped roof
 * (curved, several ridges, a dome) reads C_s point by point, so its preview gives p_f.
 */
export function snowPreview(c: SnowConfig, roof: { slopeDeg: number; W: number } | null): SnowResult {
  const { pg } = snowPg(c);
  const shaped = c.roofKind === 'curved' || c.roofKind === 'multiple' || c.roofKind === 'dome';
  return roofSnow({
    pg, terrain: c.terrain, exposure: c.exposure, thermal: c.thermal, category: c.category,
    roof: { kind: (shaped ? 'mono' : c.roofKind) as 'mono' | 'gable', slopeDeg: roof?.slopeDeg ?? 0, W: roof?.W ?? 1, slippery: c.slippery },
  });
}
