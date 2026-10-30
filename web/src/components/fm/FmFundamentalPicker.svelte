<script lang="ts">
  /**
   * Step 2's choice of the primary structure: the method's own, or one the
   * reader builds by releasing supports, bielas, springs, member ends (a
   * hinge) or whole member ends (a cut), on the drawing or from the list.
   * A wrong set is explained here, next to the list, and not solved.
   */
  import { t, tp } from '../../lib/i18n';
  import type { ForceMethodResult } from '../../lib/engine/force-method/solve';
  import type { ReleaseGroup, ReleaseOption } from '../../lib/engine/force-method/releases';
  import { fmChoice } from '../../lib/store/fm-choice.svelte';
  import { resolveFlexibility } from '../../lib/actions/fm-fundamental';
  import FmSketch from './FmSketch.svelte';
  import { releaseLabel, xName } from './fm-text';

  let { r }: { r: ForceMethodResult } = $props();

  const gh = $derived(r.count.gh);
  const options = $derived(r.releaseOptions ?? []);
  const byKey = $derived(new Map(options.map((o) => [o.key, o])));
  const chosen = $derived(fmChoice.draft.reduce((s, k) => s + (byKey.get(k)?.count ?? 0), 0));
  const GROUPS: ReleaseGroup[] = ['reaction', 'spring', 'biela', 'member'];
  const groups = $derived(GROUPS.map((g) => ({ g, items: options.filter((o) => o.group === g) })).filter((x) => x.items.length > 0));
  let justSolved = $state(false);

  function setAuto() {
    fmChoice.setMode('auto');
    justSolved = false;
    if (r.choice === 'manual') resolveFlexibility({ releases: null });
  }
  function solve() {
    justSolved = resolveFlexibility({ releases: [...fmChoice.draft] });
  }
  function toggle(key: string) {
    fmChoice.toggle(key);
    justSolved = false;
  }
  const xOf = (o: ReleaseOption) => {
    const at = fmChoice.draft.indexOf(o.key);
    if (at < 0) return '';
    const first = fmChoice.draft.slice(0, at).reduce((s, k) => s + (byKey.get(k)?.count ?? 0), 0) + 1;
    return o.count > 1 ? `${xName(first)}…${xName(first + o.count - 1)}` : xName(first);
  };
</script>

