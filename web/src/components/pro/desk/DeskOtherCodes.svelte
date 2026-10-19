<script lang="ts">
  /**
   * Sizing › Other code: one place, two modes, each saying what it does and what it keeps.
   *
   * They were two functions under two names in two places: «Check members» in the ribbon (an
   * independent check of the members under AISC 360, EN 1993-1-1, AISI S100, ACI 318 or
   * EN 1992-1-1, from the analysis, kept nowhere) and «Foreign codes» in the desk's specialties
   * (the equivalences of each CIRSOC row and the design under EN 1992 and EN 1993 with the UK
   * annex, kept with the project and carried to the report and the workbook). Same entry now, and
   * the difference is the first thing on screen.
   */
  import ProOtherCodesPanel from '../ProOtherCodesPanel.svelte';
  import ForeignCodesEditor from './codes/ForeignCodesEditor.svelte';
  import { t } from '../../../lib/i18n';
  import { deskUi, type CodesMode } from '../../../lib/store/design-desk-ui.svelte';

  const MODES: CodesMode[] = ['verify', 'memoria'];
</script>

<div class="dc" data-testid="desk-other-codes" data-mode={deskUi.codesMode}>
  <div class="dc-modes" role="radiogroup" aria-label={t('desk.rail.otherCodes')}>
    {#each MODES as m (m)}
      <button class="dc-mode" class:on={deskUi.codesMode === m} role="radio" aria-checked={deskUi.codesMode === m}
        onclick={() => (deskUi.codesMode = m)} data-testid="codes-mode-{m}">
        <strong>{t(`desk.codes.${m}`)}</strong>
        <span>{t(`desk.codes.${m}Desc`)}</span>
        <em data-testid="codes-mode-{m}-keeps">{t(`desk.codes.${m}Keeps`)}</em>
      </button>
    {/each}
  </div>
  {#if deskUi.codesMode === 'verify'}<ProOtherCodesPanel />{:else}<ForeignCodesEditor />{/if}
</div>

<style>
  .dc { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .dc-modes { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px 0; }
  .dc-mode { flex: 1 1 16rem; display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-2); cursor: pointer; font-size: 0.7rem; }
  .dc-mode strong { font-size: 0.76rem; color: var(--st-text); }
  .dc-mode em { font-style: normal; color: var(--st-text-3); }
  .dc-mode.on { border-color: var(--st-accent); background: var(--st-surface-2, var(--st-surface)); }
</style>
