/** Bar counts to areas, for the fields that take "6 Ø16" instead of cm². */
import { REBAR_DB } from '../../lib/engine/codes/argentina/cirsoc201';

export const DIAMETERS = REBAR_DB.filter((r) => r.diameter >= 6).map((r) => r.diameter);
export const areaOf = (n: number, dia: number) =>
  n * (REBAR_DB.find((r) => r.diameter === dia)?.area ?? 0);
