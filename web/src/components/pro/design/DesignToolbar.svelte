<script lang="ts">
  /**
   * Design command bar: three explicit commands plus Design all, honest counts and
   * the banner stack.
   *
   * The single old "Run Design" button conflated check + generate + accept, and the
   * accept step mutated every un-detailed member with no undo entry.
   */
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { te } from '../../../lib/i18n/engine-text';
  import { bindingLabel } from '../../../lib/codes/roles';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { detailingAuthor } from '../../../lib/store/detailing-author.svelte';
  import { diagnosticsWarning } from '../../../lib/store/diagnostics-warning.svelte';
  import { canOpenRebar3D, openRebar3D, rebar3DAssemblyCount } from '../../../lib/store/rebar-open';
  import OutcomeBadge from './OutcomeBadge.svelte';

  interface Props {
    selectedCount: number;
    hasResults: boolean;
    hasCombinations: boolean;
    editedCount: number;
    onComputeDemands: () => void;
    onCodeCheck: () => void;
    onAutoDesignSelected: () => void;
    onAutoDesignUndesigned: () => void;
    onDesignAll: () => void;
    onReviewChanges: () => void;
    onRevertEdits: () => void;
    onShowOrientation: () => void;
    /** Where the diagnostics chip goes. Owned by the panel, which knows how to switch tabs. */
    onOpenDiagnostics: () => void;
  }
  let {
    selectedCount, hasResults, hasCombinations, editedCount,
    onComputeDemands, onCodeCheck, onAutoDesignSelected, onAutoDesignUndesigned,
    onDesignAll, onReviewChanges, onRevertEdits, onShowOrientation,
    onOpenDiagnostics,
  }: Props = $props();

  let autoMenuOpen = $state(false);

  // ─── Ver modelo 3D ──────────────────────────────────────────────
  let opening3d = $state(false);
  let open3dError = $state<string | null>(null);
  const canOpen3d = $derived(canOpenRebar3D());
  const assemblyCount = $derived(rebar3DAssemblyCount());

  /**
   * Build the document and open the workspace.
   *
   * `opening3d` is held across a frame on purpose. The build is synchronous and can take a
   * noticeable moment on a large model, so without yielding first the browser never paints the
   * pending state and the button looks like it did nothing — the exact complaint that put this
   * command on the main row in the first place.
   */
  async function open3d() {
    open3dError = null;
    opening3d = true;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const res = openRebar3D({
        author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
        at: new Date().toISOString(),
      });
      if (!res.ok) open3dError = t('detailing.doc.noCoordinated');
    } finally {
      opening3d = false;
    }
  }

  /**
   * The concrete design code in force, and why it might not be.
   *
   * There is no selector here any more. This bar used to carry a dropdown listing the whole
   * adapter registry — which showed "CIRSOC 201" twice, because the 2025 and 2005 adapters
   * share a display name, and offered the 2005 edition whose official text is not supplied
   * with this app. Worse, it wrote its own state: the code check, the candidate search and
   * detailing read it, while Project Regulations bound a `concrete` role that reached only
   * part of detailing. The two could disagree.
   *
   * Project Regulations is the one selector. This is a read-out of what it chose.
   */
  const concreteBinding = $derived(regulationsStore.binding('concrete'));
  const concreteReady = $derived(regulationsStore.concreteDesignCode() !== null);
  // `bindingLabel` is the same labeller Project Regulations uses, so the read-out and the
  // selector can never print the regulation differently.


  const busy = $derived(designRunStore.running);
  // No usable concrete code means no design. Gating beats defaulting: silently falling back
  // to CIRSOC would verify a project against rules it never chose.
  const canDesign = $derived(hasResults && hasCombinations && !busy && concreteReady);
  const orientCount = $derived(verificationStore.orientationSuspectCount);
  const provisionalCount = $derived(designRunStore.provisionalIds.size);

  // ── Detailing ──
  // The audit's headline finding was that the detailing engines had no production caller.
  // This is it: a visible command, enabled exactly when the prerequisites hold, and when
  // it is not, saying which members are in the way and how many.
  const detailingReady = $derived(detailingStore.readiness);
  const hasDetailing = $derived(detailingStore.assemblies.length > 0);
  const detailingBusy = $derived(detailingStore.generating);

  /** Precise prerequisites, so a disabled button is never a dead end. */
  const detailingBlockers = $derived(
    detailingReady.prerequisites.map((p) => tp(p.key, { n: p.count,
      ids: p.elementIds.slice(0, 6).join(', ') })).join(' '),
  );

  function generateDetailing() {
    detailingStore.generate();
  }


</script>

