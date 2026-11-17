<!-- A corbel stated by its geometry, with its shear typed or read from the end of the beam it carries. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { saveEntry } from '../../../../lib/store/special-elements';

  let { onsaved }: { onsaved?: (id: string) => void } = $props();
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  let f = $state<Record<string, string>>({ name: '', bw: '40', h: '50', d: '45', av: '20', hEdge: '', vu: '', nuc: '', beam: '', end: 'j', monolithic: 'yes' });
  let note = $state('');
  const beams = $derived([...modelStore.elements.keys()].sort((a, b) => a - b));
  function save() {
    const cm = (k: string) => (num(f[k]!) ?? 0) / 100;
    if (!f.name!.trim() || !num(f.bw!) || !num(f.h!) || !num(f.d!) || !num(f.av!) || (!f.beam && !num(f.vu!))) { note = t('sel.ui.missing'); return; }
    const id = `cb-${Date.now().toString(36)}`;
    saveEntry('corbels', { id, name: f.name!.trim(), bw: cm('bw'), h: cm('h'), d: cm('d'), av: cm('av'), monolithic: f.monolithic === 'yes',
      ...(num(f.hEdge!) ? { hEdge: cm('hEdge') } : {}), ...(num(f.vu!) ? { vu: num(f.vu!)! } : {}), ...(num(f.nuc!) !== undefined ? { nuc: num(f.nuc!)! } : {}),
      ...(f.beam ? { from: { elementId: Number(f.beam), end: f.end === 'i' ? 'i' : 'j' } } : {}) });
    note = ''; onsaved?.(id);
  }
</script>

<div class="sf-form" data-testid="corbel-form">
  <label>{t('stair.ui.name')} <input bind:value={f.name} data-testid="corbel-name" /></label>
  {#each [['bw', 'sel.corbel.bw'], ['h', 'sel.corbel.h'], ['d', 'sel.corbel.d'], ['av', 'sel.corbel.av'], ['hEdge', 'sel.corbel.hEdge']] as [k, label] (k)}
    <label>{t(label)} <input inputmode="decimal" bind:value={f[k]} data-testid="corbel-{k}" /></label>
  {/each}
  <label>{t('sel.corbel.beam')} <select bind:value={f.beam} data-testid="corbel-beam"><option value="">—</option>{#each beams as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
  <label>{t('sel.corbel.end')} <select bind:value={f.end}><option value="i">I</option><option value="j">J</option></select></label>
  <label>Vu (kN) <input inputmode="decimal" bind:value={f.vu} data-testid="corbel-vu" /></label>
  <label>Nuc (kN) <input inputmode="decimal" bind:value={f.nuc} /></label>
  <label>{t('sel.corbel.cast')} <select bind:value={f.monolithic}><option value="yes">{t('sel.corbel.monolithic')}</option><option value="no">{t('sel.corbel.roughened')}</option></select></label>
  <button onclick={save} data-testid="corbel-save">{t('sfl.add')}</button>
  {#if note}<span class="muted">{note}</span>{/if}
</div>
