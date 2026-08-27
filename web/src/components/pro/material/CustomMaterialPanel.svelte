<script lang="ts">
  /**
   * The second division: a material the project states by hand.
   *
   * ── Why it is here and not on the tab ──────────────────────────────
   *
   * It was a `<details>` form on `ProMaterialsTab` that called `modelStore.addMaterial` with its
   * own five-field literal. That made the tab a second source of material CREATION beside the
   * modal — the same finding that was closed for sections — and it was the one thing the inline
   * path could do that the modal could not. So it moved before the inline path was removed:
   * deleting the only surface that offered a capability is not the same decision as relocating
   * it.
   *
   * ── What it deliberately does NOT do ───────────────────────────────
   *
   * It emits no `gradeId`, no `standard` and no `region`. A hand-entered material has none of
   * the three, and `material-choice.ts` exists because synthesising a field the source does not
   * carry is how a material stops being classifiable. The footer says as much: a custom
   * material is classified by `fy`, which cannot tell one metal from another.
   */
  import { t } from '../../../lib/i18n';
  import type { MaterialChoice } from '../../../lib/material/material-choice';

  interface Props {
    /** Emitted on every change, so the shell's Apply stays in step with the form. */
    onDraft: (choice: MaterialChoice | null) => void;
  }
  const args: Props = $props();
  const onDraft = args.onDraft;

  let name = $state('');
  let e = $state('');
  let nu = $state('');
  let rho = $state('');
  let fy = $state('');

  /**
   * A field's number, or null when it is blank or not a number.
   *
   * Comma is accepted because the decimal comma is what a Spanish keyboard produces, and the
   * inline form this replaces refused it silently: `parseFloat('0,3')` is `0`, which is a
   * Poisson ratio the form would have accepted.
   */
  function num(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const v = Number(trimmed.replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }

  /*
   * The bounds are on the PHYSICS, not on any catalogue.
   *
   * `nu` outside (-1, 0.5) is not a conservative choice, it is a material with a negative bulk
   * or shear modulus, and the solver would take it. `e` and `rho` at or below zero are the same
   * kind of statement. The inline form checked only `isNaN`, so `nu = 3` and `rho = -78.5` both
   * reached the model.
   */
  const draft = $derived.by<MaterialChoice | null>(() => {
    const n = name.trim();
    const eV = num(e), nuV = num(nu), rhoV = num(rho), fyV = num(fy);
    if (!n) return null;
    if (eV === null || eV <= 0) return null;
    if (nuV === null || nuV <= -1 || nuV >= 0.5) return null;
    if (rhoV === null || rhoV < 0) return null;
    if (fy.trim() !== '' && (fyV === null || fyV <= 0)) return null;
    return {
      kind: 'custom',
      name: n,
      e: eV,
      nu: nuV,
      rho: rhoV,
      ...(fyV !== null ? { fy: fyV } : {}),
    };
  });

  $effect(() => { onDraft(draft); });

  /**
   * What is missing or refused, so the disabled Apply is not the only feedback.
   *
   * Returned as `{ reasonKey }` rather than a bare string, and that is not decoration:
   * `pro-flow-coverage.test.ts` harvests translation keys out of the PRO sources, and it reads
   * `reasonKey: '...'` — a key handed to `t()` through a variable is invisible to it. Naming the
   * field is what puts these six sentences under the same three-locale gate as the rest.
   */
  const problem = $derived.by<{ reasonKey: string } | null>(() => {
    if (draft) return null;
    if (!name.trim()) return { reasonKey: 'material.custom.needName' };
    const eV = num(e), nuV = num(nu), rhoV = num(rho);
    if (eV === null || nuV === null || rhoV === null) return { reasonKey: 'material.custom.needNumbers' };
    if (eV <= 0) return { reasonKey: 'material.custom.badE' };
    if (nuV <= -1 || nuV >= 0.5) return { reasonKey: 'material.custom.badNu' };
    if (rhoV < 0) return { reasonKey: 'material.custom.badRho' };
    return { reasonKey: 'material.custom.badFy' };
  });

  /*
   * There is no `reset()`. The shell renders inside `{#if open}`, so closing the dialog
   * destroys this component and the next one starts blank — one lifecycle instead of a second
   * way to clear the same five fields.
   */
</script>

<div class="custom" data-testid="material-custom">
  <label>
    <span>{t('pro.thName')}</span>
    <input
      type="text" data-autofocus data-testid="material-custom-name"
      bind:value={name} placeholder="S275"
    />
  </label>
  <label>
    <span>E</span>
    <input type="text" inputmode="decimal" data-testid="material-custom-e" bind:value={e} placeholder="200000" />
    <span class="unit">MPa</span>
  </label>
  <label>
    <span>{t('field.poisson')}</span>
    <input type="text" inputmode="decimal" data-testid="material-custom-nu" bind:value={nu} placeholder="0.3" />
    <span class="unit">—</span>
  </label>
  <label>
    <span>{t('field.density')}</span>
    <input type="text" inputmode="decimal" data-testid="material-custom-rho" bind:value={rho} placeholder="78.5" />
    <span class="unit">kN/m³</span>
  </label>
  <label>
    <span>fy</span>
    <input
      type="text" inputmode="decimal" data-testid="material-custom-fy"
      bind:value={fy} placeholder={t('pro.optional')}
    />
    <span class="unit">MPa</span>
  </label>

  {#if problem}
    <p class="note" role="status" data-testid="material-custom-problem">{t(problem.reasonKey)}</p>
  {/if}
  <!-- Said where the decision is made, not only in the footer's general caveat. -->
  <p class="note" data-testid="material-custom-caveat">{t('material.custom.noGrade')}</p>
</div>

<style>
  .custom { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px; }
  label { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--st-text-2); }
  label > span:first-child { min-width: 8rem; }
  input {
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
    padding: 3px 5px; font-size: 0.72rem; width: 8rem; text-align: right;
  }
  input[type='text']:not([inputmode]) { text-align: left; }
  .unit { color: var(--st-text-3); font-size: 0.68rem; }
  .note { margin: 0; font-size: 0.68rem; color: var(--st-text-3); line-height: 1.35; }
  input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
