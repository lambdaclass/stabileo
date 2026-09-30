<script lang="ts">
  /**
   * The project's deflection limits: rules by kind, group or chosen members, each with L/n and the
   * direction it reads (`engine/deflection-limits.ts`). Without a rule a beam is checked at L/360
   * on the resultant. A cantilever is found from the model and read over 2L.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import type { DeflectionRule, DeflectionScope, DeflectionDirection } from '../../lib/engine/deflection-limits';

  const rules = $derived(modelStore.deflectionLimits?.rules ?? []);
  const groups = $derived([...modelStore.model.groups.values()].sort((a, b) => a.id - b.id));
  const DIRS: DeflectionDirection[] = ['resultant', 'localY', 'localZ'];
  const PRESETS = [240, 360, 480];

  function write(next: DeflectionRule[]) { modelStore.setDeflectionLimits(next.length ? { rules: next } : null); }
  function add() {
    const id = rules.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const sel = [...uiStore.selectedElements];
    const scope: DeflectionScope = sel.length > 0 ? { kind: 'members', ids: sel } : { kind: 'memberKind', value: 'beam' };
    write([...rules, { id, scope, n: 360, direction: 'resultant' }]);
  }
  function update(id: number, patch: Partial<DeflectionRule>) { write(rules.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  function setScopeKind(r: DeflectionRule, kind: DeflectionScope['kind']) {
    const scope: DeflectionScope = kind === 'memberKind' ? { kind, value: 'beam' }
      : kind === 'group' ? { kind, groupId: groups[0]?.id ?? 0 }
      : { kind, ids: [...uiStore.selectedElements] };
    update(r.id, { scope });
  }
</script>

<details class="dl pk-card" data-testid="defl-limits">
  <summary>{t('defl.limits.title')}: <strong>{rules.length ? tp('defl.limits.nRules', { n: rules.length }) : t('defl.limits.default')}</strong></summary>
  {#each rules as r (r.id)}
    <div class="dl-row" data-testid="defl-rule">
      <select value={r.scope.kind} onchange={(e) => setScopeKind(r, e.currentTarget.value as DeflectionScope['kind'])} aria-label={t('defl.limits.scope')}>
        <option value="memberKind">{t('defl.limits.byKind')}</option>
        <option value="group" disabled={groups.length === 0}>{t('defl.limits.byGroup')}</option>
        <option value="members">{t('defl.limits.byMembers')}</option>
      </select>
      {#if r.scope.kind === 'memberKind'}
        <select value={r.scope.value} onchange={(e) => update(r.id, { scope: { kind: 'memberKind', value: e.currentTarget.value as 'beam' | 'column' } })} aria-label={t('defl.limits.byKind')}>
          <option value="beam">{t('defl.limits.beams')}</option>
          <option value="column">{t('defl.limits.columns')}</option>
        </select>
      {:else if r.scope.kind === 'group'}
        <select value={r.scope.groupId} onchange={(e) => update(r.id, { scope: { kind: 'group', groupId: Number(e.currentTarget.value) } })} aria-label={t('defl.limits.byGroup')}>
          {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
      {:else}
        <button class="pk-btn" onclick={() => update(r.id, { scope: { kind: 'members', ids: [...uiStore.selectedElements] } })} title={t('defl.limits.takeSelection')}>
          {tp('defl.limits.nMembers', { n: r.scope.ids.length })}
        </button>
      {/if}
      <label>L/<input type="number" min="10" step="10" value={r.n} list="defl-presets" onchange={(e) => update(r.id, { n: Math.max(1, Number(e.currentTarget.value)) })} data-testid="defl-rule-n" /></label>
      <select value={r.direction} onchange={(e) => update(r.id, { direction: e.currentTarget.value as DeflectionDirection })} aria-label={t('defl.limits.direction')} data-testid="defl-rule-dir">
        {#each DIRS as d (d)}<option value={d}>{t(`defl.limits.dir.${d}`)}</option>{/each}
      </select>
      <button class="pk-btn pk-btn-icon" onclick={() => write(rules.filter((x) => x.id !== r.id))} aria-label={t('defl.limits.remove')}>×</button>
    </div>
  {/each}
  <datalist id="defl-presets">{#each PRESETS as n (n)}<option value={n}></option>{/each}</datalist>
  <button class="pk-btn" onclick={add} data-testid="defl-rule-add">+ {t('defl.limits.add')}</button>
  <p class="pk-hint">{t('defl.limits.hint')}</p>
</details>

<style>
  .dl { margin: 4px 0 6px; font-size: 0.64rem; }
  .dl summary { cursor: pointer; color: var(--st-text); }
  .dl-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
  .dl-row input[type='number'] { width: 56px; }
  .dl :global(.pk-btn) { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
</style>
