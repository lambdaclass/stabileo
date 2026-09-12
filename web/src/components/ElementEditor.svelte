<script lang="ts">
  import { modelStore, uiStore, historyStore, resultsStore } from '../lib/store';
  import { NO_RELEASE } from '../lib/store/model.svelte';
  import { t } from '../lib/i18n';
  import EditorCard from './EditorCard.svelte';

  const elemId = $derived(uiStore.editingElementId);
  const elem = $derived(elemId !== null ? modelStore.elements.get(elemId) : undefined);
  const rawPos = $derived(uiStore.editScreenPos);
  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  /* Position, clamping and dragging belong to `EditorCard`. */
  const pos = $derived(rawPos);

  let hingeStart = $state(false);
  let hingeEnd = $state(false);
  let materialId = $state(1);
  let sectionId = $state(1);
  // Sliding joints (Basic 2D only) — '' = none.
  let slideStart = $state<'' | 'x' | 'z'>('');
  let slideEnd = $state<'' | 'x' | 'z'>('');
  let slideStartAxis = $state<'global' | 'local'>('global');
  let slideEndAxis = $state<'global' | 'local'>('global');
  // Basic 3D internal joint — six released relative-DOF masks per end.
  const DOF3D_LABELS = ['dx', 'dy', 'dz', 'θx', 'θy', 'θz'];
  let jointStart = $state<boolean[]>([false, false, false, false, false, false]);
  let jointEnd = $state<boolean[]>([false, false, false, false, false, false]);

  // Sync local values when element changes
  $effect(() => {
    if (elem) {
      hingeStart = elem.releaseI?.mz === true;
      hingeEnd = elem.releaseJ?.mz === true;
      slideStart = elem.releaseI?.slide ?? '';
      slideEnd = elem.releaseJ?.slide ?? '';
      slideStartAxis = elem.releaseI?.slideAxis ?? 'global';
      slideEndAxis = elem.releaseJ?.slideAxis ?? 'global';
      jointStart = elem.jointI ? [...elem.jointI.dof] : [false, false, false, false, false, false];
      jointEnd = elem.jointJ ? [...elem.jointJ.dof] : [false, false, false, false, false, false];
      materialId = elem.materialId;
      sectionId = elem.sectionId;
    }
  });

  /**
   * One end's condition as a single choice.
   *
   * The model stores a hinge and a slide independently, which is right — they
   * release different things and can coexist. The CARD asks about the end as
   * a whole, because that is how someone thinks about it, so the two fields
   * are folded into one name here and unfolded again on the way back.
   */
  type ReleaseKind = 'none' | 'hinge' | 'slideX' | 'slideZ' | 'hingeSlideX' | 'hingeSlideZ';

  function kindOf(hinge: boolean, slide: '' | 'x' | 'z'): ReleaseKind {
    if (slide === '') return hinge ? 'hinge' : 'none';
    if (slide === 'x') return hinge ? 'hingeSlideX' : 'slideX';
    return hinge ? 'hingeSlideZ' : 'slideZ';
  }

  const releaseStart = $derived(kindOf(hingeStart, slideStart));
  const releaseEnd = $derived(kindOf(hingeEnd, slideEnd));

  function setRelease(end: 'i' | 'j', kind: ReleaseKind) {
    const hinge = kind === 'hinge' || kind.startsWith('hingeSlide');
    const slide: '' | 'x' | 'z' =
      kind === 'slideX' || kind === 'hingeSlideX' ? 'x'
        : kind === 'slideZ' || kind === 'hingeSlideZ' ? 'z'
        : '';
    if (end === 'i') { hingeStart = hinge; slideStart = slide; }
    else { hingeEnd = hinge; slideEnd = slide; }
  }

  function confirm() {
    if (!elem || elemId === null) return;
    const changed =
      hingeStart !== (elem.releaseI?.mz === true) ||
      hingeEnd !== (elem.releaseJ?.mz === true) ||
      slideStart !== (elem.releaseI?.slide ?? '') ||
      slideEnd !== (elem.releaseJ?.slide ?? '') ||
      slideStartAxis !== (elem.releaseI?.slideAxis ?? 'global') ||
      slideEndAxis !== (elem.releaseJ?.slideAxis ?? 'global') ||
      (is3DMode && jointStart.some((v, i) => v !== (elem.jointI?.dof[i] ?? false))) ||
      (is3DMode && jointEnd.some((v, i) => v !== (elem.jointJ?.dof[i] ?? false))) ||
      materialId !== elem.materialId ||
      sectionId !== elem.sectionId;

    if (changed) {
      historyStore.pushState();
      const relI = { ...(elem.releaseI ?? NO_RELEASE), mz: hingeStart } as typeof elem.releaseI;
      const relJ = { ...(elem.releaseJ ?? NO_RELEASE), mz: hingeEnd } as typeof elem.releaseJ;
      if (slideStart === '') { delete relI.slide; delete relI.slideAxis; }
      else { relI.slide = slideStart; relI.slideAxis = slideStartAxis; }
      if (slideEnd === '') { delete relJ.slide; delete relJ.slideAxis; }
      else { relJ.slide = slideEnd; relJ.slideAxis = slideEndAxis; }

      /*
       * ── Through the store, not onto the object ────────────────────
       *
       * This used to assign straight onto `elem`: `elem.materialId = …` and
       * so on. That changes the data and tells nothing. `modelVersion` never
       * moved, so everything keyed on it went on believing the model was the
       * one that had been analysed; the mutation hook never fired; the
       * elements map was never reassigned, so the canvas had no reason to
       * redraw; and the results on screen still described the member's old
       * section.
       */
      const patch: Parameters<typeof modelStore.updateElement>[1] = {
        releaseI: relI,
        releaseJ: relJ,
        materialId,
        sectionId,
      };
      if (is3DMode) {
        patch.jointI = jointStart.some(Boolean)
          ? ({ dof: [...jointStart] } as NonNullable<typeof elem.jointI>) : undefined;
        patch.jointJ = jointEnd.some(Boolean)
          ? ({ dof: [...jointEnd] } as NonNullable<typeof elem.jointJ>) : undefined;
      }
      modelStore.updateElement(elemId, patch);

      /*
       * And the analysis described the member as it was. A material swap
       * changes every force in the model that runs through it.
       */
      resultsStore.clear();
    }
    close();
  }

  function close() {
    uiStore.editingElementId = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    e.stopPropagation();
  }
