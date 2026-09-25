<script lang="ts">
  /**
   * The project's own combination rules: written in load symbols, saved with the project, and
   * expanded onto the load cases by the same generator as the regulation's
   * (`engine/loads/combination-rules.ts`). A set can start from CIRSOC 101 and travel between
   * projects as a template file.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { downloadText } from '../../lib/store/file';
  import { generateCombinations } from '../../lib/codes/cirsoc101/combinations';
  import { generateServiceCombinations } from '../../lib/codes/cirsoc101/service-combinations';
  import { presentSymbols } from '../../lib/engine/loads/combination-cases';
  import {
    RULE_SYMBOLS, ruleLabel, rulesFromTemplate, rulesToTemplate, specToRule, type CombinationRule,
  } from '../../lib/engine/loads/combination-rules';
  import type { LoadSymbol } from '../../lib/codes/cirsoc101/combinations';

  interface Props { onGenerate: () => void }
  let { onGenerate }: Props = $props();

  const rules = $derived(modelStore.combinationRules);
  let fileInput = $state<HTMLInputElement | null>(null);

  const nextId = () => `r${rules.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 0) + 1}`;
  const factorOf = (r: CombinationRule, s: LoadSymbol) => r.terms.find((x) => x.symbol === s)?.factor ?? 0;

  function write(next: CombinationRule[]) { modelStore.setCombinationRules(next); }

  function add() {
    write([...rules, { id: nextId(), purpose: 'strength', terms: [{ symbol: 'D', factor: 1.2 }] }]);
  }

  function setFactor(id: string, s: LoadSymbol, raw: string) {
    const f = raw.trim() === '' ? 0 : Number(raw.replace(',', '.'));
    if (!Number.isFinite(f)) return;
    write(rules.map((r) => r.id !== id ? r : {
      ...r, terms: [...r.terms.filter((x) => x.symbol !== s), ...(f !== 0 ? [{ symbol: s, factor: f }] : [])]
        .sort((a, b) => RULE_SYMBOLS.indexOf(a.symbol) - RULE_SYMBOLS.indexOf(b.symbol)),
    }));
  }

  function setPurpose(id: string, purpose: CombinationRule['purpose']) {
    write(rules.map((r) => (r.id === id ? { ...r, purpose } : r)));
  }

  function remove(id: string) { write(rules.filter((r) => r.id !== id)); }

  /** Start from CIRSOC 101, strength and service, for the loads the model has. */
  function seed() {
    const present = presentSymbols(modelStore.model.loadCases);
    const specs = [...generateCombinations({ present }), ...generateServiceCombinations({ present })];
    let n = rules.length;
    write([...rules, ...specs.map((s) => specToRule(s, `r${++n}`))]);
  }

  function exportTemplate() {
    downloadText(rulesToTemplate(rules, modelStore.model.name ?? ''), 'combination-rules.json', 'application/json');
  }

  async function importTemplate(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!f) return;
    const parsed = rulesFromTemplate(await f.text());
    if (!parsed || parsed.rules.length === 0) { uiStore.toast(t('combos.rules.importFailed'), 'error'); return; }
    let n = rules.length;
    write([...rules, ...parsed.rules.map((r) => ({ ...r, id: `r${++n}` }))]);
    uiStore.toast(tp('combos.rules.imported', { n: parsed.rules.length }), 'success');
  }
</script>

<details class="cr" data-testid="combo-rules">
  <summary>{tp('combos.rules.title', { n: rules.length })}</summary>
  <p class="cr-hint">{t('combos.rules.hint')}</p>
  {#if rules.length > 0}
    <div class="cr-wrap">
      <table class="cr-table">
        <thead>
          <tr><th>{t('combos.rules.purpose')}</th>{#each RULE_SYMBOLS as s (s)}<th>{s}</th>{/each}<th></th></tr>
        </thead>
        <tbody>
          {#each rules as r (r.id)}
            <tr data-testid="combo-rule-{r.id}">
              <td>
                <select value={r.purpose} onchange={(e) => setPurpose(r.id, e.currentTarget.value as CombinationRule['purpose'])}>
                  <option value="strength">{t('combos.rules.strength')}</option>
                  <option value="service">{t('combos.rules.service')}</option>
                </select>
              </td>
              {#each RULE_SYMBOLS as s (s)}
                <td><input class="cr-f" inputmode="decimal" value={factorOf(r, s) || ''}
                  onchange={(e) => setFactor(r.id, s, e.currentTarget.value)} aria-label={`${s} · ${ruleLabel(r)}`}
                  data-testid="combo-rule-{r.id}-{s}" /></td>
              {/each}
              <td><button class="cr-x" onclick={() => remove(r.id)} aria-label={t('combos.rules.remove')}>×</button></td>
            </tr>
            <tr class="cr-label"><td colspan={RULE_SYMBOLS.length + 2}>{ruleLabel(r)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <div class="cr-row">
    <button class="pro-btn" onclick={add} data-testid="combo-rule-add">{t('combos.rules.add')}</button>
    <button class="pro-btn" onclick={seed} data-testid="combo-rule-seed">{t('combos.rules.seed')}</button>
    <button class="pro-btn pro-btn-accent" disabled={rules.length === 0} onclick={onGenerate} data-testid="combo-rule-generate">{t('combos.rules.generate')}</button>
    <button class="pro-btn" disabled={rules.length === 0} onclick={exportTemplate} data-testid="combo-rule-export">{t('combos.rules.export')}</button>
    <button class="pro-btn" onclick={() => fileInput?.click()} data-testid="combo-rule-import">{t('combos.rules.import')}</button>
    <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={importTemplate} data-testid="combo-rule-file" />
  </div>
</details>

<style>
  .cr { margin: 6px 0; font-size: 0.66rem; color: var(--st-text-2); }
  .cr summary { cursor: pointer; }
  .cr-hint { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
  .cr-wrap { overflow-x: auto; }
  .cr-table { border-collapse: collapse; }
  .cr-table th { font-weight: 500; padding: 2px 3px; color: var(--st-text-3); }
  .cr-table td { padding: 1px 2px; }
  .cr-f { width: 34px; font-family: monospace; font-size: 0.62rem; text-align: right; }
  .cr-label td { font-family: monospace; font-size: 0.6rem; color: var(--st-text-3); padding-bottom: 4px; border-bottom: 1px solid var(--st-hair); }
  .cr-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .cr-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
</style>
