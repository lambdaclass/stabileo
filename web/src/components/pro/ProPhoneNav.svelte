<script lang="ts">
  /**
   * The phone panel's pinned head: the two pills, and the stage list one of them opens.
   *
   * Extracted from `ProPanel.svelte`, which the `GATE: ProPanel was decomposed` test holds
   * under 600 lines and which merging main had taken to 1 102 — the shell arrived inline from
   * one branch while the other was taking the file apart.
   *
   * Presentational only. Every reading and every command comes from `PhoneShell`, built once
   * by the panel; see the note in `lib/pro/phone-shell.svelte.ts` about why neither this
   * component nor its sibling builds the stage context itself.
   *
   * This element sits OUTSIDE `.pro-content` on purpose, so it stays pinned while the grid and
   * the tab's own content scroll under it.
   */
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import Icon from '../ribbon/Icon.svelte';
  import ProProjectFileActions from './ProProjectFileActions.svelte';
  import type { PhoneShell } from '../../lib/pro/phone-shell.svelte';

  const { shell }: { shell: PhoneShell } = $props();
</script>

  {#if uiStore.isMobile}
    <!-- Mobile-only PRO navigation and actions (tools moved to upper toolbar in App.svelte) -->
    <div class="pro-mobile-nav">
      <!--
        No action row here at all.
        ─────────────────────────
        It held Open, Save, Examples, Solve and Report above every tab. Solve and
        Report are ANALYSE commands and are in the grid; Open, Save and Examples
        belong to the document and are in the Project tab's own sections, where
        the reader already goes to start or file a model. A header that repeats
        five buttons over the nodes table, over diagnostics, over RC design is a
        permanent cost for errands you run twice a session.
      -->
      <!--
        The stage's commands, as a grid.
        ───────────────────────────────
        This replaces a native `<select>` that listed all thirteen panel tabs in
        one flat drop-down. The select was honest and it scaled, but it hid every
        destination behind a tap and told the reader nothing about the shape of
        the application — which stage they were in, what else was in it, or that
        stages existed at all. It also could not offer the eight diagrams or the
        two colour maps, because those are not tabs, so on a phone they were
        unreachable.

        A grid says all of it at once and still grows: a sixteenth command in
        ANALYSE is one more cell, and nothing above or below has to move.
      -->
      <!--
        Two pills, half the width each: command on the left, stage on the right.
        The left one always says where you are, because it is the half that
        survives when the grid is folded.
      -->
      <div class="pm-pills">
        <button
          class="pm-pill pm-pill-cmd"
          class:open={shell.gridOpen}
          onclick={() => { shell.gridOpen = !shell.gridOpen; shell.stageMenuOpen = false; }}
          aria-expanded={shell.gridOpen}
          data-testid="pm-grid-toggle"
        >
          <span class="pm-pill-face">
            {#if shell.onProject}
              <span class="pm-pill-icon"><Icon name="project" size={15} /></span>
              <span class="pm-pill-text">{t('ribbon.project')}</span>
            {:else if shell.here}
              <span class="pm-pill-icon"><Icon name={shell.here.icon ?? 'data'} size={15} rotate={shell.here.rotate ?? 0} /></span>
              <span class="pm-pill-text">{shell.here.label ?? t(shell.here.labelKey)}</span>
            {:else}
              <span class="pm-pill-text pm-pill-dim">{t('pro.tabNodes')}</span>
            {/if}
          </span>
          <span class="pm-caret" aria-hidden="true"></span>
        </button>

        <!--
          Greyed on the Project screen: the document belongs to no stage, so
          naming one would claim a place the panel is not showing.
        -->
        <button
          class="pm-pill pm-pill-stage"
          class:open={shell.stageMenuOpen}
          disabled={shell.onProject}
          onclick={() => { shell.stageMenuOpen = !shell.stageMenuOpen; shell.gridOpen = false; }}
          aria-expanded={shell.stageMenuOpen}
          data-testid="pm-stage-toggle"
        >
          <span class="pm-pill-face">
            <span class="pm-pill-text">{shell.stage ? t(shell.stage.labelKey) : ''}</span>
          </span>
          <span class="pm-caret" aria-hidden="true"></span>
        </button>
      </div>

      <!--
        What a drag picks up, shown HERE rather than in the bar.
        ──────────────────────────────────────────────────────
        Five translated words do not fit in a 375 px toolbar in any language —
        as chips up there they wrapped the bar onto a second line. They are
        options OF the pointer, so they appear when the pointer is armed, in the
        panel, which has the width. Pressing Selección in the bar opens the
        sheet for exactly this reason.
      -->
      {#if uiStore.currentTool === 'select'}
        <div class="pm-select-modes" data-testid="pm-select-modes">
          {#each [
            { id: 'nodes', key: 'float.selectNodes' },
            { id: 'elements', key: 'float.selectElements' },
            { id: 'shells', key: 'float.selectShells' },
            { id: 'supports', key: 'float.selectSupports' },
            { id: 'loads', key: 'float.selectLoads' },
          ] as const as sm (sm.id)}
            <button
              class="pm-sel"
              class:active={uiStore.selectMode === sm.id}
              onclick={() => uiStore.selectMode = sm.id}
            >{t(sm.key)}</button>
          {/each}
        </div>
      {/if}

      {#if shell.stageMenuOpen}
        <div class="pm-stage-list" data-testid="pm-stage-list">
          {#each shell.stages as st (st.id)}
            <button
              class="pm-stage-item"
              class:active={shell.stage?.id === st.id}
              data-testid="pm-stage-{st.id}"
              onclick={() => { uiStore.proActiveTab = st.home; shell.stageMenuOpen = false; }}
            >{t(st.labelKey)}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}


<style>
  .pro-mobile-nav {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    background: var(--st-surface);
  }
  .pm-select-modes {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .pm-sel {
    padding: 4px 8px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    cursor: pointer;
  }
  .pm-sel:hover { color: var(--st-text); }
  .pm-sel.active { color: var(--st-text); background: var(--st-accent); border-color: var(--st-danger); }
  /* ── The phone's stage grid ─────────────────────────────────────────
     Three columns, because at 375 px that is a 113 px cell — wide enough for
     "Diagnósticos" at a readable size and tall enough to be a 48 px target.
     It wraps downward without limit, which is the property the row it replaced
     did not have and the reason this is a grid at all.
     ──────────────────────────────────────────────────────────────── */
  /* ── The two pills ────────────────────────────────────────────────
     Half the width each, so neither reads as the senior of the two. The left
     one carries the address and is the half that survives a fold.
     ──────────────────────────────────────────────────────────────── */
  .pm-pills {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
  }

  .pm-pill {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-height: 44px;
    padding: 0 8px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-mono);
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .pm-pill.open { background: var(--st-surface-2); border-color: var(--st-hair-strong); }
  .pm-pill:disabled { opacity: 0.4; cursor: default; }

  .pm-pill-face {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
  }
  .pm-pill-icon { display: flex; flex: none; color: var(--st-accent); }
  .pm-pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pm-pill-dim { color: var(--st-text-3); }

  .pm-caret {
    flex: none;
    width: 0; height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-top: 4px solid currentColor;
    opacity: 0.7;
  }

  .pm-stage-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 8px 8px;
  }
  .pm-stage-item {
    min-height: 44px;
    padding: 0 12px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .pm-stage-item.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }


  /*
     One column of groups, each a grid of three. The heading is what turns
     fifteen buttons into four things to choose between — the same job the
     vertical rules do between the desktop ribbon's groups.
  */
</style>
