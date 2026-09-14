import { describe, it, expect } from 'vitest';
import fixture from '../../templates/fixtures/3d-nave-industrial.json';
import { buildSteelInventory } from '../../engine/steel/steel-inventory';
import { detectJoints } from '../../engine/connection-design';
import { isSteel, materialFamilyOf } from '../../engine/steel/material-family';
import { catalogueGradeFamily } from '../../engine/steel/grade-family';

/**
 * The industrial shed, through the joint pipeline it actually goes through.
 *
 * ── What this file records ──────────────────────────────────────────
 *
 * The reported symptom was "the app detects no joints" on this model. `detectJoints` was not
 * the cause and neither was the `isMetallic` predicate — both were checked against a GENERATED
 * shed and returned 300 joints and 625 metallic members. The shipped EXAMPLE behaves
 * differently, and the difference is one missing field:
 *
 *   · all 633 elements point at material id 2;
 *   · material 2 declared `e`, `nu` and `rho` and **no `fy`**;
 *   · `materialFamilyOf` with no yield strength returns `unknown` / `noData` — correctly, since
 *     it has nothing to classify with;
 *   · so the inventory held **0** members out of 633, `metallicElementIds` was empty, and the
 *     226 joints `detectJoints` finds were all filtered out.
 *
 * Material 1 carried `fy: 250` and **no element used it**: two rows both named "Acero A36",
 * one of them orphaned and the other unusable.
 *
 * The fix is on the data, not on the filter. Relaxing the predicate to admit a material with
 * no strength would make every concrete model's joints metallic, which is the defect that
 * predicate was added to close.
 */

const f = fixture as unknown as {
  materials: Array<{ id: number; name: string; fy?: number; gradeId?: string }>;
  nodes: Array<{ id: number }>;
  elements: Array<{ id: number; materialId: number }>;
  supports: Array<unknown>;
  sections: Array<{ id: number }>;
};

const maps = () => ({
  nodes: new Map(f.nodes.map((n) => [n.id, n])),
  elements: new Map(f.elements.map((e) => [e.id, e])),
  materials: new Map(f.materials.map((m) => [m.id, m])),
  sections: new Map(f.sections.map((s) => [s.id, s])),
  supports: new Map(f.supports.map((s, i) => [i, s])),
});

describe('the shipped example can be classified', () => {
  it('every material an element points at declares a yield strength', () => {
    const used = new Set(f.elements.map((e) => e.materialId));
    for (const id of used) {
      const m = f.materials.find((x) => x.id === id)!;
      expect(m, `element material ${id} is not in the model`).toBeTruthy();
      expect(m.fy, `${m.name} (id ${id}) declares no fy`).toBeGreaterThan(0);
    }
  });

  /*
   * And it rests on a DECLARED grade rather than on `fy > 80`. The magnitude fallback cannot
   * tell one metal from another — an aluminium at fy = 195 reads as steel — so a shipped
   * example is the wrong place to depend on it.
   */
  it('and names the grade it is, rather than leaving it to be inferred', () => {
    for (const m of f.materials) {
      expect(m.gradeId, `${m.name} has no gradeId`).toBeTruthy();
      expect(materialFamilyOf(m as never, catalogueGradeFamily)).toEqual({
        family: 'steel', basis: 'declaredGrade',
      });
    }
  });
});

describe('the joints the panel is meant to show', () => {
  const { nodes, elements, materials, sections, supports } = maps();
  const inventory = buildSteelInventory(
    { nodes, elements, sections, materials } as never,
    { hasDemands: false, authorityBound: false, lookupGrade: catalogueGradeFamily },
  );

  it('every element is in the metallic inventory', () => {
    expect(inventory.members).toHaveLength(f.elements.length);
    expect(inventory.census.byFamily.unknown).toBe(0);
    expect(inventory.census.byFamily.steel).toBe(f.elements.length);
  });

  it('the metallic filter removes nothing', () => {
    const metallic = new Set(
      inventory.members.filter((m) => isSteel(m.family)).map((m) => m.elementId),
    );
    expect(metallic.size).toBe(f.elements.length);

    const all = detectJoints(nodes as never, elements as never, supports as never);
    const filtered = detectJoints(nodes as never, elements as never, supports as never, {
      isMetallic: (id) => metallic.has(id),
    });
    // 226 before the fix, 0 after filtering. The whole defect was in that difference.
    expect(all.length).toBeGreaterThan(0);
    expect(filtered.length).toBe(all.length);
  });

  it('and the joints carry the members that meet at them', () => {
    const metallic = new Set(inventory.members.map((m) => m.elementId));
    const joints = detectJoints(nodes as never, elements as never, supports as never, {
      isMetallic: (id) => metallic.has(id),
    });
    for (const j of joints) {
      expect(j.elementCount).toBeGreaterThanOrEqual(2);
      expect(j.metallicElementIds.length).toBe(j.elementIds.length);
      expect(j.nonMetallicElementIds).toHaveLength(0);
    }
    // Busiest first, so the panel's first row is the one worth detailing.
    for (let i = 1; i < joints.length; i++) {
      expect(joints[i - 1].elementCount).toBeGreaterThanOrEqual(joints[i].elementCount);
    }
  });
});
