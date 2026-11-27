<script lang="ts">
  /** Where a nodal load or a support stands: on a node, or anywhere along a member with a slider. */
  import { modelStore } from '../../lib/store';
  import { whatIf, type Along } from '../../lib/store/whatif.svelte';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';
  import { t } from '../../lib/i18n';
  import WifSlider from './WifSlider.svelte';

  let { nodeId, along, nodes, onNode, onAlong, testid }: {
    nodeId: number; along: Along | undefined; nodes: number[];
    onNode: (id: number) => void; onAlong: (elementId: number, t: number) => void; testid: string;
  } = $props();

  /* The members as they were on entry: a cut the session made is not a member to place on. */
  const entry = $derived(new Map(whatIf.baseline?.elements ?? []));
  const members = $derived([...entry.keys()].sort((a, b) => a - b));
  const value = $derived(along ? `m:${along.elementId}` : `n:${nodeId}`);
  function pick(v: string) {
    const [kind, id] = [v.slice(0, 1), Number(v.slice(2))];
    if (kind === 'n') onNode(id); else onAlong(id, 0.5);
  }
  /* The member as it was on entry, between its nodes as they stand now. */
  function lengthOf(id: number): number {
    const el = entry.get(id);
    const a = el && modelStore.nodes.get(el.nodeI), b = el && modelStore.nodes.get(el.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  }
  const length = (v: number) => `${fmtQ(v, 'length')} ${unitQ('length')}`;
</script>

<label class="wif-row">
  <span class="wif-label">{t('whatif.atPlace')}</span>
  <select class="wif-select" {value} onchange={(e) => pick(e.currentTarget.value)} data-testid={testid}>
    <optgroup label={t('whatif.nodes')}>
      {#each nodes as id (id)}<option value="n:{id}">{t('whatif.node').replace('{n}', String(id))}</option>{/each}
    </optgroup>
    <optgroup label={t('whatif.elements')}>
      {#each members as id (id)}<option value="m:{id}">{t('whatif.member').replace('{n}', String(id))}</option>{/each}
    </optgroup>
  </select>
</label>
{#if along}
  {@const span = lengthOf(along.elementId)}
  {#if span > 0}
    <WifSlider label={t('whatif.alongMember')} min={0.02 * span} max={0.98 * span} step={span / 200} value={along.t * span} changed
      format={length} oninput={(v) => onAlong(along.elementId, v / span)} testid="{testid}-along" />
  {/if}
{/if}
