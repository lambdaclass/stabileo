<script lang="ts">
  /**
   * Choosing what to carry into 2D.
   *
   * # Two questions, in order
   *
   * WHICH PLANE, then WHAT TO DO WITH IT. They are asked in that order because
   * the second only makes sense once the first is answered — the cuts on offer
   * are the grid lines along the chosen plane's normal, and there are no cuts
   * to list until a plane exists.
   *
   * The old dialog asked only the first, and answered the second for you:
   * always project. For a warehouse that means every frame in the building
   * drawn on top of one frame, with the purlins collapsed to points. It solves
   * and it is not the structure anybody meant.
   *
   * # Why the cuts are offered rather than typed
   *
   * The useful distances are wherever the model happens to have its grid
   * lines, and they are not guessable from the drawing. A blank number field
   * asks the user to remember what they built; a list of the offsets that
   * exist, each with how many members it would yield, turns the question into
   * a choice. The field stays, for the case the list does not cover.
   */
  import { modelStore, uiStore } from '../lib/store';
  import {
    needsPlaneChoice, collapsedByPlane, cutsOn, projectOnto, sliceAt,
    eraseAndSwitch, switchPlain, type DrawPlane,
  } from '../lib/store/switch-2d';
  import { PROJECTION_COLLAPSE_ERROR } from '../lib/geometry/plane-projection';
  import { t } from '../lib/i18n';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  type Mode = 'project' | 'slice';

  let plane = $state<DrawPlane>('xz');
  let mode = $state<Mode>('slice');
  let offsetText = $state('');
  let confirmErase = $state(false);
  let error = $state<string | null>(null);

  /*
   * XZ first and selected by default: it is the structural convention — X
   * across, Z up — and the plane a frame taken out of a building will almost
   * always lie in. XY is the odd one out in a 3D model, being the plan.
   */
  const PLANES: Array<{ id: DrawPlane; label: string; descKey: string }> = [
    { id: 'xz', label: 'XZ', descKey: 'toolbar.planeModal.xz' },
    { id: 'yz', label: 'YZ', descKey: 'toolbar.planeModal.yz' },
    { id: 'xy', label: 'XY', descKey: 'toolbar.planeModal.xy' },
  ];

  const collapsed = $derived(open ? collapsedByPlane() : { xy: 0, xz: 0, yz: 0 });
  const cuts = $derived(open ? cutsOn(plane) : []);
  const normal = $derived(plane === 'xy' ? 'Z' : plane === 'xz' ? 'Y' : 'X');

  /** Empty is not zero: an unanswered field must not silently cut at the origin. */
  const offset = $derived(offsetText.trim() === '' ? null : Number(offsetText));
  const offsetValid = $derived(offset !== null && Number.isFinite(offset));

  /** The cut the typed distance names, if it names one. */
  const matching = $derived(
    /*
     * Tolerance matched to what the field SHOWS: fmt rounds to three
     * decimals, so a chip for 2.5455 types "2.545"/"2.546" back and must
     * still light up. 1e-3 is also the slice tolerance itself, so two
     * distinct cuts can never sit inside it.
     */
    offsetValid ? cuts.find((c) => Math.abs(c.value - offset!) < 1e-3) ?? null : null,
  );

  /** What the model carries, to say how much of it a cut leaves behind. */
  const totalLoads = $derived(modelStore.loads.length);

  /* A plane change invalidates the distance — it was measured along the old
     normal, and silently reusing the number would cut somewhere nobody asked
     for. */
  function pickPlane(p: DrawPlane) {
    plane = p;
    offsetText = '';
    error = null;
  }

  function apply() {
    error = null;
    const outcome = mode === 'project'
      ? projectOnto(plane)
      : offsetValid ? sliceAt(plane, offset!) : { ok: false as const, error: 'slice.noOffset' };

    /*
     * The builder's failure arrives as an English sentence (the legacy toolbar
     * modal toasts it verbatim, so it cannot become a key at the source). Here
     * it becomes one, so every locale gets the translation instead of a raw
     * `switch2d.All elements collapse…` fallback.
     */
    if (!outcome.ok) {
      error = outcome.error === PROJECTION_COLLAPSE_ERROR ? 'slice.allCollapse' : outcome.error;
      return;
    }
    close();
  }

  function close() {
    open = false;
    confirmErase = false;
    error = null;
  }

  function erase() {
    eraseAndSwitch();
    close();
  }

  /** Format a distance the way the list and the field both read it. */
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''));
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="s2d-overlay" onclick={close}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="s2d" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <h3 class="s2d-title">{t('switch2d.title')}</h3>
      <p class="s2d-lede">{t('switch2d.lede')}</p>

      <!-- ── 1. the plane ─────────────────────────────────────────── -->
      <section class="s2d-step">
        <h4 class="s2d-step-head"><span class="s2d-num">1</span>{t('switch2d.stepPlane')}</h4>
        <div class="s2d-planes" role="radiogroup" aria-label={t('switch2d.stepPlane')}>
          {#each PLANES as p}
            <button
              class="s2d-plane" class:on={plane === p.id}
              role="radio" aria-checked={plane === p.id}
              onclick={() => pickPlane(p.id)}
              data-testid={`s2d-plane-${p.id}`}
            >
              <span class="s2d-plane-name">{p.label}</span>
              <span class="s2d-plane-desc">{t(p.descKey)}</span>
            </button>
          {/each}
        </div>
      </section>

      <!-- ── 2. what to do with it ────────────────────────────────── -->
      <section class="s2d-step">
        <h4 class="s2d-step-head"><span class="s2d-num">2</span>{t('switch2d.stepWhat')}</h4>
        <div class="s2d-modes">
          <button
            class="s2d-mode" class:on={mode === 'slice'}
            onclick={() => (mode = 'slice')}
            data-testid="s2d-mode-slice"
          >
            <span class="s2d-mode-name">{t('switch2d.slice')}</span>
            <span class="s2d-mode-desc">{t('switch2d.sliceDesc')}</span>
          </button>
          <button
            class="s2d-mode" class:on={mode === 'project'}
            onclick={() => (mode = 'project')}
            data-testid="s2d-mode-project"
          >
            <span class="s2d-mode-name">{t('switch2d.project')}</span>
            <span class="s2d-mode-desc">{t('switch2d.projectDesc')}</span>
          </button>
        </div>

        {#if mode === 'slice'}
          <div class="s2d-slice">
            <label class="s2d-offset">
              <span class="s2d-offset-label">{normal} =</span>
              <!--
                NOT bind:value: on a numeric input Svelte coerces the binding
                to number | null, and offsetText is a string everywhere else
                (trim, fmt) — the first keystroke would crash the dialog.
              -->
              <input
                type="number"
                step="any"
                value={offsetText}
                oninput={(e) => (offsetText = e.currentTarget.value)}
                placeholder={cuts.length ? fmt(cuts[0].value) : '0'}
                data-testid="s2d-offset"
              />
              <span class="s2d-unit">m</span>
            </label>

            {#if cuts.length}
              <p class="s2d-hint">{t('switch2d.cutsAvailable')}</p>
              <div class="s2d-cuts">
                {#each cuts as c}
                  <button
                    class="s2d-cut" class:on={matching?.value === c.value}
                    class:barren={c.elements === 0}
                    onclick={() => (offsetText = fmt(c.value))}
                    data-testid={`s2d-cut-${fmt(c.value)}`}
                  >
                    <span class="s2d-cut-at">{normal} = {fmt(c.value)}</span>
                    <span class="s2d-cut-n">
                      {c.elements} {t('switch2d.members')}
                      <!--
                        A cut with no support in it is the single most common
                        way this ends badly: across the models that ship with
                        the app, every cut that fails to solve fails for
                        exactly this reason. Marked on the chip, so the choice
                        is made knowing it.
                      -->
                      {#if c.elements > 0 && c.supports === 0}
                        <span class="s2d-cut-flag">· {t('switch2d.noSupports')}</span>
                      {/if}
                      <!--
                        And the opposite failure, which is the quiet one. No
                        supports means the solver refuses and the user finds
                        out. No load means it SOLVES, reports zero everywhere,
                        and paints a uniformly safe utilisation map. Flagged on
                        the chip for the same reason, in the same place.
                      -->
                      {#if c.elements > 0 && c.loads === 0}
                        <span class="s2d-cut-flag">· {t('switch2d.noLoads')}</span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}

            <!--
              What the cut would leave behind, before it is made. A count after
              the fact explains a surprise; the same count before it is a
              decision.
            -->
            {#if matching}
              <p class="s2d-outcome">
                {matching.nodes} {t('switch2d.nodes')} · {matching.elements} {t('switch2d.members')}
                · {matching.loads} {t('switch2d.loads')}
                {#if modelStore.elements.size - matching.elements > 0}
                  <span class="s2d-dropped">
                    — {modelStore.elements.size - matching.elements} {t('switch2d.leftBehind')}
                  </span>
                {/if}
                <!--
                  Load left behind is counted beside members left behind, because
                  the two mislead in opposite directions: a member the cut missed
                  makes the frame look weaker than it is, and a LOAD it missed
                  makes it look stronger.
                -->
                {#if totalLoads - matching.loads > 0}
                  <span class="s2d-dropped">
                    — {totalLoads - matching.loads} {t('switch2d.loadsLeftBehind')}
                  </span>
                {/if}
              </p>
              {#if matching.supports === 0}
                <p class="s2d-warn-line">{t('switch2d.noSupportsWarn')}</p>
              {/if}
              {#if matching.elements > 0 && matching.loads === 0}
                <p class="s2d-warn-line">{t('switch2d.noLoadsWarn')}</p>
              {/if}
            {/if}
          </div>
        {:else}
          <p class="s2d-outcome">
            {#if collapsed[plane] > 0}
              <span class="s2d-warn">~{collapsed[plane]} {t('toolbar.planeModal.simplified')}</span>
            {:else}
              {t('switch2d.projectClean')}
            {/if}
          </p>
        {/if}

        {#if error}
          <p class="s2d-error" data-testid="s2d-error">{t(`switch2d.${error.replace('slice.', '')}`)}</p>
        {/if}
      </section>

      <div class="s2d-footer">
        <button class="s2d-btn" onclick={close} data-testid="s2d-cancel">
          {t('toolbar.planeModal.stay3d')}
        </button>
        <div class="s2d-footer-right">
          <!--
            Erasing is not one of the two answers above, so it does not sit
            beside them. It asks again in place rather than opening a second
            dialog: the question is small and a dialog on a dialog is how a
            user loses track of what they are confirming.
          -->
          {#if confirmErase}
            <button class="s2d-btn s2d-danger" onclick={erase} data-testid="s2d-erase-confirm">
              {t('switch2d.eraseSure')}
            </button>
            <button class="s2d-btn" onclick={() => (confirmErase = false)}>
              {t('switch2d.eraseCancel')}
            </button>
          {:else}
            <button class="s2d-btn s2d-quiet" onclick={() => (confirmErase = true)} data-testid="s2d-erase">
              {t('toolbar.planeModal.eraseAndSwitch')}
            </button>
            <button
              class="s2d-btn s2d-primary"
              onclick={apply}
              disabled={mode === 'slice' && !offsetValid}
              data-testid="s2d-apply"
            >
              {t('switch2d.apply')}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .s2d-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .s2d {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
  }

  .s2d-title {
    margin: 0 0 4px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .s2d-lede {
    margin: 0 0 16px;
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--st-text-3);
  }

  .s2d-step { margin-bottom: 16px; }

  .s2d-step-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 8px;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }

  /* Numbered because the second question depends on the first — the order is
     part of the instruction, not decoration. */
  .s2d-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--st-surface-3);
    color: var(--st-text-2);
    font-size: 0.6rem;
  }

  .s2d-planes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .s2d-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

  .s2d-plane,
  .s2d-mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .s2d-plane:hover,
  .s2d-mode:hover { background: var(--st-surface-3); color: var(--st-text); }

  /* Marked the way the selection panel marks its armed kind: a bar on the
     leading edge, not a fill. Same meaning, same mark. */
  .s2d-plane.on,
  .s2d-mode.on {
    border-left-color: var(--st-accent);
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .s2d-plane-name { font-size: 0.8rem; font-weight: 600; }
  .s2d-plane-desc,
  .s2d-mode-desc { font-size: 0.62rem; line-height: 1.35; color: var(--st-text-3); }
  .s2d-mode-name { font-size: 0.76rem; font-weight: 600; }

  .s2d-slice { margin-top: 10px; }

  .s2d-offset {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--st-text);
  }

  .s2d-offset-label { font-family: var(--st-mono, monospace); min-width: 2.2em; }

  .s2d-offset input {
    width: 8em;
    padding: 4px 6px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.75rem;
  }

  .s2d-unit { font-size: 0.68rem; color: var(--st-text-3); }

  .s2d-hint {
    margin: 10px 0 5px;
    font-size: 0.62rem;
    color: var(--st-text-3);
  }

  .s2d-cuts { display: flex; flex-wrap: wrap; gap: 4px; }

  .s2d-cut {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 4px 7px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.66rem;
  }

  .s2d-cut:hover { background: var(--st-surface-3); color: var(--st-text); }
  .s2d-cut.on { border-color: var(--st-accent); color: var(--st-text); }

  /* An offset with nodes but nothing joining them cannot make a frame. Shown
     rather than hidden, because its absence from the list would be the more
     confusing of the two. */
  .s2d-cut.barren { opacity: 0.5; }

  .s2d-cut-at { font-family: var(--st-mono, monospace); }
  .s2d-cut-n { font-size: 0.58rem; color: var(--st-text-3); }
  .s2d-cut-flag { color: var(--st-value); }

  .s2d-warn-line {
    margin: 4px 0 0;
    font-size: 0.64rem;
    line-height: 1.4;
    color: var(--st-value);
  }

  .s2d-outcome {
    margin: 10px 0 0;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }

  .s2d-dropped { color: var(--st-text-3); }
  .s2d-warn { color: var(--st-value); }

  .s2d-error {
    margin: 8px 0 0;
    font-size: 0.68rem;
    color: var(--st-bad, #e06c75);
  }

  .s2d-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--st-hair);
  }

  .s2d-footer-right { display: flex; gap: 6px; }

  .s2d-btn {
    padding: 6px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .s2d-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .s2d-btn:disabled { opacity: 0.45; cursor: default; }

  .s2d-primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }

  .s2d-quiet { color: var(--st-text-3); }

  .s2d-danger {
    background: color-mix(in srgb, var(--st-bad, #e06c75) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-bad, #e06c75) 55%, transparent);
    color: var(--st-text);
  }
</style>
