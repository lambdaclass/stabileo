/** The values the app carried before they moved to code profiles, copied verbatim from the modules that held them. */
import { clause, type ClauseRef } from '../../codes/regulation';
import type { AssemblyKind, OccupancyCategory, OccupancyEntry } from '../../codes/cirsoc101/live-loads';
import type { MassUse } from '../../codes/turkey/inputs';
import { EN1991_1_1, UK_NA_1991_1_1, type EcFamily } from '../../codes/eurocode/refs';
import type { ImposedCategory } from '../../codes/eurocode/context';
import { A7 } from '../../codes/asce7/refs';
import { TS498 } from '../../codes/turkey/refs';
import type { Ec2Params } from '../../engine/design/eurocode/ec2-params';

type Psi = readonly [number, number, number];
const FT = 0.3048;
const LBF_KN = 4.4482216152605e-3;
const PSF = LBF_KN / (FT * FT);

export const OLD_EC2_RECOMMENDED: Ec2Params = {
  code: 'en-1992-1-1',
  gammaC: 1.5, gammaS: 1.15,
  alphaCC: 1.0, alphaCCShear: 1.0, alphaCT: 1.0,
  crdc: 0.18 / 1.5, k1: 0.15, vminCoeff: 0.035,
  cotThetaMin: 1, cotThetaMax: 2.5,
  nu1Factor: 1,
  xuLimitLow: 0.45, xuLimitHigh: 0.35,
  beamMinFctm: 0.26, beamMinAbs: 0.0013, beamMaxRatio: 0.04,
  linkMinCoeff: 0.08, linkMaxSpacing: 0.75,
  colMinN: 0.1, colMinAbs: 0.002, colMaxRatio: 0.04,
  lambdaLimCoeff: 20,
  es: 200000,
};

export const OLD_EC2_UK: Ec2Params = { ...OLD_EC2_RECOMMENDED, code: 'bs-en-1992-1-1', alphaCC: 0.85, alphaCCShear: 1.0 };

export const EC2_SET_EXTRAS = { punchingMaxCoeff: 0.4, colBarMin: 8 };
export const UK_SET_EXTRAS = { punchingMaxCoeff: 0.5, colBarMin: 12 };

const IMPOSED_EN: Readonly<Record<ImposedCategory, Psi>> = {
  A: [0.7, 0.5, 0.3], B: [0.7, 0.5, 0.3], C: [0.7, 0.7, 0.6], D: [0.7, 0.7, 0.6],
  E: [1.0, 0.9, 0.8], F: [0.7, 0.7, 0.6], G: [0.7, 0.5, 0.3], H: [0, 0, 0],
};

export const OLD_PSI: Readonly<Record<EcFamily, {
  imposed: Readonly<Record<ImposedCategory, Psi>>; snowLow: Psi; snowHigh: Psi; wind: Psi; thermal: Psi;
}>> = {
  eurocode: { imposed: IMPOSED_EN, snowLow: [0.5, 0.2, 0], snowHigh: [0.7, 0.5, 0.2], wind: [0.6, 0.2, 0], thermal: [0.6, 0.5, 0] },
  uk: { imposed: { ...IMPOSED_EN, H: [0.7, 0, 0] }, snowLow: [0.5, 0.2, 0], snowHigh: [0.5, 0.2, 0], wind: [0.5, 0.2, 0], thermal: [0.6, 0.5, 0] },
};

export const OLD_GAMMA = { gSup: 1.35, gInf: 1.0, q: 1.5 } as const;
export const OLD_XI: Readonly<Record<EcFamily, number>> = { eurocode: 0.85, uk: 0.925 };

export const OLD_EC_CATEGORY: Readonly<Record<string, string>> = Object.freeze({
  D: 'permanent', L: 'imposed', Lr: 'roofImposed', S: 'snow', W: 'wind', E: 'seismic', T: 'thermal', H: 'earthPressure', F: 'fluid',
});

interface EcRow { key: string; cat: ImposedCategory; sub: string; kind: OccupancyCategory; qk: number; Qk: number }

