<script lang="ts">
  /**
   * Specifications › Members: everything a member is told beyond its geometry, section and
   * material, for the members selected. One editor per property, and each write over the whole
   * selection is one undo step; a property whose value differs across the selection reads
   * "mixed" until it is set.
   *
   *   axial behaviour   frame, truss, tension only, compression only, cable, inactive
   *   releases          My, Mz and T of each end, in the member's local axes
   *   local axes        β, the roll about the member's axis
   *   the rest          global joints, semi-rigid ends, stiffness factors, end offsets and the
   *                     design lengths, each in the one component that edits it
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import type { Element, Release } from '../../../lib/store/model.svelte';
  import type { MemberBehaviour } from '../../../lib/engine/member-behaviour';
  import ProMemberBehaviour from '../ProMemberBehaviour.svelte';
  import MemberOffsetEditor from '../../property/MemberOffsetEditor.svelte';
  import ProSteelLbEditor from '../ProSteelLbEditor.svelte';

  const ids = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  const allIds = $derived(new Set(modelStore.elements.keys()));
  const same = <T,>(f: (e: Element) => T): T | undefined => {
    const v = ids.map((id) => f(modelStore.elements.get(id)!));
    return v.length && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : undefined;
  };

  /** The axial behaviour: a member's type and its one-way or cable behaviour, as one choice. */
  type Axial = 'frame' | 'truss' | MemberBehaviour;
  const axialOf = (e: Element): Axial => e.behaviour ?? (e.type === 'truss' ? 'truss' : 'frame');
  const axial = $derived(same(axialOf) ?? 'mixed');
  function setAxial(v: Axial) {
    modelStore.batch(() => {
      for (const id of ids) {
        if (v === 'frame' || v === 'truss') modelStore.updateElement(id, { type: v, behaviour: undefined });
        else modelStore.updateElement(id, { behaviour: v });
      }
    });
  }

  /** Local releases: a released moment carries nothing at that end. */
  const DOFS = ['my', 'mz', 't'] as const;
  const releaseOf = (end: 'i' | 'j', k: (typeof DOFS)[number]) => same((e) => !!(end === 'i' ? e.releaseI : e.releaseJ)?.[k]);
  function setRelease(end: 'i' | 'j', k: (typeof DOFS)[number], on: boolean) {
    modelStore.batch(() => {
      for (const id of ids) {
        const e = modelStore.elements.get(id)!;
        const cur: Release = { my: false, mz: false, t: false, ...(end === 'i' ? e.releaseI : e.releaseJ) };
        cur[k] = on;
        const any = cur.my || cur.mz || cur.t || cur.slide !== undefined;
        modelStore.updateElement(id, end === 'i' ? { releaseI: any ? cur : undefined } : { releaseJ: any ? cur : undefined });
      }
    });
  }

  /** β: the roll about the member's axis, degrees. */
  const roll = $derived(same((e) => e.rollAngle ?? 0));
  const hasReference = $derived(ids.some((id) => modelStore.elements.get(id)?.localYx !== undefined));
  function setRoll(v: number) {
    if (!Number.isFinite(v)) return;
    modelStore.batch(() => { for (const id of ids) modelStore.updateElement(id, { rollAngle: v === 0 ? undefined : v }); });
  }
  function clearReference() {
    modelStore.batch(() => { for (const id of ids) modelStore.updateElement(id, { localYx: undefined, localYy: undefined, localYz: undefined }); });
  }
</script>

{#if ids.length === 0}
  <p class="sm-empty" data-testid="spec-members-empty">{t('spec.members.empty')}</p>
{:else}
  <div class="sm" data-testid="spec-members">
    <div class="sm-title">{tp('spec.members.title', { n: ids.length })}</div>

    <section>
      <h5>{t('spec.members.axial')}</h5>
      <select value={axial} onchange={(e) => setAxial(e.currentTarget.value as Axial)} data-testid="mb-behaviour">
        {#if axial === 'mixed'}<option value="mixed" disabled>{t('behaviour.mixed')}</option>{/if}
        <option value="frame">{t('spec.axial.frame')}</option>
        <option value="truss">{t('spec.axial.truss')}</option>
        <option value="tensionOnly">{t('behaviour.tensionOnly')}</option>
        <option value="compressionOnly">{t('behaviour.compressionOnly')}</option>
        <option value="cable">{t('spec.axial.cable')}</option>
        <option value="inactive">{t('behaviour.inactive')}</option>
      </select>
      {#if axial === 'tensionOnly' || axial === 'compressionOnly'}<p class="sm-hint">{t('behaviour.nonlinearHint')}</p>{/if}
      {#if axial === 'cable'}<p class="sm-hint" data-testid="spec-cable-hint">{t('spec.axial.cableHint')}</p>{/if}
    </section>

    <section>
      <h5>{t('spec.members.releases')}</h5>
      <div class="sm-grid">
        <span></span>{#each DOFS as k (k)}<span class="sm-h">{k === 't' ? 'T' : k === 'my' ? 'My' : 'Mz'}</span>{/each}
        {#each ['i', 'j'] as const as end (end)}
          <span class="sm-h">{end.toUpperCase()}</span>
          {#each DOFS as k (k)}
            {@const v = releaseOf(end, k)}
            <input type="checkbox" checked={!!v} indeterminate={v === undefined}
              onchange={(e) => setRelease(end, k, e.currentTarget.checked)} data-testid="spec-release-{end}-{k}"
              aria-label="{end.toUpperCase()} {k}" />
          {/each}
        {/each}
      </div>
      <p class="sm-hint">{t('spec.members.releasesHint')}</p>
    </section>

    <section>
      <h5>{t('spec.members.localAxes')}</h5>
      <label class="sm-row">β
        <input type="number" step="15" value={roll ?? ''} placeholder={roll === undefined ? t('behaviour.mixed') : ''}
          onchange={(e) => setRoll(Number(e.currentTarget.value))} data-testid="spec-roll" /> °</label>
      {#if hasReference}
        <button class="sm-btn" onclick={clearReference} data-testid="spec-roll-clear-ref">{t('spec.members.clearReference')}</button>
      {/if}
      <p class="sm-hint">{t('spec.members.localAxesHint')}</p>
    </section>

    <section>
      <h5>{t('spec.members.offsets')}</h5>
      <MemberOffsetEditor />
    </section>

    <section>
      <h5>{t('spec.members.designLengths')}</h5>
      <ProSteelLbEditor steelIds={allIds} />
    </section>

    <ProMemberBehaviour />
  </div>
{/if}

<style>
  .sm { display: flex; flex-direction: column; gap: 8px; padding: 6px 10px; font-size: 0.68rem; color: var(--st-text-2); }
  .sm-empty { padding: 8px 10px; font-size: 0.68rem; color: var(--st-text-3); }
  .sm-title { font-weight: 600; color: var(--st-text); font-size: 0.72rem; }
  section { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--st-hair); padding-top: 6px; }
  h5 { margin: 0; font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .sm-grid { display: grid; grid-template-columns: 16px repeat(3, 32px); gap: 2px 6px; align-items: center; }
  .sm-h { font-family: var(--st-mono); font-size: 0.62rem; color: var(--st-text-3); }
  .sm-row { display: flex; gap: 6px; align-items: center; }
  .sm-row input { width: 64px; }
  .sm-btn { align-self: flex-start; font-size: 0.64rem; }
  .sm-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
</style>
