/**
 * Mass sources a design code defines, as a registry.
 *
 * A code states which fraction of each kind of load is present when the earthquake arrives.
 * Each entry here is one code's rule: its parameters, the clause it comes from, and the factor
 * it gives a load case of a given type. Adding a code is adding an entry; nothing that reads the
 * registry changes.
 *
 * A project stores the entry's id and its parameters, not the factors they produce, so the
 * factors follow the load cases: a live-load case added later gets the code's f1 without anyone
 * restating the table.
 *
 * Pure: no store, no runes, no i18n.
 */

import { SIMULTANEITY_F1, SIMULTANEITY_F2, type OccupancyProbability } from '../../codes/cirsoc103/spectrum';

export type MassPresetParamValue = string | number | boolean;

export type MassPresetParam =
  | { key: string; kind: 'enum'; labelKey: string; options: ReadonlyArray<{ value: string; labelKey: string }>; default: string }
  | { key: string; kind: 'boolean'; labelKey: string; default: boolean };

export interface MassPreset {
  /** Stored in the project. Never renamed once shipped. */
  id: string;
  labelKey: string;
  /** Where the rule comes from, as printed beside the factors. */
  clause: string;
  params: ReadonlyArray<MassPresetParam>;
  /** The factor for a load case of `caseType`, or null when the code does not count it as mass. */
  factorFor(caseType: string, params: Readonly<Record<string, MassPresetParamValue>>): number | null;
}

const OCCUPANCIES: ReadonlyArray<OccupancyProbability> = ['exceptional', 'reduced', 'intermediate', 'high', 'full', 'other'];

/**
 * INPRES-CIRSOC 103-I (2018) [3.15]: Wi = Di + f1·Li + f2·Si, factors from Tabla 3.3.
 *
 * f1 depends on how likely the imposed load is to be present — a quarter for dwellings and
 * offices, three quarters for a warehouse — and f2 on whether the roof retains snow. A roof live
 * load (`Lr`) is maintenance load, the table's "exceptional" row.
 */
export const CIRSOC_103_2018: MassPreset = {
  id: 'cirsoc103-2018',
  labelKey: 'pro.massPreset.cirsoc103.label',
  clause: 'INPRES-CIRSOC 103-I (2018) [3.15], Tabla 3.3',
  params: [
    {
      key: 'occupancy', kind: 'enum', labelKey: 'pro.massPreset.cirsoc103.occupancy',
      options: OCCUPANCIES.map((o) => ({ value: o, labelKey: `pro.massPreset.cirsoc103.occupancy.${o}` })),
      default: 'reduced',
    },
    { key: 'snowRetaining', kind: 'boolean', labelKey: 'pro.massPreset.cirsoc103.snowRetaining', default: false },
  ],
  factorFor(caseType, params) {
    const occupancy = (OCCUPANCIES as readonly string[]).includes(String(params.occupancy))
      ? params.occupancy as OccupancyProbability : 'reduced';
    switch (caseType) {
      case 'D': return 1;
      case 'L': return SIMULTANEITY_F1[occupancy];
      case 'Lr': return SIMULTANEITY_F1.exceptional;
      case 'S': return params.snowRetaining === true ? SIMULTANEITY_F2.retaining : SIMULTANEITY_F2.other;
      default: return null;
    }
  },
};

export const MASS_PRESETS: ReadonlyArray<MassPreset> = [CIRSOC_103_2018];

export function massPresetById(id: string): MassPreset | undefined {
  return MASS_PRESETS.find((p) => p.id === id);
}

/** A preset's parameters with every missing one at its default. */
export function presetParams(
  preset: MassPreset,
  given: Readonly<Record<string, MassPresetParamValue>> = {},
): Record<string, MassPresetParamValue> {
  const out: Record<string, MassPresetParamValue> = {};
  for (const p of preset.params) out[p.key] = given[p.key] ?? p.default;
  return out;
}
