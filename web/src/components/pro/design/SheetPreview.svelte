<script lang="ts">
  /**
   * The sheet, previewed at a size you can read and enlarged when you cannot.
   *
   * ── Why this is its own component ──────────────────────────────────
   *
   * `DetailingWorkflow` crossed the 600-line ceiling the suite enforces the moment the enlarge
   * dialog landed in it, and the boundary was obvious: everything here is about ONE drawing —
   * which sheet it is, how big it is shown, and how to see it properly. The workflow around it is
   * about assemblies, conflicts, review and exports.
   *
   * ── One projection, two presentations ──────────────────────────────
   *
   * Both the preview and the dialog render `detailingSheet.svg`. There is no second renderer
   * and no separate geometry: what you enlarge is exactly what the DXF and the report carry, which
   * is the whole reason the drawing is trustworthy at all.
   *
   * The scroll IS the pan. The SVG keeps its natural size inside a scrolling box rather than being
   * fitted to the window, because a 1:50 elevation scaled down to a panel column is not a smaller
   * drawing, it is an unreadable one — which is what the preview used to be.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingSheet } from '../../../lib/store/detailing-sheet.svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { captureFocus, cycleTabWithin } from '../../../lib/utils/dialog-focus';

  interface Props {
    /** The assembly the sheet belongs to, for the caption. */
    assemblyLabel: string;
    /**
     * Whether the enlarged dialog is up.
     *
     * Bound rather than internal so the conflict list can open the drawing a conflict is on. The
     * dialog still owns closing it — Escape, the close button and the focus restore all live
     * here, so there is exactly one place that knows how this dialog ends.
     */
    open?: boolean;
  }
  let { assemblyLabel, open = $bindable(false) }: Props = $props();
  let sheetDialog = $state<HTMLDivElement | null>(null);

  /**
   * Zoom, as an explicit control rather than only as a browser gesture.
   *
   * The scroll was the pan and there was no zoom at all: the sheet rendered at its natural size
   * and you either could read it or you could not. A trackpad pinch works, but it is invisible,
   * undiscoverable and unavailable from a keyboard — so the magnification is a number with two
   * buttons and a reset, and the scroll keeps being the pan.
   *
   * It scales the SVG with a CSS transform. No second renderer and no re-projection: the geometry
   * is `detailingSheet.svg`, exactly what the DXF, the report and the schedule carry.
   */
  const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
  let zoomIndex = $state(2);
  const zoom = $derived(ZOOMS[zoomIndex]);

  function zoomIn() { zoomIndex = Math.min(zoomIndex + 1, ZOOMS.length - 1); }
  function zoomOut() { zoomIndex = Math.max(zoomIndex - 1, 0); }
  function zoomReset() { zoomIndex = 2; }

  /**
   * Move the dialog to `document.body` while it is open.
   *
   * `z-index: 950` on a full-screen dialog buys nothing when an ancestor already opened a
   * stacking context: the value is only ever compared inside that context, and the right panel's
   * own positioned ancestor sits below the app header. The visible result was that the app's
   * floating "?" shortcuts button covered the dialog's zoom controls — measured, not guessed:
   * `elementFromPoint` at the centre of `sheet-zoom-in` returned `<button class="btn btn-help">`,
   * so the button was visible, stable, enabled and un-clickable.
   *
   * Raising the number would not have fixed it. Escaping the context does. The node is put back
   * on teardown so nothing is orphaned when the component unmounts with the dialog open.
   */
  function portal(node: HTMLElement) {
    const home = node.parentNode;
    document.body.appendChild(node);
    return {
      destroy() {
        if (home && node.parentNode === document.body) home.appendChild(node);
      },
    };
  }

  const kindLabel = $derived(detailingSheet.kind === 'section'
    ? t('detailing.sheet.section') : t('detailing.sheet.elevation'));

  /**
   * Focus is captured on open and restored on close by the same helper the 3-D workspace uses.
   *
   * `aria-modal` on a dialog that does not trap focus actively lies to assistive technology — the
   * defect the PR20 plan lists first for the overlay. Not worth reintroducing one panel over.
   */
  $effect(() => {
    if (!open) return;
    return captureFocus(sheetDialog);
  });

  function onSheetKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { open = false; return; }
    // The usual pair, so the zoom is reachable without hunting for the buttons.
    if (e.key === '+' || e.key === '=') { zoomIn(); e.preventDefault(); return; }
    if (e.key === '-') { zoomOut(); e.preventDefault(); return; }
    if (e.key === '0') { zoomReset(); e.preventDefault(); return; }
    if (cycleTabWithin(sheetDialog, e)) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onSheetKeydown} />

