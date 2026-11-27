<script lang="ts">
  /**
   * The members' stiffness, all at once or one by one, and how each end is connected. A member
   * picked on the canvas opens here; past a few dozen members only the picked and the changed
   * ones are listed, since a slider stack per member is a wall for a building.
   */
  import { uiStore, modelStore } from '../../lib/store';
  import { whatIf, type MemberFactors } from '../../lib/store/whatif.svelte';
  import { t } from '../../lib/i18n';
  import EndConditionSelect from '../EndConditionSelect.svelte';
  import WifSlider from './WifSlider.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);
  const MANY = 30;
  const elements = $derived((whatIf.baseline?.elements.map(([, member]) => member) ?? [...modelStore.elements.values()]).sort((a, b) => a.id - b.id));
  const selected = $derived(new Set([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id))));
  const listed = $derived(elements.length <= MANY ? elements : elements.filter((e) => selected.has(e.id) || whatIf.isMemberChanged(e.id)));

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

  const showIds = $derived(is3D ? uiStore.showElementLabels3D : uiStore.showElementLabels);
  function setShowIds(v: boolean) {
    if (is3D) uiStore.showElementLabels3D = v; else uiStore.showElementLabels = v;
  }

  function releaseOf(id: number, end: 'i' | 'j') {
    const o = whatIf.releases[id]?.[end];
    if (o) return o;
    const el = elements.find(member => member.id === id);
    return end === 'i' ? el?.releaseI : el?.releaseJ;
  }

  const factors = $derived<Array<{ k: keyof MemberFactors; label: string }>>([
    { k: 'e', label: 'E' }, { k: 'a', label: 'A' }, { k: 'iy', label: is3D ? 'Iy, Iz, J' : 'Iy' },
  ]);
  const times = (v: number) => `${v.toFixed(2)}×`;
</script>

<div class="wif-tools">
  <span class="wif-hint">{t('whatif.pickMember')}</span>
  <label class="wif-ids" title={t('whatif.showIdsHint')}>
    <input type="checkbox" checked={showIds} onchange={(e) => setShowIds(e.currentTarget.checked)} data-testid="whatif-show-ids" />
    {t('whatif.showIds')}
  </label>
</div>

<div class="wif-item">
  <div class="wif-item-title">{t('whatif.allMembers')}</div>
  {#each factors as f (f.k)}
    <WifSlider label={f.label} min={0.1} max={5} step={0.05} value={whatIf.all[f.k]} changed={whatIf.all[f.k] !== 1}
      format={times} oninput={(v) => whatIf.setAll(f.k, v)} />
  {/each}
</div>

{#if elements.length > MANY}
  <p class="wif-hint">{t('whatif.manyMembers').replace('{n}', String(elements.length))}</p>
{/if}
{#each listed as el (el.id)}
  {@const open = expanded.has(el.id)}
  {@const f = whatIf.memberFactors(el.id)}
  <div class="wif-item" class:changed={whatIf.isMemberChanged(el.id)} class:picked={selected.has(el.id)} data-testid="whatif-member-{el.id}">
    <button type="button" class="wif-item-head" onclick={() => toggle(el.id)} aria-expanded={open}>
      <span class="wif-caret" aria-hidden="true">›</span>
      {t('whatif.member').replace('{n}', String(el.id))}
      {#if el.type === 'truss'}<span class="wif-tag">{t('whatif.truss')}</span>{/if}
    </button>
    {#if open}
      {#each factors as fk (fk.k)}
        {#if !(el.type === 'truss' && fk.k === 'iy')}
          <WifSlider label={fk.label} min={0.1} max={5} step={0.05} value={f[fk.k]} changed={f[fk.k] !== 1}
            format={times} oninput={(v) => whatIf.setMember(el.id, fk.k, v)} />
        {/if}
      {/each}
      {#if el.type !== 'truss' || !is3D}
        {#each [{ end: 'i', label: t('whatif.hingeI') }, { end: 'j', label: t('whatif.hingeJ') }] as const as row (row.end)}
          <div class="wif-row">
            <span class="wif-label">{row.label}</span>
            <EndConditionSelect compact release={releaseOf(el.id, row.end)} {is3D}
              onchange={(r) => whatIf.setRelease(el.id, row.end, r)} testid="whatif-end-{el.id}-{row.end}" />
          </div>
        {/each}
      {/if}
    {/if}
  </div>
{/each}