</script>

{#if elem}
  <EditorCard
    title="{t('editor.element')} {elemId}"
    anchor={pos}
    onClose={close}
    onKeydown={handleKeydown}
    testid="element-editor"
  >

    <div class="field">
      <span>{t('editor.material')}:</span>
      <select bind:value={materialId}>
        {#each Array.from(modelStore.materials.values()) as mat}
          <option value={mat.id}>{mat.name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <span>{t('editor.section')}:</span>
      <select bind:value={sectionId}>
        {#each Array.from(modelStore.sections.values()) as sec}
          <option value={sec.id}>{sec.name}</option>
        {/each}
      </select>
    </div>

    <!--
      ── Releases, one end at a time ──────────────────────────────────
      This was three separate controls: a hinge checkbox for each end, then
      a slider dropdown for each end somewhere below, then an axis dropdown
      that appeared next to the slider. The two things that describe ONE end
      of the member sat in different parts of the card, and the word
      "articulación" never appeared over any of them.

      Now the end is the unit. Each gets one dropdown naming exactly what it
      releases, and an axis beside it when there is a slide to orient.

      The combined entries are not padding. A hinge releases rotation and a
      slider releases a translation, so a pin-on-roller is a real end
      condition and the old pair of independent controls could express it.
      A dropdown offering only one or the other would silently drop that
      combination the first time such a model was opened and saved.
    -->
    <div class="rel">
      <div class="rel-title">{t('editor.releases')}</div>

      {#each [
        { key: 'i', label: t('editor.atStart') },
        { key: 'j', label: t('editor.atEnd') },
      ] as end (end.key)}
        <div class="rel-row">
          <span class="rel-end">{end.label}</span>
          <select
            value={end.key === 'i' ? releaseStart : releaseEnd}
            onchange={(e) => setRelease(end.key as 'i' | 'j', e.currentTarget.value as ReleaseKind)}
            data-testid="release-{end.key}"
          >
            <option value="none">{t('editor.relNone')}</option>
            <option value="hinge">{t('editor.relHinge')}</option>
            <option value="slideX">{t('editor.relSlideX')}</option>
            <option value="slideZ">{t('editor.relSlideZ')}</option>
            <option value="hingeSlideX">{t('editor.relHingeSlideX')}</option>
            <option value="hingeSlideZ">{t('editor.relHingeSlideZ')}</option>
          </select>

          {#if (end.key === 'i' ? releaseStart : releaseEnd).startsWith('slide')
            || (end.key === 'i' ? releaseStart : releaseEnd).startsWith('hingeSlide')}
            <!-- Only a slide has an axis to be measured against. -->
            <select
              value={end.key === 'i' ? slideStartAxis : slideEndAxis}
              onchange={(e) => {
                const v = e.currentTarget.value as 'global' | 'local';
                if (end.key === 'i') slideStartAxis = v; else slideEndAxis = v;
              }}
              title={t('float.jointAxis')}
              data-testid="release-axis-{end.key}"
            >
              <option value="global">{t('float.jointAxisGlobal')}</option>
              <option value="local">{t('float.jointAxisLocal')}</option>
            </select>
          {/if}
        </div>
      {/each}
    </div>

    {#if is3DMode && elem.type === 'frame'}
      <div class="joint3d" title={t('editor.joint3dHint')}>
        <div class="joint3d-title">{t('editor.joint3dTitle')}</div>
        <div class="joint3d-row">
          <span class="joint3d-end">I</span>
          {#each DOF3D_LABELS as label, i}
            <label class="joint3d-dof"><input type="checkbox" bind:checked={jointStart[i]} />{label}</label>
          {/each}
        </div>
        <div class="joint3d-row">
          <span class="joint3d-end">J</span>
          {#each DOF3D_LABELS as label, i}
            <label class="joint3d-dof"><input type="checkbox" bind:checked={jointEnd[i]} />{label}</label>
          {/each}
        </div>
      </div>
    {/if}

    <div class="info">
      {t('editor.nodesLabel')}: {elem.nodeI} → {elem.nodeJ}
      | L = {modelStore.getElementLength(elemId!).toFixed(3)} m
    </div>

    {#snippet footer()}
      <button class="ee-btn" onclick={close}>{t('editor.cancel')}</button>
      <button class="ee-btn ee-ok" onclick={confirm} data-testid="element-editor-ok">OK</button>
    {/snippet}
  </EditorCard>
{/if}

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .field > span {
    flex: 1;
    color: var(--st-text-2);
  }

  .field select,
  .rel-row select {
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.7rem;
    max-width: 130px;
  }

  .field select:focus,
  .rel-row select:focus { outline: none; border-color: var(--st-accent); }

  /* ── Releases ─────────────────────────────────────────────────── */
  .rel {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
  }

  .rel-title {
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .rel-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .rel-end {
    width: 52px;
    flex: none;
    color: var(--st-text-2);
  }

  .rel-row select { flex: 1; max-width: none; }

  /* ── 3D joints ────────────────────────────────────────────────── */
  .joint3d {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
  }

  .joint3d-title {
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .joint3d-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .joint3d-end {
    width: 14px;
    color: var(--st-text-3);
  }

  .joint3d-dof {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.64rem;
    color: var(--st-text-2);
  }

  .info {
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
    font-size: 0.64rem;
    color: var(--st-text-3);
  }

  .ee-btn {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ee-btn:hover { color: var(--st-text); }

  .ee-ok {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .ee-ok:hover { background: var(--st-selected-bg); }
</style>
