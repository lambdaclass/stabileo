<script lang="ts">
  /** A value in scientific notation, "1.6 × 10⁻¹²", with the exponent as real markup. */
  import { sci } from './format';
  let { value, sig = 2, unit = '' }: { value: number; sig?: number; unit?: string } = $props();
  const p = $derived(sci(value, sig));
</script>

<span class="sci">{p.mantissa}{#if p.exp}&#8202;×&#8202;10<sup>{p.exp}</sup>{/if}{#if unit}&#8239;{unit}{/if}</span>

<style>
  .sci {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
