/**
 * A swappable source over the material catalogue, matching the two that already exist.
 *
 * ── Why this appeared ───────────────────────────────────────────────
 *
 * `steel-surface-audit.test.ts` holds every PRO picker to two rules: it may not reach past a
 * source into a table, and it must hold a swappable one. `ProfileSelectorPanel` has
 * `ProfileSource`, `GradePickerPanel` has `GradeSource` — and the material catalogue had no
 * seam at all, so the new modal imported `searchPresets` and `MATERIAL_CATEGORIES` directly and
 * the audit failed it. Correctly: a picker wired to a table cannot be handed a project library
 * or a server later without editing the component.
 *
 * So this is the missing third seam, deliberately shaped like the other two — `list`, `byId`,
 * and the closed set the filters are built from — rather than a bespoke interface that happens
 * to work for one modal.
 *
 * ── It adds nothing to the catalogue ────────────────────────────────
 *
 * Every rule here is `material-presets.ts`'s own: `searchPresets` does the category filtering,
 * the region gating and the code association, and this passes the query through. The one thing
 * it adds is the PRO region filter, which lives here rather than in `searchPresets` because
 * that function's `pro` flag already means "do not gate by region" — giving the same argument a
 * second, opposite meaning is how a filter starts contradicting itself.
 */

import {
  MATERIAL_CATEGORIES, searchPresets, categoryFamily,
  type MaterialPreset,
} from '../data/material-presets';
import type { GradeFamily, GradeRegion } from '../data/structural-grades';

export interface MaterialPresetQuery {
  /** Matched against the designation and the standard, as `searchPresets` matches. */
  text?: string;
  /** Picker category id. Absent means every category. */
  category?: string;
  /** Empty or absent means every origin. */
  regions?: readonly GradeRegion[];
}

export interface MaterialCategoryEntry {
  id: string;
  /** i18n key, never prose. */
  labelKey: string;
  /** The grade family behind it, or null for the non-metals. */
  family: GradeFamily | null;
}

export interface MaterialPresetSource {
  list(query?: MaterialPresetQuery): MaterialPreset[];
  /** By designation. Null when the catalogue does not carry it. */
  byName(name: string): MaterialPreset | null;
  /** The closed set the category strip is built from. */
  categories(): MaterialCategoryEntry[];
}

/**
 * A source over a given catalogue function, so a test can supply its own rows.
 *
 * Kept as a factory for the same reason `createColdFormedSource` is: the shipped instance is
 * one call of it, and a caller with a different catalogue is not a special case.
 */
export function createMaterialPresetSource(
  search: typeof searchPresets = searchPresets,
  cats: typeof MATERIAL_CATEGORIES = MATERIAL_CATEGORIES,
): MaterialPresetSource {
  return {
    list(query: MaterialPresetQuery = {}): MaterialPreset[] {
      const rows = search(query.text ?? '', query.category, { pro: true });
      if (!query.regions || query.regions.length === 0) return rows;
      /*
       * A row with no region — the reinforcing bar is the case — is never removed by a control
       * that has no opinion about it. Same rule `searchPresets` applies to its own gating.
       */
      return rows.filter((p) => p.region && query.regions!.includes(p.region));
    },
    byName(name: string): MaterialPreset | null {
      const target = name.trim().toUpperCase();
      if (!target) return null;
      for (const c of cats) {
        const hit = search('', c.id, { pro: true }).find((p) => p.name.trim().toUpperCase() === target);
        if (hit) return hit;
      }
      return null;
    },
    categories(): MaterialCategoryEntry[] {
      return cats.map((c) => ({ id: c.id, labelKey: c.label, family: categoryFamily(c.id) }));
    },
  };
}

/** The catalogue this app ships. */
export const materialPresetSource: MaterialPresetSource = createMaterialPresetSource();
