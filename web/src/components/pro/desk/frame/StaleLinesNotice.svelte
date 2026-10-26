<!--
  Saved beam lines that no longer stand for their members (`beam-line-store.ts` `staleLines`):
  not applied, so the detailing and the frame editor read the members instead, and shown, so a
  person decides. A line whose members were redesigned can be taken up again as a draft (checked
  before it is saved); a line whose lengths moved can only be let go, because positions along the
  old line are not rescaled to fit the new one.

  `one`: the notice for the line open in the frame editor, with its actions. Without it: every
  stale line, each with a way to open it.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { discardLine, staleLines, type StaleLine } from '../../../../lib/store/beam-line-store';
  import { deskUi } from '../../../../lib/store/design-desk-ui.svelte';

  let { one, onTakeUp }: { one?: StaleLine; onTakeUp?: (s: StaleLine) => void } = $props();

  const all = $derived.by(() => { void modelStore.designDecisions; void modelStore.elements; return one ? [one] : staleLines(); });
  const fmt = (v?: number) => (v === undefined ? '—' : v.toFixed(2));
  const open = (s: StaleLine) => { deskUi.tab = 'frame'; deskUi.selected = s.members[0]!; };
</script>

{#if all.length}
  <div class="stale" role="status" data-testid={one ? 'frame-stale' : 'stale-lines'}>
    {#if !one}<p class="lead">{tp('frameEd.stale.count', { n: all.length })}</p>{/if}
    {#each all as s (s.key)}
      <div class="row" data-testid={`stale-line-${s.key}`} data-reason={s.reason}>
        <p>
          <strong>{s.label}</strong> ·
          {#if s.reason === 'redesigned'}
            {tp('frameEd.stale.redesigned', { ids: s.changed.map((c) => `#${c.id}`).join(', ') })}
          {:else}
            {tp('frameEd.stale.geometry', { list: s.changed.map((c) => `#${c.id} ${fmt(c.was)} → ${fmt(c.now)} m`).join('; ') })}
          {/if}
        </p>
        <div class="acts">
          {#if one && s.reason === 'redesigned' && onTakeUp}
            <button onclick={() => onTakeUp(s)} data-testid="frame-stale-take-up">{t('frameEd.stale.takeUp')}</button>
          {/if}
          {#if !one}<button onclick={() => open(s)} data-testid={`stale-line-open-${s.key}`}>{t('frameEd.stale.open')}</button>{/if}
          <button onclick={() => discardLine(s.key)} data-testid={one ? 'frame-stale-discard' : `stale-line-discard-${s.key}`}>{t('frameEd.stale.discard')}</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .stale { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-warn, var(--st-hair-strong)); border-radius: 4px; background: var(--st-surface-2, var(--st-surface)); }
  .lead, .row p { margin: 0; font-size: 0.7rem; color: var(--st-text); line-height: 1.35; }
  .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
  .acts { display: flex; gap: 4px; }
  .acts button { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
</style>
