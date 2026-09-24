<script lang="ts">
  /**
   * Which combinations design reads, and named envelopes over them.
   *
   * Both are project definitions (`engine/result-scopes.ts`): stating them is an edit, so it is
   * undoable and it retires the results on hand, exactly like editing a combination. Showing a
   * named envelope is not an edit: it only changes what the viewport draws, and design keeps
   * reading the active list's envelope.
   */
  import { modelStore, resultsStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { envelopeOver, type NamedEnvelope, type EnvelopePurpose, type ResultScopes } from '../../lib/engine/result-scopes';

  const PURPOSES: EnvelopePurpose[] = ['strength', 'service', 'other'];

  const combos = $derived(modelStore.combinations);
  const scopes = $derived<ResultScopes>(modelStore.resultScopes ?? {});
  const active = $derived(scopes.active ? new Set(scopes.active) : null);
  const envelopes = $derived(scopes.envelopes ?? []);
  const nActive = $derived(active ? combos.filter((c) => active.has(c.id)).length : combos.length);
  /** The envelope whose combinations are being picked. */
  let editing = $state<number | null>(null);
  const solved = $derived(resultsStore.perCombo3D.size > 0);

  function write(next: ResultScopes) {
    const clean: ResultScopes = {
      ...(next.active ? { active: next.active } : {}),
      ...(next.envelopes && next.envelopes.length > 0 ? { envelopes: next.envelopes } : {}),
    };
    modelStore.setResultScopes(clean.active || clean.envelopes ? clean : null);
  }

  function setAll(all: boolean) {
    write({ ...scopes, active: all ? undefined : combos.map((c) => c.id) });
  }

  function toggleActive(id: number) {
    const cur = active ? [...active] : combos.map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    // Keep the model's order, so the list reads like the combination table.
    write({ ...scopes, active: combos.map((c) => c.id).filter((x) => next.includes(x)) });
  }

  function markActive(all: boolean) {
    write({ ...scopes, active: all ? combos.map((c) => c.id) : [] });
  }

  function addEnvelope() {
    const id = envelopes.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    const env: NamedEnvelope = {
      id, name: tp('scopes.newName', { n: id }), purpose: 'strength',
      comboIds: active ? combos.map((c) => c.id).filter((x) => active.has(x)) : combos.map((c) => c.id),
    };
    write({ ...scopes, envelopes: [...envelopes, env] });
    editing = id;
  }

  function updateEnvelope(id: number, patch: Partial<NamedEnvelope>) {
    write({ ...scopes, envelopes: envelopes.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function removeEnvelope(id: number) {
    if (editing === id) editing = null;
    write({ ...scopes, envelopes: envelopes.filter((e) => e.id !== id) });
  }

  function toggleEnvelopeCombo(env: NamedEnvelope, id: number) {
    const has = env.comboIds.includes(id);
    const next = has ? env.comboIds.filter((x) => x !== id) : [...env.comboIds, id];
    updateEnvelope(env.id, { comboIds: combos.map((c) => c.id).filter((x) => next.includes(x)) });
  }

  function show(env: NamedEnvelope) {
    const e = envelopeOver(resultsStore.perCombo3D, env.comboIds);
    if (!e) return;
    resultsStore.viewEnvelope3D(e, env.name);
    resultsStore.activeView = 'envelope';
  }

  function backToActive() {
    resultsStore.viewEnvelope3D(null);
  }
</script>

{#if combos.length > 0}
  <details class="rs" data-testid="result-scopes">
    <summary>
      {t('scopes.title')}:
      <strong>{active ? tp('scopes.summarySome', { n: nActive, total: combos.length }) : tp('scopes.summaryAll', { n: combos.length })}</strong>
      {#if envelopes.length > 0} · {tp('scopes.nEnvelopes', { n: envelopes.length })}{/if}
    </summary>

    <div class="rs-mode">
      <label><input type="radio" name="rs-mode" checked={!active} onchange={() => setAll(true)} data-testid="rs-all" /> {t('scopes.all')}</label>
      <label><input type="radio" name="rs-mode" checked={!!active} onchange={() => setAll(false)} data-testid="rs-chosen" /> {t('scopes.chosen')}</label>
      {#if active}
        <button onclick={() => markActive(true)}>{t('scopes.markAll')}</button>
        <button onclick={() => markActive(false)}>{t('scopes.markNone')}</button>
      {/if}
    </div>
    {#if active}
      <ul class="rs-list" data-testid="rs-active-list">
        {#each combos as c (c.id)}
          <li><label><input type="checkbox" checked={active.has(c.id)} onchange={() => toggleActive(c.id)} /> {c.name}</label></li>
        {/each}
      </ul>
      {#if nActive === 0}<p class="rs-warn" role="alert">{t('scopes.noneActive')}</p>{/if}
    {/if}
    <p class="rs-hint">{t('scopes.hint')}</p>

    <h4>{t('scopes.envelopes')}</h4>
    {#if resultsStore.viewedEnvelopeName}
      <p class="rs-onscreen" data-testid="rs-onscreen">
        {tp('scopes.onScreen', { name: resultsStore.viewedEnvelopeName })}
        <button onclick={backToActive}>{t('scopes.backToActive')}</button>
      </p>
    {/if}
    {#each envelopes as env (env.id)}
      <div class="rs-env" data-testid="rs-envelope">
        <input
          class="rs-name" value={env.name} aria-label={t('scopes.name')}
          onchange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== env.name) updateEnvelope(env.id, { name: v }); }}
        />
        <select value={env.purpose} onchange={(e) => updateEnvelope(env.id, { purpose: (e.target as HTMLSelectElement).value as EnvelopePurpose })} aria-label={t('scopes.purpose')}>
          {#each PURPOSES as p (p)}<option value={p}>{t(`scopes.purpose.${p}`)}</option>{/each}
        </select>
        <button class:on={editing === env.id} onclick={() => (editing = editing === env.id ? null : env.id)}>
          {tp('scopes.nCombos', { n: env.comboIds.length })}
        </button>
        <button disabled={!solved || env.comboIds.length === 0} onclick={() => show(env)} title={solved ? '' : t('scopes.solveFirst')} data-testid="rs-show">{t('scopes.show')}</button>
        <button class="rs-x" onclick={() => removeEnvelope(env.id)} aria-label={t('scopes.remove')}>×</button>
      </div>
      {#if editing === env.id}
        <ul class="rs-list">
          {#each combos as c (c.id)}
            <li><label><input type="checkbox" checked={env.comboIds.includes(c.id)} onchange={() => toggleEnvelopeCombo(env, c.id)} /> {c.name}</label></li>
          {/each}
        </ul>
      {/if}
    {/each}
    <button onclick={addEnvelope} data-testid="rs-add-envelope">+ {t('scopes.addEnvelope')}</button>
    <p class="rs-hint">{t('scopes.serviceHint')}</p>
  </details>
{/if}

<style>
  .rs { font-size: 0.68rem; color: var(--st-text-2); margin: 4px 0; }
  .rs summary { cursor: pointer; color: var(--st-text); }
  .rs h4 { margin: 8px 0 4px; font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .rs-mode { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
  .rs-list { list-style: none; margin: 2px 0 4px; padding: 0 0 0 4px; max-height: 160px; overflow-y: auto; columns: 2; }
  .rs-list li { break-inside: avoid; }
  .rs-hint { margin: 2px 0; color: var(--st-text-3); font-size: 0.62rem; }
  .rs-warn { margin: 2px 0; color: var(--st-danger); font-size: 0.64rem; }
  .rs-onscreen { margin: 2px 0 4px; color: var(--st-accent); }
  .rs-env { display: flex; gap: 4px; align-items: center; margin: 2px 0; }
  .rs-name { flex: 1; min-width: 0; }
  input.rs-name, select {
    font-size: 0.64rem; padding: 1px 4px; color: var(--st-text); background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong); border-radius: 3px;
  }
  button {
    padding: 1px 6px; font-size: 0.62rem; color: var(--st-text); background: var(--st-surface-3);
    border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer;
  }
  button.on { border-color: var(--st-accent); }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .rs-x { padding: 0 5px; }
</style>