const EN_ROWS: readonly EcRow[] = [
  { key: 'ec-A-floor', cat: 'A', sub: 'A_floor', kind: 'residential', qk: 2.0, Qk: 2.0 },
  { key: 'ec-A-stairs', cat: 'A', sub: 'A_stairs', kind: 'circulation', qk: 2.0, Qk: 2.0 },
  { key: 'ec-A-balcony', cat: 'A', sub: 'A_balcony', kind: 'residential', qk: 2.5, Qk: 2.0 },
  { key: 'ec-B', cat: 'B', sub: 'B', kind: 'office', qk: 3.0, Qk: 4.5 },
  { key: 'ec-C1', cat: 'C', sub: 'C1', kind: 'assembly', qk: 3.0, Qk: 4.0 },
  { key: 'ec-C2', cat: 'C', sub: 'C2', kind: 'assembly', qk: 4.0, Qk: 4.0 },
  { key: 'ec-C3', cat: 'C', sub: 'C3', kind: 'assembly', qk: 5.0, Qk: 4.0 },
  { key: 'ec-C4', cat: 'C', sub: 'C4', kind: 'assembly', qk: 5.0, Qk: 7.0 },
  { key: 'ec-C5', cat: 'C', sub: 'C5', kind: 'assembly', qk: 5.0, Qk: 4.5 },
  { key: 'ec-D1', cat: 'D', sub: 'D1', kind: 'commercial', qk: 5.0, Qk: 4.0 },
  { key: 'ec-D2', cat: 'D', sub: 'D2', kind: 'commercial', qk: 5.0, Qk: 7.0 },
  { key: 'ec-E1', cat: 'E', sub: 'E1', kind: 'storage', qk: 7.5, Qk: 7.0 },
  { key: 'ec-H', cat: 'H', sub: 'H', kind: 'roof', qk: 0.4, Qk: 1.0 },
];

const UK_ROWS: readonly EcRow[] = [
  { key: 'uk-A1', cat: 'A', sub: 'uk_A1', kind: 'residential', qk: 1.5, Qk: 2.0 },
  { key: 'uk-A3', cat: 'A', sub: 'uk_A3', kind: 'residential', qk: 2.0, Qk: 2.0 },
  { key: 'uk-A5', cat: 'A', sub: 'uk_A5', kind: 'residential', qk: 2.5, Qk: 2.0 },
  { key: 'uk-B1', cat: 'B', sub: 'uk_B1', kind: 'office', qk: 2.5, Qk: 2.7 },
  { key: 'uk-B2', cat: 'B', sub: 'uk_B2', kind: 'office', qk: 3.0, Qk: 2.7 },
  { key: 'uk-C11', cat: 'C', sub: 'uk_C11', kind: 'assembly', qk: 2.0, Qk: 3.0 },
  { key: 'uk-C13', cat: 'C', sub: 'uk_C13', kind: 'education', qk: 3.0, Qk: 3.0 },
  { key: 'uk-C21', cat: 'C', sub: 'uk_C21', kind: 'assembly', qk: 4.0, Qk: 3.6 },
  { key: 'uk-C41', cat: 'C', sub: 'uk_C41', kind: 'assembly', qk: 5.0, Qk: 3.6 },
  { key: 'uk-C51', cat: 'C', sub: 'uk_C51', kind: 'assembly', qk: 5.0, Qk: 3.6 },
  { key: 'uk-D1', cat: 'D', sub: 'uk_D1', kind: 'commercial', qk: 4.0, Qk: 3.6 },
  { key: 'uk-D2', cat: 'D', sub: 'uk_D2', kind: 'commercial', qk: 4.0, Qk: 3.6 },
  { key: 'uk-H', cat: 'H', sub: 'uk_H', kind: 'roof', qk: 0.6, Qk: 0.9 },
];

const tableRef = (family: EcFamily, cat: ImposedCategory): ClauseRef => family === 'uk'
  ? UK_NA_1991_1_1(cat === 'H' ? 'Table NA.7' : 'Table NA.3', 'imposed loads')
  : EN1991_1_1(cat === 'H' ? 'Table 6.10' : cat === 'E' ? 'Table 6.4' : 'Table 6.2', 'imposed loads');

function entry(family: EcFamily, r: EcRow): OccupancyEntry {
  const cd = r.cat === 'C' || r.cat === 'D';
  return {
    key: r.key, labelKey: `loads.ec.occ.${r.sub}`, category: r.kind,
    uniformKNm2: r.qk, concentratedKN: r.Qk,
    ...(cd ? { assemblyKind: 'publicAssembly' as const } : {}),
    ...(r.cat === 'E' || r.cat === 'H' ? { noReduction: true } : {}),
    refs: [EN1991_1_1('Table 6.1', 'categories of use'), tableRef(family, r.cat)],
  };
}

