<script module lang="ts">
  import { designData } from '../../../lib/store/design-data';
  import type { PropertyLines } from '../../../lib/model/foundation/edges';

  export function savedLines(): PropertyLines {
    return designData().propertyLines ?? {};
  }
</script>

<script lang="ts">
  /** The sides of the building that are property lines, as the design data holds them: the foundation tools and the sheets read the same option. */
  import { t } from '../../../lib/i18n';
  import { patchDesignData } from '../../../lib/store/design-data';
  import { PROPERTY_SIDES, type PropertySide } from '../../../lib/model/foundation/edges';

  let { testid = 'property-line' }: { testid?: string } = $props();
  const LABEL: Record<PropertySide, string> = { minX: '−X', maxX: '+X', minY: '−Y', maxY: '+Y' };
  const lines = $derived(savedLines());
  function toggle(k: PropertySide) {
    const on = PROPERTY_SIDES.filter((s) => (s === k ? !lines[s] : lines[s]));
    patchDesignData({ propertyLines: on.length ? Object.fromEntries(on.map((s) => [s, true])) : undefined });
  }
</script>

<span class="plp" role="group" aria-label={t('fdn.propertyLines')}>
  {#each PROPERTY_SIDES as k (k)}
    <label><input type="checkbox" checked={!!lines[k]} onchange={() => toggle(k)} data-testid="{testid}-{k}" /> {LABEL[k]}</label>
  {/each}
</span>

<style>
  .plp { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
  label { display: inline-flex; align-items: center; gap: 3px; }
</style>
