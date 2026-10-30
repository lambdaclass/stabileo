<script lang="ts">
  /**
   * A number of the Dynamic panel's forms: shown in the unit it is read in
   * (`scale` times the stored SI value), refused next to the field when it is
   * not a number in range, set when it is.
   */
  let { label, value, scale = 1, min = -Infinity, max = Infinity, step = 'any', testid, onSet }: {
    label: string; value: number; scale?: number; min?: number; max?: number; step?: number | 'any'; testid?: string; onSet: (v: number) => void;
  } = $props();

  let bad = $state(false);
  const shown = $derived(+(value * scale).toPrecision(6));

  function commit(raw: string) {
    const v = Number(raw.replace(',', '.'));
    bad = raw.trim() === '' || !Number.isFinite(v) || v < min || v > max;
    if (!bad) onSet(v / scale);
  }
</script>

<label class="cf-field">
  <span>{label}</span>
  <input type="number" inputmode="decimal" {step} value={shown} class:bad aria-invalid={bad}
    onchange={(e) => commit(e.currentTarget.value)} data-testid={testid} />
</label>
