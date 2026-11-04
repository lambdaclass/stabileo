<!-- A construction by layers: each layer's thickness, λ and ρ as the maker or the code states them, the surface resistances and the project's limits. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { saveConstruction, type Construction } from '../../../../lib/store/architecture';

  let { onsaved }: { onsaved?: () => void } = $props();
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return String(s).trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  let f = $state<Record<string, string>>({ name: '', kind: 'wall', rsi: '', rse: '', uMax: '', massMin: '', rwRequired: '', rw: '' });
  let layers = $state<Array<Record<string, string>>>([{ name: '', d: '', lambda: '', rho: '' }]);
  let note = $state('');
  function save() {
    const ls = layers.filter((l) => l.name!.trim() && num(l.d!));
    if (!f.name!.trim() || !ls.length || num(f.rsi!) === undefined || num(f.rse!) === undefined) { note = t('arch.ui.missingConstruction'); return; }
    const c: Construction = {
      id: `cn-${Date.now().toString(36)}`, name: f.name!.trim(), kind: f.kind as Construction['kind'], rsi: num(f.rsi!)!, rse: num(f.rse!)!,
      layers: ls.map((l) => ({ name: l.name!.trim(), thickness: num(l.d!)! / 1000, lambda: num(l.lambda!) ?? 0, density: num(l.rho!) ?? 0 })),
      ...(num(f.uMax!) !== undefined ? { uMax: num(f.uMax!)! } : {}), ...(num(f.massMin!) !== undefined ? { massMin: num(f.massMin!)! } : {}),
      ...(num(f.rwRequired!) !== undefined ? { rwRequired: num(f.rwRequired!)! } : {}), ...(num(f.rw!) !== undefined ? { rw: num(f.rw!)! } : {}),
    };
    saveConstruction(c);
    note = ''; f = { ...f, name: '' }; layers = [{ name: '', d: '', lambda: '', rho: '' }];
    onsaved?.();
  }
</script>

<div class="sf-form" data-testid="construction-form">
  <label>{t('fed.ui.name')} <input bind:value={f.name} data-testid="cons-name" /></label>
  <label>{t('arch.ui.kind')} <select bind:value={f.kind}>{#each ['wall', 'floor', 'roof'] as k (k)}<option value={k}>{t(`arch.kind.${k}`)}</option>{/each}</select></label>
  {#each [['rsi', 'arch.ui.rsi'], ['rse', 'arch.ui.rse'], ['uMax', 'arch.ui.uMax'], ['massMin', 'arch.ui.massMin'], ['rwRequired', 'arch.ui.rwRequired'], ['rw', 'arch.ui.rw']] as [k, label] (k)}
    <label>{t(label)} <input inputmode="decimal" bind:value={f[k]} data-testid="cons-{k}" /></label>
  {/each}
</div>
{#each layers as l, i (i)}
  <div class="sf-form">
    <strong class="tag">{t('arch.ui.layer')} {i + 1}</strong>
    <label>{t('fed.ui.name')} <input bind:value={l.name} data-testid="layer-{i}-name" /></label>
    <label>d (mm) <input inputmode="decimal" bind:value={l.d} data-testid="layer-{i}-d" /></label>
    <label>λ (W/mK) <input inputmode="decimal" bind:value={l.lambda} data-testid="layer-{i}-lambda" /></label>
    <label>ρ (kg/m³) <input inputmode="decimal" bind:value={l.rho} data-testid="layer-{i}-rho" /></label>
    {#if layers.length > 1}<button class="link" onclick={() => (layers = layers.filter((_, j) => j !== i))}>{t('mat.timber.drop')}</button>{/if}
  </div>
{/each}
<div class="sf-form">
  <button class="link" onclick={() => (layers = [...layers, { name: '', d: '', lambda: '', rho: '' }])} data-testid="layer-add">{t('arch.ui.addLayer')}</button>
  <button onclick={save} data-testid="cons-save">{t('sfl.add')}</button>
  {#if note}<span class="muted">{note}</span>{/if}
</div>
