/**
 * CIRSOC 101-2025 Tablas 3.1, 4.1 and 4.2 and the formulas of §4.7 and §4.8.1, against the
 * official text (docs/codes/CIRSOC/markdown/cirsoc-101-2025), read here independently.
 *
 * Each catalogue row is located in the converted text by its own printed label and its value is
 * read off that line, so a transcription error in the module and a parsing error here would
 * have to agree to pass. The roof formulas are held to the commentary's own tabulated values
 * (Tablas C 4.8.1, C 4.8.2 and C 4.8.3, pp. 95 and 100), parsed from the same text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEAD_TABLE_2025, findDeadEntry, checkPartitionAllowance, PARTITION_MINIMUM_KNM2 } from '../dead-loads';
import { OCCUPANCY_TABLE_2025, findOccupancy, K_LL, REDUCTION_THRESHOLD_M2, reduceLiveLoad } from '../live-loads';
import { roofLiveLoad, roofWeightClass } from '../roof-live';

const MD = (f: string) => readFileSync(fileURLToPath(new URL(`../../../../../../docs/codes/CIRSOC/markdown/cirsoc-101-2025/${f}`, import.meta.url)), 'utf8');
const ch3 = MD('capitulo-3-cargas-permanentes.md');
const ch4 = MD('capitulo-4-sobrecargas-de-diseno.md');
const num = (s: string) => Number(s.replace(',', '.'));
const section = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

// ── Tabla 3.1 ──────────────────────────────────────────────────────

const T31 = section(ch3, 'Tabla 3.1. Pesos unitarios', 'Tabla 3.2. Pesos unitarios');
const T31_LINES = T31.split('\n');
/**
 * Each module key, the printed label that identifies its line (the n-th match, from 0, when a
 * label repeats), and which column it reads: kN/m² (the first number past the label) or kN/m³
 * (the last on the line).
 */
