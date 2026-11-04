<script lang="ts">
  /**
   * What the next member drawn is: a plain bar, or a column, beam or brace of a typology, declared
   * as it is drawn (`store/next-member.svelte.ts`). In the drawing bar beside section and material.
   */
  import { t } from '../../../lib/i18n';
  import { TYPOLOGIES } from '../../../lib/model/physical';
  import { nextMember } from '../../../lib/store/next-member.svelte';

  const KINDS = ['column', 'beam', 'brace'] as const;
  const kind = $derived(nextMember.physical?.kind ?? '');
  function setKind(v: string) {
    nextMember.physical = v ? { kind: v as (typeof KINDS)[number], typology: TYPOLOGIES[v]?.[0] } : null;
  }
</script>

<span class="dk" data-testid="drawn-kind">
  <label class="dk-field">
    <span class="dk-name">{t('building.drawnIs')}</span>
    <select value={kind} onchange={(e) => setKind(e.currentTarget.value)} data-testid="drawn-kind-select">
      <option value="">{t('building.plainBar')}</option>
      {#each KINDS as k}<option value={k}>{t(`physical.kind.${k}`)}</option>{/each}
    </select>
  </label>
  {#if nextMember.physical}
    <select value={nextMember.physical.typology ?? ''} aria-label={t('physical.typology')}
      onchange={(e) => (nextMember.physical = { ...nextMember.physical!, typology: e.currentTarget.value || undefined })} data-testid="drawn-kind-typology">
      {#each TYPOLOGIES[nextMember.physical.kind] ?? [] as ty}<option value={ty}>{t(`physical.typ.${ty}`)}</option>{/each}
    </select>
  {/if}
</span>

<style>
  .dk { display: inline-flex; align-items: center; gap: 4px; }
  .dk-field { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .dk-name { color: var(--st-text-3); }
  .dk select {
    padding: 1px 5px; background: var(--st-ink); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit;
  }
</style>
