<script lang="ts">
  /**
   * Moving the geometry: each node by an offset along the axes the reader sees, which moves every
   * member that meets it. A node picked on the canvas opens here, and a model of more than a few
   * dozen nodes lists only the picked and the moved ones.
   */
  import { uiStore, modelStore } from '../../lib/store';
  import { whatIf } from '../../lib/store/whatif.svelte';
  import { coordLabels } from '../../lib/axes/display';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import { t } from '../../lib/i18n';
  import WifSlider from './WifSlider.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);
  const labels = $derived(coordLabels(is3D));
  const MANY = 30;
  const base = $derived((whatIf.baseline?.nodes ?? []).map(([, n]) => n).sort((a, b) => a.id - b.id));
  const selected = $derived(new Set([...uiStore.selectedNodes].filter((id) => modelStore.nodes.has(id))));
  const moved = (id: number) => (whatIf.nodeShift[id] ?? []).some((v) => v !== 0);
  const listed = $derived(base.length <= MANY ? base : base.filter((n) => selected.has(n.id) || moved(n.id)));

  /* Half the model's size each way, and at least a metre, so a small frame still has room to move. */
  const reach = $derived.by(() => {
    if (!base.length) return 1;
    const span = (k: 'x' | 'y' | 'z') => Math.max(...base.map((n) => n[k] ?? 0)) - Math.min(...base.map((n) => n[k] ?? 0));
    return Math.max(1, 0.5 * Math.max(span('x'), span('y'), span('z')));
  });
  const length = (v: number) => `${v > 0 ? '+' : ''}${fmtQ(v, 'length')} ${unitQ('length')}`;

  let expanded = $state<Set<number>>(new Set());
  $effect(() => {
    const s = selected;
    if (s.size === 0 || s.size > 4) return;
    const next = new Set(expanded);
    for (const id of s) next.add(id);
    if (next.size !== expanded.size) expanded = next;
  });
  function toggle(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    expanded = next;
  }
</script>

<div class="wif-tools"><span class="wif-hint">{t('whatif.pickNode')}</span></div>
{#if base.length > MANY}
  <p class="wif-hint">{t('whatif.manyNodes').replace('{n}', String(base.length))}</p>
{/if}
{#each listed as n (n.id)}
  {@const open = expanded.has(n.id)}
  <div class="wif-item" class:changed={moved(n.id)} class:picked={selected.has(n.id)} data-testid="whatif-node-{n.id}">
    <button type="button" class="wif-item-head" onclick={() => toggle(n.id)} aria-expanded={open}>
      <span class="wif-caret" aria-hidden="true">›</span>
      {t('whatif.node').replace('{n}', String(n.id))}
    </button>
    {#if open}
      {#each labels as axis, k (axis)}
        {@const d = whatIf.nodeShift[n.id]?.[k] ?? 0}
        <WifSlider label={`Δ${axis}`} min={-reach} max={reach} step={reach / 100} value={d} changed={d !== 0}
          format={length} oninput={(v) => whatIf.setNodeShift(n.id, k, v)} testid="whatif-node-{n.id}-{k}" />
      {/each}
    {/if}
  </div>
{/each}
