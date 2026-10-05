<script lang="ts">
  /**
   * The model's combinations, one row each, and the ways to make more.
   *
   * Closed, a row is what the combination adds up (`1.2 D + 1.6 L`), read from its factors so an
   * edited factor shows at once (`engine/loads/combination-definition.ts`); open, its name and a
   * factor per case. Twelve combinations used to be twelve full tables stacked, and finding one
   * meant scrolling through all of them.
   *
   * Generating goes through the review dialog the Loads tab owns (`ongenerate`). The project's
   * own rules are edited in the regulation dialog, beside the regulation's combinations, and
   * used from here over the cases already in the model.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { combinationDefinition } from '../../lib/engine/loads/combination-definition';

  type Template = 'lrfd' | 'service' | 'project';
  interface Props {
    ongenerate: (template: Template) => void;
    /** Open the regulation dialog on its combinations tab. */
    oneditrules: () => void;
  }
  let { ongenerate, oneditrules }: Props = $props();

  const loadCases = $derived(modelStore.model.loadCases);
  const combinations = $derived(modelStore.model.combinations);
  const rules = $derived(modelStore.combinationRules);
  const legacySelfWeight = $derived(modelStore.analysis?.selfWeight === undefined && uiStore.includeSelfWeight);

  let open = $state<Set<number>>(new Set());
  function toggle(id: number) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    open = next;
  }

  /** "U3" of "U3: 1.2 D + 1.6 L": the generated name's number, which tells the set apart. */
  const tagOf = (name: string) => /^([A-Z]\d+):/.exec(name)?.[1] ?? null;

  function setFactor(comboId: number, caseId: number, raw: string) {
    const f = Number(raw.replace(',', '.'));
    if (!Number.isFinite(f)) return;
    const combo = combinations.find((c) => c.id === comboId);
    if (!combo) return;
    const has = combo.factors.some((x) => x.caseId === caseId);
    const factors = has
      ? combo.factors.map((x) => (x.caseId === caseId ? { ...x, factor: f } : x))
      : [...combo.factors, { caseId, factor: f }];
    modelStore.updateCombination(comboId, { factors });
  }

  function addCombination() {
    const taken = new Set(combinations.map((c) => c.name));
    let n = combinations.length + 1;
    while (taken.has(`C${n}`)) n++;
    // Every case at zero: a new combination names what it takes, and a case left at 1 by default
    // went into it unnoticed.
    const id = modelStore.addCombination(`C${n}`, loadCases.map((lc) => ({ caseId: lc.id, factor: 0 })));
    open = new Set([...open, id]);
  }

  /** Dead-load factor of a combination, for the older self-weight switch that rides on D. */
  function deadFactor(factors: ReadonlyArray<{ caseId: number; factor: number }>) {
    const dead = loadCases.find((c) => c.type === 'D');
    return dead ? (factors.find((f) => f.caseId === dead.id)?.factor ?? 0) : 0;
  }
</script>

