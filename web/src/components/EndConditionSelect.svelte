<script lang="ts">
  /**
   * One member end's condition — free, hinge, slide, hinge + slide — and, for
   * a slide, the axis it is measured against. The same control in the element
   * editor, the Explore panel and the members table; see `end-condition.ts`.
   */
  import { t } from '../lib/i18n';
  import type { Release, SlideAxisMode } from '../lib/store/model.svelte';
  import { END_KIND_LABEL, endKindOf, kindHasSlide, offeredKinds, releaseWithKind, type EndKind } from '../lib/store/end-condition';

  let {
    release,
    is3D,
    onchange,
    compact = false,
    testid = undefined,
    axisTestid = undefined,
  }: {
    release: Release | undefined;
    is3D: boolean;
    onchange: (next: Release) => void;
    compact?: boolean;
    testid?: string;
    axisTestid?: string;
  } = $props();

  const kind = $derived(endKindOf(release, is3D));
  const axis = $derived<SlideAxisMode>(release?.slideAxis ?? 'global');
  const kinds = $derived(offeredKinds(kind, is3D));

  function pick(k: EndKind) { onchange(releaseWithKind(release, k, axis, is3D)); }
  function pickAxis(a: SlideAxisMode) { onchange(releaseWithKind(release, kind, a, is3D)); }
</script>

<span class="ec" class:compact>
  <select value={kind} onchange={(e) => pick(e.currentTarget.value as EndKind)} data-testid={testid}>
    {#each kinds as k (k)}
      <option value={k}>{t(END_KIND_LABEL[k])}</option>
    {/each}
  </select>
  {#if kindHasSlide(kind)}
    <!-- Only a slide has an axis to be measured against. -->
    <select value={axis} onchange={(e) => pickAxis(e.currentTarget.value as SlideAxisMode)}
      title={t('float.jointAxis')} data-testid={axisTestid ?? (testid ? `${testid}-axis` : undefined)}>
      <option value="global">{t('float.jointAxisGlobal')}</option>
      <option value="local">{t('float.jointAxisLocal')}</option>
    </select>
  {/if}
</span>

<style>
  .ec { display: inline-flex; gap: 0.25rem; min-width: 0; flex: 1; }
  select {
    min-width: 0;
    flex: 1;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.7rem;
  }
  select:focus { outline: none; border-color: var(--st-accent); }
  .compact select { padding: 0.1rem 0.2rem; font-size: 0.64rem; }
  .compact select + select { flex: 0 0 auto; }
</style>
