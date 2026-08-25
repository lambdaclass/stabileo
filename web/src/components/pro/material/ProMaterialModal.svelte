<script lang="ts">
  /**
   * The PRO material selector.
   *
   * ── The same architecture as the section modal, deliberately ───────
   *
   * Centred dialog, `aria-modal`, Tab trap, focus restored to whatever opened it, a browsing
   * area and a data sheet. Not a coincidence and not copy-paste convenience: a user who has
   * learnt one of these two knows the other, and the two surfaces write to the model through
   * conversion modules with the same shape — `section-choice.ts` and `material-choice.ts`.
   *
   * ── It reuses Basic's catalogue, and adds the axes PRO needs ───────
   *
   * `material-presets.ts` is Basic's catalogue and it is already richer than Basic's own picker
   * shows: every row carries `gradeId`, `standard` and `region`, and 27 of the 28 steel rows
   * link into the grade database. So there is nothing to duplicate — the categories, the search
   * and the region gating are the shipped ones, and what this adds is the region filter, the
   * grade id on screen, the thickness bands with the standard that publishes them, and the
   * per-field authority.
   *
   * ── What a selection means ─────────────────────────────────────────
   *
   * It configures the model, and it now configures it COMPLETELY: `gradeId`, `standard`,
   * `region` and `fu` travel with the choice. The tab this replaces wrote five fields and
   * dropped the rest, which is why an aluminium 5052-H32 entered in PRO was classified as
   * steel. Choosing a grade still verifies nothing — there is no metallic design authority in
   * this app — and the footer says so rather than leaving it to be inferred.
   */
  import { t } from '../../../lib/i18n';
  import MaterialDataSheet from './MaterialDataSheet.svelte';
  import GradePickerPanel from '../steel/GradePickerPanel.svelte';
  import {
    materialPresetSource, type MaterialPresetSource,
  } from '../../../lib/material/preset-source';
  import type { MaterialPreset } from '../../../lib/data/material-presets';
  import { populatedRegions, structuralGradeSource } from '../../../lib/grades/catalogue';
  import { materialDataSheet } from '../../../lib/material/data-sheet';
  import type { MaterialChoice } from '../../../lib/material/material-choice';
  import type { GradeRegion } from '../../../lib/data/structural-grades';

  interface Props {
    open: boolean;
    /** Currently chosen material name, so the list can mark it. */
    selected?: string;
    onApply: (choice: MaterialChoice) => void;
    onClose: () => void;
    label?: string;
    /**
     * Which categories to offer. All six when absent.
     *
     * The generators pass the metal ones. A steel truss generator that offered C25/30 would be
     * offering a material its emitter cannot use, and narrowing the SAME selector is better
     * than shipping a second one: the catalogue, the sheet, the keyboard and the conversion
     * stay identical, and only the tab strip is shorter.
     */
    categories?: readonly string[];
    /** Swappable catalogue. Defaults to the one this app ships, like the other two pickers. */
    source?: MaterialPresetSource;
  }
  const {
    open, selected = '', onApply, onClose, label = '', categories,
    source = materialPresetSource,
  }: Props = $props();

  const ALL_CATEGORIES = $derived(source.categories());
  const CATEGORIES = $derived(
    categories ? ALL_CATEGORIES.filter((c) => categories.includes(c.id)) : ALL_CATEGORIES,
  );

  let category = $state<string>('acero');
  // A restricted list must not leave the selection pointing at a tab that is not on screen.
  $effect(() => {
    if (CATEGORIES.length > 0 && !CATEGORIES.some((c) => c.id === category)) category = CATEGORIES[0].id;
  });
  let query = $state('');
  let regions = $state<GradeRegion[]>([]);

  const REGIONS = populatedRegions();

  // Both filters go through the source, which is where the region rule now lives.
  const results = $derived(source.list({ text: query, category, regions }));

  let cursor = $state(0);
  $effect(() => {
    // Reading the length is what subscribes this to search and filter changes.
    if (cursor > results.length - 1) cursor = Math.max(0, results.length - 1);
  });
  $effect(() => {
    const at = results.findIndex((p) => p.name === selected);
    if (at >= 0) cursor = at;
  });

  /**
   * Whether the active category has an entry in the metal grade database.
   *
   * The two halves of this modal are not a layout choice; they are two different data models.
   * A metal is described by a `GradeEntry` — thickness bands with the design code that
   * tabulates them, a family, a design-code filter, and the pairing against what mills roll in
   * a given section family. Concrete and timber have none of that: they are described by the
   * catalogue row itself, and `structuralGradeSource.byId` returns nothing for them.
   *
   * So the metals get `GradePickerPanel`, which already does all of it and is pinned by M1's
   * §1 checklist, and the non-metals get the preset list below. One modal, one focus trap, one
   * Escape, two bodies — rather than one body that would have to pretend a band table exists
   * for C25/30.
   */
  const isMetal = $derived(ALL_CATEGORIES.find((c) => c.id === category)?.family != null);

  const focused = $derived<MaterialPreset | null>(results[cursor] ?? null);
  const sheet = $derived(focused ? materialDataSheet({ preset: focused }) : null);
  let sheetOpen = $state(true);

  /** The grade id the panel should mark, derived from whatever name the caller passed. */
  const gradeIdForSelection = $derived(
    results.find((p) => p.name === selected)?.gradeId ?? null,
  );

  let dialogEl: HTMLDivElement | undefined = $state();
  let returnFocus: HTMLElement | null = null;
  let listEl: HTMLDivElement | undefined = $state();

  /**
   * Focus, on the OPEN and CLOSE transitions only. Same reasoning as the section modal.
   *
   * `$effect.pre` rather than `$effect`, and this is the part that is easy to get wrong: child
   * effects run FIRST, and this dialog's body — `GradePickerPanel` — focuses its own search box
   * on mount. A plain effect here would capture that input as the thing to return focus to, and
   * returning focus to a node being removed sends it to `<body>`. Measured in the section
   * modal, which had the identical bug.
   *
   * Restoring synchronously loses to the teardown, so it happens one frame later. One latch,
   * one frame.
   */
  let wasOpen = false;
  $effect.pre(() => {
    const isOpen = open;
    if (isOpen && !wasOpen) {
      wasOpen = true;
      returnFocus = document.activeElement as HTMLElement | null;
      queueMicrotask(() => dialogEl?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    } else if (!isOpen && wasOpen) {
      wasOpen = false;
      const el = returnFocus;
      requestAnimationFrame(() => el?.focus?.());
    }
  });

  $effect(() => {
    void cursor;
    listEl?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  function toggleRegion(r: GradeRegion) {
    regions = regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r];
  }

  function apply() {
    if (!focused) return;
    onApply({ kind: 'preset', preset: focused });
    onClose();
  }

  /** Same trap as the section modal, for the same reason. */
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, results.length - 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); return; }
    if (e.key === 'Home') { e.preventDefault(); cursor = 0; return; }
    if (e.key === 'End') { e.preventDefault(); cursor = results.length - 1; return; }
    if (e.key !== 'Tab' || !dialogEl) return;
    const focusable = [...dialogEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="overlay" role="presentation" onkeydown={keydown}>
    <button class="backdrop" type="button" aria-label={t('material.modal.close')} onclick={onClose}></button>
    <div
      class="modal"
      bind:this={dialogEl}
      role="dialog"
      aria-modal="true"
      aria-label={label || t('material.modal.title')}
      data-testid="pro-material-modal"
    >
      <header>
        <h2>{t('material.modal.title')}</h2>
        <button type="button" class="close" onclick={onClose} aria-label={t('material.modal.close')}>✕</button>
      </header>

      <div class="filters">
        <!--
          Search and region belong to whichever body is on screen, not to both.

          `GradePickerPanel` brings its own search, family, design-code and region controls, and
          they are better than these: they know the grade database. Showing mine as well would
          put two search boxes over one list and two region filters that do not agree. The
          category strip stays, because it is what CHOOSES the body.
        -->
        {#if !isMetal}
          <input
            type="search" data-autofocus data-testid="material-search"
            placeholder={t('material.modal.search')}
            bind:value={query}
          />
        {/if}
        <div class="chips" role="group" aria-label={t('material.modal.category')}>
          {#each CATEGORIES as c (c.id)}
            <button
              type="button" class:active={category === c.id}
              data-testid={`material-cat-${c.id}`}
              onclick={() => { category = c.id; cursor = 0; }}
            >{t(c.labelKey)}</button>
          {/each}
        </div>
        <!-- Region, which is the axis Basic's picker cannot express: it gates by region for
             Basic and shows everything for PRO, so the extra rows arrive unexplained. For the
             metals the grade panel's own region chips do this, and better. -->
        {#if !isMetal}
        <div class="chips" role="group" aria-label={t('material.modal.region')}>
          {#each REGIONS as r (r)}
            <button
              type="button" class="small" class:active={regions.includes(r)}
              data-testid={`material-region-${r}`}
              onclick={() => toggleRegion(r)}
            >{r}</button>
          {/each}
        </div>
        {/if}
      </div>

      <div class="body">
        {#if isMetal}
          <!--
            The deep panel, unchanged. Its testids — `grade-list`, `grade-search`,
            `grade-family-*`, `grade-region-*`, `grade-bands`, `grade-option-*` — are the ones
            M1's checklist pins, and they keep working because this contains the panel rather
            than replacing it.
          -->
          <div class="grades">
            <GradePickerPanel
              selected={gradeIdForSelection}
              onPick={(id) => {
                const g = structuralGradeSource.byId(id);
                if (g) { onApply({ kind: 'grade', grade: g }); onClose(); }
              }}
            />
          </div>
        {:else}
        <div class="list" bind:this={listEl} data-testid="material-list">
          {#if results.length === 0}
            <p class="note" data-testid="material-no-results">{t('material.modal.noResults')}</p>
          {:else}
            {#each results as p, i (p.name + p.category)}
              <button
                type="button"
                class="row"
                class:cursor={i === cursor}
                data-cursor={i === cursor}
                data-testid={`material-row-${i}`}
                onmouseenter={() => (cursor = i)}
                onclick={() => { cursor = i; apply(); }}
              >
                <span class="name">{p.name}</span>
                <span class="meta">
                  {p.standard ?? '—'}
                  {#if p.fy}· fy {p.fy} MPa{/if}
                  {#if p.region}· {p.region}{/if}
                </span>
              </button>
            {/each}
          {/if}
        </div>
        {/if}

        <aside class="side">
          {#if sheet && !isMetal}
            <details bind:open={sheetOpen} data-testid="material-sheet-toggle">
              <summary>{t('material.sheet.title')}</summary>
              <MaterialDataSheet {sheet} />
            </details>
          {/if}
        </aside>
      </div>

      <footer>
        <span class="current" data-testid="material-current">
          {isMetal ? (structuralGradeSource.byId(gradeIdForSelection ?? '')?.designation ?? '—') : (focused?.name ?? '—')}
        </span>
        <!-- Said once, at the end. Choosing a grade configures the model; it does not check it. -->
        <span class="caveat" data-testid="material-caveat">{t('material.modal.noAuthority')}</span>
        <button type="button" class="ghost" onclick={onClose}>{t('material.modal.cancel')}</button>
        {#if !isMetal}
          <button
            type="button" class="primary" onclick={apply}
            disabled={!focused} data-testid="material-apply"
          >{t('material.modal.apply')}</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .backdrop { position: absolute; inset: 0; border: none; padding: 0; background: rgba(0, 0, 0, 0.55); cursor: pointer; }
  .modal {
    position: relative; display: flex; flex-direction: column;
    width: min(880px, 94vw); max-height: min(620px, 92vh);
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 6px; }
  h2 { margin: 0; font-size: 0.9rem; }
  .close { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 1rem; }
  .close:hover { color: var(--st-text); }

  .filters { display: flex; flex-direction: column; gap: 6px; padding: 0 14px 8px; }
  input[type='search'] {
    width: 100%; background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 4px 6px; font-size: 0.75rem;
  }
  .chips { display: flex; gap: 4px; flex-wrap: wrap; }
  .chips button {
    padding: 3px 9px; font-size: 0.7rem; cursor: pointer;
    background: transparent; color: var(--st-text-2);
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .chips button.small { padding: 2px 7px; font-size: 0.66rem; font-family: var(--st-mono, monospace); }
  .chips button.active { background: var(--st-interactive); border-color: var(--st-interactive); color: var(--st-bg); }

  .body { display: flex; gap: 12px; padding: 0 14px; flex: 1; min-height: 0; }
  .list { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .row {
    display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
    padding: 4px 6px; text-align: left; cursor: pointer;
    background: transparent; border: 1px solid transparent; border-radius: 3px;
  }
  .row.cursor { background: var(--st-surface-3); border-color: var(--st-hair); }
  .name { font-size: 0.75rem; color: var(--st-text); font-weight: 500; }
  .meta { font-size: 0.66rem; color: var(--st-text-3); }
  .side { width: 280px; flex-shrink: 0; overflow-y: auto; }
  /* The grade panel brings its own two-column layout, so it takes the whole body. */
  .grades { flex: 1; min-width: 0; overflow: auto; }
  details summary { cursor: pointer; font-size: 0.72rem; color: var(--st-text-2); padding: 4px 0; }
  .note { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }

  footer { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--st-hair); }
  .current { font-family: var(--st-mono, monospace); font-size: 0.74rem; }
  .caveat { flex: 1; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.3; }
  footer button { padding: 5px 14px; font-size: 0.74rem; border-radius: 4px; cursor: pointer; }
  .ghost { background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); }
  .primary { background: var(--st-interactive); color: var(--st-bg); border: 1px solid var(--st-interactive); }

  button:focus-visible, input:focus-visible, summary:focus-visible {
    outline: 2px solid var(--st-value); outline-offset: 1px;
  }
</style>