<div class="ff" data-testid="fm-fundamental">
  <div class="ff-seg" role="radiogroup" aria-label={t('course.statics.fm.fund.title')}>
    <button role="radio" aria-checked={fmChoice.mode === 'auto'} class:on={fmChoice.mode === 'auto'}
      onclick={setAuto} data-testid="fm-fund-auto">{t('course.statics.fm.fund.auto')}</button>
    <button role="radio" aria-checked={fmChoice.mode === 'manual'} class:on={fmChoice.mode === 'manual'}
      onclick={() => fmChoice.setMode('manual')} data-testid="fm-fund-manual">{t('course.statics.fm.fund.manual')}</button>
  </div>

  {#if fmChoice.mode === 'auto'}
    <p class="ff-note">{t('course.statics.fm.fund.autoNote')}</p>
  {:else}
    <p class="ff-note">{tp('course.statics.fm.fund.how', { gh })}</p>
    <FmSketch geometry={r.original} testId="fm-pick-sketch" highlight={fmChoice.error?.nodes ?? []}
      pick={{ options, picked: fmChoice.draft, onPick: toggle, title: releaseLabel }} />
    <p class="ff-count" class:ok={chosen === gh} data-testid="fm-fund-count">{tp('course.statics.fm.fund.counter', { n: chosen, gh })}</p>
    {#each groups as grp (grp.g)}
      {@const n = grp.items.filter((o) => fmChoice.draft.includes(o.key)).length}
      <details class="ff-group" open={grp.g !== 'member' || n > 0}>
        <summary>{t(`course.statics.fm.group.${grp.g}`)} <span class="ff-dim">{n > 0 ? `· ${n}` : ''}</span></summary>
        {#each grp.items as o (o.key)}
          <label class="ff-item">
            <input type="checkbox" checked={fmChoice.draft.includes(o.key)} onchange={() => toggle(o.key)} data-testid="fm-rel-{o.key}" />
            <span>{releaseLabel(o)}</span>
            {#if xOf(o)}<strong class="ff-x">{xOf(o)}</strong>{/if}
          </label>
        {/each}
        {#if grp.g === 'member'}<p class="ff-hint">{t('course.statics.fm.fund.section')}</p>{/if}
      </details>
    {/each}
    {#if fmChoice.error}
      <p class="ff-err" role="alert" data-testid="fm-fund-error">{tp(fmChoice.error.key, fmChoice.error.params)}</p>
    {:else if justSolved}
      <p class="ff-ok" data-testid="fm-fund-ok">{t('course.statics.fm.fund.ok')}</p>
    {/if}
    <div class="ff-actions">
      <button class="ff-primary" disabled={fmChoice.draft.length === 0} onclick={solve} data-testid="fm-fund-solve">{t('course.statics.fm.fund.solve')}</button>
      <button class="ff-secondary" disabled={fmChoice.draft.length === 0} onclick={() => { fmChoice.clearDraft(); justSolved = false; }}>{t('course.statics.fm.fund.clear')}</button>
    </div>
  {/if}
</div>

<style>
  .ff { margin: 4px 0 8px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .ff-seg { display: flex; gap: 0; border: 1px solid var(--st-hair-strong); border-radius: 6px; overflow: hidden; }
  .ff-seg button {
    flex: 1; padding: 4px 6px; border: none; background: transparent; color: var(--st-text-2);
    font-size: 0.72rem; cursor: pointer; font-family: inherit;
  }
  .ff-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .ff-seg button.on { background: var(--st-accent); color: #fff; }
  .ff-note { font-size: 0.7rem; line-height: 1.45; color: var(--st-text-2); margin: 6px 0 2px; }
  .ff-count { font-size: 0.72rem; font-variant-numeric: tabular-nums; color: var(--st-text-2); margin: 2px 0 4px; }
  .ff-count.ok { color: var(--st-ok); font-weight: 600; }
  .ff-group { border-top: 1px solid var(--st-hair); padding: 3px 0; }
  .ff-group summary { font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); cursor: pointer; padding: 2px 0; }
  .ff-dim { color: var(--st-accent); font-weight: 600; }
  .ff-item { display: flex; align-items: flex-start; gap: 6px; font-size: 0.68rem; line-height: 1.35; color: var(--st-text); padding: 2px 0 2px 4px; cursor: pointer; }
  .ff-item input { margin-top: 1px; flex: none; }
  .ff-item span { flex: 1; min-width: 0; }
  .ff-hint { font-size: 0.64rem; line-height: 1.4; color: var(--st-text-3); margin: 2px 0 2px 4px; }
  .ff-x { color: #e5484d; font-size: 0.66rem; white-space: nowrap; }
  .ff-err { font-size: 0.7rem; line-height: 1.45; color: var(--st-danger); border-left: 2px solid var(--st-danger); padding-left: 6px; margin: 6px 0; }
  .ff-ok { font-size: 0.7rem; line-height: 1.45; color: var(--st-ok); margin: 6px 0; }
  .ff-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
  .ff-primary {
    flex: 1; padding: 5px 8px; border: none; border-radius: 6px; background: var(--st-accent); color: #fff;
    font-size: 0.74rem; font-weight: 600; cursor: pointer; font-family: inherit;
  }
  .ff-secondary {
    padding: 5px 8px; border: 1px solid var(--st-hair-strong); border-radius: 6px; background: transparent; color: var(--st-text-2);
    font-size: 0.72rem; cursor: pointer; font-family: inherit;
  }
  .ff-primary:disabled, .ff-secondary:disabled { opacity: 0.45; cursor: default; }
  @media (pointer: coarse) { .ff-item { min-height: 30px; align-items: center; } .ff-seg button { min-height: 32px; } }
</style>
