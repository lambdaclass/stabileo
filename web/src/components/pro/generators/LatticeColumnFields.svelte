<script lang="ts">
  /**
   * The parameters of a latticed column, the one set of fields for the column generator and for
   * the columns of a shed. Height and base fixity are the column generator's own; a shed takes
   * them from its clear height and its own base switch.
   */
  import { t } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import { LACING_PATTERNS, type LatticeColumnParams } from '../../../lib/engine/generators/lattice-column';

  interface Props {
    p: LatticeColumnParams | Pick<LatticeColumnParams, 'widthM' | 'divisions' | 'lacing' | 'fixedBase'>;
    /** The column generator on its own: its height and its base. */
    standalone?: boolean;
  }
  let { p = $bindable(), standalone = false }: Props = $props();
  const full = $derived(p as LatticeColumnParams);
</script>

{#snippet fieldHead(key: string)}
  <span class="fname">{t(`generator.ui.${key}`)}</span>
  <span class="fhint" id={`gen-hint-${key}`}>{t(`generator.hint.${key}`)}</span>
{/snippet}

{#if standalone}
  <label>{@render fieldHead('height')}<QuantityInput quantity="length" bind:value={full.heightM} describedBy="gen-hint-height" /></label>
{/if}
<label>{@render fieldHead('width')}<QuantityInput quantity="length" bind:value={p.widthM} describedBy="gen-hint-width" /></label>
<label>{@render fieldHead('divisions')}<input type="number" min="1" step="1" bind:value={p.divisions} aria-describedby="gen-hint-divisions" /></label>
<label><span>{t('generator.ui.lacing')}</span>
  <select bind:value={p.lacing} data-testid="gen-lacing">
    {#each LACING_PATTERNS as l (l)}<option value={l}>{t(`generator.lacing.${l}`)}</option>{/each}
  </select></label>
{#if standalone}
  <label class="check"><input type="checkbox" bind:checked={p.fixedBase} /><span>{t('generator.ui.fixedBase')}</span></label>
{/if}
