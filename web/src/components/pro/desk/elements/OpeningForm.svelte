<!-- A rectangular opening through a beam's web: where it is along the beam and its size. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { saveEntry } from '../../../../lib/store/special-elements';

  let { onsaved }: { onsaved?: (id: string) => void } = $props();
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };
  let f = $state<Record<string, string>>({ beam: '', x: '', lo: '', ho: '', offset: '0' });
  let note = $state('');
  const beams = $derived([...modelStore.elements.values()].filter((e) => { const s = modelStore.sections.get(e.sectionId); return !!s?.b && !!s.h && e.type !== 'truss'; }).map((e) => e.id).sort((a, b) => a - b));
  function save() {
    const x = num(f.x!), lo = num(f.lo!), ho = num(f.ho!);
    if (!f.beam || x === undefined || !lo || !ho) { note = t('sel.ui.missing'); return; }
    const id = `op-${Date.now().toString(36)}`;
    saveEntry('openings', { id, elementId: Number(f.beam), x, lo: lo / 100, ho: ho / 100, ...(num(f.offset!) ? { offset: num(f.offset!)! / 100 } : {}) });
    note = ''; onsaved?.(id);
  }
</script>

<div class="sf-form" data-testid="opening-form">
  <label>{t('sel.opening.beam')} <select bind:value={f.beam} data-testid="opening-beam"><option value="">—</option>{#each beams as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
  {#each [['x', 'sel.opening.x'], ['lo', 'sel.opening.lo'], ['ho', 'sel.opening.ho'], ['offset', 'sel.opening.offset']] as [k, label] (k)}
    <label>{t(label)} <input inputmode="decimal" bind:value={f[k]} data-testid="opening-{k}" /></label>
  {/each}
  <button onclick={save} data-testid="opening-save">{t('sfl.add')}</button>
  {#if note}<span class="muted">{note}</span>{/if}
</div>
