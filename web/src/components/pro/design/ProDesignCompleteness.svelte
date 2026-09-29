<script lang="ts">
  /**
   * Whether the design has every combination it should.
   *
   * A combination solved with P-Delta that finds no second-order equilibrium publishes no forces,
   * and every design path (concrete, steel, other codes, the optimiser) reads the combinations that
   * have forces. Without a word here, a member could read "passes" on the combinations that were
   * left; the solve's toast was the only trace, and it goes. `missing` lets a panel whose forces
   * come from elsewhere (the direct analysis) name its own.
   */
  import { modelStore } from '../../../lib/store';
  import { unstableCombinations } from '../../../lib/store/active-results';
  import { t } from '../../../lib/i18n';

  let { missing }: { missing?: readonly number[] } = $props();
  const ids = $derived(missing ?? unstableCombinations());
  const names = $derived.by(() => {
    const byId = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));
    return ids.map((id) => byId.get(id) ?? `#${id}`);
  });
</script>

{#if names.length}
  <div class="dc" role="status" data-testid="design-incomplete">
    <strong>{t('design.incomplete.title')}</strong>
    <span>{t('design.incomplete.body').replace('{names}', names.join(', '))}</span>
  </div>
{/if}

<style>
  .dc { margin: 6px 10px; padding: 6px 8px; border: 1px solid var(--st-danger); border-radius: 4px; font-size: 0.66rem; color: var(--st-text-2); display: flex; flex-direction: column; gap: 2px; }
  .dc strong { color: var(--st-danger); font-size: 0.68rem; }
</style>
