<script lang="ts">
  /**
   * The project's own response spectra (`engine/spectral-case.ts` `UserSpectrum`): a table of Sa or
   * Sd against period, pasted or typed one row per line, read linearly or on log axes. Kept with the
   * project (`model.dynamics.spectra`), used by the spectral analysis and by spectral load cases.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { parseSpectrumTable, userSa, G, type UserSpectrum } from '../../../lib/engine/spectral-case';

  const spectra = $derived(modelStore.model.dynamics?.spectra ?? []);
  let editing = $state<number | null>(null);
  let text = $state('');
  let error = $state<string | null>(null);

  const save = (list: UserSpectrum[]) => modelStore.setDynamics({ ...modelStore.model.dynamics, spectra: list });

  function add() {
    // A number never given before (`addUserSpectrum`): a case on a deleted spectrum does not take this one.
    const id = modelStore.addUserSpectrum((id) => ({ id, name: tp('userSpectrum.defaultName', { n: id }), ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 0.4], [0.5, 1], [1, 0.5], [3, 0.17]] }));
    open(id);
  }
  function open(id: number) {
    const s = spectra.find((x) => x.id === id);
    editing = id; error = null;
    text = s ? s.points.map(([a, b]) => `${a}; ${b}`).join('\n') : '';
  }
  function update(id: number, patch: Partial<UserSpectrum>) {
    save(spectra.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function apply(id: number) {
    // Refused with the reason: too few rows, a negative value, a period twice (`parseSpectrumTable`).
    const p = parseSpectrumTable(text);
    if ('error' in p) { error = t(p.error === 'negative' ? 'userSpectrum.negative' : p.error === 'duplicate' ? 'userSpectrum.duplicate' : 'userSpectrum.badTable'); return; }
    error = null;
    update(id, { points: p.points });
  }
  function remove(id: number) {
    // Not while a spectral case is on it: the case would have no spectrum, and say so only at the solve.
    if (!modelStore.removeUserSpectrum(id)) {
      uiStore.toast(tp('userSpectrum.inUse', { cases: modelStore.casesOnSpectrum(id).map((c) => c.name).join(', ') }), 'error');
      return;
    }
    if (editing === id) editing = null;
  }

  // ── A small plot of Sa against T ──
  const W = 240, H = 90;
  function path(s: UserSpectrum): string {
    const tMax = Math.max(...s.points.map(([p]) => p), 1);
    const pts = Array.from({ length: 60 }, (_, i) => (i + 0.5) * tMax / 60).map((p) => [p, userSa(s, p) / G] as const);
    const sMax = Math.max(...pts.map(([, v]) => v), 1e-6);
    return pts.map(([p, v], i) => `${i ? 'L' : 'M'}${(6 + (W - 12) * p / tMax).toFixed(1)},${(H - 6 - (H - 12) * v / sMax).toFixed(1)}`).join(' ');
  }
</script>

<div class="us" data-testid="user-spectra">
  <div class="us-head">
    <span class="us-title">{t('userSpectrum.title')}</span>
    <button class="pk-btn" onclick={add} data-testid="us-add">+ {t('userSpectrum.add')}</button>
  </div>
  {#each spectra as s (s.id)}
    <div class="us-row">
      <input type="text" class="us-name" value={s.name} onchange={(e) => update(s.id, { name: e.currentTarget.value })} aria-label={t('userSpectrum.name')} />
      <button class="pk-btn" onclick={() => (editing === s.id ? (editing = null) : open(s.id))} data-testid="us-edit-{s.id}">{t('userSpectrum.edit')}</button>
      <button class="us-x" onclick={() => remove(s.id)} aria-label={t('loadTables.delete')}>×</button>
    </div>
    {#if editing === s.id}
      <div class="us-edit">
        <div class="us-row">
          <select value={s.ordinate} onchange={(e) => update(s.id, { ordinate: e.currentTarget.value as 'Sa', unit: e.currentTarget.value === 'Sd' ? 'm' : 'g' })} data-testid="us-ordinate">
            <option value="Sa">Sa</option><option value="Sd">Sd</option>
          </select>
          {#if s.ordinate === 'Sa'}
            <select value={s.unit} onchange={(e) => update(s.id, { unit: e.currentTarget.value as 'g' })}>
              <option value="g">g</option><option value="m/s2">m/s²</option>
            </select>
          {:else}<span>m</span>{/if}
          <select value={s.interpolation} onchange={(e) => update(s.id, { interpolation: e.currentTarget.value as 'linear' })} data-testid="us-interp">
            <option value="linear">{t('userSpectrum.linear')}</option><option value="log">{t('userSpectrum.log')}</option>
          </select>
        </div>
        <textarea rows="6" bind:value={text} placeholder={t('spectra.userTablePlaceholder')} data-testid="us-table"></textarea>
        <div class="us-row">
          <button class="pk-btn" onclick={() => apply(s.id)} data-testid="us-apply">{t('userSpectrum.apply')}</button>
          {#if error}<span class="us-err" role="alert">{error}</span>{/if}
        </div>
        <p class="us-hint">{t('userSpectrum.hint')}</p>
        <svg viewBox="0 0 {W} {H}" class="us-plot" role="img" aria-label={s.name}><path d={path(s)} class="us-line" /></svg>
      </div>
    {/if}
  {/each}
</div>

<style>
  .us { display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--st-text-2); }
  .us-head { display: flex; align-items: center; gap: 8px; }
  .us-title { font-weight: 600; color: var(--st-text); }
  .us-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .us-name { width: 150px; }
  .us-edit { display: flex; flex-direction: column; gap: 4px; padding: 4px 0 6px 10px; }
  .us-edit textarea { width: 100%; font-family: var(--st-mono); font-size: 0.68rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 3px; }
  .us-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); }
  .us-err { color: var(--st-danger); }
  .us-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .us-plot { width: 100%; max-width: 260px; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .us-line { fill: none; stroke: var(--st-accent); stroke-width: 1.5; }
</style>
