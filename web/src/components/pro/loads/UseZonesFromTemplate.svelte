<script lang="ts">
  /**
   * Zones from a template's closed outlines: the template, the layers holding room outlines,
   * then each outline with the label inside it and the use it suggests (pending until confirmed).
   * The reader picks which to make; they are made at the template's level.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { createUseZone, suggestUse, templateOutlines } from '../../../lib/store/use-zones';
  import { findOccupancy } from '../../../lib/codes/cirsoc101/live-loads';

  let { onclose }: { onclose: () => void } = $props();
  const templates = $derived(modelStore.underlays.filter((u) => u.shapes?.some((s) => s.k === 'p' && s.closed)));
  let uid = $state(modelStore.underlays.find((u) => u.shapes?.some((s) => s.k === 'p' && s.closed))?.id ?? '');
  const u = $derived(templates.find((x) => x.id === uid));
  let layers = $state<string[]>([]);
  $effect(() => { if (u) layers = (u.layers ?? []).filter((_l, i) => u.shapes!.some((s) => s.k === 'p' && s.closed && s.L === i)); });
  const outlines = $derived(u ? templateOutlines(u, layers) : []);
  let chosen = $state<Set<number>>(new Set());
  $effect(() => { chosen = new Set(outlines.map((_, k) => k)); });
  let result = $state<string | null>(null);
  const area = (pts: Array<{ x: number; y: number }>) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]!; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

  function make() {
    if (!u) return;
    let n = 0;
    modelStore.batch(() => {
      outlines.forEach((o, k) => {
        if (!chosen.has(k)) return;
        const use = o.label ? suggestUse(o.label) : undefined;
        if (createUseZone(o.points, u.z, o.label?.trim() || tp('loadZone.defaultName', { n: k + 1 }), use ? { ...use, provenance: 'suggested' } : undefined) >= 0) n++;
      });
    });
    result = tp('useZones.fromTemplateMade', { n });
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="zt-overlay" onclick={onclose} role="presentation">
  <div class="zt" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" aria-label={t('useZones.fromTemplate')} data-testid="zones-from-template-dialog">
    <h3>{t('useZones.fromTemplate')}</h3>
    <label>{t('underlay.title')} <select bind:value={uid}>{#each templates as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
    {#if u}
      <div class="zt-layers">{#each u.layers ?? [] as l (l)}<label><input type="checkbox" checked={layers.includes(l)} onchange={() => (layers = layers.includes(l) ? layers.filter((x) => x !== l) : [...layers, l])} /> {l}</label>{/each}</div>
      <table data-testid="zones-from-template-list">
        <thead><tr><th></th><th>{t('useZones.label')}</th><th>m²</th><th>{t('useZones.suggested')}</th></tr></thead>
        <tbody>
          {#each outlines as o, k (k)}
            {@const s = o.label ? suggestUse(o.label) : undefined}
            <tr>
              <td><input type="checkbox" checked={chosen.has(k)} onchange={() => { const c = new Set(chosen); if (c.has(k)) c.delete(k); else c.add(k); chosen = c; }} /></td>
              <td>{o.label ?? '—'}</td>
              <td>{area(o.points).toFixed(2)}</td>
              <td>{s?.candidates?.length ? s.candidates.map((c) => t(findOccupancy(c)?.labelKey ?? c)).join(' / ') : t('useZones.noSuggestion')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="zt-hint">{t('useZones.fromTemplateHint')}</p>
    {/if}
    {#if result}<p data-testid="zones-from-template-result">{result}</p>{/if}
    <div class="zt-actions">
      <button class="zt-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="zt-btn primary" disabled={!chosen.size} onclick={make} data-testid="zones-from-template-make">{tp('useZones.makeN', { n: chosen.size })}</button>
    </div>
  </div>
</div>

<style>
  .zt-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .zt { width: min(520px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 0.74rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .zt-layers { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; color: var(--st-text-3); font-weight: 500; }
  td, th { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .zt-hint { margin: 0; color: var(--st-text-3); font-size: 0.68rem; }
  .zt-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .zt-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .zt-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .zt-btn:disabled { opacity: 0.5; cursor: default; }
</style>
