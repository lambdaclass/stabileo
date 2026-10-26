<script lang="ts">
  /**
   * The model's physical elements: what each set of bars and shells IS to the engineer.
   *
   * Recognise reads them off the model (the generator's role first, the geometry last, said as
   * inferred); a person corrects the kind or the typology, and the element becomes declared, so a
   * later recognition leaves it alone. Design reads the kind from here: a bar declared a column
   * is designed as a column. A click on a row selects its bars and shells in the model.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { TYPOLOGIES, type PhysicalKind } from '../../lib/model/physical';
  import {
    physicalGroups, declarePhysicalKind, declarePhysicalTypology,
    physicalSection, physicalThickness, setPhysicalSection, setPhysicalThickness,
  } from '../../lib/store/physical';
  import { planRecognition, type RecognitionOutcome, type RecognitionPlan } from '../../lib/store/physical-recognition';
  import PhysicalRecognitionReview from './PhysicalRecognitionReview.svelte';

  /** The proposal under review, and what the last application did. */
  let review = $state<RecognitionPlan | null>(null);
  let outcome = $state<RecognitionOutcome | null>(null);
  function recognise() { outcome = null; review = planRecognition(); }
  function done(o: RecognitionOutcome | null) { review = null; outcome = o; }

  const KINDS: PhysicalKind[] = ['column', 'beam', 'brace', 'slab', 'wall'];
  let filter = $state<'all' | PhysicalKind>('all');

  const list = $derived.by(() => {
    void modelStore.model.groups;
    return physicalGroups();
  });
  const levels = $derived(modelStore.grid?.levels ?? []);
  const levelName = (id?: string) => {
    if (!id) return '—';
    const l = levels.find((x) => x.id === id);
    return l ? l.name : id.startsWith('z:') ? `+${Number(id.slice(2)).toFixed(2)}` : id;
  };
  const zOf = (id?: string) => levels.find((x) => x.id === id)?.z ?? (id?.startsWith('z:') ? Number(id.slice(2)) : 0);
  const shown = $derived(list
    .filter((g) => filter === 'all' || g.physical.kind === filter)
    .sort((a, b) => zOf(a.physical.levelFrom) - zOf(b.physical.levelFrom) || a.name.localeCompare(b.name, undefined, { numeric: true })));
  const inferred = $derived(list.filter((g) => g.physical.provenance === 'inferred').length);
  const counts = $derived(Object.fromEntries(KINDS.map((k) => [k, list.filter((g) => g.physical.kind === k).length])));

  function select(g: (typeof list)[number]) {
    uiStore.setSelection(
      new Set(), new Set(g.members.elements ?? []), true,
      new Set([...(g.members.quads ?? []).map((id) => `q${id}`), ...(g.members.plates ?? []).map((id) => `p${id}`)]),
    );
  }
  const sections = $derived([...modelStore.sections.values()]);
  const isBar = (g: (typeof list)[number]) => (g.members.elements?.length ?? 0) > 0;
  const size = (g: (typeof list)[number]) => (g.members.elements?.length ?? 0) + (g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0);
</script>

