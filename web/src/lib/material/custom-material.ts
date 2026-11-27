/** The rules and reason keys must stay those of PRO's `CustomMaterialPanel.svelte` and `materials.alphaInvalid`. */
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
  if (stored !== undefined && raw === alphaField(stored)) return stored;
  const value = parseDecimal(raw);
  return value === null ? null : value * 1e-6;
}

export function readCustomMaterial(form: CustomMaterialForm, stored?: Pick<Material, 'alpha'>): CustomMaterialRead {
  const name = form.name.trim();
  if (!name) return { ok: false, reasonKey: 'material.custom.needName' };
  const nu = parseDecimal(form.nu);
  const { e, rho, fy } = form;
  if (e === null || nu === null || rho === null) return { ok: false, reasonKey: 'material.custom.needNumbers' };
  if (!(e > 0)) return { ok: false, reasonKey: 'material.custom.badE' };
  if (nu <= -1 || nu >= 0.5) return { ok: false, reasonKey: 'material.custom.badNu' };
  if (!(rho >= 0)) return { ok: false, reasonKey: 'material.custom.badRho' };
  if (fy !== null && !(fy > 0)) return { ok: false, reasonKey: 'material.custom.badFy' };
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

/**
 * Adds the material, or rewrites the one with `id`: one undo step either way. Typed numbers are
 * no catalogue grade, so an edit drops the grade and what came from it (fu, the timber class), as
 * PRO's hand-entered material carries none; it keeps f'c and the concrete's placing data, which
 * the form does not show. A blank fy or α clears the stored one.
 */
export function saveCustomMaterial(choice: CustomMaterialChoice, id: number | null = null): number {
  const fields = toMaterialFields(choice);
  if (id === null || !modelStore.materials.has(id)) return modelStore.addMaterial({ ...fields, userDefined: true });
  modelStore.updateMaterial(id, {
    name: fields.name, e: fields.e, nu: fields.nu, rho: fields.rho, fy: fields.fy, alpha: fields.alpha,
    gradeId: undefined, fu: undefined, timber: undefined, userDefined: true,
  });
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
