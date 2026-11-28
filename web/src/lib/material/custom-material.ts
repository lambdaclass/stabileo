/** The rules and reason keys must stay those of PRO's `CustomMaterialPanel.svelte` and `materials.alphaInvalid`. */
import { isValidThermalAlpha } from '../engine/thermal-alpha';
import { parseDecimal } from '../utils/numeric-input';
import { modelStore, type Material } from '../store/model.svelte';
import { toMaterialFields, type MaterialChoice } from './material-choice';
import type { MaterialPreset } from '../data/material-presets';

export type CustomMaterialChoice = Extract<MaterialChoice, { kind: 'custom' }>;

export interface CustomMaterialForm {
  name: string;
  /** MPa; null when blank. */
  e: number | null;
  nu: string;
  /** kN/m³; null when blank. */
  rho: number | null;
  /** MPa; null when blank, which a material with no yield point is. */
  fy: number | null;
  /** In 10⁻⁶/°C as typed; blank is the family's value. */
  alpha: string;
}

export type CustomMaterialRead =
  | { ok: true; choice: CustomMaterialChoice }
  | { ok: false; reasonKey: string };

export function alphaField(alpha: number | undefined): string {
  return alpha === undefined ? '' : String(alpha * 1e6);
}

export function readAlpha(raw: string, stored?: number): number | null | undefined {
  if (!raw.trim()) return undefined;
  const value = parseDecimal(raw);
  if (value === null) return null;
  const alpha = stored !== undefined && Number.isFinite(stored) && raw === alphaField(stored) ? stored : value * 1e-6;
  return isValidThermalAlpha(alpha) ? alpha : null;
}

export function readCustomMaterial(form: CustomMaterialForm, stored?: Pick<Material, 'alpha'>): CustomMaterialRead {
  const name = form.name.trim();
  if (!name) return { ok: false, reasonKey: 'material.custom.needName' };
  const nu = parseDecimal(form.nu);
  const { e, rho, fy } = form;
  if (e === null || nu === null || rho === null) return { ok: false, reasonKey: 'material.custom.needNumbers' };
  if (!Number.isFinite(e) || !(e > 0)) return { ok: false, reasonKey: 'material.custom.badE' };
  if (nu <= -1 || nu >= 0.5) return { ok: false, reasonKey: 'material.custom.badNu' };
  if (!Number.isFinite(rho) || !(rho >= 0)) return { ok: false, reasonKey: 'material.custom.badRho' };
  if (fy !== null && (!Number.isFinite(fy) || !(fy > 0))) return { ok: false, reasonKey: 'material.custom.badFy' };
  const alpha = readAlpha(form.alpha, stored?.alpha);
  if (alpha === null) return { ok: false, reasonKey: 'materials.alphaInvalid' };
  return {
    ok: true,
    choice: {
      kind: 'custom', name, e, nu, rho,
      ...(fy !== null ? { fy } : {}),
      ...(alpha !== undefined ? { alpha } : {}),
    },
  };
}

/** The form a stored material opens in; α back in 10⁻⁶/°C. */
export function customMaterialForm(m: Pick<Material, 'name' | 'e' | 'nu' | 'rho' | 'fy' | 'alpha'>): CustomMaterialForm {
  return {
    name: m.name,
    e: m.e,
    nu: String(m.nu),
    rho: m.rho,
    fy: m.fy ?? null,
    alpha: alphaField(m.alpha),
  };
}

export function saveCustomMaterial(choice: CustomMaterialChoice, id: number | null = null): number {
  const fields = toMaterialFields(choice);
  const original = id === null ? undefined : modelStore.materials.get(id);
  if (id === null || !original) return modelStore.addMaterial({ ...fields, userDefined: true });
  if (original.e === fields.e && original.nu === fields.nu && original.rho === fields.rho
    && original.fy === fields.fy) {
    modelStore.updateMaterial(id, { name: fields.name, ...(original.alpha !== fields.alpha ? { alpha: fields.alpha } : {}) });
    return id;
  }
  if (!original.gradeId && original.userDefined !== false) {
    modelStore.updateMaterial(id, { ...fields, fy: fields.fy, alpha: fields.alpha, userDefined: true });
  } else {
    modelStore.updateMaterial(id, { replacement: { ...fields, userDefined: true } });
  }
  return id;
}

/**
 * Adds the catalogue material, or puts it in place of the one with `id`. A replacement clears
 * every property the old material stated and the preset does not, so a hand-entered α or the
 * hand-entered mark never survives onto a catalogue grade.
 */
export function saveCatalogueMaterial(preset: MaterialPreset, id: number | null = null): number {
  const fields = toMaterialFields({ kind: 'preset', preset });
  if (id === null || !modelStore.materials.has(id)) return modelStore.addMaterial(fields);
  modelStore.updateMaterial(id, { replacement: fields });
  return id;
}
