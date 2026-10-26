<!-- A tubular joint at a node (type, gap and eccentricity stated or found), and a timber dowel connection. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { saveEntry } from '../../../../lib/store/special-elements';

  let { kind, onsaved }: { kind: 'hss' | 'dowel'; onsaved?: (id: string) => void } = $props();
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  let note = $state('');
  const nodes = $derived([...modelStore.nodes.keys()].sort((a, b) => a - b));
  const members = $derived([...modelStore.elements.keys()].sort((a, b) => a - b));

  let h = $state<Record<string, string>>({ node: '', joint: '', gap: '', e: '' });
  function saveHss() {
    if (!h.node) { note = t('sel.ui.missing'); return; }
    const id = `hj-${Date.now().toString(36)}`;
    saveEntry('hss', { id, nodeId: Number(h.node), ...(h.joint ? { joint: h.joint as 'T' | 'Y' | 'X' | 'K' } : {}), ...(num(h.gap!) !== undefined ? { gap: num(h.gap!)! } : {}), ...(num(h.e!) !== undefined ? { e: num(h.e!)! } : {}) });
    note = ''; onsaved?.(id);
  }

  let d = $state<Record<string, string>>({ name: '', D: '', Fyb: '', lm: '', ls: '', Fem: '', Fes: '', theta: '0', shear: 'single', n: '', demand: '', member: '', cg: '' });
  function saveDowel() {
    const need = ['D', 'Fyb', 'lm', 'ls', 'Fem', 'Fes', 'n'];
    if (!d.name!.trim() || need.some((k) => !num(d[k]!)) || (!d.member && !num(d.demand!))) { note = t('sel.ui.missing'); return; }
    const id = `dw-${Date.now().toString(36)}`;
    saveEntry('dowels', { id, name: d.name!.trim(), D: num(d.D!)!, Fyb: num(d.Fyb!)!, lm: num(d.lm!)!, ls: num(d.ls!)!, Fem: num(d.Fem!)!, Fes: num(d.Fes!)!, theta: num(d.theta!) ?? 0, shear: d.shear === 'double' ? 'double' : 'single', n: Math.round(num(d.n!)!),
      ...(num(d.cg!) ? { cg: num(d.cg!)! } : {}), ...(d.member ? { from: { elementId: Number(d.member) } } : { demand: num(d.demand!)! }) });
    note = ''; onsaved?.(id);
  }
</script>

{#if kind === 'hss'}
  <div class="sf-form" data-testid="hss-form">
    <label>{t('sel.hss.node')} <select bind:value={h.node} data-testid="hss-node"><option value="">—</option>{#each nodes as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
    <label>{t('sel.hss.joint')} <select bind:value={h.joint}><option value="">{t('sel.hss.auto')}</option>{#each ['T', 'Y', 'X', 'K'] as j (j)}<option value={j}>{j}</option>{/each}</select></label>
    <label>{t('sel.hss.gap')} <input inputmode="decimal" bind:value={h.gap} /></label>
    <label>{t('sel.hss.e')} <input inputmode="decimal" bind:value={h.e} /></label>
    <button onclick={saveHss} data-testid="hss-save">{t('sfl.add')}</button>
  </div>
{:else}
  <div class="sf-form" data-testid="dowel-form">
    <label>{t('stair.ui.name')} <input bind:value={d.name} data-testid="dowel-name" /></label>
    {#each [['D', 'sel.dowel.D'], ['Fyb', 'sel.dowel.Fyb'], ['lm', 'sel.dowel.lm'], ['ls', 'sel.dowel.ls'], ['Fem', 'sel.dowel.Fem'], ['Fes', 'sel.dowel.Fes'], ['theta', 'sel.dowel.theta'], ['n', 'sel.dowel.n'], ['cg', 'sel.dowel.cg']] as [k, label] (k)}
      <label>{t(label)} <input inputmode="decimal" bind:value={d[k]} data-testid="dowel-{k}" /></label>
    {/each}
    <label>{t('sel.dowel.shear')} <select bind:value={d.shear}><option value="single">{t('sel.dowel.single')}</option><option value="double">{t('sel.dowel.double')}</option></select></label>
    <label>{t('sel.dowel.member')} <select bind:value={d.member}><option value="">—</option>{#each members as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
    <label>{t('sel.dowel.demand')} <input inputmode="decimal" bind:value={d.demand} data-testid="dowel-demand" /></label>
    <button onclick={saveDowel} data-testid="dowel-save">{t('sfl.add')}</button>
  </div>
{/if}
{#if note}<p class="muted">{note}</p>{/if}
