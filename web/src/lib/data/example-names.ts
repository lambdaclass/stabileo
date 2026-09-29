/**
 * The names an example brings, in the language the app is in.
 *
 * The code examples are written in Spanish and most fixtures in English, so a gallery model
 * opened in any language showed "Galpón simple", "Cargas permanentes" or "Dead Load" in its tab,
 * its load cases, its materials, the combinations built from them, the report and the workbook.
 * The project takes the gallery's own title, and the case, material and section names the
 * examples use are read through keys. A name this table does not know is left as written.
 */
import { modelStore } from '../store/model.svelte';
import { t, tp } from '../i18n';

type Rename = (name: string) => string | null;

const exact = (table: Record<string, string>): Rename => (name) => (name in table ? t(table[name]!) : null);
const pattern = (re: RegExp, key: string, param: string): Rename => (name) => {
  const m = re.exec(name);
  return m ? tp(key, { [param]: m[1]! }) : null;
};
const first = (...rules: Rename[]): Rename => (name) => {
  for (const r of rules) { const v = r(name); if (v !== null) return v; }
  return null;
};

const CASE = first(
  exact({
    'Cargas permanentes': 'exData.case.dead', 'Dead Load': 'exData.case.dead',
    'Sobrecarga de uso': 'exData.case.live', 'Live Load': 'exData.case.live',
    'Sobrecarga de cubierta': 'exData.case.roofLive', 'Roof Live Load': 'exData.case.roofLive', 'Roof live load': 'exData.case.roofLive',
    'Viento X': 'exData.case.windX', 'Viento Y': 'exData.case.windY', 'Wind': 'exData.case.wind',
    'Wind +X': 'exData.case.windPlusX', 'Wind −X': 'exData.case.windMinusX',
    'Sismo X': 'exData.case.seismicX', 'Seismic +X': 'exData.case.seismicPlusX',
    'Nieve': 'exData.case.snow', 'Peso propio': 'exData.case.selfWeight', 'Crane': 'exData.case.crane',
    'Superimposed dead (screed+finish+partitions)': 'exData.case.superimposedDead',
    'Residential (living/bedroom/kitchen) 2.0 kN/m²': 'exData.case.residential',
    'Corridor & stairs 3.0 kN/m²': 'exData.case.corridors',
    'Cantilevered balcony 3.0 kN/m²': 'exData.case.balconies',
    'Roof 1.0 kN/m²': 'exData.case.roof',
    'Dead Load + Equipment': 'exData.case.deadEquipment',
    'Wind (100-yr)': 'exData.case.wind100', 'Wave + Current (100-yr)': 'exData.case.wave100',
  }),
  pattern(/^Grúa en el pórtico (\d+)$/, 'exData.case.craneAtFrame', 'n'),
);

const MATERIAL = first(
  exact({ 'Cable de acero': 'exData.mat.cable' }),
  pattern(/^(?:Acero|Steel) ([A-Z]+-?\d+)$/, 'exData.mat.steel', 'g'),
  pattern(/^Hormigón (H-\d+)$/, 'exData.mat.concrete', 'g'),
);

const SECTION = first(
  pattern(/^(?:Viga|Beam) (\d+×\d+)$/, 'exData.sec.beam', 'd'),
  pattern(/^Col (\d+×\d+)$/, 'exData.sec.column', 'd'),
);

/** Rename the loaded example's project, cases, materials and sections into the app's language. */
export function localiseExampleNames(nameKey: string): void {
  modelStore.model.name = t(nameKey);
  for (const c of modelStore.model.loadCases) {
    const v = CASE(c.name);
    if (v !== null && v !== c.name) modelStore.updateLoadCase(c.id, v);
  }
  for (const m of modelStore.materials.values()) {
    const v = MATERIAL(m.name);
    if (v !== null && v !== m.name) modelStore.updateMaterial(m.id, { name: v });
  }
  for (const s of modelStore.sections.values()) {
    const v = SECTION(s.name);
    if (v !== null && v !== s.name) modelStore.updateSection(s.id, { name: v });
  }
}
