<!-- A masonry infill in a frame bay: the two columns, the beam over them, the infill's thickness, modulus and strength. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { saveEntry } from '../../../../lib/store/special-elements';

  let { onsaved }: { onsaved?: (id: string) => void } = $props();
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return s.trim() !== '' && Number.isFinite(v) && v > 0 ? v : undefined; };
  let f = $state<Record<string, string>>({ name: '', c1: '', c2: '', beam: '', t: '18', em: '', strength: '' });
  let note = $state('');
  const vertical = (id: number) => { const e = modelStore.elements.get(id)!; const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ); return !!a && !!b && Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0)) < 0.05; };
  const columns = $derived([...modelStore.elements.keys()].filter(vertical).sort((a, b) => a - b));
  const beams = $derived([...modelStore.elements.keys()].filter((id) => !vertical(id)).sort((a, b) => a - b));
  function save() {
    if (!f.name!.trim() || !f.c1 || !f.c2 || !f.beam || !num(f.t!) || !num(f.em!) || !num(f.strength!)) { note = t('sel.ui.missing'); return; }
    const id = `in-${Date.now().toString(36)}`;
    saveEntry('infills', { id, name: f.name!.trim(), columns: [Number(f.c1), Number(f.c2)], beam: Number(f.beam), t: num(f.t!)! / 100, em: num(f.em!)!, strength: num(f.strength!)! });
    note = ''; onsaved?.(id);
  }
</script>

<div class="sf-form" data-testid="infill-form">
  <label>{t('stair.ui.name')} <input bind:value={f.name} data-testid="infill-name" /></label>
  <label>{t('sel.infill.c1')} <select bind:value={f.c1} data-testid="infill-c1"><option value="">—</option>{#each columns as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
  <label>{t('sel.infill.c2')} <select bind:value={f.c2} data-testid="infill-c2"><option value="">—</option>{#each columns as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
  <label>{t('sel.infill.beam')} <select bind:value={f.beam} data-testid="infill-beam"><option value="">—</option>{#each beams as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
  <label>{t('sel.infill.t')} <input inputmode="decimal" bind:value={f.t} /></label>
  <label>Em (MPa) <input inputmode="decimal" bind:value={f.em} data-testid="infill-em" /></label>
  <label>{t('sel.infill.strength')} <input inputmode="decimal" bind:value={f.strength} data-testid="infill-strength" /></label>
  <button onclick={save} data-testid="infill-save">{t('sfl.add')}</button>
  {#if note}<span class="muted">{note}</span>{/if}
</div>
