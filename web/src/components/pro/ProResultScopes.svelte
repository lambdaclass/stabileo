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
  <details class="rs pk-card" data-testid="result-scopes">
    <summary>
      {t('scopes.title')}:
      <strong>{active ? tp('scopes.summarySome', { n: nActive, total: combos.length }) : tp('scopes.summaryAll', { n: combos.length })}</strong>
      {#if envelopes.length > 0} · {tp('scopes.nEnvelopes', { n: envelopes.length })}{/if}
    </summary>

    <div class="rs-mode">
      <label><input type="radio" name="rs-mode" checked={!active} onchange={() => setAll(true)} data-testid="rs-all" /> {t('scopes.all')}</label>
      <label><input type="radio" name="rs-mode" checked={!!active} onchange={() => setAll(false)} data-testid="rs-chosen" /> {t('scopes.chosen')}</label>
      {#if active}
        <button class="pk-btn" onclick={() => markActive(true)}>{t('scopes.markAll')}</button>
        <button class="pk-btn" onclick={() => markActive(false)}>{t('scopes.markNone')}</button>
      {/if}
    </div>
    {#if active}
      <ul class="rs-list" data-testid="rs-active-list">
        {#each combos as c (c.id)}
          <li><label><input type="checkbox" checked={active.has(c.id)} onchange={() => toggleActive(c.id)} /> {c.name}</label></li>
        {/each}
      </ul>
      {#if nActive === 0}<p class="pk-warn" role="alert">{t('scopes.noneActive')}</p>{/if}
    {/if}
    <p class="pk-hint">{t('scopes.hint')}</p>

    <h4 class="pk-heading rs-sub">{t('scopes.envelopes')}</h4>
    {#if resultsStore.viewedEnvelopeName}
      <p class="rs-onscreen" data-testid="rs-onscreen">
        {tp('scopes.onScreen', { name: resultsStore.viewedEnvelopeName })}
        <button class="pk-btn" onclick={backToActive}>{t('scopes.backToActive')}</button>
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
        <button class="pk-btn" class:on={editing === env.id} onclick={() => (editing = editing === env.id ? null : env.id)}>
          {tp('scopes.nCombos', { n: env.comboIds.length })}
        </button>
        <button class="pk-btn" disabled={!solved || env.comboIds.length === 0} onclick={() => show(env)} title={solved ? '' : t('scopes.solveFirst')} data-testid="rs-show">{t('scopes.show')}</button>
        <button class="pk-btn pk-btn-icon" onclick={() => removeEnvelope(env.id)} aria-label={t('scopes.remove')}>×</button>
      </div>
      {#if editing === env.id}
        <ul class="rs-list">
          {#each combos as c (c.id)}
            <li><label><input type="checkbox" checked={env.comboIds.includes(c.id)} onchange={() => toggleEnvelopeCombo(env, c.id)} /> {c.name}</label></li>
          {/each}
        </ul>
      {/if}
    {/each}
    <button class="pk-btn" onclick={addEnvelope} data-testid="rs-add-envelope">+ {t('scopes.addEnvelope')}</button>
    <p class="pk-hint">{t('scopes.serviceHint')}</p>
  </details>
{/if}

<style>
  .rs { margin: 6px 0; }
  .rs summary { cursor: pointer; color: var(--st-text); font-size: 0.7rem; }
  .rs[open] summary { margin-bottom: 4px; }
  .rs-sub { margin-top: 6px; }
  .rs-mode { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .rs-list { list-style: none; margin: 0; padding: 0 0 0 4px; max-height: 160px; overflow-y: auto; columns: 2; font-size: 0.66rem; }
  .rs-list li { break-inside: avoid; }
  .rs-onscreen { margin: 0; color: var(--st-accent); font-size: 0.66rem; }
  .rs-env { display: flex; gap: 4px; align-items: center; }
  .rs-name { flex: 1; min-width: 0; }
  .rs :global(.pk-btn) { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.64rem; }
</style>
