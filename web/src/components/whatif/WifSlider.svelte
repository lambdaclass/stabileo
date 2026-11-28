<script lang="ts">
  /** One "What if?" control: a name, a slider and its value, which turns bright once it moved off the original. */
  let { label, min, max, step, value, format, changed = false, oninput, testid }: {
    label: string; min: number; max: number; step: number; value: number;
    format: (v: number) => string; changed?: boolean; oninput: (v: number) => void | false; testid?: string;
  } = $props();
</script>

<label class="wif-row">
  <span class="wif-label" title={label}>{label}</span>
  <input type="range" class="wif-range" {min} {max} {step} {value} aria-label={label}
    oninput={(e) => { if (oninput(Number(e.currentTarget.value)) === false) e.currentTarget.value = String(value); }} data-testid={testid} />
  <span class="wif-val" class:changed>{format(value)}</span>
</label>
