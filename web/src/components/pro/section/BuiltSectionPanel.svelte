<script lang="ts">
  /**
   * The second division: build a section from a template.
   *
   * ── Templates, never a blank form ──────────────────────────────────
   *
   * The brief is explicit that PRO must not offer an amorphous section, and this panel is what
   * makes that possible without losing anything: every section built here comes from a named
   * template with named parameters, so it has a `shape`, an outline, and a record of the
   * numbers that produced it. Basic's third tab lets a user type an area and an inertia with
   * no geometry; that section cannot be drawn, cannot be composed, cannot be classified and
   * cannot be checked against a clause, which is why PRO has two divisions and not three.
   *
   * ── Why the inputs are stored as typed, not as computed ────────────
   *
   * `Section.built` records the template and the parameters. Without it a built section could
   * not be edited — reopening a project, the only way to change a web thickness was to delete
   * the section and retype everything, because nothing recorded what was typed. The panel
   * writes both halves: the properties for the solver, and the inputs for the next edit.
   */
  import { t } from '../../../lib/i18n';
  import {
    SECTION_SHAPES, THIN_SHAPES, SOLID_SHAPES,
    computeSectionProperties, generateSectionName,
    type ShapeType, type MaterialCategory,
  } from '../../../lib/data/section-shapes';
  import { crossSectionPath } from '../../../lib/utils/section-drawing';
  import { toSectionFields, type SectionChoice } from '../../../lib/section/section-choice';
  import { resolveSectionState } from '../../../lib/section/state';
  import { drawingGeometry } from '../../../lib/section/drawing';
  import { canonicalOutlinePath } from '../../../lib/section/outline';
  import type { Section } from '../../../lib/store/model.svelte';

  interface Props {
    /** Emitted on every change, so the shell's preview and Apply stay in step with the form. */
    onDraft: (choice: SectionChoice | null) => void;
    initial?: { shapeType: string; params: Record<string, number> } | null;
  }
  /*
   * Named `args`, and `computeSectionProperties`' result named `computed` rather than `props`.
   *
   * A local called `props` makes Svelte read the `$props` rune as store access on it — "Cannot
   * use 'props' as a store" — which is a compile error several lines away from the name that
   * caused it. Worth the comment: the rename is not a style choice.
   */
  const args: Props = $props();
  const onDraft = args.onDraft;

  let shape = $state<ShapeType>((args.initial?.shapeType as ShapeType | undefined) ?? 'hollow-rect');
  // The category of the template being reopened, or the effect below would swap a solid one for
  // the first thin template before the reader saw it.
  let category = $state<MaterialCategory>(SECTION_SHAPES.find((s) => s.id === shape)?.category ?? 'thin');
  let values = $state<Record<string, number>>({ ...(args.initial?.params ?? {}) });
  /** A length parameter shown in mm; stored in m. Rounded so 0.0254 m reads 25.4, not 25.400000000000002. */
  const toShown = (unit: string, v: number) => (unit === 'm' ? Number((v * 1000).toPrecision(10)) : v);
  const fromShown = (unit: string, v: number) => (unit === 'm' ? v / 1000 : v);

  const shapes = $derived(category === 'thin' ? THIN_SHAPES : SOLID_SHAPES);
  const def = $derived(SECTION_SHAPES.find((s) => s.id === shape) ?? SECTION_SHAPES[0]);

  /*
   * Defaults are filled when the TEMPLATE changes, not on every render.
   *
   * Refilling on every render would overwrite what the user is typing; refilling never would
   * leave the new template's parameters undefined and the properties NaN. Tracking the
   * previous id is what distinguishes the two.
   */
  let prevShape = $state<ShapeType | null>(null);
  $effect(() => {
    if (shape === prevShape) return;
    prevShape = shape;
    const d = SECTION_SHAPES.find((s) => s.id === shape);
    if (!d) return;
    const next: Record<string, number> = {};
    for (const p of d.params) next[p.id] = values[p.id] ?? p.defaultValue;
    values = next;
  });

  /* Keep the selected template inside the selected category. */
  $effect(() => {
    if (!shapes.some((s) => s.id === shape) && shapes.length > 0) shape = shapes[0].id;
  });

  const computed = $derived(computeSectionProperties(shape, values));
  const name = $derived(generateSectionName(shape, values));
  /*
   * The outline the solver will integrate, from the same resolver the model uses; the bare
   * parametric sketch only while the engine is not up. The sketch reads `tw`/`tf`/`t` and has
   * no lip, no offset web and no tee for the concrete templates, whose parameters are named
   * otherwise.
   */
  const path = $derived.by(() => {
    if (!computed || !computed.h || !computed.b) return null;
    try {
      const fields = toSectionFields({ kind: 'built', name, shapeType: shape, params: values, props: computed, rotationDeg: 0 }, 0);
      const state = fields ? resolveSectionState({ id: 0, ...fields } as unknown as Section) : null;
      if (state?.kind === 'geometry-backed') return canonicalOutlinePath(drawingGeometry(state));
    } catch { /* the sketch below */ }
    return crossSectionPath({
      shape: (computed.shape ?? 'rect') as never,
      b: computed.b, h: computed.h,
      tw: (values.tw ?? values.t) as number, tf: (values.tf ?? values.t) as number,
      t: values.t as number,
    } as never);
  });

  $effect(() => {
    // Null while the form cannot produce a section, so the shell can disable Apply rather
    // than write a NaN area onto the model.
    if (!computed || !Number.isFinite(computed.a) || computed.a <= 0) { onDraft(null); return; }
    onDraft({
      kind: 'built', name, shapeType: shape,
      params: { ...values }, props: computed, rotationDeg: 'auto',
    });
  });
