/**
 * The snow block of the regulation load generator, as the dialog holds it, and the p_g it
 * reads: a locality of Tablas 1.1 a 1.15 or a site value.
 */
import { GROUND_SNOW_TABLES } from '../../codes/cirsoc104/ground-snow';
import type { RoofExposure, SnowCategory, SnowTerrain, ThermalCondition } from '../../codes/cirsoc104/snow';

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
  roofKind: 'mono' | 'gable';
  slippery: boolean;
}

export function defaultSnowConfig(): SnowConfig {
  const first = GROUND_SNOW_TABLES[0]!;
  return {
    enabled: false, fromTable: true, table: first.table, locality: first.rows[0]!.n, sitePg: 0,
    terrain: 'B', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: 'gable', slippery: false,
  };
}

/** p_g and where it came from, for the derivation. */
export function snowPg(c: SnowConfig): { pg: number; source: string } {
  if (!c.fromTable) return { pg: c.sitePg, source: 'site' };
  const tb = GROUND_SNOW_TABLES.find((x) => x.table === c.table) ?? GROUND_SNOW_TABLES[0]!;
  const r = tb.rows.find((x) => x.n === c.locality) ?? tb.rows[0]!;
  return { pg: r.pg, source: `${r.locality}, ${tb.province}, Tabla ${tb.table}` };
}
