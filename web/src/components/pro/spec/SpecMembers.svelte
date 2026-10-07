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
   *   the rest          global joints, semi-rigid ends, stiffness factors, end offsets, the
   *                     variable section and the design lengths, each in the one component that
   *                     edits it
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import type { Element, Release } from '../../../lib/store/model.svelte';
  import { axialOf, setAxial, type Axial } from '../../../lib/pro/member-axial';
  import ProMemberBehaviour from '../ProMemberBehaviour.svelte';
  import MemberOffsetEditor from '../../property/MemberOffsetEditor.svelte';
  import ProSteelLbEditor from '../ProSteelLbEditor.svelte';
  import SpecEmpty from './SpecEmpty.svelte';
  import SpecVariableSection from './SpecVariableSection.svelte';

  const ids = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  const allIds = $derived(new Set(modelStore.elements.keys()));
  const same = <T,>(f: (e: Element) => T): T | undefined => {
    const v = ids.map((id) => f(modelStore.elements.get(id)!));
    return v.length && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : undefined;
  };

  /** The axial behaviour: a member's type and its one-way or cable behaviour (`pro/member-axial.ts`). */
  const axial = $derived(same(axialOf) ?? 'mixed');

  /** Local releases: a released moment carries nothing at that end. */
  const DOFS = ['my', 'mz', 't'] as const;
  const releaseOf = (end: 'i' | 'j', k: (typeof DOFS)[number]) => same((e) => !!(end === 'i' ? e.releaseI : e.releaseJ)?.[k]);
  function setRelease(end: 'i' | 'j', k: (typeof DOFS)[number], on: boolean) {
    modelStore.batch(() => {
      for (const id of ids) {
        const e = modelStore.elements.get(id)!;
        const was = end === 'i' ? e.releaseI : e.releaseJ;
        const cur: Release = { ...was, my: was?.my ?? false, mz: was?.mz ?? false, t: was?.t ?? false };
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
  <SpecEmpty kind="elements" items={[
    { title: 'spec.members.axial', hint: 'spec.item.axial' },
    { title: 'spec.members.ends', hint: 'spec.item.ends' },
    { title: 'spec.members.localAxes', hint: 'spec.item.localAxes' },
    { title: 'behaviour.stiffness', hint: 'spec.item.stiffness' },
    { title: 'spec.members.offsets', hint: 'spec.item.offsets' },
    { title: 'spec.members.designLengths', hint: 'spec.item.designLengths' },
    { title: 'spec.members.variable', hint: 'spec.item.variable' },
  ]} />
{:else}
  <!-- One card per group of properties, each in the PRO panel kit, so the part reads as one. -->
  <div class="pk" data-testid="spec-members">
    <p class="sm-title">{tp('spec.members.title', { n: ids.length })}</p>

    <section class="pk-card">
      <h4 class="pk-heading">{t('spec.members.axial')}</h4>
      <select value={axial} onchange={(e) => setAxial(ids, e.currentTarget.value as Axial)} data-testid="mb-behaviour">
        {#if axial === 'mixed'}<option value="mixed" disabled>{t('behaviour.mixed')}</option>{/if}
        <option value="frame">{t('spec.axial.frame')}</option>
        <option value="truss">{t('spec.axial.truss')}</option>
        <option value="tensionOnly">{t('behaviour.tensionOnly')}</option>
        <option value="compressionOnly">{t('behaviour.compressionOnly')}</option>
        <option value="cable">{t('spec.axial.cable')}</option>
        <option value="inactive">{t('behaviour.inactive')}</option>
      </select>
      {#if axial === 'tensionOnly' || axial === 'compressionOnly'}<p class="pk-hint">{t('behaviour.nonlinearHint')}</p>{/if}
      {#if axial === 'cable'}<p class="pk-hint" data-testid="spec-cable-hint">{t('spec.axial.cableHint')}</p>{/if}
    </section>

    <section class="pk-card">
      <h4 class="pk-heading">{t('spec.members.ends')}</h4>
      <span class="pk-label">{t('spec.members.releases')}</span>
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
      <p class="pk-hint">{t('spec.members.releasesHint')}</p>
      <ProMemberBehaviour part="ends" />
    </section>

    <section class="pk-card">
      <h4 class="pk-heading">{t('spec.members.localAxes')}</h4>
      <label class="pk-row">β
        <input class="sm-num" type="number" step="15" value={roll ?? ''} placeholder={roll === undefined ? t('behaviour.mixed') : ''}
          onchange={(e) => setRoll(Number(e.currentTarget.value))} data-testid="spec-roll" /> °</label>
      {#if hasReference}
        <button class="pk-btn" onclick={clearReference} data-testid="spec-roll-clear-ref">{t('spec.members.clearReference')}</button>
      {/if}
      <p class="pk-hint">{t('spec.members.localAxesHint')}</p>
    </section>

    <section class="pk-card">
      <h4 class="pk-heading">{t('behaviour.stiffness')}</h4>
      <ProMemberBehaviour part="stiffness" />
    </section>

    <section class="pk-card">
      <h4 class="pk-heading">{t('spec.members.offsets')}</h4>
      <MemberOffsetEditor bare />
    </section>

    <section class="pk-card" data-testid="spec-variable-card">
      <h4 class="pk-heading">{t('spec.members.variable')}</h4>
      <SpecVariableSection {ids} />
    </section>

    <section class="pk-card">
      <h4 class="pk-heading">{t('spec.members.designLengths')}</h4>
      <ProSteelLbEditor steelIds={allIds} bare />
    </section>
  </div>
{/if}

<style>
  .sm-title { margin: 0; font-weight: 600; color: var(--st-text); font-size: 0.74rem; }
  .sm-grid { display: grid; grid-template-columns: 16px repeat(3, 32px); gap: 2px 6px; align-items: center; }
  .sm-h { font-family: var(--st-mono); font-size: 0.62rem; color: var(--st-text-3); }
  .sm-num { width: 72px; }
</style>
