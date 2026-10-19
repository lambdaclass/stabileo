<script lang="ts">
  /**
   * «Size…»: the one dialog every design button opens (`deskUi.ask`), and the one command it runs
   * (`rcDesign`). What it will cover is chosen here and said before it runs: every member, the
   * members selected in the model, or those with no bars yet; for every member, the concrete
   * families. The members a person edited by hand and did not lock are kept unless the person
   * chooses to overwrite them, and overwriting asks once more, naming how many. Locked members
   * are never touched.
   */
  import { t, tp } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store';
  import { DESIGN_FAMILIES } from '../../../lib/engine/design/design-families';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { deskUi, type RunScope } from '../../../lib/store/design-desk-ui.svelte';
  import { undesignedMembers, type DeskReport } from '../../../lib/store/design-desk';
  import { rcDesign } from '../../../lib/flow/rc-commands';

  let { onDone }: { onDone: (report: DeskReport, error: { key: string; params: Record<string, string | number> } | null, fromList: boolean) => void } = $props();

  const SCOPES: RunScope[] = ['all', 'selection', 'undesigned'];
  let scope = $state<RunScope>('all');
  let edited = $state<'keep' | 'overwrite'>('keep');
  let steel = $state(true);
  let confirming = $state(false);
  // Each time it is asked for, it starts from the scope it was asked with, keeping the edited bars.
  $effect(() => {
    const a = deskUi.ask;
    if (!a) return;
    scope = a.scope === 'selection' && uiStore.selectedElements.size === 0 ? 'all' : a.scope;
    edited = 'keep';
    confirming = false;
  });
  const selected = $derived([...uiStore.selectedElements]);
  const undesigned = $derived(deskUi.ask ? undesignedMembers().length : 0);
  const count = (s: RunScope) => (s === 'selection' ? selected.length : s === 'undesigned' ? undesigned : null);
  /** The edited members this run would reach. */
  const editedInScope = $derived.by(() => {
    const m = designRunStore.manualOverrides;
    if (scope === 'undesigned') return 0;
    if (scope === 'selection') return selected.filter((id) => m.has(id)).length;
    return m.size;
  });

  const scopeText = $derived(designRunStore.familySelection.length === 0
    ? t('design.cmd.scopeNone')
    : tp('design.cmd.scopeIs', { families: designRunStore.familySelection.map((f) => t(`design.families.${f}`)).join(', ') }));
  function close() { deskUi.ask = null; }
  async function run() {
    if (edited === 'overwrite' && editedInScope > 0 && !confirming) { confirming = true; return; }
    const ask = { scope, ids: scope === 'selection' ? selected : undefined, edited: editedInScope > 0 ? edited : 'keep' as const, steel };
    const fromList = !!deskUi.ask?.fromList;
    deskUi.ask = null;
    // A frame for the dialog to go before the run holds the page.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const report = rcDesign(ask);
    const e = designRunStore.lastError;
    onDone(report, e ? { key: e.key, params: e.params ?? {} } : null, fromList);
  }
  function onKey(e: KeyboardEvent) { if (deskUi.ask && e.key === 'Escape') { e.stopPropagation(); close(); } }
</script>

<svelte:window onkeydown={onKey} />

{#if deskUi.ask}
  <div class="rd" role="dialog" aria-label={t('desk.size')} data-testid="desk-run-options">
    <h4>{t('desk.size')}</h4>
    <p>{t('desk.designHint')}</p>
    <fieldset data-testid="desk-run-scope">
      <legend>{t('desk.scope')}</legend>
      {#each SCOPES as s (s)}
        {@const n = count(s)}
        <label><input type="radio" bind:group={scope} value={s} disabled={n === 0} data-testid="desk-run-scope-{s}" />
          {n === null ? t(`desk.runScope.${s}`) : tp(`desk.runScope.${s}`, { n })}</label>
      {/each}
    </fieldset>
    {#if scope === 'all'}
      <!-- The families of the whole run: the same selection the member list shows. -->
      <fieldset data-testid="desk-run-families">
        <legend>{t('desk.runFamilies')}</legend>
        {#each DESIGN_FAMILIES as f (f)}
          <label><input type="checkbox" checked={designRunStore.familySelection.includes(f)}
            onchange={(e) => designRunStore.setFamilySelection(e.currentTarget.checked ? [...designRunStore.familySelection, f] : designRunStore.familySelection.filter((x) => x !== f))}
            data-testid="desk-run-family-{f}" /> {t(`design.families.${f}`)}</label>
        {/each}
        <!-- What will run, in words, before it runs: an unticked family is a choice said aloud. -->
        <p class="rd-scope" data-testid="cmd-design-scope">{scopeText}</p>
      </fieldset>
    {/if}
    {#if editedInScope > 0}
      <fieldset data-testid="desk-run-edited">
        <legend>{tp('desk.editedQuestion', { n: editedInScope })}</legend>
        <label><input type="radio" bind:group={edited} value="keep" onchange={() => (confirming = false)} data-testid="desk-keep-edited" /> {t('desk.keepEdited')}</label>
        <label><input type="radio" bind:group={edited} value="overwrite" data-testid="desk-overwrite-edited" /> {t('desk.overwriteEdited')}</label>
      </fieldset>
    {/if}
    <label><input type="checkbox" bind:checked={steel} data-testid="desk-run-steel" /> {t('desk.withSteel')}</label>
    {#if confirming}
      <p class="rd-confirm" role="alert" data-testid="desk-run-confirm">{tp('desk.overwriteConfirm', { n: editedInScope })}</p>
    {/if}
    <div class="rd-actions">
      <button onclick={close} data-testid="desk-run-cancel">{t('desk.cancel')}</button>
      <button class="rd-primary" onclick={run} disabled={scope === 'all' && designRunStore.familySelection.length === 0} data-testid="desk-run">{confirming ? tp('desk.overwriteRun', { n: editedInScope }) : t('desk.run')}</button>
    </div>
  </div>
{/if}

<style>
  .rd { position: fixed; z-index: 905; top: 110px; left: 50%; transform: translateX(-50%); width: min(28rem, 92vw); max-height: calc(100vh - 130px); overflow: auto; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 6px; padding: 12px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25); display: flex; flex-direction: column; gap: 8px; font-size: 0.74rem; box-sizing: border-box; }
  .rd h4 { margin: 0; }
  .rd p { margin: 0; color: var(--st-text-2); }
  .rd fieldset { border: 1px solid var(--st-hair); border-radius: 4px; display: flex; flex-direction: column; gap: 4px; }
  .rd .rd-confirm { color: var(--st-warn); }
  .rd .rd-scope { font-size: 0.7rem; }
  .rd-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .rd-actions button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; }
  .rd-actions .rd-primary { border-color: var(--st-accent); background: var(--st-accent); color: var(--st-on-accent, #fff); }
  .rd-actions button:disabled { opacity: 0.5; cursor: default; }
  @media (max-height: 600px) { .rd { top: 40px; max-height: calc(100vh - 56px); } }
</style>