export const EC_TABLES: Record<EcFamily, readonly OccupancyEntry[]> = {
  eurocode: Object.freeze(EN_ROWS.map((r) => entry('eurocode', r))),
  uk: Object.freeze(UK_ROWS.map((r) => entry('uk', r))),
};
export const EC_CATEGORY_OF = new Map<string, ImposedCategory>([...EN_ROWS, ...UK_ROWS].map((r) => [r.key, r.cat]));

const T41 = clause('cirsoc-101', '2025', 'Tabla 4.1',
  'sobrecargas mínimas uniformemente distribuidas y concentradas');

const e = (
  key: string, category: OccupancyCategory,
  uniformKNm2: number | null, concentratedKN: number | null = null,
  extra: Partial<OccupancyEntry> = {},
): OccupancyEntry => ({
  key, labelKey: `loads.occupancy.${key}`, category, uniformKNm2, concentratedKN,
  refs: [T41], ...extra,
});

export const OLD_CIRSOC: readonly OccupancyEntry[] = Object.freeze([
  e('archivos', 'office', 7.0),
  e('reunion_asientos_fijos', 'assembly', 3.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_vestibulos', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_asientos_moviles', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_plataformas', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_escenarios', 'assembly', 7.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_proyeccion', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_otras', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('azotea_publica', 'roof', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('azotea_privada', 'roof', 3.0),
  e('azotea_inaccesible', 'roof', 1.0),
  e('balcon_vivienda', 'residential', 5.0),
  e('balcon_casa_pequena', 'residential', 3.0),
  e('balcon_otros', 'residential', null, null,
    { seeArticle: '4.11' }),
  e('bano_vivienda', 'residential', 2.0),
  e('bano_otros', 'other', 3.0),
  e('biblioteca_lectura', 'education', 3.0, 4.5),
  e('biblioteca_deposito', 'education', 7.0, 4.5, { noReduction: true }),
  e('biblioteca_pasillos_sup', 'circulation', 4.0, 4.5),
  e('biblioteca_pasillos_pb', 'circulation', 5.0, 4.5),
  e('cielorraso_liviano', 'storage', 1.0),
  e('cielorraso_ocasional', 'storage', 0.5),
  e('cielorraso_mantenimiento', 'other', null, 1.0),
  e('cocina_vivienda', 'residential', 2.0),
  e('cocina_otros', 'other', 4.0),
  e('comercio_minorista_pb', 'commercial', 5.0, 4.5),
  e('comercio_minorista_sup', 'commercial', 4.0, 4.5),
  e('comercio_mayorista', 'commercial', 6.0, 4.5, { noReduction: true }),
  e('cuarto_maquinas', 'industrial', 7.5),
  e('cubierta_usual', 'roof', 1.0),
  e('cubierta_jardin', 'roof', 5.0),
  e('cubierta_toldos', 'roof', 0.25, null,
    { seeArticle: 'no reducible', noReduction: true }),
  e('cubierta_cerramiento', 'roof', 0.25, 1.0,
    { seeArticle: 'no reducible', noReduction: true }),
  e('cubierta_otras', 'roof', 1.0),
  e('deposito_liviano', 'storage', 6.0, null, { noReduction: true }),
  e('deposito_pesado', 'storage', 12.0, null,
    { seeArticle: '4.13', noReduction: true }),
  e('escalera_privada', 'circulation', 2.0),
  e('escalera_otros', 'circulation', 5.0),

  e('escotillas', 'other', null, 1.0),
  e('escuela_aulas', 'education', 3.0, 4.5),
  e('escuela_pasillos_sup', 'circulation', 4.0, 4.5),
  e('escuela_pasillos_pb', 'circulation', 5.0, 4.5),
  e('entrepiso_liviano', 'other', null, 1.0),

    e('garaje_autos', 'parking', 2.0, null, { garageOrPublicAssembly: true, assemblyKind: 'passengerGarage' }),
  e('garaje_camiones', 'parking', null, null,
    { garageOrPublicAssembly: true, assemblyKind: 'truckGarage', seeArticle: '4.10.3' }),
  e('hospital_habitaciones', 'health', 2.0, 4.5),
  e('hospital_quirofanos', 'health', 3.0, 4.5),
  e('hospital_corredores', 'circulation', 4.0, 4.5),
  e('oficina', 'office', 2.5, 9.0),
  e('oficina_corredores_sup', 'circulation', 4.0, 9.0),
  e('oficina_corredores_pb', 'circulation', 5.0, 9.0),
  e('vivienda', 'residential', 2.0),
  e('vivienda_dormitorio', 'residential', 2.0),
  e('fabrica_liviana', 'industrial', 6.0, 9.0, { seeArticle: '4.12.1', noReduction: true }),
  e('fabrica_pesada', 'industrial', 12.0, 14.0, { seeArticle: '4.12.1', noReduction: true }),
]);

const T43 = A7('Table 4.3-1', 'minimum live loads');
interface AsceRow { key: string; category: OccupancyCategory; psf: number | null; lb?: number; kind?: AssemblyKind; noReduction?: boolean; see?: string; storage?: boolean }

const ASSEMBLY: AssemblyKind = 'publicAssembly';

const ROWS: readonly AsceRow[] = [
  { key: 'accessOffice', category: 'office', psf: 50, lb: 2000 },
  { key: 'accessComputer', category: 'office', psf: 100, lb: 2000 },
  { key: 'armories', category: 'assembly', psf: 150, kind: ASSEMBLY },
  { key: 'assemblyFixedSeats', category: 'assembly', psf: 60, kind: ASSEMBLY },
  { key: 'assemblyLobbies', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyMovableSeats', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyPlatforms', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'assemblyStage', category: 'assembly', psf: 150, kind: ASSEMBLY },
  { key: 'assemblyOther', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'catwalks', category: 'other', psf: 40, lb: 300 },
  { key: 'corridorsFirstFloor', category: 'circulation', psf: 100 },
  { key: 'diningRooms', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'fireEscapes', category: 'circulation', psf: 100 },
  { key: 'fireEscapesDwellings', category: 'circulation', psf: 40 },
  { key: 'garagePassenger', category: 'parking', psf: 40, kind: 'passengerGarage', see: '4.10.1' },
  { key: 'garageTrucks', category: 'parking', psf: null, kind: 'truckGarage', see: '4.10.2' },
  { key: 'hospitalOperating', category: 'health', psf: 60, lb: 1000 },
  { key: 'hospitalPatient', category: 'health', psf: 40, lb: 1000 },
  { key: 'hospitalCorridors', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'libraryReading', category: 'education', psf: 60, lb: 1000 },
  { key: 'libraryStacks', category: 'storage', psf: 150, lb: 1000, storage: true },
  { key: 'libraryCorridors', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'manufacturingLight', category: 'industrial', psf: 125, lb: 2000 },
  { key: 'manufacturingHeavy', category: 'industrial', psf: 250, lb: 3000 },
  { key: 'officeLobbies', category: 'circulation', psf: 100, lb: 2000 },
  { key: 'offices', category: 'office', psf: 50, lb: 2000 },
  { key: 'officeCorridors', category: 'circulation', psf: 80, lb: 2000 },
  { key: 'penalCells', category: 'residential', psf: 40 },
  { key: 'penalCorridors', category: 'circulation', psf: 100 },
  { key: 'bowling', category: 'assembly', psf: 75, kind: ASSEMBLY },
  { key: 'danceHalls', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'gymnasiums', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'grandstands', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'stadiumsFixedSeats', category: 'assembly', psf: 60, kind: ASSEMBLY },
  { key: 'atticNoStorage', category: 'residential', psf: 10 },
  { key: 'atticStorage', category: 'storage', psf: 20, storage: true },
  { key: 'habitableAttics', category: 'residential', psf: 30 },
  { key: 'dwellingOther', category: 'residential', psf: 40 },
  { key: 'residentialPrivate', category: 'residential', psf: 40 },
  { key: 'residentialPublic', category: 'assembly', psf: 100, kind: ASSEMBLY },
  { key: 'roofOrdinary', category: 'roof', psf: 20, see: '4.8', noReduction: true },
  { key: 'roofAssembly', category: 'roof', psf: 100, kind: ASSEMBLY },
  { key: 'awningsFabric', category: 'roof', psf: 5, noReduction: true },
  { key: 'schoolClassrooms', category: 'education', psf: 40, lb: 1000 },
  { key: 'schoolCorridorsUpper', category: 'circulation', psf: 80, lb: 1000 },
  { key: 'schoolCorridorsFirst', category: 'circulation', psf: 100, lb: 1000 },
  { key: 'sidewalksTrucking', category: 'parking', psf: 250, lb: 8000 },
  { key: 'stairs', category: 'circulation', psf: 100, lb: 300 },
  { key: 'stairsDwellings', category: 'circulation', psf: 40, lb: 300 },
  { key: 'storageAboveCeilings', category: 'storage', psf: 20, storage: true },
  { key: 'warehouseLight', category: 'storage', psf: 125, storage: true },
  { key: 'warehouseHeavy', category: 'storage', psf: 250, storage: true },
  { key: 'retailFirst', category: 'commercial', psf: 100, lb: 1000 },
  { key: 'retailUpper', category: 'commercial', psf: 75, lb: 1000 },
  { key: 'wholesale', category: 'commercial', psf: 125, lb: 1000 },
  { key: 'walkways', category: 'circulation', psf: 60 },
  { key: 'yardsTerraces', category: 'assembly', psf: 100, kind: ASSEMBLY },
];

export const OLD_STORAGE: ReadonlySet<string> = new Set(ROWS.filter((r) => r.storage).map((r) => r.key));

export const OLD_ASCE: readonly OccupancyEntry[] = Object.freeze(ROWS.map((r): OccupancyEntry => ({
  key: r.key, labelKey: `loads.asce7.occ.${r.key}`, category: r.category,
  uniformKNm2: r.psf === null ? null : r.psf * PSF,
  concentratedKN: r.lb === undefined ? null : r.lb * LBF_KN,
  ...(r.kind ? { assemblyKind: r.kind, garageOrPublicAssembly: true } : {}),
  ...(r.noReduction ? { noReduction: true } : {}),
  ...(r.see ? { seeArticle: r.see } : {}),
  refs: [T43],
})));

const T7 = TS498('Çizelge 7', 'düzgün yayılı düşey hareketli yük hesap değerleri');

type TrOccupancy = OccupancyEntry & { use: MassUse };

const tr = (key: string, category: OccupancyCategory, q: number, use: MassUse, reducible = false): TrOccupancy => ({
  key, labelKey: `loads.tr.occ.${key}`, category, uniformKNm2: q, concentratedKN: null, refs: [T7], use,
  ...(reducible ? {} : { noReduction: true }),
});

export const OLD_TS498: readonly TrOccupancy[] = Object.freeze([
  tr('tr_attic_rooms', 'residential', 1.5, 'residential', true),
  tr('tr_roof_occasional', 'roof', 2.0, 'residential'),
  tr('tr_residential', 'residential', 2.0, 'residential', true),
  tr('tr_office', 'office', 2.0, 'residential', true),
  tr('tr_shop_small', 'commercial', 2.0, 'residential', true),
  tr('tr_hospital_rooms', 'health', 2.0, 'residential'),
  tr('tr_roof_terrace_garden', 'roof', 3.5, 'residential'),
  tr('tr_hospital_kitchen_exam', 'health', 3.5, 'residential'),
  tr('tr_classroom', 'education', 3.5, 'assembly'),
  tr('tr_dormitory', 'residential', 3.5, 'assembly'),
  tr('tr_amphitheatre', 'education', 3.5, 'assembly'),
  tr('tr_stairs_residential', 'circulation', 3.5, 'residential'),
  tr('tr_mosque', 'assembly', 5.0, 'assembly'),
  tr('tr_theatre_cinema', 'assembly', 5.0, 'assembly'),
  tr('tr_sport_dance_exhibition', 'assembly', 5.0, 'assembly'),
  tr('tr_stand_fixed', 'assembly', 5.0, 'assembly'),
  tr('tr_meeting_waiting', 'assembly', 5.0, 'assembly'),
  tr('tr_store', 'commercial', 5.0, 'assembly', true),
  tr('tr_restaurant', 'commercial', 5.0, 'assembly'),
  tr('tr_library', 'education', 5.0, 'assembly'),
  tr('tr_archive', 'storage', 5.0, 'storage'),
  tr('tr_workshop_light', 'industrial', 5.0, 'residential', true),
  tr('tr_kitchen_canteen', 'commercial', 5.0, 'assembly'),
  tr('tr_slaughterhouse', 'industrial', 5.0, 'residential'),
  tr('tr_bakery', 'industrial', 5.0, 'residential'),
  tr('tr_barn', 'other', 5.0, 'residential'),
  tr('tr_balcony_10', 'residential', 5.0, 'residential'),
  tr('tr_corridor_public', 'circulation', 5.0, 'assembly'),
  tr('tr_stairs_public', 'circulation', 5.0, 'assembly'),
  tr('tr_stand_unfixed', 'assembly', 7.5, 'assembly'),
  tr('tr_garage_2_5t', 'parking', 5.0, 'residential'),
]);