<div class="cb" data-testid="combo-list">
  {#if combinations.length === 0}
    <p class="pk-hint cb-empty">{t('combos.empty')}</p>
  {/if}
  {#each combinations as combo (combo.id)}
    {@const isOpen = open.has(combo.id)}
    {@const tag = tagOf(combo.name)}
    <div class="cb-row" class:open={isOpen} data-testid="combo-row">
      <div class="cb-head">
        <button type="button" class="cb-toggle" aria-expanded={isOpen} onclick={() => toggle(combo.id)} title={combo.name} data-testid="combo-toggle">
          <span class="cb-chev" aria-hidden="true">▸</span>
          {#if tag}<span class="cb-tag">{tag}</span>{/if}
          {#if combo.method === 'srss' || combo.method === 'abs'}<span class="cb-tag" data-testid="combo-method-tag">{combo.method.toUpperCase()}</span>{/if}
          <span class="cb-def" data-testid="combo-definition">{combinationDefinition(combo.factors, loadCases)}</span>
        </button>
        <button class="cb-x" onclick={() => modelStore.removeCombination(combo.id)} aria-label={t('combos.remove')} title={t('combos.remove')}>×</button>
      </div>
      {#if isOpen}
        <div class="cb-body">
          <label class="cb-name"><span class="pk-label">{t('pro.lcName')}</span>
            <input type="text" value={combo.name} onchange={(e) => modelStore.updateCombination(combo.id, { name: e.currentTarget.value })} data-testid="combo-name" />
          </label>
          <!-- How the factored cases add: linear, or as magnitudes (`combination-methods.ts`). -->
          <label class="cb-name"><span class="pk-label">{t('combos.method')}</span>
            <select value={combo.method ?? 'linear'} onchange={(e) => modelStore.updateCombination(combo.id, { method: e.currentTarget.value as 'linear' | 'srss' | 'abs' })} data-testid="combo-method">
              <option value="linear">{t('combos.method.linear')}</option>
              <option value="srss">{t('combos.method.srss')}</option>
              <option value="abs">{t('combos.method.abs')}</option>
            </select>
          </label>
          {#if combo.method === 'srss' || combo.method === 'abs'}<p class="cb-hint">{t('combos.method.hint')}</p>{/if}
          <table class="cb-factors">
            <tbody>
              {#if legacySelfWeight}
                <tr class="cb-sw">
                  <td class="cb-f"><span class="cb-f-fixed">{deadFactor(combo.factors)}</span></td>
                  <td class="cb-mult">×</td>
                  <td>D · {t('pro.selfWeight')}</td>
                </tr>
              {/if}
              {#each loadCases as lc (lc.id)}
                <tr>
                  <td class="cb-f"><input inputmode="decimal" value={combo.factors.find((f) => f.caseId === lc.id)?.factor ?? 0}
                    onchange={(e) => setFactor(combo.id, lc.id, e.currentTarget.value)} aria-label={`${lc.name} · ${combo.name}`} data-testid="combo-factor-{lc.id}" /></td>
                  <td class="cb-mult">×</td>
                  <td><span class="cb-sym">{lc.type || '—'}</span> {lc.name}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/each}
  <div class="pk-row">
    <button class="pk-btn" onclick={addCombination} disabled={loadCases.length === 0} data-testid="combo-add">+ {t('combos.add')}</button>
  </div>

  <section class="pk-card cb-gen" data-testid="combo-generate">
    <h4 class="pk-heading">{t('combos.generateTitle')}</h4>
    <p class="pk-hint">{t('combos.generateHint')}</p>
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={() => ongenerate('lrfd')} title={t('pro.generateLRFDHint')} data-testid="combo-gen-strength">{t('combos.genStrength')}</button>
      <button class="pk-btn" onclick={() => ongenerate('service')} title={t('pro.generateServiceHint')} data-testid="combo-gen-service">{t('combos.genService')}</button>
      <button class="pk-btn" onclick={() => ongenerate('project')} disabled={rules.length === 0} data-testid="combo-rule-generate">{tp('combos.genRules', { n: rules.length })}</button>
    </div>
    <button class="cb-link" onclick={oneditrules} data-testid="combo-rules-edit">{t('combos.editRules')}</button>
  </section>
</div>

<style>
  .cb { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; font-size: 0.72rem; color: var(--st-text-2); }
  .cb-empty { padding: 4px 0; }
  .cb-row { border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: var(--st-surface-2); }
  .cb-row.open { border-color: var(--st-hair-strong); }
  .cb-head { display: flex; align-items: center; }
  .cb-toggle {
    display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
    padding: 5px 8px; background: none; border: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .cb-toggle:hover { color: var(--st-text); }
  .cb-toggle:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: -2px; }
  .cb-chev { display: inline-block; font-size: 0.8rem; line-height: 1; color: var(--st-text-3); transition: transform 0.12s; }
  .cb-row.open .cb-chev { transform: rotate(90deg); }
  .cb-tag { font-family: var(--st-mono); font-size: 0.62rem; color: var(--st-text-3); min-width: 1.8rem; }
  .cb-def { font-family: var(--st-mono); font-size: 0.7rem; color: var(--st-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cb-x { background: none; border: none; color: var(--st-text-3); font-size: 0.95rem; cursor: pointer; padding: 0 8px; }
  .cb-x:hover { color: var(--st-danger); }
  .cb-body { display: flex; flex-direction: column; gap: 6px; padding: 4px 8px 8px 22px; border-top: 1px solid var(--st-hair); }
  .cb-name { display: flex; flex-direction: column; gap: 2px; padding-top: 4px; }
  .cb-name input { width: 100%; }
  .cb-factors { border-collapse: collapse; }
  .cb-factors td { padding: 1px 4px; font-size: 0.7rem; }
  .cb-f { width: 48px; }
  .cb-f input { width: 44px; text-align: right; font-family: var(--st-mono); }
  .cb-f-fixed { display: inline-block; width: 44px; text-align: right; font-family: var(--st-mono); color: var(--st-text-3); }
  .cb-mult { width: 12px; color: var(--st-text-3); text-align: center; }
  .cb-sym { display: inline-block; min-width: 1.4rem; font-family: var(--st-mono); color: var(--st-text-3); }
  .cb-sw { color: var(--st-text-3); }
  .cb-gen { margin-top: 8px; }
  .cb-link { align-self: flex-start; background: none; border: none; padding: 0; color: var(--st-text-2); text-decoration: underline; font: inherit; font-size: 0.68rem; cursor: pointer; }
  .cb-link:hover { color: var(--st-text); }
  .cb-hint { margin: 2px 0 4px; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
</style>
