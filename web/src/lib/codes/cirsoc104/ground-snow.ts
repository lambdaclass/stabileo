/**
 * CIRSOC 104-2005 Tablas 1.1 a 1.15: ground snow load p_g by locality, kN/m².
 *
 * Transcribed from `docs/codes/CIRSOC/markdown/cirsoc-104-2005/tablas.md`, row by row, and
 * checked against it by `__tests__/ground-snow.test.ts`, which re-reads the Markdown. `n` is the
 * locality's number on the map of Figura 1; `estimated` marks the values the regulation flags
 * with (*): assigned by topographic and climatic similarity rather than from data (§1.3).
 *
 * A locality not listed, or above the altitude listed, needs a site value approved by the
 * jurisdiction (Capítulo 2); the app then takes p_g as a project value.
 */

export interface GroundSnowRow {
  n: number;
  locality: string;
  /** Partido or departamento. */
  district: string;
  altitudeM: number;
  /** kN/m². */
  pg: number;
  estimated?: true;
}

export interface GroundSnowTable {
  table: string;
  province: string;
  rows: GroundSnowRow[];
}

export const GROUND_SNOW_TABLES: readonly GroundSnowTable[] = [
  { table: '1.1', province: "Buenos Aires", rows: [
    { n: 89, locality: "Azul", district: "Azul", altitudeM: 137, pg: 0.3 },
    { n: 109, locality: "Bahía Blanca", district: "Bahía Blanca", altitudeM: 19, pg: 0.3 },
    { n: 106, locality: "Balcarce", district: "Balcarce", altitudeM: 111, pg: 0.3 },
    { n: 104, locality: "Benito Juárez", district: "Benito Juárez", altitudeM: 214, pg: 0.3 },
    { n: 111, locality: "Coronel Pringles", district: "Coronel Pringles", altitudeM: 253, pg: 0.3 },
    { n: 103, locality: "Laprida", district: "Laprida", altitudeM: 213, pg: 0.3 },
    { n: 120, locality: "Médanos", district: "Villarino", altitudeM: 32, pg: 0.3 },
    { n: 100, locality: "Pigüé", district: "Saavedra", altitudeM: 287, pg: 0.3 },
    { n: 99, locality: "Puán", district: "Puán", altitudeM: 238, pg: 0.3 },
    { n: 110, locality: "Punta Alta", district: "Cnel. de Marina L Rosales", altitudeM: 6, pg: 0.3 },
    { n: 105, locality: "Tandil", district: "Tandil", altitudeM: 178, pg: 0.3 },
    { n: 108, locality: "Tornquist", district: "Tornquist", altitudeM: 290, pg: 0.3 },
  ] },
  { table: '1.2', province: "Catamarca", rows: [
    { n: 5, locality: "Andalgalá", district: "Andalgalá", altitudeM: 962, pg: 0.3 },
    { n: 1, locality: "Antofagasta de la Sierra", district: "Antofagasta de la Sierra", altitudeM: 3440, pg: 2.0 },
    { n: 3, locality: "Belén", district: "Belén", altitudeM: 1240, pg: 0.9 },
    { n: 10, locality: "Catamarca", district: "Capital", altitudeM: 505, pg: 0.3 },
    { n: 8, locality: "La Merced", district: "Paclín", altitudeM: 831, pg: 0.3, estimated: true },
    { n: 7, locality: "La Puerta", district: "Ambato", altitudeM: 650, pg: 0.3, estimated: true },
    { n: 12, locality: "San Isidro", district: "Valle Viejo", altitudeM: 500, pg: 0.3 },
    { n: 11, locality: "San José", district: "Fray Mamerto Esquiú", altitudeM: 500, pg: 0.3, estimated: true },
    { n: 4, locality: "Santa María", district: "Santa María", altitudeM: 2050, pg: 0.3 },
    { n: 6, locality: "Saujil", district: "Pomán", altitudeM: 283, pg: 0.3 },
    { n: 2, locality: "Tinogasta", district: "Tinogasta", altitudeM: 1202, pg: 0.3 },
  ] },
  { table: '1.3', province: "Córdoba", rows: [
    { n: 15, locality: "Alta Gracia", district: "Santa María", altitudeM: 553, pg: 0.3 },
    { n: 14, locality: "Córdoba", district: "Capital", altitudeM: 387, pg: 0.3 },
    { n: 7, locality: "Cosquín", district: "Punilla", altitudeM: 708, pg: 0.3 },
    { n: 9, locality: "Jesús María", district: "Colón", altitudeM: 531, pg: 0.3, estimated: true },
    { n: 19, locality: "Oliva", district: "Tercero Arriba", altitudeM: 262, pg: 0.3, estimated: true },
    { n: 23, locality: "Río Cuarto", district: "Río Cuarto", altitudeM: 434, pg: 0.3 },
    { n: 18, locality: "San Agustín", district: "Calamuchita", altitudeM: 560, pg: 0.3, estimated: true },
    { n: 13, locality: "Villa Cura Brochero", district: "San Alberto", altitudeM: 845, pg: 0.3 },
    { n: 8, locality: "Villa del Totoral", district: "Totoral", altitudeM: 575, pg: 0.3 },
    { n: 17, locality: "Villa Dolores", district: "San Javier", altitudeM: 529, pg: 0.3 },
    { n: 20, locality: "Villa María", district: "General San Martín", altitudeM: 204, pg: 0.3 },
  ] },
  { table: '1.4', province: "Chubut", rows: [
    { n: 12, locality: "Camarones", district: "Florentino Ameghino", altitudeM: 23, pg: 0.3 },
    { n: 15, locality: "Comodoro Rivadavia", district: "Escalante", altitudeM: 10, pg: 0.5 },
    { n: 5, locality: "Esquel", district: "Futaleufú", altitudeM: 530, pg: 1.2 },
    { n: 10, locality: "Gaiman", district: "Gaiman", altitudeM: 24, pg: 0.3, estimated: true },
    { n: 2, locality: "Gastre", district: "Gastre", altitudeM: 1050, pg: 0.9, estimated: true },
    { n: 7, locality: "José de San Martín", district: "Tehuelches", altitudeM: 800, pg: 2.0 },
    { n: 9, locality: "Las Plumas", district: "Mártires", altitudeM: 377, pg: 0.3, estimated: true },
    { n: 1, locality: "Leleque", district: "Cushamen", altitudeM: 266, pg: 2.0 },
    { n: 8, locality: "Paso de Indios", district: "Paso de Indios", altitudeM: 475, pg: 0.9 },
    { n: 13, locality: "Río Senguer", district: "Río Senguer", altitudeM: 690, pg: 0.9 },
    { n: 14, locality: "Sarmiento", district: "Sarmiento", altitudeM: 269, pg: 0.9 },
    { n: 6, locality: "Tecka", district: "Languiñeo", altitudeM: 775, pg: 2.0 },
    { n: 3, locality: "Telsen", district: "Telsen", altitudeM: 500, pg: 0.3, estimated: true },
  ] },
  { table: '1.5', province: "Jujuy", rows: [
    { n: 4, locality: "Abra Pampa", district: "Cochinoca", altitudeM: 3480, pg: 0.3 },
    { n: 6, locality: "Humahuaca", district: "Humahuaca", altitudeM: 2939, pg: 0.3 },
    { n: 2, locality: "La Quiaca", district: "Yaví", altitudeM: 3440, pg: 0.3 },
    { n: 3, locality: "Rinconada", district: "Rinconada", altitudeM: 3950, pg: 0.9, estimated: true },
    { n: 12, locality: "San Antonio", district: "San Antonio", altitudeM: 1200, pg: 0.3 },
    { n: 10, locality: "San Salvador de Jujuy", district: "Capital", altitudeM: 1259, pg: 0.3 },
    { n: 1, locality: "Santa Catalina", district: "Santa Catalina", altitudeM: 3905, pg: 0.3 },
    { n: 5, locality: "Susques", district: "Susques", altitudeM: 3675, pg: 0.9, estimated: true },
    { n: 8, locality: "Tilcara", district: "Tilcara", altitudeM: 2461, pg: 0.3 },
    { n: 7, locality: "Tumbaya", district: "Tumbaya", altitudeM: 2094, pg: 0.3 },
  ] },
  { table: '1.6', province: "La Pampa", rows: [
    { n: 8, locality: "Algarrobo del Aguila", district: "Chical-Co", altitudeM: 311, pg: 0.3, estimated: true },
    { n: 14, locality: "Colonia 25 de Mayo", district: "Puelén", altitudeM: 320, pg: 0.3, estimated: true },
    { n: 15, locality: "Limay Mahuida", district: "Limay Mahuida", altitudeM: 262, pg: 0.3 },
    { n: 19, locality: "Puelches", district: "Curacó", altitudeM: 380, pg: 0.3 },
    { n: 9, locality: "Santa Isabel", district: "Chalileo", altitudeM: 315, pg: 0.3 },
    { n: 10, locality: "Victorica", district: "Loventué", altitudeM: 311, pg: 0.3 },
  ] },
  { table: '1.7', province: "La Rioja", rows: [
    { n: 6, locality: "Aimogasta", district: "Arauco", altitudeM: 358, pg: 0.3 },
    { n: 5, locality: "Aminga", district: "Castro Barros", altitudeM: 1480, pg: 0.3 },
    { n: 13, locality: "Chamical", district: "Gobernador Gordillo", altitudeM: 467, pg: 0.3, estimated: true },
    { n: 17, locality: "Chepes", district: "Rosario Vera Peñaloza", altitudeM: 652, pg: 0.3 },
    { n: 8, locality: "Chilecito", district: "Chilecito", altitudeM: 1014, pg: 0.3, estimated: true },
    { n: 3, locality: "Famatina", district: "Famatina", altitudeM: 1810, pg: 0.3 },
    { n: 10, locality: "La Rioja", district: "Capital", altitudeM: 498, pg: 0.3 },
    { n: 14, locality: "Malanzán", district: "Gral. Juan Facundo Quiroga", altitudeM: 903, pg: 0.3, estimated: true },
    { n: 11, locality: "Patquia", district: "Independencia", altitudeM: 431, pg: 0.3, estimated: true },
    { n: 4, locality: "San Blas", district: "San Blas de los Sauces", altitudeM: 1050, pg: 0.3 },
    { n: 12, locality: "Tama", district: "Gral. Angel Vera Peñaloza", altitudeM: 651, pg: 0.3 },
    { n: 2, locality: "Villa Castelli", district: "General Lamadrid", altitudeM: 1250, pg: 0.3 },
    { n: 7, locality: "Villa Unión", district: "General Lavalle", altitudeM: 1240, pg: 0.3, estimated: true },
    { n: 9, locality: "Villa Sanagasta", district: "Sanagasta", altitudeM: 1000, pg: 0.3 },
    { n: 1, locality: "Vinchina", district: "Gral. Sarmiento", altitudeM: 1480, pg: 0.3 },
  ] },
  { table: '1.8', province: "Mendoza", rows: [
    { n: 17, locality: "General Alvear", district: "General Alvear", altitudeM: 466, pg: 0.9 },
    { n: 4, locality: "Godoy Cruz", district: "Godoy Cruz", altitudeM: 900, pg: 0.3, estimated: true },
    { n: 6, locality: "Guaymallén", district: "Villa Nueva", altitudeM: 750, pg: 0.3 },
    { n: 9, locality: "Junín", district: "Junín", altitudeM: 606, pg: 0.3 },
    { n: 13, locality: "La Paz", district: "La Paz", altitudeM: 503, pg: 0.3 },
    { n: 1, locality: "Las Heras", district: "Las Heras", altitudeM: 750, pg: 0.3 },
    { n: 2, locality: "Lavalle", district: "Lavalle", altitudeM: 600, pg: 0.3 },
    { n: 5, locality: "Luján de Cuyo", district: "Luján de Cuyo", altitudeM: 935, pg: 0.3 },
    { n: 7, locality: "Maipú", district: "Maipú", altitudeM: 750, pg: 0.3 },
    { n: 18, locality: "Malargüe", district: "Malargüe", altitudeM: 1440, pg: 0.9 },
    { n: 3, locality: "Mendoza", district: "Capital", altitudeM: 757, pg: 0.3 },
    { n: 11, locality: "Rivadavia", district: "Rivadavia", altitudeM: 654, pg: 0.3 },
    { n: 15, locality: "San Carlos", district: "San Carlos", altitudeM: 941, pg: 0.9 },
    { n: 8, locality: "San Martín", district: "San Martín", altitudeM: 657, pg: 0.3 },
    { n: 16, locality: "San Rafael", district: "San Rafael", altitudeM: 688, pg: 0.9 },
    { n: 12, locality: "Santa Rosa", district: "Santa Rosa", altitudeM: 606, pg: 0.3 },
    { n: 14, locality: "Tunuyán", district: "Tunuyán", altitudeM: 869, pg: 0.3 },
    { n: 10, locality: "Tupungato", district: "Tupungato", altitudeM: 1067, pg: 0.9 },
  ] },
  { table: '1.9', province: "Neuquén", rows: [
    { n: 10, locality: "Aluminé", district: "Aluminé", altitudeM: 1260, pg: 2.3 },
    { n: 1, locality: "Andacollo", district: "Minas", altitudeM: 1415, pg: 3.1 },
    { n: 6, locality: "Añelo", district: "Añelo", altitudeM: 405, pg: 0.9 },
    { n: 3, locality: "Buta Ranquil", district: "Pehuenches", altitudeM: 850, pg: 2.0 },
    { n: 2, locality: "Chos Malal", district: "Chos Malal", altitudeM: 866, pg: 2.4 },
    { n: 4, locality: "El Huecú", district: "Ñorquín", altitudeM: 1150, pg: 2.5 },
    { n: 13, locality: "Junín de los Andes", district: "Huiliches", altitudeM: 773, pg: 2.3 },
    { n: 11, locality: "Las Coloradas", district: "Catán Lil", altitudeM: 960, pg: 2.0 },
    { n: 7, locality: "Las Lajas", district: "Picunches", altitudeM: 710, pg: 1.9 },
    { n: 5, locality: "Loncopué", district: "Loncopué", altitudeM: 892, pg: 2.3 },
    { n: 9, locality: "Neuquén", district: "Confluencia", altitudeM: 265, pg: 0.9 },
    { n: 12, locality: "Picún Leufú", district: "Picún Leufú", altitudeM: 391, pg: 0.9 },
    { n: 14, locality: "Piedra del Aguila", district: "Collón Curá", altitudeM: 573, pg: 1.4 },
    { n: 15, locality: "San Martín de los Andes", district: "Lácar", altitudeM: 625, pg: 2.5 },
    { n: 16, locality: "Villa la Angostura", district: "Los Lagos", altitudeM: 845, pg: 2.5 },
    { n: 8, locality: "Zapala", district: "Zapala", altitudeM: 1012, pg: 1.5 },
  ] },
  { table: '1.10', province: "Río Negro", rows: [
    { n: 3, locality: "Choele Choel", district: "Avellaneda", altitudeM: 176, pg: 0.3 },
    { n: 2, locality: "El Cuy", district: "El Cuy", altitudeM: 705, pg: 0.9, estimated: true },
    { n: 5, locality: "General Conesa", district: "Conesa", altitudeM: 70, pg: 0.3 },
    { n: 1, locality: "General Roca", district: "General Roca", altitudeM: 236, pg: 0.6 },
    { n: 7, locality: "Maquinchao", district: "Veinticinco de Mayo", altitudeM: 888, pg: 0.9 },
    { n: 13, locality: "Ñorquinco", district: "Ñorquinco", altitudeM: 880, pg: 0.9 },
    { n: 6, locality: "Pilcaniyeu", district: "Pilcaniyeu", altitudeM: 976, pg: 0.9 },
    { n: 4, locality: "Río Colorado", district: "Pichi Mahiuda", altitudeM: 79, pg: 0.3 },
    { n: 12, locality: "San Carlos de Bariloche", district: "Bariloche", altitudeM: 800, pg: 2.0 },
    { n: 8, locality: "Sierra Colorada", district: "Nueve de Julio", altitudeM: 668, pg: 0.3, estimated: true },
  ] },
  { table: '1.11', province: "Salta", rows: [
    { n: 12, locality: "Cachi", district: "Cachi", altitudeM: 2280, pg: 0.3 },
    { n: 2, locality: "Iruya", district: "Iruya", altitudeM: 2730, pg: 0.3 },
    { n: 7, locality: "La Poma", district: "La Poma", altitudeM: 3015, pg: 0.3 },
    { n: 16, locality: "Molinos", district: "Molinos", altitudeM: 2020, pg: 0.3 },
    { n: 8, locality: "Rosario de Lerma", district: "Rosario de Lerma", altitudeM: 1332, pg: 0.3 },
    { n: 1, locality: "Santa Victoria", district: "Santa Victoria", altitudeM: 2561, pg: 0.9 },
    { n: 6, locality: "San Antonio de los Cobres", district: "Los Andes", altitudeM: 3775, pg: 0.9 },
  ] },
  { table: '1.12', province: "San Juan", rows: [
    { n: 6, locality: "Albardón", district: "Albardón", altitudeM: 609, pg: 0.3 },
    { n: 4, locality: "Calingasta", district: "Calingasta", altitudeM: 1375, pg: 0.3 },
    { n: 14, locality: "Caucete", district: "Caucete", altitudeM: 561, pg: 0.3 },
    { n: 17, locality: "Nueve de Julio", district: "Nueve de Julio", altitudeM: 561, pg: 0.3 },
    { n: 9, locality: "Rivadavia", district: "Rivadavia", altitudeM: 700, pg: 0.3 },
    { n: 1, locality: "Rodeo", district: "Iglesia", altitudeM: 1162, pg: 0.3 },
    { n: 3, locality: "San Agustín del Valle Fértil", district: "Valle Fértil", altitudeM: 850, pg: 0.3 },
    { n: 2, locality: "San José de Jáchal", district: "Jáchal", altitudeM: 1162, pg: 0.3 },
    { n: 11, locality: "San Juan", district: "Capital", altitudeM: 640, pg: 0.3 },
    { n: 12, locality: "Santa Lucía", district: "Santa Lucía", altitudeM: 641, pg: 0.3 },
    { n: 5, locality: "Ullúm", district: "Ullún", altitudeM: 750, pg: 0.3 },
    { n: 15, locality: "Villa Alberastain", district: "Pocito", altitudeM: 637, pg: 0.3 },
    { n: 7, locality: "Villa del Salvador", district: "Angaco", altitudeM: 641, pg: 0.3 },
    { n: 16, locality: "Villa Krause", district: "Rawson", altitudeM: 637, pg: 0.3 },
    { n: 18, locality: "Villa Media Agua", district: "Sarmiento", altitudeM: 544, pg: 0.3 },
    { n: 10, locality: "Villa Paula A. de Sarmiento", district: "Chimbas", altitudeM: 641, pg: 0.3 },
    { n: 13, locality: "Villa San Isidro", district: "San Martín", altitudeM: 641, pg: 0.3 },
    { n: 19, locality: "Villa Santa Rosa", district: "Veinticinco de Mayo", altitudeM: 561, pg: 0.3 },
    { n: 8, locality: "Zonda", district: "Zonda", altitudeM: 637, pg: 0.3 },
  ] },
  { table: '1.13', province: "San Luis", rows: [
    { n: 9, locality: "Buena Esperanza", district: "Gobernador Dupuy", altitudeM: 318, pg: 0.3 },
    { n: 6, locality: "Concarán", district: "Chacabuco", altitudeM: 672, pg: 0.3 },
    { n: 4, locality: "La Toma", district: "Coronel Pringles", altitudeM: 892, pg: 0.3 },
    { n: 8, locality: "Mercedes", district: "General Pedernera", altitudeM: 515, pg: 0.3 },
    { n: 1, locality: "S. F. de Monte de Oro", district: "Ayacucho", altitudeM: 776, pg: 0.3 },
    { n: 7, locality: "San Luis", district: "Capital", altitudeM: 709, pg: 0.3 },
    { n: 5, locality: "San Martín", district: "Libertador Gral. San Martín", altitudeM: 955, pg: 0.3, estimated: true },
    { n: 2, locality: "Santa Rosa", district: "Junín", altitudeM: 505, pg: 0.3 },
    { n: 3, locality: "Villa General Roca", district: "Belgrano", altitudeM: 648, pg: 0.3, estimated: true },
  ] },
  { table: '1.14', province: "Santa Cruz", rows: [
    { n: 5, locality: "El Calafate", district: "Lago Argentino", altitudeM: 225, pg: 1.2 },
    { n: 3, locality: "Gobernador Gregores", district: "Río Chico", altitudeM: 280, pg: 2.0 },
    { n: 1, locality: "Perito Moreno", district: "Lago Buenos Aires", altitudeM: 410, pg: 3.2 },
    { n: 2, locality: "Puerto Deseado", district: "Deseado", altitudeM: 13, pg: 0.3 },
    { n: 4, locality: "Puerto San Julián", district: "Magallanes", altitudeM: 19, pg: 0.4 },
    { n: 6, locality: "Puerto Santa Cruz", district: "Corpen Aike", altitudeM: 40, pg: 0.4 },
    { n: 7, locality: "Río Gallegos", district: "Güer Aike", altitudeM: 16, pg: 0.45 },
  ] },
  { table: '1.15', province: "Tierra del Fuego", rows: [
    { n: 1, locality: "Río Grande", district: "Río Grande", altitudeM: 10, pg: 0.75 },
    { n: 2, locality: "Ushuaia", district: "Ushuaia", altitudeM: 10, pg: 1.0 },
  ] },
];
