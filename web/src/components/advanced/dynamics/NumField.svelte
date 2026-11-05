<script lang="ts">
  /**
   * A number of the Dynamic panel's forms: shown in the unit it is read in
   * (`scale` times the stored SI value), set when it is a number in range; otherwise
   * the field goes back to the value in use and is marked.
   */
  import { numEntry } from './num-entry';

  let { label, value, scale = 1, min = -Infinity, max = Infinity, step = 'any', testid, onSet }: {
    label: string; value: number; scale?: number; min?: number; max?: number; step?: number | 'any'; testid?: string; onSet: (v: number) => void;
  } = $props();

  let bad = $state(false);
  const shown = $derived(+(value * scale).toPrecision(6));

  function commit(field: HTMLInputElement) {
    const v = numEntry(field, shown, min, max);
    bad = v === null;
    if (v !== null) onSet(v / scale);
  }
</script>

<label class="cf-field">
  <span>{label}</span>
  <input type="number" inputmode="decimal" {step} value={shown} class:bad aria-invalid={bad}
    oninput={() => (bad = false)} onchange={(e) => commit(e.currentTarget)} data-testid={testid} />
</label>