</script>

<div class="build" data-testid="section-build">
  <div class="cats" role="group" aria-label={t('section.modal.category')}>
    {#each ['thin', 'solid'] as const as c (c)}
      <button
        type="button" class:active={category === c}
        data-testid={`section-cat-${c}`}
        onclick={() => (category = c)}
      >{t(`section.modal.category.${c}`)}</button>
    {/each}
  </div>

  <label class="pick">
    <span>{t('section.modal.template')}</span>
    <select bind:value={shape} data-testid="section-template">
      {#each shapes as s (s.id)}<option value={s.id}>{t(s.label)}</option>{/each}
    </select>
  </label>
  <p class="desc" data-testid="section-template-desc">{t(def.description)}</p>

  <div class="params">
    {#each def.params as p (p.id)}
      <label>
        <span>{t(p.label)}</span>
        <!--
          Section dimensions are typed in millimetres and kept in metres. In metres a tube's
          50.8 × 2.5 was easy to enter as 0.508 × 0.025, ten times its size in each dimension and
          a hundred times its area and stiffness, which is what a first scaffold model did.
        -->
        <input
          type="number" min="0" step={toShown(p.unit, p.step)}
          data-testid={`section-param-${p.id}`}
          value={toShown(p.unit, values[p.id] ?? p.defaultValue)}
          onchange={(e) => {
            const v = Number(e.currentTarget.value);
            values = { ...values, [p.id]: Number.isFinite(v) ? fromShown(p.unit, v) : (p.defaultValue as number) };
          }}
        />
        <span class="unit">{p.unit === 'm' ? 'mm' : p.unit}</span>
      </label>
    {/each}
  </div>

  {#if path}
    <svg viewBox="-90 -90 180 180" class="fig" aria-hidden="true">
      <path d={path} fill="var(--st-value)" fill-opacity="0.12" stroke="var(--st-value)" stroke-width="1.5" fill-rule="evenodd" data-testid="section-build-outline" />
    </svg>
  {/if}

  {#if computed}
    <!-- Shown as it is typed, because a template's numbers are the whole reason to prefer one
         set of parameters over another. -->
    <dl class="out" data-testid="section-build-props">
      <dt>A</dt><dd>{(computed.a * 1e4).toFixed(2)} cm²</dd>
      <dt>Iy</dt><dd>{(computed.iy * 1e8).toFixed(1)} cm⁴</dd>
      <dt>Iz</dt><dd>{(computed.iz * 1e8).toFixed(1)} cm⁴</dd>
      {#if computed.j !== undefined}<dt>J</dt><dd>{(computed.j * 1e8).toFixed(2)} cm⁴</dd>{/if}
    </dl>
  {/if}
</div>

<style>
  .build { display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; }
  .cats { display: flex; gap: 4px; }
  .cats button {
    padding: 4px 10px; font-size: 0.72rem; cursor: pointer;
    background: transparent; color: var(--st-text-2);
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .cats button.active { background: var(--st-surface-3); color: var(--st-text); }
  label { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  label > span:first-child { min-width: 8rem; }
  .desc { margin: 0; font-size: 0.68rem; color: var(--st-text-3); line-height: 1.35; }
  .params { display: flex; flex-direction: column; gap: 4px; }
  select, input {
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
    padding: 3px 5px; font-size: 0.72rem;
  }
  input { width: 6rem; text-align: right; }
  .unit { color: var(--st-text-3); }
  .fig {
    width: 120px; height: 120px; align-self: center;
    background: var(--st-bg); border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .out {
    display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0;
    font-size: 0.72rem; font-family: var(--st-mono, monospace);
  }
  dt { color: var(--st-text-2); }
  dd { margin: 0; color: var(--st-text); }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--st-value); outline-offset: 1px;
  }
</style>
