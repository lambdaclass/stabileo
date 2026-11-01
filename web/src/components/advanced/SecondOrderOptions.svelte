<script lang="ts">
  import { t } from '../../lib/i18n';
  import { secondOrderSettings } from '../../lib/store/second-order.svelte';
  import { ELEMENT_COUNTS, MAX_MODES, type SoMethod } from '../../lib/engine/second-order/settings';
  import AdvChips from './kit/AdvChips.svelte';

  const K = 'course.second-order.opts';
  const METHODS: SoMethod[] = ['consistent', 'string', 'phi'];

  let { kind, onchange }: { kind: 'pdelta' | 'buckling'; onchange?: () => void } = $props();
  const s = $derived(secondOrderSettings.value);

  function apply(patch: Parameters<typeof secondOrderSettings.set>[0]) {
    secondOrderSettings.set(patch);
    onchange?.();
  }
</script>

<div class="so" data-testid="so-options">
  <AdvChips label={t(`${K}.method`)} value={s.method} testid="so-method" help={t(`${K}.help.method`)}
    chips={METHODS.map((m) => ({ id: m, label: t(`${K}.short.${m}`), title: t(`${K}.method.${m}`) }))}
    onchange={(m) => apply({ method: m as SoMethod })} />
  <AdvChips label={t(`${K}.n`)} value={String(s.n)} testid="so-n" help={t(`${K}.help.n`)}
    chips={ELEMENT_COUNTS.map((n) => ({ id: String(n), label: String(n) }))}
    onchange={(n) => apply({ n: Number(n) })} />
  <AdvChips label={t(`${K}.axial`)} value={s.axialRigid ? 'rigid' : 'elastic'} testid="so-axial" help={t(`${K}.help.axial`)}
    chips={[{ id: 'elastic', label: t(`${K}.short.elastic`), title: t(`${K}.axial.elastic`) }, { id: 'rigid', label: t(`${K}.short.rigid`), title: t(`${K}.axial.rigid`) }]}
    onchange={(v) => apply({ axialRigid: v === 'rigid' })} />
  {#if kind === 'buckling'}
    <div class="so-modes">
      <label class="so-label" for="so-modes">{t(`${K}.modes`)}</label>
      <input id="so-modes" class="so-num" type="number" min="1" max={MAX_MODES} step="1" value={s.modes} data-testid="so-modes"
        onchange={(e) => apply({ modes: Number((e.currentTarget as HTMLInputElement).value) })} />
      <span class="so-help" title={t(`${K}.help.modes`)}>?</span>
    </div>
  {/if}
  {#if s.n === 1 && s.method !== 'phi'}<p class="so-warn" data-testid="so-n1-warning">{t(`${K}.n1Warn`)}</p>{/if}
  <p class="so-engine">{t(s.method === 'consistent' && !s.axialRigid ? `${K}.byEngine` : `${K}.byTeaching`)}</p>
</div>

<style>
  .so { display: flex; flex-direction: column; gap: 1px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid rgba(26, 74, 122, 0.4); }
  .so-modes { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .so-label { font-size: 0.65rem; color: var(--st-text-3); min-width: 52px; }
  .so-num { width: 44px; height: 18px; padding: 0 4px; font-size: 0.65rem; color: var(--st-text); background: rgba(19, 33, 45, 0.8); border: 1px solid var(--st-surface-3); border-radius: 3px; }
  .so-help { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; margin-left: auto; border-radius: 50%; background: rgba(127, 212, 204, 0.12); color: var(--st-value); font-size: 0.5rem; font-weight: 700; cursor: help; border: 1px solid rgba(127, 212, 204, 0.25); opacity: 0.6; }
  .so-warn { margin: 2px 0 0; font-size: 0.62rem; line-height: 1.4; color: var(--st-warning, #e0a030); }
  .so-engine { margin: 2px 0 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