const ROWS_31: Array<[key: string, label: RegExp, column: 'area' | 'volume', nth?: number]> = [
  ['cielo_superliviano', /poliuretano, incluida estructura de sostén, 50 mm/, 'area'],
  ['cielo_acustico', /placa acústica de fibra mineral/, 'area'],
  ['cielo_listones_acero', /listones de acero/, 'area'],
  ['cielo_pvc', /policloruro de vinilo rígido/, 'area'],
  ['cielo_termoacustico', /elementos metálicos o enlistonado de madera, incluidos éstos/, 'area'],
  ['cielo_yeso_aluminio', /plaquetas de yeso/, 'area'],
  ['cielo_mezcla_desplegado', /Mezcla de cemento, cal, arena, con material desplegado/, 'area'],
  ['cielo_yeso_desplegado', /Yeso con metal desplegado/, 'area'],
  ['cub_fibra_organica', /fibra orgánica/, 'area'],
  ['cub_alum_06', /0,6 mm de espesor \(onda chica\)/, 'area'],
  ['cub_alum_08', /0,8 mm de espesor \(onda grande\)/, 'area'],
  ['cub_alum_10', /1,0 mm de espesor \(onda grande\)/, 'area'],
  ['cub_acero_04', /-\s+0,4 mm de espesor/, 'area'],
  ['cub_acero_07', /-\s+0,7 mm de espesor/, 'area'],
  ['cub_acero_10', /-\s+1,0 mm de espesor\s+\d/, 'area'],
  ['cub_cobre', /Chapa de cobre/, 'area'],
  ['cub_zinc', /Chapa de zinc/, 'area'],
  ['cub_plastico', /Chapa de plástico reforzado/, 'area'],
  ['cub_asfaltica_7', /cartón asfáltico de siete capas/, 'area'],
  ['cub_panel_alum_eps', /Doble chapa de aluminio/, 'area'],
  ['cub_teja_asfaltica', /Teja asfáltica/, 'area'],
  ['cub_teja_espanola', /tipo español/, 'area'],
  ['cub_teja_francesa', /Marsella o francés/, 'area'],
  ['cub_teja_flamenca', /tipo flamenco/, 'area'],
  ['cub_teja_normanda', /tipo normando/, 'area'],
  ['cub_teja_romana', /tipo romano/, 'area'],
  ['cub_pizarra_nat', /pizarra natural/, 'area'],
  ['cub_pizarra_art', /pizarra artificial/, 'area'],
  ['cub_teja_vidrio', /Teja de vidrio/, 'area'],
  ['horm_simple', /-\s+sin armar/, 'volume'],
  ['horm_armado', /-\s+armado\s+\d/, 'volume'],
  ['horm_basaltico', /agregado basáltico/, 'volume'],
  ['horm_cascote', /pórtland, arena y cascote/, 'volume'],
  ['horm_hierro', /mineral de hierro/, 'volume'],
  ['horm_cal_cascote', /Hormigón de cal, arena y cascote/, 'volume'],
  ['piso_baldosa_ceramica', /Baldosa cerámica, 12 mm/, 'area'],
  ['piso_gres', /gres cerámico/, 'area'],
  ['piso_vinilico', /Baldosa vinílica/, 'area'],
  ['piso_granitico', /Baldosón granítico/, 'area'],
  ['piso_goma', /loseta de goma/, 'area'],
  ['piso_mosaico_calcareo', /Mosaico calcáreo/, 'area'],
  ['piso_granito_recon', /granito reconstituido/, 'area'],
  ['piso_parquet_dura', /-\s+madera dura/, 'area', 0],
  ['piso_parquet_semidura', /-\s+madera semidura/, 'area', 0],
  ['piso_madera_dura', /-\s+madera dura/, 'area', 1],
  ['piso_madera_semidura', /-\s+madera semidura/, 'area', 1],
  ['piso_elevado', /Piso elevado o flotante/, 'area'],
  ['piso_porcelanato', /Porcelanato/, 'area'],
  ['contrapiso_cal', /Contrapiso de cal/, 'volume'],
  ['contrapiso_cemento', /Contrapiso de cemento/, 'volume'],
  ['contrapiso_piedra', /Contrapiso de piedra/, 'volume'],
  ['piso_baldosa_mortero', /Baldosa de mortero de cemento/, 'volume'],
  ['tab_yeso_simple', /^\s+95 mm de espesor/, 'area'],
  ['tab_yeso_doble', /^\s+120 mm de espesor/, 'area'],
  ['tab_yeso_ceramico_70', /^\s+70 mm de espesor/, 'area'],
  ['tab_yeso_ceramico_100', /^\s+100 mm de espesor/, 'area'],
  ['vid_sencillo', /-\s+Sencillo/, 'volume'],
  ['vid_doble', /-\s+Doble\s/, 'volume'],
  ['vid_triple', /-\s+Triple/, 'volume'],
  ['vid_grueso', /-\s+Grueso/, 'volume'],
  ['vid_translucido', /Plano translúcido/, 'volume'],
  ['vid_armado', /Vidrio armado/, 'volume'],
];

/** The value a printed line gives, by column. Glazing rows print thickness, then kN/m². */
function read31(label: RegExp, column: 'area' | 'volume', nth = 0): { value: number; star: boolean; line: string } {
  const hits = T31_LINES.filter((l) => label.test(l));
  const line = hits[nth];
  if (!line) throw new Error(`Tabla 3.1: no line for ${label}`);
  const m = line.match(/\s(\d+(?:,\d+)?)(?=\s|$)/g)!.map((s) => num(s.trim()));
  // The label's own numbers (12 mm, 0,6 mm…) come first; the table's are the last one or two.
  const [a, b] = [m[m.length - 2], m[m.length - 1]];
  const value = column === 'volume' ? b! : (/\d\s{6,}\d/.test(line.trimEnd().slice(-20)) && /cerámica, 12 mm/.test(line) ? a! : b!);
  return { value, star: /\(\*\)/.test(line), line };
}

describe('Tabla 3.1 — every catalogue row against the printed line', () => {
  it('covers every row of the module', () => {
    expect(ROWS_31.map((r) => r[0]).sort()).toEqual(DEAD_TABLE_2025.map((e) => e.key).sort());
  });
  for (const [key, label, column, nth] of ROWS_31) {
    it(key, () => {
      const e = findDeadEntry(key)!;
      const p = read31(label, column, nth);
      // Glazing prints kN/m² in its last column (thickness before it); everything else as labelled.
      const got = e.areaKNm2 ?? e.volumeKNm3;
      expect(got, p.line).toBe(p.value);
      // The (*) batten deduction travels with exactly the rows that print it.
      expect(!!e.battenDeduction, p.line).toBe(p.star);
    });
  }
  it('the batten deduction is 0,1 kN/m², as the footnote prints', () => {
    expect(T31).toMatch(/enlistonado solamente, a los valores de esta Tabla se les debe restar 0,1 kN\/m2/);
  });
});

