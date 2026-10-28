<script lang="ts">
  /**
   * The zones' live loads as a plan (`model/use-zones.ts planZoneLoads`): what is added, changed
   * and removed, and the zones left unresolved, before anything is written. Manual loads are not
   * part of it and are never touched. Applied as one undo step.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { applyZoneLoadPlan, zoneLoadPlan } from '../../../lib/store/use-zones';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const plan = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return zoneLoadPlan(); });
  const caseName = (id: number) => modelStore.model.loadCases.find((c) => c.id === id)?.name ?? `#${id}`;
  let result = $state<string | null>(null);
  function apply() {
    if (!plan) return;
    const r = applyZoneLoadPlan(plan);
    result = tp('useZones.planApplied', { added: r.added, changed: r.changed, removed: r.removed });
  }
  const dist = (d: string) => t(`useZones.dist.${d}`);
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="zp-overlay" onclick={onclose} role="presentation">
  <div class="zp" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-label={t('useZones.planTitle')} data-testid="use-zones-plan-dialog">
    <h3>{t('useZones.planTitle')}</h3>
    {#if plan}
      <p class="zp-hint">{t('useZones.planHint')}</p>
      {#if plan.add.length}<h4>{tp('useZones.planAdd', { n: plan.add.length })}</h4><ul>{#each plan.add as a (`${a.zoneId}|${a.role}`)}<li>{a.zone} · {t(`useZones.role.${a.role}`)}: {fmtQ(a.q, 'areaLoad')} {unitQ('areaLoad')} · {caseName(a.caseId)} · {dist(a.distribution)}</li>{/each}</ul>{/if}
      {#if plan.change.length}<h4>{tp('useZones.planChange', { n: plan.change.length })}</h4><ul>{#each plan.change as c (`${c.zoneId}|${c.role}`)}<li>{c.zone} · {t(`useZones.role.${c.role}`)}: {fmtQ(c.from.q, 'areaLoad')} → {fmtQ(c.q, 'areaLoad')} {unitQ('areaLoad')}{c.from.distribution !== c.distribution ? ` · ${dist(c.distribution)}` : ''}</li>{/each}</ul>{/if}
      {#if plan.remove.length}<h4>{tp('useZones.planRemove', { n: plan.remove.length })}</h4><ul>{#each plan.remove as r (r.defId)}<li>{r.zone}</li>{/each}</ul>{/if}
      {#if plan.unresolved.length}<h4 class="warn">{tp('useZones.planUnresolved', { n: plan.unresolved.length })}</h4><ul>{#each plan.unresolved as u (u.zoneId)}<li>{u.zone}: {t(`useZones.status.${u.status}`)}</li>{/each}</ul>{/if}
      {#if plan.finishNoCase.length}<h4 class="warn" data-testid="use-zones-plan-no-dead">{tp('useZones.planFinishNoCase', { n: plan.finishNoCase.length })}</h4><ul>{#each plan.finishNoCase as f (f.zoneId)}<li>{f.zone}</li>{/each}</ul>{/if}
      {#if !plan.add.length && !plan.change.length && !plan.remove.length}<p data-testid="use-zones-plan-empty">{t('useZones.planNothing')}</p>{/if}
    {:else}
      <p>{t('useZones.noLiveCase')}</p>
    {/if}
    {#if result}<p class="zp-msg" data-testid="use-zones-plan-result">{result}</p>{/if}
    <div class="zp-actions">
      <button class="zp-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="zp-btn primary" disabled={!plan || (!plan.add.length && !plan.change.length && !plan.remove.length)} onclick={apply} data-testid="use-zones-plan-apply">{t('plates.apply')}</button>
    </div>
  </div>
</div>

<style>
  .zp-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .zp { width: min(480px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  h4 { margin: 4px 0 0; font-size: 0.75rem; color: var(--st-text); }
  h4.warn { color: var(--st-warn, #d9a441); }
  ul { margin: 0; padding-left: 16px; }
  .zp-hint { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .zp-msg { margin: 0; color: var(--st-text); }
  .zp-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .zp-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .zp-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .zp-btn:disabled { opacity: 0.5; cursor: default; }
</style>