<div class="toolbar" data-testid="design-toolbar">
  <!--
    The regulation read-out and the member counts moved to `DesignOverview.svelte`.

    They were the FIRST questions a reviewer asks — which code, and what state is the project in —
    answered at the very bottom of the tab, below three collapsible stages. They are now the tab's
    opening section. Nothing was duplicated: this bar no longer renders either of them.
  -->
  <!--
    Three groups, in the order the work happens, each named.

    They were one flat row of six buttons that wrapped onto three lines at 1280×720, with no
    signal that "Compute demands" must precede "Run code check" or that "View 3-D model" is a
    result rather than a step. The group labels are the same words the workflow strip uses, so
    the strip and the commands name the same stages.
  -->
  <div class="cmd-row">
    <div class="cmd-group" data-testid="cmd-group-verify">
      <span class="group-label">{t('design.group.verify')}</span>
      <div class="group-items">
        <button class="cmd" data-testid="cmd-compute-demands" onclick={onComputeDemands}
                disabled={!hasResults || busy}>{t('design.cmd.computeDemands')}</button>
        <button class="cmd" data-testid="cmd-code-check" onclick={onCodeCheck}
                disabled={!canDesign}>{t('design.cmd.codeCheck')}</button>
      </div>
    </div>

    <div class="cmd-group" data-testid="cmd-group-design">
      <span class="group-label">{t('design.group.design')}</span>
      <div class="group-items">
    <div class="split">
      <button class="cmd cmd-primary" data-testid="cmd-autodesign" onclick={onAutoDesignSelected}
              disabled={!canDesign || selectedCount === 0}>
        {t('design.cmd.autoDesignSelected')}{selectedCount > 0 ? ` (${selectedCount})` : ''}
      </button>
      <button class="cmd cmd-caret" data-testid="cmd-autodesign-menu"
              aria-haspopup="menu" aria-expanded={autoMenuOpen}
              aria-label={t('design.cmd.autoDesign')}
              onclick={() => (autoMenuOpen = !autoMenuOpen)} disabled={!canDesign}>▾</button>
      {#if autoMenuOpen}
        <div class="menu" role="menu" data-testid="autodesign-menu">
          <button role="menuitem" data-testid="cmd-autodesign-undesigned"
                  onclick={() => { autoMenuOpen = false; onAutoDesignUndesigned(); }}>
            {t('design.cmd.autoDesignUndesigned')}
          </button>
        </div>
      {/if}
    </div>

    <button class="cmd cmd-all" data-testid="cmd-design-all" onclick={onDesignAll}
            disabled={!canDesign}
            title={t('design.cmd.designAllScope')}>{t('design.cmd.designAll')}</button>
      </div>
    </div>

    <div class="cmd-group" data-testid="cmd-group-detailing">
      <span class="group-label">{t('design.group.detailing')}</span>
      <div class="group-items">
    <button class="cmd cmd-detailing" data-testid="cmd-generate-detailing"
            onclick={generateDetailing}
            disabled={!detailingReady.ready || detailingBusy || busy}
            title={detailingReady.ready ? '' : detailingBlockers}>
      {detailingBusy
        ? t('detailing.cmd.generating')
        : hasDetailing ? t('detailing.cmd.regenerate') : t('detailing.cmd.generate')}
    </button>
        <!-- The preference that governs the button beside it, next to the button it governs. -->
        <label class="detailing-auto" data-testid="detailing-auto-label">
          <input type="checkbox" data-testid="detailing-auto"
                 checked={detailingStore.autoGenerate}
                 onchange={(e) => detailingStore.setAutoGenerate(e.currentTarget.checked)} />
          {t('detailing.cmd.autoShort')}
        </label>

    <!--
      `Ver modelo 3D` — the RESULT of everything to its left, and until PR20 it was reachable
      only from inside the detailing disclosure, two levels below the commands that produce it.

      It is the same operation as the button that stays down there: both call `openRebar3D`, so
      the cage on screen is a projection of the same document instance the report, the schedule
      and the drawings render. It is disabled — not hidden — while there is nothing to draw, and
      says so, because a command that vanishes teaches nobody what it needs.
    -->
    <button
      class="cmd cmd-3d"
      data-testid="cmd-open-3d"
      onclick={open3d}
      disabled={!canOpen3d || opening3d || detailingBusy}
      title={canOpen3d ? '' : t('detailing.scene.openBlocked')}
    >
      <span aria-hidden="true">◫</span>
      {opening3d ? t('detailing.scene.opening') : t('detailing.scene.openMain')}
      {#if canOpen3d}
        <span class="cmd-3d-count" data-testid="cmd-open-3d-count">{assemblyCount}</span>
      {/if}
    </button>

      </div>
    </div>

    {#if busy}
      <button class="cmd cmd-cancel" data-testid="cmd-cancel" onclick={() => designRunStore.cancel()}>
        {t('design.cmd.cancel')}
      </button>
    {/if}

    <!--
      The model-diagnostics warning, at the RIGHT of this row rather than down the side of the
      panel — see `diagnostics-warning.svelte.ts` for when it is allowed to appear at all. It is
      a chip, not a column: it takes one line's height and gives the rest back.
    -->
    {#if diagnosticsWarning.visible}
      <button
        class="cmd-diag"
        data-testid="design-diagnostics-warning"
        onclick={() => { diagnosticsWarning.markSeen(); onOpenDiagnostics(); }}
        title={t('pro.fixBeforeSolve')}
      >
        <span aria-hidden="true">⚠</span>
        {tp('pro.diagWarnChip', { n: diagnosticsWarning.count })}
      </button>
    {/if}
  </div>

  {#if open3dError}
    <p class="open3d-error" role="alert" data-testid="cmd-open-3d-error">{open3dError}</p>
  {/if}

  <!-- Why the command is unavailable, in the open, with counts. -->
  {#if !detailingReady.ready && detailingBlockers}
    <p class="detailing-blockers" data-testid="detailing-prerequisites">
      {detailingBlockers}
    </p>
  {/if}


  {#if busy && designRunStore.progress}
    {@const p = designRunStore.progress}
    <div class="progress" role="status" aria-live="polite" data-testid="design-progress">
      <div class="progress-bar"><div class="progress-fill" style="width:{(p.done / Math.max(p.total, 1)) * 100}%"></div></div>
      <span class="progress-text">{tp('design.cmd.progress', { done: p.done, total: p.total, verified: p.verified })}</span>
    </div>
  {/if}


  <!-- ─── Banner stack ─── -->
  {#if !hasCombinations}
    <div class="banner banner-block" role="alert" data-testid="banner-no-combinations">
      {t('design.banner.noCombinations')}
    </div>
  {/if}

  {#if orientCount > 0}
    <div class="banner banner-block" role="alert" data-testid="banner-orientation">
      <span>{tp('design.banner.orientation', { n: orientCount })}</span>
      <button class="banner-btn" data-testid="banner-orientation-detail" onclick={onShowOrientation}>
        {t('design.banner.orientationDetail')}
      </button>
    </div>
  {/if}

  {#if verificationStore.isBaselineStale}
    <div class="banner banner-stale" role="status" data-testid="banner-stale">
      <span>⌛ {t('design.banner.staleBaseline')}</span>
      <button class="banner-btn" data-testid="banner-rerun-code-check" onclick={onCodeCheck}>
        {t('design.banner.rerunCodeCheck')}
      </button>
    </div>
  {/if}

  {#if editedCount > 0}
    <!-- Reinforcement edits do NOT make the numbers stale: verification is
         recomputed from retained demand on every edit. The banner is therefore an
         affordance, not a warning. -->
    <div class="banner banner-info" role="status" data-testid="banner-changed">
      <span>ⓘ {tp('design.banner.changed', { n: editedCount })}</span>
      <button class="banner-btn" data-testid="banner-review-changes" onclick={onReviewChanges}>
        {t('design.banner.review')}
      </button>
      <button class="banner-btn" data-testid="banner-revert-edits" onclick={onRevertEdits}>
        {t('design.banner.revert')}
      </button>
    </div>
  {/if}

  {#if provisionalCount > 0}
    <div class="banner banner-warn" role="status" data-testid="banner-provisional">
      <OutcomeBadge flag="provisional" />
      <span>{tp('design.banner.provisional', { n: provisionalCount })}</span>
      <button class="banner-btn" data-testid="banner-provisional-review" onclick={onReviewChanges}>
        {t('design.banner.review')}
      </button>
    </div>
  {/if}

  {#if designRunStore.lastError}
    <div class="banner banner-block" role="alert" data-testid="banner-error">
      {tp(designRunStore.lastError.key, designRunStore.lastError.params)}
    </div>
  {/if}
</div>

<style>
  .toolbar { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px;
    background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3); flex-shrink: 0; }
  /*
    Groups, not a row of buttons.

    `align-items: flex-start` so a group whose items wrap does not stretch its neighbours, and a
    hairline between groups so the boundary survives when the row itself wraps at 1280×720 — which
    is exactly when a flat row stopped being readable.
  */
  .cmd-row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
  .cmd-group { display: flex; flex-direction: column; gap: 3px; padding-right: 10px; }
  .cmd-group + .cmd-group { border-left: 1px solid var(--st-hair); padding-left: 10px; }
  .group-label {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-3);
  }
  .group-items { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .cmd { padding: 4px 10px; background: var(--st-surface-3); border: 1px solid var(--st-info);
    border-radius: 4px; color: var(--st-text); font-size: 0.75rem; font-weight: 600; cursor: pointer; }
  .cmd:hover:not(:disabled) { background: var(--st-hair-strong); }
  .cmd:disabled { opacity: 0.4; cursor: not-allowed; }
  .cmd:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .cmd-primary { background: var(--st-surface-3); border-color: var(--st-info); color: var(--st-text); }
  .cmd-all { background: var(--st-hair-strong); border-color: var(--st-ok); color: var(--st-text); }
  .cmd-cancel { background: var(--st-hair-strong); border-color: var(--st-accent); color: var(--st-text); }
  .split { position: relative; display: flex; }
  .cmd-caret { border-left: none; border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 4px 6px; }
  .split .cmd-primary { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .menu { position: absolute; top: 100%; left: 0; z-index: 40; margin-top: 2px;
    background: var(--st-surface-3); border: 1px solid var(--st-info); border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5); min-width: 220px; }
  .menu button { display: block; width: 100%; text-align: left; padding: 6px 10px;
    background: none; border:  1px solid var(--st-hair); color: var(--st-text); font-size: 0.75rem; cursor: pointer; }
  .menu button:hover { background: var(--st-surface-3); }

  .progress { display: flex; align-items: center; gap: 8px; }
  .progress-bar { flex: 1; height: 5px; background: var(--st-surface-3); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--st-accent); transition: width 0.15s linear; }
  .progress-text { font-size: 0.7rem; color: var(--st-text-2); font-family: monospace; }

  .cmd-detailing { background: var(--st-hair-strong); }
  .detailing-auto {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 0.68rem; color: var(--st-text-2); white-space: nowrap; cursor: pointer;
  }
  .detailing-auto:focus-within { outline: 2px solid var(--st-value); outline-offset: 2px; }

  /*
     `Ver modelo 3D` reads as the end of the row, because it is: everything to its left
     produces the thing it shows. Interactive blue rather than the accent — the accent is the
     brand and the destructive edge, and this is neither.
  */
  .cmd-3d {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--st-surface-3);
    border-color: var(--st-interactive);
    color: var(--st-text);
  }
  .cmd-3d:hover:not(:disabled) { background: var(--st-hair-strong); }
  .cmd-3d-count {
    font-family: var(--st-mono); font-size: 0.66rem; font-weight: 600;
    padding: 0 4px; border-radius: 2px;
    background: var(--st-hair); color: var(--st-text-2);
  }

  /*
     The diagnostics chip. `margin-left: auto` sends it to the right of the row and nothing
     else in the row is allowed to grow, so it stays a chip on one line instead of the column
     down the panel it used to be.
  */
  .cmd-diag {
    margin-left: auto;
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px;
    background: rgba(217, 164, 65, 0.12);
    border: 1px solid var(--st-warn);
    border-radius: 4px;
    color: var(--st-warn);
    font-size: 0.72rem; font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .cmd-diag:hover { background: rgba(217, 164, 65, 0.22); }
  .cmd-diag:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 1px; }

  .open3d-error {
    margin: 0.3rem 0 0;
    font-size: 0.72rem;
    color: var(--st-warn);
  }
  .detailing-blockers { margin: 0.3rem 0 0; font-size: 0.76rem; opacity: 0.85; }

  .banner { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 5px 9px; border-radius: 4px; font-size: 0.73rem; line-height: 1.45; }
  .banner-block { background: rgba(238,34,34,0.14); border: 1px solid var(--st-accent); color: var(--st-text); }
  .banner-warn { background: rgba(255,102,0,0.13); border: 1px solid var(--st-warn); color: var(--st-text); }
  .banner-info { background: rgba(127, 212, 204,0.11); border: 1px solid var(--st-hair-strong); color: var(--st-text); }
  .banner-stale { border: 1px solid var(--st-text-3); color: var(--st-text);
    background: repeating-linear-gradient(45deg, rgba(138,143,122,0.16) 0 6px, rgba(93,97,84,0.16) 6px 12px); }
  .banner-btn { padding: 2px 8px; background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.18); border-radius: 3px; color: inherit;
    font-size: 0.7rem; font-weight: 600; cursor: pointer; }
  .banner-btn:hover { background: rgba(255,255,255,0.16); }
  .banner-btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
</style>
