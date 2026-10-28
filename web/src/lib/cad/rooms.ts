// Room-/use-based live loads from architectural CAD text labels.
//
// A plan's room labels (ESTAR, DORMITORIO, BAÑO, BALCÓN, …) are mapped to a
// live-load category + value through an EXPLICIT table whose q values trace to
// the app's implemented CIRSOC 101 occupancy table (lib/engine/auto-loads.ts).
// This is NOT automatic code-load generation beyond that table: it is a
// name→category lookup the user can see and toggle. Classification of which
// quad belongs to which room is by NEAREST LABEL POSITION (v1) — there are no
// closed room polygons in these plans, only text — and splitting a slab by
// room boundaries is future work.

export interface RoomUse {
  /** Stable category key (named group; several share a q value honestly). */
  category: string;
  /** Live load q in kN/m² (from the CIRSOC 101 occupancy table). */
  q: number;
}

/**
 * Room category → live load (kN/m²). q values from CIRSOC 101
 * (OCCUPANCY_TABLE in auto-loads.ts): residential general/private/stairs 2.0,
 * residential balcony 5.0, private terrace 3.0, car parking 2.5, offices 2.5,
 * retail upper floors 4.0, light storage 6.0.
 */
export const ROOM_CATEGORY_LOADS: Record<string, number> = {
  living: 2.0,      // ESTAR/COMEDOR/HALL/PASILLO/PALIER — residential general
  private: 2.0,     // DORMITORIO/BAÑO/COCINA/VESTIDOR/LAVADERO — residential
  stair: 2.0,       // ESCALERA — residential stairs
  balcony: 5.0,     // BALCÓN/VOLADIZO — residential balcony
  terrace: 3.0,     // TERRAZA/AZOTEA — private terrace
  garage: 2.5,      // COCHERA — car parking
  office: 2.5,      // OFICINA
  commercial: 4.0,  // LOCAL/COMERCIO — retail upper floors
  storage: 6.0,     // DEPÓSITO — light storage
};

/** Room-name keyword → category. Spanish (accent-insensitive) + English. */
const ROOM_VOCAB: Array<{ category: string; tokens: string[] }> = [
  { category: 'balcony', tokens: ['BALCON', 'BALCÓN', 'VOLADIZO', 'BALCONY'] },
  { category: 'terrace', tokens: ['TERRAZA', 'AZOTEA', 'TERRACE', 'ROOF TERRACE'] },
  { category: 'stair', tokens: ['ESCALERA', 'ESCALERAS', 'STAIR', 'STAIRS', 'STAIRCASE'] },
  { category: 'garage', tokens: ['COCHERA', 'COCHERAS', 'GARAGE', 'GARAJE', 'PARKING'] },
  { category: 'office', tokens: ['OFICINA', 'OFICINAS', 'OFFICE', 'ESCRITORIO', 'DESPACHO'] },
  { category: 'commercial', tokens: ['LOCAL', 'LOCALES', 'COMERCIO', 'COMERCIAL', 'SHOP', 'RETAIL', 'TIENDA'] },
  { category: 'storage', tokens: ['DEPOSITO', 'DEPÓSITO', 'STORAGE', 'BODEGA', 'BAULERA'] },
  // Residential "private" rooms (bedroom/bath/kitchen/…).
  { category: 'private', tokens: ['DORMITORIO', 'DORM', 'BEDROOM', 'BAÑO', 'BANO', 'BATH', 'BATHROOM', 'TOILETTE', 'TOILET', 'COCINA', 'KITCHEN', 'VESTIDOR', 'CLOSET', 'LAVADERO', 'LAUNDRY', 'SUITE'] },
  // Residential "living"/circulation (general 2.0).
  { category: 'living', tokens: ['ESTAR', 'COMEDOR', 'LIVING', 'DINING', 'HALL', 'PASILLO', 'PALIER', 'CORRIDOR', 'RECIBIDOR', 'ESTUDIO'] },
];

