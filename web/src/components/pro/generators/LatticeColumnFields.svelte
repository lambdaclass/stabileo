<script lang="ts">
  /**
   * The parameters of a latticed column, the one set of fields for the column generator and for
   * the columns of a shed. Height and base fixity are the column generator's own; a shed takes
   * them from its clear height and its own base switch.
   */
  import { t } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import GenRow from './GenRow.svelte';
  import { LACING_PATTERNS, type LatticeColumnParams } from '../../../lib/engine/generators/lattice-column';

  interface Props {
    p: LatticeColumnParams | Pick<LatticeColumnParams, 'widthM' | 'divisions' | 'lacing' | 'fixedBase'>;
    /** The column generator on its own: its height and its base. */
    standalone?: boolean;
  }
  let { p = $bindable(), standalone = false }: Props = $props();
  const full = $derived(p as LatticeColumnParams);
  const hint = (key: string) => ({ hint: t(`generator.hint.${key}`), hintId: `gen-hint-${key}` });
</script>

{#if standalone}
  <GenRow name={t('generator.ui.height')} {...hint('height')}><QuantityInput quantity="length" bind:value={full.heightM} describedBy="gen-hint-height" /></GenRow>
{/if}
<GenRow name={t('generator.ui.width')} {...hint('width')}><QuantityInput quantity="length" bind:value={p.widthM} describedBy="gen-hint-width" /></GenRow>
<GenRow name={t('generator.ui.divisions')} {...hint('divisions')}><input type="number" min="1" step="1" bind:value={p.divisions} aria-describedby="gen-hint-divisions" /></GenRow>
<GenRow name={t('generator.ui.lacing')}>
  <select bind:value={p.lacing} data-testid="gen-lacing">
    {#each LACING_PATTERNS as l (l)}<option value={l}>{t(`generator.lacing.${l}`)}</option>{/each}
  </select>
</GenRow>
{#if standalone}
  <GenRow name={t('generator.ui.fixedBase')} check><input type="checkbox" bind:checked={p.fixedBase} /></GenRow>
{/if}
