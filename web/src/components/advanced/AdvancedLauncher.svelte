<script lang="ts">
  /**
   * The list of Basic's advanced functions: a search over all of them and their step-by-step
   * methods, then the groups, closed until opened, each a column of cards (drawing, name, one
   * line on what it does). Everything listed comes from `lib/advanced/catalog.ts`.
   */
  import { t, tp } from '../../lib/i18n';
  import { tAt } from '../../lib/i18n/store.svelte';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { ADV_FUNCTIONS, ADV_GROUPS, offered, ownerOfMethod, linkedMethods, unavailable, unavailableReasonKey, type AdvFunction, type AdvGroupId } from '../../lib/advanced/catalog';
  import { buildIndex, fold, search, type SearchDoc } from '../../lib/advanced/search';
  import { advancedList } from '../../lib/advanced/panel-state.svelte';
  import { openStepMethod, stepBlockedReason } from '../../lib/advanced/open-step';
  import AdvThumb from './AdvThumb.svelte';
  import Prose from '../steps/Prose.svelte';

  let { onOpen }: { onOpen: (id: string) => void } = $props();

  import { hasCurrentResults } from '../../lib/actions/solve';

  type Entry = { kind: 'fn'; fn: AdvFunction } | { kind: 'step'; method: string; owner: AdvFunction };

  const functions = $derived(ADV_FUNCTIONS.filter(offered));

  const is3D = $derived(uiStore.is3DWorkspace);
  const modelState = $derived({
    is3D,
    members: modelStore.elements.size,
    solved: hasCurrentResults(),
  });

  const both = (key: string) => [t(key), tAt(key, 'en')];
  const descKey = (f: AdvFunction) => `advCat.fn.${f.id}.desc`;
  const methodTitle = (id: string) => `steps.m.${id}.title`;

  const index = $derived.by(() => {
    const docs: SearchDoc<Entry>[] = [];
    for (const fn of functions) {
      docs.push({
        id: fn.id,
        fields: {
          title: both(fn.titleKey), description: both(descKey(fn)), keywords: fn.keywords,
          steps: fn.steps.flatMap((m) => both(methodTitle(m))), group: both(`advCat.group.${fn.group}`),
        },
        item: { kind: 'fn', fn },
      });
    }
    for (const method of linkedMethods()) {
      const owner = ownerOfMethod(method);
      if (!owner || !offered(owner)) continue;
      docs.push({ id: `step:${method}`, secondary: true, fields: { title: both(methodTitle(method)), group: both(owner.titleKey) }, item: { kind: 'step', method, owner } });
    }
    return buildIndex(docs);
  });

  const hits = $derived(advancedList.query.trim() ? search(index, advancedList.query) : []);
  const grouped = $derived.by(() => {
    const byGroup = new Map<AdvGroupId, Entry[]>();
    for (const h of hits) {
      const e = h.doc.item;
      const g = e.kind === 'fn' ? e.fn.group : e.owner.group;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(e);
    }
    return [...byGroup.entries()];
  });
  const flat = $derived(grouped.flatMap(([, list]) => list));

  function reasonOf(f: AdvFunction): string | null {
    const why = unavailable(f, modelState);
    return why ? t(unavailableReasonKey[why]) : null;
  }

  const ownerOf = (e: Entry) => (e.kind === 'fn' ? e.fn : e.owner);
  const blockedReason = (e: Entry) => e.kind === 'step' ? stepBlockedReason(e.method)
    : unavailable(ownerOf(e), modelState) === 'plane' ? 'advanced.only2d' : null;
  const blocked = (e: Entry) => blockedReason(e) !== null;

  function open(e: Entry): void {
    if (blocked(e)) return;
    if (e.kind === 'step') { openStepMethod(e.method); return; }
    advancedList.reveal(e.fn.group);
    onOpen(e.fn.id);
  }

  let input = $state<HTMLInputElement | null>(null);
  let results = $state<HTMLElement | null>(null);

  function onKey(ev: KeyboardEvent): void {
    if (ev.isComposing) return;
    if (ev.key === 'Enter') {
      const exact = flat.find(e => e.kind === 'step' && both(methodTitle(e.method)).some(name => fold(name) === fold(advancedList.query)));
      const first = exact ?? flat.find(entry => !blocked(entry));
      if (first) { ev.preventDefault(); open(first); }
    } else if (ev.key === 'Escape') {
      if (advancedList.query) { ev.preventDefault(); ev.stopPropagation(); advancedList.query = ''; }
      else input?.blur();
    } else if (ev.key === 'ArrowDown') {
      const first = results?.querySelector<HTMLButtonElement>('button:not([disabled])');
      if (first) { ev.preventDefault(); first.focus(); }
    }
  }

</script>

