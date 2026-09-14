<script lang="ts">
  /**
   * The phone panel's command grid, by group.
   *
   * The other half of the shell extracted from `ProPanel.svelte`. It renders INSIDE
   * `.pro-content` so it scrolls away with the numbers — the grid used to sit up with the head,
   * which held 256 px of the panel permanently on the stage where the content matters most.
   *
   * Presentational only, and it shares `PhoneShell` with `ProPhoneNav`: the pills up there
   * decide what this shows, which is why the state is in neither component.
   */
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import Icon from '../ribbon/Icon.svelte';
  import type { PhoneShell } from '../../lib/pro/phone-shell.svelte';

  const { shell }: { shell: PhoneShell } = $props();
</script>

    {#if uiStore.isMobile}
        {#if shell.gridOpen}
        <div class="pm-groups" data-stage={shell.stage?.id} data-testid="pm-grid">
          <!--
          Project first, on its own, above the stage's groups. Reached from the
          same pill as everything else the panel can show, because from the
          reader's side it is one question — what am I looking at.
        -->
        <section class="pm-group">
          <h4 class="pm-group-title">{t('proProject.documentSection')}</h4>
          <div class="pm-grid">
            <button
              class="pm-cell"
              class:active={shell.onProject}
              data-testid="pm-cmd-project"
              onclick={() => shell.openProject()}
              title={t('ribbon.project')}
            >
              <span class="pm-cell-icon"><Icon name="project" size={20} /></span>
              <span class="pm-cell-label">{t('ribbon.project')}</span>
            </button>
          </div>
        </section>
        {#each shell.groups as g (g.id)}
            <section class="pm-group">
                <h4 class="pm-group-title">{t(g.labelKey)}</h4>
                <div class="pm-grid">
                  {#each g.cmds as c (c.id)}
                    {@const on = !c.enabled || c.enabled()}
                    <button
                        class="pm-cell"
                        class:active={shell.isActive(c)}
                        disabled={!on}
                        data-testid="pm-cmd-{c.id}"
                        onclick={() => shell.run(c)}
                        title={c.label ? `${t(c.labelKey)} (${c.label})` : t(c.labelKey)}
                    >
                        <!--
                          The icon is always drawn, and the SHORT name goes under it.
                          Before, a diagram cell showed its symbol where the icon goes
                          and the full name underneath — "Momento flector respecto a
                          y" ellipsised to "Momento flector respect…" in a 116 px
                          cell, which is a truncation pretending to be a label. The
                          symbol IS the short name for those; the full one is in the
                          tooltip, exactly as the desktop ribbon does it.
                        -->
                        <span class="pm-cell-icon">
                          <Icon name={c.icon ?? 'data'} size={20} rotate={c.rotate ?? 0} />
                        </span>
                        <span class="pm-cell-label" class:symbol={!!c.label}>{c.label ?? t(c.labelKey)}</span>
                    </button>
                  {/each}
                </div>
            </section>
          {/each}
        </div>
        {/if}
    {/if}

<style>
  .pm-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }


  .pm-group-title {
    margin: 0 0 3px;
    font-family: var(--st-mono);
    font-size: 0.58rem;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  /*
     The count per row follows the screen instead of being three.
     ───────────────────────────────────────────────────────────
     `auto-fill` with a 76 px floor: four across at 375, five at 430, more on a
     tablet — and the cells stay near-square rather than stretching into
     letterboxes as the screen grows, which is what a fixed three columns did.
  */
  .pm-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 4px;
  }

  .pm-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    /* Near-square: the icon needs the height as much as the word needs width. */
    min-height: 62px;
    padding: 4px 2px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    overflow: hidden;
  }

  .pm-cell-icon { display: flex; color: var(--st-text); line-height: 1; }

  /* N, My, Vz are notation, so the label takes the mono face when it is one. */
  .pm-cell-label.symbol {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .pm-cell-label {
    font-size: 0.56rem;
    line-height: 1.15;
    text-align: center;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-cell.active {
    background: var(--st-selected-bg);
    border-color: var(--st-accent);
    color: var(--st-text);
  }
  .pm-cell.active .pm-cell-icon { color: var(--st-accent); }

  /* Greyed, never removed — the same rule the ribbon follows. */
  .pm-cell:disabled { opacity: 0.34; cursor: default; }


</style>