// ── §3.1.4 and §4.3.2, partitions ─────────────────────────────────

describe('§3.1.4 and §4.3.2 — partitions', () => {
  it('the text: owed unless L > 4 kN/m² (§3.1.4); at least 0,75 kN/m², not owed over 3,85 (§4.3.2)', () => {
    const t = ch3.replace(/\s+/g, ' ');
    expect(t).toMatch(/a menos que la sobrecarga especificada sea mayor de 4 kN\/m2/);
    const u = section(ch4, '### 4.3.2', '### 4.3.3').split('\n').map((l) => l.slice(0, 60)).join(' ').replace(/\s+/g, ' ');
    expect(u).toMatch(/deberá ser mayor o igual que 0,75 kN\/m2/);
    expect(u).toMatch(/mayor que 3,85 kN\/m2 no se requerirá/);
  });
  it('an allowance below 0,75 kN/m² is not the allowance §4.3.2 asks for', () => {
    // The finding: any positive allowance passed, so one 95 mm plasterboard row (0,35) did.
    expect(PARTITION_MINIMUM_KNM2).toBe(0.75);
    const r = checkPartitionAllowance(2.0, 0.35);
    expect(r.missing).toBe(true);
    expect(r.message.key).toBe('loads.cirsoc101.dead.partitionBelowMinimum');
    expect(r.refs.map((x) => x.clause)).toContain('4.3.2');
    expect(checkPartitionAllowance(2.0, 0.75).missing).toBe(false);
    expect(checkPartitionAllowance(2.0, 0.7499).missing).toBe(true);
    // Over 4 kN/m² neither article asks for it (the stricter of 3,85 and 4).
    expect(checkPartitionAllowance(4.01, 0).exempt).toBe(true);
    expect(checkPartitionAllowance(3.9, 0).missing).toBe(true);
  });
});

// ── Tabla 4.1 ──────────────────────────────────────────────────────

const T41 = section(ch4, 'Tabla 4.1. Sobrecargas mínimas', '### 4.3.2');
/** The normative column only: Tabla 4.1 runs in the left ~75 characters of each page. */
const T41L = T41.split('\n').map((l) => l.slice(0, 75));
/**
 * Each row as printed: a label (the text that identifies its line, n-th match when it repeats),
 * then the uniform load and the concentrated one read on that line or the next few, by column
 * position. Values are written here from the page and checked to be on it; the module's are
 * then compared with them.
 */
