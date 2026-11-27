<script lang="ts">
  /** Each load of the model: how big it is and where it is (along its member, or on which node). */
  import { modelStore } from '../../lib/store';
  import { whatIf } from '../../lib/store/whatif.svelte';
  import { loadLabel } from '../../lib/whatif/load-label';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import { t } from '../../lib/i18n';
  import WifSlider from './WifSlider.svelte';
  import WifPlace from './WifPlace.svelte';
  import type { Load } from '../../lib/store/model.svelte';

  const base = $derived((whatIf.baseline?.loads ?? []) as unknown as Load[]);
  const nodeIds = $derived((whatIf.baseline?.nodes ?? []).map(([id]) => id).sort((a, b) => a - b));
  const entry = $derived(new Map(whatIf.baseline?.elements ?? []));
  const length = (v: number) => `${fmtQ(v, 'length')} ${unitQ('length')}`;

  /* The member as it was on entry (a cut the session made does not shorten it), between its nodes as they stand now. */
  function memberLength(elementId: number): number {
    const el = entry.get(elementId);
    const a = el && modelStore.nodes.get(el.nodeI), b = el && modelStore.nodes.get(el.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  }
</script>

{#if !base.length}<p class="wif-empty">{t('whatif.noLoads')}</p>{/if}
{#each whatIf.loadFactors as factor, i (i)}
  {@const l = base[i]}
  {@const onMember = l && (l.type === 'pointOnElement' || l.type === 'pointOnElement3d') ? (l.data as { elementId: number; a: number }) : null}
  {@const onNode = l && (l.type === 'nodal' || l.type === 'nodal3d') ? (l.data as { nodeId: number }) : null}
  {@const station = onMember ? whatIf.pointStation(i, onMember.a, onMember.elementId, memberLength(onMember.elementId)) : null}
  {@const moved = i in whatIf.loadAt || i in whatIf.loadNode || i in whatIf.loadAlong || (onMember && onMember.a !== station)}
  <div class="wif-item" class:changed={factor !== 1 || moved} data-testid="whatif-load-{i}">
    <div class="wif-item-title" title={loadLabel(l, i)}>{loadLabel(l, i)}</div>
    <WifSlider label={t('whatif.factor')} min={0} max={3} step={0.05} value={factor} changed={factor !== 1}
      format={(v) => `${v.toFixed(2)}×`} oninput={(v) => whatIf.setLoadFactor(i, v)} />
    {#if onMember}
      {@const span = memberLength(onMember.elementId)}
      {#if span > 0}
        <WifSlider label={t('whatif.position')} min={0} max={span} step={span / 200} value={station ?? onMember.a}
          changed={station !== onMember.a} format={length} oninput={(v) => whatIf.setLoadAt(i, v)} testid="whatif-load-at-{i}" />
      {/if}
    {:else if onNode}
      <WifPlace nodeId={whatIf.loadNode[i] ?? onNode.nodeId} along={whatIf.loadAlong[i]} nodes={nodeIds}
        onNode={(id) => whatIf.setLoadNode(i, id)} onAlong={(el, at) => whatIf.setLoadAlong(i, el, at)} testid="whatif-load-node-{i}" />
    {/if}
  </div>
{/each}