{#if detailingSheet.svg}
  <figure class="sheet-figure" data-testid="sheet-figure">
    <figcaption class="sheet-caption">
      <span class="sheet-title" data-testid="sheet-caption">
        {assemblyLabel}
        <span class="sheet-kind">
          {kindLabel}
        </span>
      </span>
      <button
        type="button"
        class="sheet-expand"
        data-testid="sheet-expand"
        onclick={() => (open = true)}
        title={t('detailing.sheet.expandHint')}
      >⤢ {t('detailing.sheet.expand')}</button>
    </figcaption>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated by sheetToSvg, all text escaped -->
    <div class="sheet" data-testid="sheet-preview">{@html detailingSheet.svg}</div>
  </figure>
{:else}
  <p class="sheet-empty" data-testid="sheet-empty">{t('detailing.sheet.empty')}</p>
{/if}

<!--
  The sheet at a size you can read.

  Rendered from the same `detailingSheet.svg` the preview shows — one projection, two
  presentations. `overflow: auto` on the body is the zoom/pan: the SVG keeps its natural size and
  the dialog scrolls, so nothing is scaled down into illegibility and nothing is cropped.
-->
{#if open && detailingSheet.svg}
  <div
    class="sheet-modal"
    data-testid="sheet-modal"
    role="dialog"
    aria-modal="true"
    aria-label={t('detailing.sheet.expand')}
    bind:this={sheetDialog}
    tabindex="-1"
    use:portal
  >
    <header>
      <h2>
        {assemblyLabel}
        <span class="kind">
          {kindLabel}
        </span>
        {#if detailingStore.document}
          <span class="rev">{tp('detailing.doc.revision', { n: detailingStore.document.revision.number })}</span>
        {/if}
      </h2>
      <div class="zoom" role="group" aria-label={t('detailing.sheet.zoom')}>
        <button type="button" data-testid="sheet-zoom-out" onclick={zoomOut}
                disabled={zoomIndex === 0} aria-label={t('detailing.sheet.zoomOut')}>−</button>
        <span data-testid="sheet-zoom-level">{Math.round(zoom * 100)}%</span>
        <button type="button" data-testid="sheet-zoom-in" onclick={zoomIn}
                disabled={zoomIndex === ZOOMS.length - 1}
                aria-label={t('detailing.sheet.zoomIn')}>+</button>
        <button type="button" data-testid="sheet-zoom-reset" onclick={zoomReset}>
          {t('detailing.sheet.zoomReset')}
        </button>
      </div>
      <button type="button" data-testid="sheet-modal-close" onclick={() => (open = false)}>
        ✕ {t('detailing.sheet.close')}
      </button>
    </header>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated by sheetToSvg, all text escaped -->
    <!--
      The scroll is still the pan; the transform is the zoom. `transform-origin: top left` so
      magnifying grows the drawing down and right instead of walking it out of the scroll box.
    -->
    <div class="sheet-modal-body" data-testid="sheet-modal-body">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated by sheetToSvg, all text escaped -->
      <div class="zoom-layer" style="transform: scale({zoom});">{@html detailingSheet.svg}</div>
    </div>
  </div>
{/if}

<style>
  .sheet-figure { margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .sheet-caption {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    font-size: 0.72rem; color: var(--st-text-2);
  }
  .sheet-title { font-weight: 600; color: var(--st-text); }
  .sheet-kind { font-weight: 400; color: var(--st-text-2); }
  .sheet-expand {
    background: var(--st-surface-3); border: 1px solid var(--st-interactive);
    color: var(--st-text); border-radius: 4px; padding: 2px 8px;
    font-size: 0.7rem; cursor: pointer; white-space: nowrap;
  }
  .sheet-expand:hover { background: var(--st-hair-strong); }
  .sheet-expand:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .sheet-empty {
    margin: 0.5rem 0; padding: 0.6rem 0.7rem;
    border: 1px dashed var(--st-hair-strong); border-radius: 4px;
    font-size: 0.75rem; color: var(--st-text-2);
  }
  /* A useful minimum: below this the drawing stops being readable and becomes decoration. */
  .sheet { overflow: auto; background: var(--st-text); border-radius: 4px; min-height: 9rem; }
  .sheet :global(svg) { max-width: 100%; height: auto; display: block; }

  .sheet-modal {
    position: fixed; inset: 0; z-index: 950;
    display: flex; flex-direction: column;
    background: var(--st-bg);
  }
  /*
    The header must not push its own controls off the screen.

    `h2` held the assembly label, the sheet kind and the revision with nothing stopping it from
    growing, so in a flex row with `space-between` the zoom group and the close button were shoved
    past the right edge — present in the DOM, resolvable by a locator, and never clickable.
    `min-width: 0` lets the title shrink; wrapping catches the case where it still cannot.
  */
  .sheet-modal header {
    display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
    /*
      Deliberately NOT `flex-wrap: wrap`.

      With a wrapping header and a title that grows, the row oscillates between one and two lines
      on consecutive frames — and a box that never settles is a control that can never be clicked.
      Playwright reported it precisely: the zoom button resolved, measured 29x22 at a real
      position, and failed "visible, enabled and stable" 114 times in a row. The title truncates
      instead; the controls keep their size and their place.
    */
    padding: 0.5rem 0.9rem;
    border-bottom: 1px solid var(--st-hair);
    background: var(--st-surface);
  }
  .sheet-modal h2 {
    margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--st-text);
    display: flex; align-items: baseline; gap: 0.5rem;
    min-width: 0; flex: 1 1 auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .zoom, .sheet-modal header > button { flex: 0 0 auto; }
  .sheet-modal .kind, .sheet-modal .rev { font-size: 0.75rem; font-weight: 400; color: var(--st-text-2); }
  .sheet-modal header button {
    background: var(--st-surface-3); border: 1px solid var(--st-hair-strong);
    color: var(--st-text); border-radius: 4px; padding: 3px 10px;
    font-size: 0.75rem; cursor: pointer;
  }
  .sheet-modal header button:hover { background: var(--st-hair-strong); }
  .sheet-modal header button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  /* The scroll IS the pan: the sheet keeps its own size and the window moves over it. */
  .sheet-modal-body { flex: 1 1 auto; overflow: auto; background: var(--st-text); padding: 0.5rem; }
  .sheet-modal-body :global(svg) { display: block; }
  /* The zoom layer, not the SVG: scaling the element keeps the drawing's own geometry untouched. */
  .zoom-layer { transform-origin: top left; width: max-content; }
  .zoom { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--st-text-2); }
  .zoom button {
    min-width: 1.6rem;
    background: var(--st-surface-3); border: 1px solid var(--st-hair-strong);
    color: var(--st-text); border-radius: 4px; padding: 2px 6px;
    font-size: 0.72rem; cursor: pointer;
  }
  .zoom button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .zoom button:disabled { opacity: 0.5; cursor: not-allowed; }
  .zoom button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .zoom span { font-variant-numeric: tabular-nums; min-width: 2.8rem; text-align: center; }
</style>
