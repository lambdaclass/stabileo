<script lang="ts">
  /** Each load of the model: how big it is and where it is (along its member, or on which node). */
  import { modelStore } from '../../lib/store';
  import { whatIf } from '../../lib/store/whatif.svelte';
  import { loadLabel } from '../../lib/whatif/load-label';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import { t } from '../../lib/i18n';
  import WifSlider from './WifSlider.svelte';
  import type { Load } from '../../lib/store/model.svelte';

  const base = $derived((whatIf.baseline?.loads ?? []) as unknown as Load[]);
  const nodeIds = $derived([...modelStore.nodes.keys()].sort((a, b) => a - b));
  const length = (v: number) => `${fmtQ(v, 'length')} ${unitQ('length')}`;

  function memberLength(elementId: number): number {
    const el = modelStore.elements.get(elementId);
    const a = el && modelStore.nodes.get(el.nodeI), b = el && modelStore.nodes.get(el.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  }
</script>

{#if !base.length}<p class="wif-empty">{t('whatif.noLoads')}</p>{/if}
{#each whatIf.loadFactors as factor, i (i)}
  {@const l = base[i]}
  {@const onMember = l && (l.type === 'pointOnElement' || l.type === 'pointOnElement3d') ? (l.data as { elementId: number; a: number }) : null}
  {@const onNode = l && (l.type === 'nodal' || l.type === 'nodal3d') ? (l.data as { nodeId: number }) : null}
  {@const moved = i in whatIf.loadAt || i in whatIf.loadNode}
  <div class="wif-item" class:changed={factor !== 1 || moved} data-testid="whatif-load-{i}">
    <div class="wif-item-title" title={loadLabel(l, i)}>{loadLabel(l, i)}</div>
    <WifSlider label={t('whatif.factor')} min={0} max={3} step={0.05} value={factor} changed={factor !== 1}
      format={(v) => `${v.toFixed(2)}×`} oninput={(v) => whatIf.setLoadFactor(i, v)} />
    {#if onMember}
      {@const span = memberLength(onMember.elementId)}
      {#if span > 0}
        <WifSlider label={t('whatif.position')} min={0} max={span} step={span / 200} value={Math.min(whatIf.loadAt[i] ?? onMember.a, span)}
          changed={i in whatIf.loadAt} format={length} oninput={(v) => whatIf.setLoadAt(i, v)} testid="whatif-load-at-{i}" />
      {/if}
    {:else if onNode}
      <label class="wif-row">
        <span class="wif-label">{t('whatif.atNode')}</span>
        <select class="wif-select" value={whatIf.loadNode[i] ?? onNode.nodeId}
          onchange={(e) => whatIf.setLoadNode(i, Number(e.currentTarget.value))} data-testid="whatif-load-node-{i}">
          {#each nodeIds as id (id)}<option value={id}>{t('whatif.node').replace('{n}', String(id))}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
{/each}
