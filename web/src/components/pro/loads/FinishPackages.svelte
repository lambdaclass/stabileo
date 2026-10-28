<script lang="ts">
  /**
   * Packages of finishes (`model/use-zones.ts FinishPackage`): each one's layers with thickness and
   * unit weight, or a load stated directly, and its total. Given to zones in the zones table, they
   * become a dead load of their own on the dead case, apart from the structure's own weight. A
   * room's name never chooses one.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { addFinishPackage, finishPackages, removeFinishPackage, setFinishPackage } from '../../../lib/store/use-zones';
  import { finishTotal, type FinishLayer, type FinishPackage } from '../../../lib/model/use-zones';

  const packages = $derived.by(() => { void modelStore.model.groups; return finishPackages(); });
  let name = $state('');
  const num = (s: string) => { const v = Number(s.trim().replace(',', '.')); return Number.isFinite(v) ? v : undefined; };
  function addLayer(id: number, pkg: FinishPackage) { setFinishPackage(id, { layers: [...pkg.layers, { name: '', thickness: 0.05, unitWeight: 20 }] }); }
  function editLayer(id: number, pkg: FinishPackage, k: number, patch: Partial<FinishLayer>) {
    setFinishPackage(id, { layers: pkg.layers.map((l, i) => (i === k ? { ...l, ...patch } : l)) });
  }
  function dropLayer(id: number, pkg: FinishPackage, k: number) { setFinishPackage(id, { layers: pkg.layers.filter((_, i) => i !== k) }); }
</script>

<details class="fp" data-testid="finish-packages">
  <summary>{tp('finishes.title', { n: packages.length })}</summary>
  <p class="fp-hint">{t('finishes.hint')}</p>
  {#each packages as g (g.id)}
    {@const pkg = (g.data as unknown as FinishPackage) ?? { layers: [] }}
    <div class="fp-pkg" data-testid="finish-package-{g.name}">
      <div class="fp-row"><strong>{g.name}</strong><span class="fp-dim">{tp('finishes.total', { q: finishTotal(pkg).toFixed(2) })}</span><button class="fp-x" onclick={() => removeFinishPackage(g.id)} title={t('finishes.remove')}>×</button></div>
      <table>
        <thead><tr><th>{t('finishes.layer')}</th><th>{t('finishes.thickness')}</th><th>{t('finishes.weight')}</th><th>{t('finishes.or')}</th><th></th></tr></thead>
        <tbody>
          {#each pkg.layers as l, k (k)}
            <tr>
              <td><input class="fp-name" value={l.name} onchange={(e) => editLayer(g.id, pkg, k, { name: e.currentTarget.value })} /></td>
              <td><input class="fp-num" value={l.thickness ?? ''} disabled={Number.isFinite(l.q)} onchange={(e) => editLayer(g.id, pkg, k, { thickness: num(e.currentTarget.value) })} /> m</td>
              <td><input class="fp-num" value={l.unitWeight ?? ''} disabled={Number.isFinite(l.q)} onchange={(e) => editLayer(g.id, pkg, k, { unitWeight: num(e.currentTarget.value) })} /> kN/m³</td>
              <td><input class="fp-num" value={l.q ?? ''} onchange={(e) => editLayer(g.id, pkg, k, { q: num(e.currentTarget.value) })} /> kN/m²</td>
              <td><button class="fp-x" onclick={() => dropLayer(g.id, pkg, k)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="pk-btn" onclick={() => addLayer(g.id, pkg)}>{t('finishes.addLayer')}</button>
    </div>
  {/each}
  <div class="fp-row">
    <input class="fp-name" placeholder={t('finishes.newName')} bind:value={name} data-testid="finish-new-name" />
    <button class="pk-btn" disabled={!name.trim()} onclick={() => { addFinishPackage(name.trim(), { layers: [{ name: t('finishes.screed'), thickness: 0.05, unitWeight: 20 }, { name: t('finishes.floor'), thickness: 0.02, unitWeight: 22 }] }); name = ''; }} data-testid="finish-add">{t('finishes.add')}</button>
  </div>
</details>

<style>
  .fp summary { cursor: pointer; font-weight: 600; color: var(--st-text); }
  .fp-hint { margin: 2px 0; font-size: 0.62rem; color: var(--st-text-3); }
  .fp-pkg { padding: 4px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); margin: 4px 0; }
  .fp-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .fp-dim { color: var(--st-text-3); }
  table { border-collapse: collapse; }
  th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  td { padding: 1px 3px; }
  .fp-name { width: 7rem; font-size: 0.62rem; }
  .fp-num { width: 3.2rem; font-size: 0.62rem; }
  .fp-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
</style>
