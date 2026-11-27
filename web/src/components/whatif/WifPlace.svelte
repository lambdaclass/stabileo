<script lang="ts">
  /** Where a nodal load or a support stands: on a node, or anywhere along a member with a slider. */
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
  let picked = $state<number | null>(null);
  const member = $derived(picked ?? along?.elementId);
  const value = $derived(along ? 'm:' + along.elementId : 'n:' + nodeId);
  function pick(select: HTMLSelectElement) {
    const kind = select.value[0];
    const id = Number(select.value.slice(2));
    picked = kind === 'n' ? null : id;
    if (kind === 'n') onNode(id);
    else onAlong(id, 0.5);
    select.value = along ? 'm:' + along.elementId : 'n:' + nodeId;
  }
  const length = (v: number) => `${fmtQ(v, 'length')} ${unitQ('length')}`;
</script>

<label class="wif-row">
  <span class="wif-label">{t('whatif.atPlace')}</span>
  <select class="wif-select" {value} onchange={(e) => pick(e.currentTarget)} data-testid={testid}>
    <optgroup label={t('whatif.nodes')}>
      {#each nodes as id (id)}<option value="n:{id}">{t('whatif.node').replace('{n}', String(id))}</option>{/each}
    </optgroup>
    <optgroup label={t('whatif.elements')}>
      {#each members as id (id)}<option value="m:{id}">{t('whatif.member').replace('{n}', String(id))}</option>{/each}
    </optgroup>
  </select>
</label>
{#if member !== undefined}
  {@const span = whatIf.memberLength(member)}
  {#if span > 0}
    {#if member !== along?.elementId}
      <button type="button" onclick={() => onAlong(member, 0.5)}>{t('pro.apply')} ({length(span / 2)})</button>
    {/if}
    <WifSlider label={t('whatif.alongMember')} min={0} max={span} step={span / 200} value={(along?.elementId === member ? along.t : 0.5) * span} changed={along?.elementId === member}
      format={length} oninput={(v) => {
        const el = entry.get(member)!;
        if (v === 0 || v === span) {
          const endpoint = v === 0 ? el.nodeI : el.nodeJ;
          if (!nodes.includes(endpoint)) return false;
          onNode(endpoint);
          picked = null;
        } else onAlong(member, v / span);
      }} testid="{testid}-along" />
  {/if}
{/if}