<div class="pk ph" data-testid="physical-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('physical.title')}</h4>
    <p class="pk-hint">{t('physical.explain')}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={recognise} disabled={review !== null} data-testid="physical-recognize">{t('physical.recognize')}</button>
      {#if list.length > 0}<span class="pk-hint">{tp('physical.summary', { n: list.length, inferred })}</span>{/if}
    </div>
    {#if outcome && outcome.channel !== 'none'}
      <p class="pk-hint" data-testid="recognition-outcome">{tp('physical.review.done', { applied: outcome.applied, created: outcome.created, removed: outcome.removed, remapped: outcome.remapped })}
        {#if outcome.frozen}{tp('physical.review.doneFrozen', { n: outcome.frozen })}{/if}
        {#if outcome.dropped.length}<span data-testid="recognition-dropped">{tp('physical.review.doneDropped', { n: outcome.dropped.length, list: outcome.dropped.map((d) => `${t(`physical.review.place.${d.place}`)} #${d.fromId} → #${d.toId}`).join('; ') })}</span>{/if}</p>
    {/if}
  </section>

  {#if review}
    <PhysicalRecognitionReview plan={review} onDone={done} />
  {/if}

  {#if list.length > 0}
    <section class="pk-card">
      <div class="ph-filter" role="radiogroup" aria-label={t('physical.filter')}>
        <button class="pk-btn" class:on={filter === 'all'} role="radio" aria-checked={filter === 'all'} onclick={() => (filter = 'all')}>{t('physical.all')} ({list.length})</button>
        {#each KINDS as k}
          {#if counts[k] > 0}
            <button class="pk-btn" class:on={filter === k} role="radio" aria-checked={filter === k} onclick={() => (filter = k)} data-testid="physical-filter-{k}">{t(`physical.kind.${k}`)} ({counts[k]})</button>
          {/if}
        {/each}
      </div>
      <table class="ph-table" data-testid="physical-table">
        <thead>
          <tr>
            <th scope="col">{t('physical.name')}</th><th scope="col">{t('physical.kindCol')}</th>
            <th scope="col">{t('physical.typology')}</th><th scope="col">{t('physical.levels')}</th>
            <th scope="col">{t('physical.sectionCol')}</th><th scope="col">{t('physical.parts')}</th><th scope="col">{t('physical.source')}</th>
          </tr>
        </thead>
        <tbody>
          {#each shown as g (g.id)}
            <tr data-testid="physical-row-{g.id}" class:inferred={g.physical.provenance === 'inferred'}>
              <td><button class="ph-name" onclick={() => select(g)} title={t('physical.selectMembers')}>{g.name}</button></td>
              <td>
                <select value={g.physical.kind} onchange={(e) => declarePhysicalKind(g.id, (e.currentTarget as HTMLSelectElement).value)} aria-label={t('physical.kindCol')} data-testid="physical-kind-{g.id}">
                  {#each KINDS as k}<option value={k}>{t(`physical.kind.${k}`)}</option>{/each}
                </select>
              </td>
              <td>
                <select value={g.physical.typology ?? ''} onchange={(e) => declarePhysicalTypology(g.id, (e.currentTarget as HTMLSelectElement).value || null)} aria-label={t('physical.typology')}>
                  <option value="">—</option>
                  {#each TYPOLOGIES[g.physical.kind] ?? [] as ty}<option value={ty}>{t(`physical.typ.${ty}`)}</option>{/each}
                </select>
              </td>
              <td class="mono">{levelName(g.physical.levelFrom)}{g.physical.levelTo && g.physical.levelTo !== g.physical.levelFrom ? ` → ${levelName(g.physical.levelTo)}` : ''}</td>
              <td>
                {#if isBar(g)}
                  <select value={physicalSection(g) ?? ''} onchange={(e) => setPhysicalSection(g.id, Number(e.currentTarget.value))} aria-label={t('physical.sectionCol')} data-testid="physical-section-{g.id}">
                    {#if physicalSection(g) === null}<option value="">{t('physical.mixed')}</option>{/if}
                    {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
                  </select>
                {:else}
                  <input class="ph-th" type="number" min="0.01" step="0.01" value={physicalThickness(g) ?? ''} placeholder={t('physical.mixed')}
                    onchange={(e) => setPhysicalThickness(g.id, Number(e.currentTarget.value))} aria-label={t('physical.thickness')} data-testid="physical-thickness-{g.id}" /> m
                {/if}
              </td>
              <td class="num">{size(g)}</td>
              <td><span class="ph-src ph-src-{g.physical.provenance}">{t(`physical.provenance.${g.physical.provenance}`)}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .ph-filter { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .ph-filter .on { border-color: var(--st-accent); color: var(--st-text); }
  .ph-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  .ph-table th { text-align: left; font-weight: 500; color: var(--st-text-2); padding: 3px 4px; border-bottom: 1px solid var(--st-hair); }
  .ph-table td { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .ph-table select { font-size: 0.7rem; max-width: 9rem; }
  .ph-name { background: none; border: none; color: var(--st-accent); cursor: pointer; padding: 0; font: inherit; }
  .ph-th { width: 4rem; font-size: 0.7rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: monospace; }
  .ph-src { font-size: 0.64rem; padding: 0 5px; border-radius: 3px; border: 1px solid var(--st-hair-strong); }
  .ph-src-inferred { border-color: var(--st-warn); }
  .ph-src-declared { border-color: var(--st-ok); }
</style>