{#snippet card(fn: AdvFunction)}
  {@const reason = reasonOf(fn)}
  {@const plane = unavailable(fn, modelState) === 'plane'}
  <button type="button" class="ac-card" class:muted={!!reason} disabled={plane} onclick={() => open({ kind: 'fn', fn })}
    data-testid="adv-fn-{fn.id}" title={reason ?? undefined}>
    <span class="ac-thumb"><AdvThumb id={fn.thumb} /></span>
    <span class="ac-text">
      <span class="ac-title">{t(fn.titleKey)}{#if fn.beta}<span class="ac-beta">{t('flex.beta')}</span>{/if}</span>
      <span class="ac-desc">{t(descKey(fn))}</span>
      {#if reason}<span class="ac-reason" data-testid="adv-reason-{fn.id}">{reason}</span>{/if}
    </span>
    {#if fn.steps.length && !fn.stepsGroup}
      <span class="ac-steps" title={tp('advCat.stepsBadge', { n: fn.steps.length })} aria-label={tp('advCat.stepsBadge', { n: fn.steps.length })}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 3h8M2 6h6M2 9h7" /></svg>{fn.steps.length}
      </span>
    {/if}
  </button>
{/snippet}

<div class="al" data-testid="adv-launcher">
  <div class="al-search" role="search">
    <svg class="al-glass" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
    <input bind:this={input} type="search" bind:value={advancedList.query} onkeydown={onKey}
      placeholder={t('advCat.search.placeholder')} aria-label={t('advCat.search.label')}
      autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" data-testid="adv-search" />
    {#if advancedList.query}
      <button type="button" class="al-clear" onclick={() => { advancedList.query = ''; input?.focus(); }}
        aria-label={t('advCat.search.clear')} title={t('advCat.search.clear')} data-testid="adv-search-clear">×</button>
    {/if}
  </div>

  {#if advancedList.query.trim()}
    <p class="al-count" aria-live="polite" data-testid="adv-search-count">{tp('advCat.search.results', { n: hits.length })}</p>
    <div class="al-results" bind:this={results} data-testid="adv-search-results">
      {#if !hits.length}
        <div class="al-empty" data-testid="adv-search-empty">
          <p>{tp('advCat.search.empty', { q: advancedList.query.trim() })}</p>
          <p class="al-hint">{t('advCat.search.emptyHint')}</p>
        </div>
      {/if}
      {#each grouped as [g, list] (g)}
        <section class="al-rgroup" data-testid="adv-result-group-{g}">
          <h4>{t(`advCat.group.${g}`)}</h4>
          {#each list as e (e.kind === 'fn' ? e.fn.id : `step:${e.method}`)}
            {#if e.kind === 'fn'}
              {@render card(e.fn)}
            {:else}
              <button type="button" class="ac-step" disabled={blocked(e)} title={blocked(e) ? t(blockedReason(e)!) : undefined} onclick={() => open(e)} data-testid="adv-step-{e.method}">
                <span class="ac-step-tag">{t('advCat.search.step')}</span>
                <span class="ac-step-title"><Prose text={t(methodTitle(e.method))} /></span>
                <span class="ac-step-owner">{tp('advCat.search.stepOf', { name: t(e.owner.titleKey) })}</span>
              </button>
            {/if}
          {/each}
        </section>
      {/each}
    </div>
  {:else}
    <div class="al-groups">
      {#each ADV_GROUPS as g (g)}
        {@const list = functions.filter((f) => f.group === g)}
        {#if list.length}
          {@const isOpen = advancedList.isOpen(g)}
          <section class="al-group" class:open={isOpen} data-testid="adv-group-{g}">
            <button type="button" class="al-ghead" aria-expanded={isOpen} aria-controls="adv-group-body-{g}"
              onclick={() => advancedList.toggle(g)} data-testid="adv-group-toggle-{g}">
              <span class="al-chev" aria-hidden="true">›</span>
              <span class="al-gtext">
                <span class="al-gname">{t(`advCat.group.${g}`)}</span>
                <span class="al-gsum">{list.map((f) => t(f.titleKey)).join(' · ')}</span>
              </span>
              <span class="al-gcount" title={tp('advCat.count', { n: list.length })} aria-label={tp('advCat.count', { n: list.length })}>{list.length}</span>
            </button>
            {#if isOpen}
              <div class="al-gbody" id="adv-group-body-{g}">
                {#each list as fn (fn.id)}{@render card(fn)}{/each}
              </div>
            {/if}
          </section>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .al { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }

  .al-search {
    position: sticky; top: -0.65rem; z-index: 2; display: flex; align-items: center; gap: 0.35rem;
    margin: -0.65rem -0.65rem 0; padding: 0.55rem 0.65rem 0.5rem; background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
  }
  .al-glass { position: absolute; left: 1.15rem; width: 14px; height: 14px; fill: none; stroke: var(--st-text-3); stroke-width: 1.6; stroke-linecap: round; pointer-events: none; }
  .al-search input {
    flex: 1; min-width: 0; height: 36px; padding: 0 2.1rem 0 2rem; box-sizing: border-box;
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2);
    color: var(--st-text); font: inherit; font-size: 0.82rem;
  }
  .al-search input::placeholder { color: var(--st-text-3); }
  .al-search input:focus { outline: none; border-color: var(--st-interactive); }
  .al-search input::-webkit-search-cancel-button { display: none; }
  .al-clear {
    position: absolute; right: 0.9rem; width: 30px; height: 30px; border: none; background: none; cursor: pointer;
    color: var(--st-text-2); font-size: 1.1rem; line-height: 1; border-radius: var(--st-radius);
  }
  .al-clear:hover { color: var(--st-text); }

  .al-count { margin: 0; font-size: 0.7rem; color: var(--st-text-3); }
  .al-results, .al-groups { display: flex; flex-direction: column; gap: 0.4rem; }
  .al-empty p { margin: 0.3rem 0; font-size: 0.8rem; color: var(--st-text); overflow-wrap: anywhere; }
  .al-empty .al-hint { font-size: 0.74rem; color: var(--st-text-3); line-height: 1.4; }
  .al-rgroup { display: flex; flex-direction: column; gap: 0.3rem; }
  .al-rgroup h4 {
    margin: 0.3rem 0 0; padding-bottom: 0.15rem; border-bottom: 1px solid var(--st-hair);
    font-family: var(--st-mono); font-size: 0.64rem; font-weight: 400; letter-spacing: 0.1em; text-transform: uppercase; color: var(--st-text-3);
  }

  .al-group { border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 8px); background: color-mix(in srgb, var(--st-surface-2) 40%, transparent); }
  .al-group.open { border-color: var(--st-hair-strong); }
  .al-ghead {
    display: flex; align-items: center; gap: 0.5rem; width: 100%; min-height: 48px; padding: 0.45rem 0.6rem;
    background: none; border: none; color: var(--st-text); font: inherit; text-align: left; cursor: pointer; border-radius: inherit;
  }
  .al-ghead:hover { background: var(--st-surface-3); }
  .al-ghead:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: -2px; }
  .al-chev { flex: none; width: 12px; color: var(--st-text-3); font-size: 1rem; transition: transform 0.15s; }
  .open .al-chev { transform: rotate(90deg); }
  .al-gtext { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
  .al-gname { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-accent); }
  .al-gsum { font-size: 0.72rem; color: var(--st-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .al-gcount {
    flex: none; min-width: 1.4rem; padding: 1px 6px; box-sizing: border-box; text-align: center; border: 1px solid var(--st-hair-strong);
    border-radius: 999px; font-size: 0.66rem; color: var(--st-text-3); font-variant-numeric: tabular-nums;
  }
  .al-gbody { display: flex; flex-direction: column; gap: 0.3rem; padding: 0 0.45rem 0.45rem; }

  .ac-card {
    display: flex; align-items: center; gap: 0.6rem; width: 100%; min-height: 56px; padding: 0.4rem 0.5rem; box-sizing: border-box;
    background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 8px);
    color: var(--st-text); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.12s, background 0.12s;
  }
  .ac-card:hover:not(:disabled) { border-color: var(--st-accent); background: var(--st-surface-3); }
  .ac-card:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .ac-card:disabled { cursor: not-allowed; }
  .ac-card.muted .ac-thumb, .ac-card.muted .ac-title { opacity: 0.55; }
  .ac-thumb { flex: none; width: 58px; height: 38px; padding: 2px; box-sizing: border-box; border-radius: 6px; background: var(--st-surface); pointer-events: none; }
  .ac-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .ac-title { font-size: 0.8rem; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
  .ac-beta { margin-left: 0.35rem; font-size: 0.55rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); vertical-align: 0.15em; }
  .ac-desc { font-size: 0.72rem; line-height: 1.35; color: var(--st-text-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ac-reason { font-size: 0.68rem; line-height: 1.3; color: var(--st-amber-text, var(--st-text-3)); }
  .ac-steps {
    flex: none; align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; padding: 1px 5px;
    border: 1px solid var(--st-hair-strong); border-radius: 999px; font-size: 0.62rem; color: var(--st-text-3); font-variant-numeric: tabular-nums;
  }
  .ac-steps svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }

  .ac-step {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: 48px;
    padding: 0.4rem 0.55rem; box-sizing: border-box; background: none; border: 1px dashed var(--st-hair-strong); border-radius: var(--st-radius-lg, 8px);
    color: var(--st-text); font: inherit; text-align: left; cursor: pointer;
  }
  .ac-step:hover:not(:disabled) { border-color: var(--st-accent); background: var(--st-surface-3); }
  .ac-step:disabled { opacity: 0.5; cursor: not-allowed; }
  .ac-step:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  .ac-step-tag { font-family: var(--st-mono); font-size: 0.56rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--st-accent); }
  .ac-step-title { font-size: 0.78rem; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .ac-step-owner { font-size: 0.68rem; color: var(--st-text-3); }

  @media (max-width: 767px), (pointer: coarse) {
    .al-search input { height: 44px; font-size: 16px; }
    .al-clear { width: 40px; height: 40px; right: 0.75rem; }
    .ac-card { min-height: 60px; }
    .ac-desc { font-size: 0.76rem; -webkit-line-clamp: 3; line-clamp: 3; }
    .ac-title { font-size: 0.84rem; }
  }
</style>