/** Classify a (possibly MTEXT-formatted) room label; null if not a room. */
export function classifyRoomLabel(raw: string): { category: string; q: number; raw: string } | null {
  // Strip MTEXT formatting ({\f…;TEXT}, \P, \pxqc;) and accents-insensitive
  // matching is handled by listing both accented and plain tokens.
  const cleaned = raw
    .replace(/\\P/g, ' ')
    .replace(/\\p[^;]*;/g, '')
    .replace(/\{\\[^;{}]*;/g, '')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .toUpperCase()
    .trim();
  if (!cleaned || cleaned.length > 40) return null;
  // Ignore obvious dimension/height notes ("H = 2.40 m").
  if (/^\s*[HE]\s*=/.test(cleaned)) return null;
  for (const { category, tokens } of ROOM_VOCAB) {
    if (tokens.some((tk) => {
      const i = cleaned.indexOf(tk);
      if (i < 0) return false;
      const before = i === 0 ? '' : cleaned[i - 1];
      const after = i + tk.length >= cleaned.length ? '' : cleaned[i + tk.length];
      const letter = (c: string) => c !== '' && /[A-ZÁÉÍÓÚÑ]/.test(c);
      return !letter(before) && !letter(after);
    })) {
      return { category, q: ROOM_CATEGORY_LOADS[category], raw: cleaned };
    }
  }
  return null;
}

/**
 * The occupancy-table rows (`codes/cirsoc101/live-loads.ts`) a room's name may be, most likely
 * first. A name alone does not decide the row: a corridor of a dwelling and one of an office are
 * different rows, a kitchen of a dwelling and one of a restaurant too. Use zones offer these as a
 * suggestion the engineer confirms (`model/use-zones.ts`); no value is read from the name.
 */
const ROOM_OCCUPANCY: Array<{ tokens: string[]; candidates: string[] }> = [
  { tokens: ['DORMITORIO', 'DORM', 'BEDROOM', 'SUITE'], candidates: ['vivienda_dormitorio'] },
  { tokens: ['PASILLO', 'CORREDOR', 'CORRIDOR', 'PALIER', 'CIRCULACION', 'CIRCULACIÓN'], candidates: ['vivienda', 'oficina_corredores_sup', 'escuela_pasillos_sup', 'hospital_corredores'] },
  { tokens: ['ESTAR', 'COMEDOR', 'LIVING', 'DINING', 'HALL', 'RECIBIDOR', 'ESTUDIO', 'LAVADERO', 'LAUNDRY', 'VESTIDOR', 'CLOSET'], candidates: ['vivienda'] },
  { tokens: ['BAÑO', 'BANO', 'BATH', 'BATHROOM', 'TOILETTE', 'TOILET'], candidates: ['bano_vivienda', 'bano_otros'] },
  { tokens: ['COCINA', 'KITCHEN'], candidates: ['cocina_vivienda', 'cocina_otros'] },
  { tokens: ['BALCON', 'BALCÓN', 'BALCONY', 'VOLADIZO'], candidates: ['balcon_vivienda', 'balcon_casa_pequena', 'balcon_otros'] },
  { tokens: ['TERRAZA', 'AZOTEA', 'TERRACE'], candidates: ['azotea_privada', 'azotea_publica', 'azotea_inaccesible'] },
  { tokens: ['ESCALERA', 'ESCALERAS', 'STAIR', 'STAIRS'], candidates: ['escalera_privada', 'escalera_otros'] },
  { tokens: ['COCHERA', 'COCHERAS', 'GARAGE', 'GARAJE', 'PARKING'], candidates: ['garaje_autos', 'garaje_camiones'] },
  { tokens: ['OFICINA', 'OFICINAS', 'OFFICE', 'DESPACHO'], candidates: ['oficina'] },
  { tokens: ['LOCAL', 'LOCALES', 'COMERCIO', 'SHOP', 'RETAIL', 'TIENDA'], candidates: ['comercio_minorista_pb', 'comercio_minorista_sup', 'comercio_mayorista'] },
  { tokens: ['DEPOSITO', 'DEPÓSITO', 'STORAGE', 'BODEGA', 'BAULERA'], candidates: ['deposito_liviano', 'deposito_pesado'] },
];

/** The rows a room label may be, most likely first; empty when the name says nothing known. */
export function roomOccupancyCandidates(label: string): string[] {
  const s = label.toUpperCase();
  const word = (tk: string) => { const i = s.indexOf(tk); if (i < 0) return false; const b = s[i - 1] ?? '', a = s[i + tk.length] ?? ''; return !/[A-ZÁÉÍÓÚÑ]/.test(b) && !/[A-ZÁÉÍÓÚÑ]/.test(a); };
  return ROOM_OCCUPANCY.find((r) => r.tokens.some(word))?.candidates ?? [];
}