const ROWS_41: Array<[key: string, label: RegExp, lo: number | null, conc: number | null, noteA: boolean, nth?: number]> = [
  ['archivos', /^Archivos/, 7, null, false],
  ['reunion_asientos_fijos', /asientos fijos, sujetos al piso/, 3, null, true],
  ['reunion_vestibulos', /- vestíbulos\./, 5, null, true],
  ['reunion_asientos_moviles', /- asientos móviles\./, 5, null, true],
  ['reunion_plataformas', /plataformas de montaje/, 5, null, true],
  ['reunion_escenarios', /pisos de escenarios/, 7, null, true],
  ['reunion_proyeccion', /salas de proyección/, 5, null, true],
  ['reunion_otras', /otras áreas de reunión/, 5, null, false],
  ['azotea_publica', /^\s+personas\s+5/, 5, null, false],
  ['azotea_privada', /^\s+te\s+3/, 3, null, false],
  ['azotea_inaccesible', /azoteas inaccesibles\s+1/, 1, null, false],
  ['balcon_vivienda', /viviendas en general\s+5/, 5, null, false],
  ['balcon_casa_pequena', /excediendo 10 m\s+3/, 3, null, false],
  ['bano_vivienda', /- viviendas\s+2/, 2, null, false, 0],
  ['bano_otros', /- otros destinos\s+3/, 3, null, false, 0],
  ['biblioteca_lectura', /salas de lectura\s+3\s+4,5/, 3, 4.5, false],
  ['biblioteca_deposito', /^\s{30,}7(\s|$)/, 7, 4.5, true],
  ['biblioteca_pasillos_sup', /planta baja\s+4\s+4,5/, 4, 4.5, false, 0],
  ['biblioteca_pasillos_pb', /pasillos en planta baja\s+5\s+4,5/, 5, 4.5, false],
  ['cielorraso_liviano', /^\s+no\s+1\s*$/, 1, null, false],
  ['cielorraso_ocasional', /^\s+sional\s+0,5/, 0.5, null, false],
  ['cielorraso_mantenimiento', /^\s+nimiento\s+1\s/, null, 1, false],
  ['cocina_vivienda', /- viviendas\s+2/, 2, null, false, 1],
  ['cocina_otros', /- otros destinos\s+4/, 4, null, false],
  ['comercio_minorista_pb', /planta baja\s+5\s+4,5/, 5, 4.5, false, 0],
  ['comercio_minorista_sup', /pisos superiores\s+4\s+4,5/, 4, 4.5, false],
  ['comercio_mayorista', /venta mayorista, todos los pisos\s+6/, 6, 4.5, true],
  ['cuarto_maquinas', /Cuartos de máquinas y calderas\s+7,5/, 7.5, null, false],
  ['cubierta_usual', /cubiertas planas, inclinadas y\s+1/, 1, null, false],
  ['cubierta_jardin', /nes en terrazas y azoteas\s+5/, 5, null, false],
  ['cubierta_toldos', /Construcciones de tela sopor-\s+0,25/, 0.25, null, false],
  ['cubierta_cerramiento', /cubiertas de cerramiento \(cerra- 0,25/, 0.25, 1.0, false],
  ['cubierta_otras', /todas las demás construcciones\s+1/, 1, null, false],
  ['deposito_liviano', /- liviano\s+6\s+\(a\)/, 6, null, true],
  ['deposito_pesado', /- pesado\s+12 \(a\)/, 12, null, true],
  ['escalera_privada', /hoteles en áreas privadas\s+2/, 2, null, false],
  ['escalera_otros', /todos los demás destinos\s+5/, 5, null, false],
  ['escotillas', /Escotillas y claraboyas\s+1/, null, 1, false],
  ['escuela_aulas', /- aulas\s+3\s+4,5/, 3, 4.5, false],
  ['escuela_pasillos_sup', /superiores a planta baja\s+4\s+4,5/, 4, 4.5, false],
  ['escuela_pasillos_pb', /^\s+baja\s+5\s+4,5/, 5, 4.5, false],
  ['entrepiso_liviano', /de 650 mm2\s+1/, null, 1, false],
  ['garaje_autos', /sólo vehículos de pasajeros\s+2 \(a, b, c\)/, 2, null, true],
  ['garaje_camiones', /camiones y ómnibus\s+Ver art\. 4\.10\.3/, null, null, false],
  ['hospital_habitaciones', /habitaciones para pacientes\s+2\s+4,5/, 2, 4.5, false],
  ['hospital_quirofanos', /nes, laboratorios\s+3\s+4,5/, 3, 4.5, false],
  ['hospital_corredores', /superiores a planta baja\s+4\s+4,5/, 4, 4.5, false, 1],
  ['oficina', /- oficinas\s+2,5\s+9/, 2.5, 9, false],
  ['oficina_corredores_sup', /planta baja\s+4\s+9/, 4, 9, false],
  ['oficina_corredores_pb', /^\s+baja\s+5\s+9/, 5, 9, false],
  ['vivienda', /^\s+2\s*$/, 2, null, false, 1],
  ['fabrica_liviana', /manufactura liviana\s+6 \(a\)\s+9/, 6, 9, true],
  ['fabrica_pesada', /manufactura pesada\s+12 \(a\)\s+14/, 12, 14, true],
];

describe('Tabla 4.1 — every occupancy row against the printed line', () => {
  it('each printed label is on the page', () => {
    for (const [key, label, , , , nth] of ROWS_41) {
      const hits = T41L.filter((l) => label.test(l));
      expect(hits.length, `${key}: ${label}`).toBeGreaterThan(nth ?? 0);
    }
  });
  for (const [key, , lo, conc] of ROWS_41) {
    it(key, () => {
      const o = findOccupancy(key)!;
      expect(o, key).toBeDefined();
      expect(o.uniformKNm2, `${key} Lo`).toBe(lo);
      expect(o.concentratedKN, `${key} concentrated`).toBe(conc);
    });
  }
  it('every row printing note (a) is barred from §4.7 (directly, as assembly, or by §4.7.3/§4.7.4)', () => {
    for (const [key, , , , noteA] of ROWS_41) {
      if (!noteA) continue;
      const o = findOccupancy(key)!;
      const r = reduceLiveLoad({
        loKNm2: o.uniformKNm2 ?? 0, tributaryAreaM2: 1000, elementKind: 'interiorColumn', floorsSupported: 1,
        noReduction: o.noReduction, publicAssembly: o.assemblyKind === 'publicAssembly', passengerGarage: o.assemblyKind === 'passengerGarage',
      });
      expect(r.reduced, key).toBe(false);
    }
  });
  it('dwellings: "todas las demás áreas" (2 kN/m²) includes bedrooms (**), so 2 for a dormitorio', () => {
    expect(T41L.join(' ').replace(/\s+/g, ' ')).toMatch(/se incluyen baños,.{0,6}cocinas, lavaderos, comedores, salas de estar y dormitorios/);
    expect(findOccupancy('vivienda_dormitorio')!.uniformKNm2).toBe(2);
  });
  it('covers every module row', () => {
    const covered = new Set([...ROWS_41.map((r) => r[0]), 'balcon_otros', 'vivienda_dormitorio']);
    for (const o of OCCUPANCY_TABLE_2025) expect(covered.has(o.key), o.key).toBe(true);
  });
});

// ── Tabla 4.2 and §4.7 ─────────────────────────────────────────────

describe('Tabla 4.2 and Eq. (4.1)', () => {
  const t42 = section(ch4, 'Tabla 4.2. Factor de sobrecarga', '### 4.7.3');
  it('Tabla 4.2, row by row', () => {
    const row = (label: RegExp) => {
      const lines = t42.split('\n');
      const i = lines.findIndex((l) => label.test(l));
      // The value sits on the label's line or the one after it (wrapped labels).
      for (const l of lines.slice(i, i + 3)) { const m = /\s(\d)\s*$/.exec(l); if (m) return Number(m[1]); }
      throw new Error(String(label));
    };
    expect(K_LL.interiorColumn).toBe(row(/Columnas interiores/));
    expect(K_LL.exteriorColumnNoCantilever).toBe(row(/Columnas exteriores sin losas en/));
    expect(K_LL.edgeColumnWithCantilever).toBe(row(/Columnas de borde con losas en/));
    expect(K_LL.cornerColumnWithCantilever).toBe(row(/Columnas de esquina con losas en/));
    expect(K_LL.edgeBeamNoCantilever).toBe(row(/Vigas de borde sin losas en voladizo/));
    expect(K_LL.interiorBeam).toBe(row(/Vigas interiores/));
    expect(K_LL.other).toBe(row(/- Vigas en voladizo|^\s+1\s*$/));
  });

  it('prints the expression and its limits as implemented', () => {
    const t = section(ch4, '### 4.7.2', 'Tabla 4.2.').replace(/\s+/g, ' ');
    expect(t).toMatch(/KLL At sea mayor o igual que 37 m2/);
    expect(t).toMatch(/4,57/);
    expect(t).toMatch(/L = Lo \(0,25 \+/);
    expect(t).toMatch(/no será menor que 0,5Lo para elementos que soportan un piso y L será mayor o igual que 0,4Lo para elementos que soportan dos o más pisos/);
    expect(REDUCTION_THRESHOLD_M2).toBe(37);
  });

  it('the threshold: 36,99 m² is not reduced, 37 m² is', () => {
    const at = (kllAt: number) => reduceLiveLoad({ loKNm2: 2, tributaryAreaM2: kllAt / 2, elementKind: 'interiorBeam', floorsSupported: 1 });
    expect(at(36.99).reduced).toBe(false);
    // At 37 m² Eq. (4.1) gives 1,0013 Lo: never above Lo. The reduction starts to bite past 37,4 m².
    expect(at(37).lKNm2).toBe(2);
    expect(at(50).lKNm2).toBeCloseTo(2 * (0.25 + 4.57 / Math.sqrt(50)), 12);
  });

  it('the floors: 0,5 Lo for one floor, 0,4 Lo for two or more, reached at large areas', () => {
    const r = (floors: number) => reduceLiveLoad({ loKNm2: 2, tributaryAreaM2: 1e6, elementKind: 'interiorColumn', floorsSupported: floors });
    expect(r(1).lKNm2).toBe(1.0);
    expect(r(2).lKNm2).toBeCloseTo(0.8, 12);
  });

  it('§4.7.3 heavy: > 5 kN/m² unreduced; 20 % off for two or more floors; 5 itself is not heavy', () => {
    expect(reduceLiveLoad({ loKNm2: 6, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 1 }).lKNm2).toBe(6);
    expect(reduceLiveLoad({ loKNm2: 6, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 2 }).lKNm2).toBeCloseTo(4.8, 12);
    expect(reduceLiveLoad({ loKNm2: 5, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 1 }).reduced).toBe(true);
  });

  it('§4.7.4 passenger garages: unreduced, 20 % for two or more floors', () => {
    expect(reduceLiveLoad({ loKNm2: 2, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 1, passengerGarage: true }).reduced).toBe(false);
    expect(reduceLiveLoad({ loKNm2: 2, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 3, passengerGarage: true }).lKNm2).toBeCloseTo(1.6, 12);
  });

  it('§4.7.6 one-way slabs: the 2025 text forbids the reduction except for heavy loads', () => {
    const t = section(ch4, '### 4.7.6', '### 4.8').split('\n').map((l) => l.slice(0, 55)).join(' ').replace(/\s+/g, ' ');
    expect(t).toMatch(/Para losas en una sola dirección, las sobrecargas no se podrán reducir excepto en el caso de sobrecargas pesadas/);
    // The finding: Eq. (4.1) was applied to a one-way slab whose width was within 1,5 × span.
    const light = reduceLiveLoad({ loKNm2: 3, tributaryAreaM2: 60, elementKind: 'other', floorsSupported: 1, oneWaySlab: true });
    expect(light.reduced).toBe(false);
    expect(light.refs[0]!.clause).toBe('4.7.6');
    const heavy = reduceLiveLoad({ loKNm2: 6, tributaryAreaM2: 60, elementKind: 'other', floorsSupported: 2, oneWaySlab: true });
    expect(heavy.lKNm2).toBeCloseTo(4.8, 12);
  });
});

// ── §4.8.1 roof live loads against the commentary's own tables ─────

describe('§4.8.1 — Lr against Tablas C 4.8.1, C 4.8.2 (heavy) and C 4.8.3 (light)', () => {
  it('the weight class: heavy above 0,5 kN/m², light at 0,5 and below', () => {
    expect(section(ch4, '### 4.8.1', 'Para los elementos estructurales de la estructura').split('\n').map((l) => l.slice(0, 60)).join(' ').replace(/\s+/g, ' ')).toMatch(/peso total mayor que 0,5 kN\/m2 y como cubiertas livianas a aquellas que tengan un peso total menor o igual que 0,5 kN\/m2/);
    expect(roofWeightClass(0.5)).toBe('light');
    expect(roofWeightClass(0.5001)).toBe('heavy');
  });

  /** Rows of a commentary table: its numeric lines (indented at least `indent`, `min` numbers). */
  const rowsOf = (title: string, end: string, indent: number, min: number) => section(ch4, title, end).split('\n')
    .filter((l) => new RegExp(`^\\s{${indent},}[<>]?\\s*\\d`).test(l))
    .map((l) => l.match(/(?:[<>]\s*)?\d+(?:,\d+)?/g))
    .filter((m): m is RegExpMatchArray => !!m && m.length >= min);

  it('C 4.8.1 (At ≤ 19 m², R1 = 1) and C 4.8.2 (At ≥ 56 m², R1 = 0,6): heavy roofs', () => {
    const c481 = rowsOf('Tabla C 4.8.1. Área tributaria', 'Tabla C 4.8.2.', 40, 6);
    const c482 = rowsOf('Tabla C 4.8.2. Área tributaria', 'C 4.8.1.(a)', 40, 6);
    expect(c481).toHaveLength(10);
    expect(c482).toHaveLength(10);
    for (const [rows, at] of [[c481, 10], [c482, 100]] as const) {
      for (const m of rows) {
        // angle, slope %, R2, Lr (2005 = heavy 2025 expression), Lr 1982, ratio
        const slope = num(m[1]!.replace(/[<>\s]/g, ''));
        const r = roofLiveLoad({ weight: 'heavy', atM2: at, slopePercent: m[1]!.startsWith('<') ? 0 : slope });
        // R2 printed to three decimals (0,981 for 0,9817: cut, not rounded), Lr to two.
        expect(Math.abs(r.r2 - num(m[2]!)), m.join(' ')).toBeLessThan(0.0011);
        expect(Math.abs(r.lr - num(m[3]!)), m.join(' ')).toBeLessThanOrEqual(0.005 + 1e-9);
      }
    }
  });

  it('C 4.8.3: light roofs, At < 20 m² (R1 = 1) and At > 60 m² (R1 = 0,75)', () => {
    const rows = rowsOf('Tabla C 4.8.3. Sobrecargas en cubiertas livianas', 'Reglamento CIRSOC 101-25', 15, 8);
    expect(rows.length).toBe(14);
    for (const m of rows) {
      const lt = m[0]!.startsWith('<'), gt = m[0]!.startsWith('>');
      const p = lt ? 0 : gt ? 80 : num(m[0]!);
      const small = roofLiveLoad({ weight: 'light', atM2: 10, slopePercent: p });
      const large = roofLiveLoad({ weight: 'light', atM2: 100, slopePercent: p });
      // slope %, angle, R2, Lr (R1 = 1), Lr (R1 = 0,75), …
      expect(Math.abs(small.r2 - num(m[2]!)), m.join(' ')).toBeLessThan(0.0006);
      expect(Math.abs(small.lr - num(m[3]!)), m.join(' ')).toBeLessThanOrEqual(0.0005 + 1e-9);
      // One misprint in the commentary: at 4 % the R1 = 0,75 cell prints 0,341 for
      // 0,45 · 0,75 · 1,008 = 0,3402 (its neighbours round correctly: 0,343 at 3 %, 0,338 at 5 %;
      // the same row also prints 2,79° for 4 %, which is 2,29°).
      const misprint = m[0] === '4';
      expect(Math.abs(large.lr - num(m[4]!)), m.join(' ')).toBeLessThanOrEqual((misprint ? 0.001 : 0.0005) + 1e-9);
    }
  });

  it('R1 and R2 at their boundaries, as printed (both expressions are discontinuous at At = 20 m²)', () => {
    const h = (at: number, p: number) => roofLiveLoad({ weight: 'heavy', atM2: at, slopePercent: p });
    expect(h(19.99, 0).r1).toBe(1);
    expect(h(20, 0).r1).toBeCloseTo(1.2 - 0.01076 * 20, 12);
    expect(h(60, 0).r1).toBeCloseTo(1.2 - 0.01076 * 60, 12);
    expect(h(60.01, 0).r1).toBe(0.6);
    expect(h(0, 4 / 0.12).r2).toBe(1);                   // F = 4
    expect(h(0, 12 / 0.12).r2).toBeCloseTo(0.6, 12);     // F = 12
    const l = (at: number, p: number) => roofLiveLoad({ weight: 'light', atM2: at, slopePercent: p });
    expect(l(0, 2.999).r2).toBe(1.7);
    expect(l(0, 3).r2).toBeCloseTo(1.016, 12);
    expect(l(0, 55).r2).toBeCloseTo(0.6, 12);
    expect(l(0, 56).r2).toBe(0.6);
    expect(l(20, 0).r1).toBeCloseTo(1.0, 12);
    expect(l(60, 0).r1).toBeCloseTo(0.75, 12);
    // The bounds: 0,58 ≤ Lr ≤ 0,96 heavy, 0,203 ≤ Lr ≤ 0,765 light.
    expect(h(1000, 1000).lr).toBe(0.58);
    expect(l(1000, 1000).lr).toBe(0.203);
    expect(l(0, 0).lr).toBeCloseTo(0.765, 12);
  });
});
