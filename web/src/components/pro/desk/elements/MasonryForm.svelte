<!-- A masonry wall's material and confining elements (INPRES-CIRSOC 103 Parte III). Lengths in cm, steel in mm. -->
<script lang="ts">
  import { t } from '../../../../lib/i18n';
  import { setMasonryChoice, type MasonryChoice } from '../../../../lib/store/masonry-infill';
  import type { ConfiningElement, MasonryKind, MasonryUnit, MortarType, SeismicZone } from '../../../../lib/engine/design/masonry/confined-masonry';

  let { wallKey, choice }: { wallKey: string; choice: MasonryChoice | undefined } = $props();
  const num = (s: string | undefined) => { const v = Number(String(s ?? '').replace(',', '.')); return String(s ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  const el = (c: ConfiningElement | undefined) => ({ b: c ? String(c.b * 100) : '20', h: c ? String(c.h * 100) : '20', bars: String(c?.bars ?? 4), barDia: String(c?.barDia ?? 10), fy: String(c?.fy ?? 420), tieDia: String(c?.tieDia ?? 6), sNormal: c ? String(c.sNormal * 100) : '20', sCritical: c ? String(c.sCritical * 100) : '10' });
  // svelte-ignore state_referenced_locally
  let f = $state<Record<string, string>>({ kind: choice?.kind ?? 'simple', unit: choice?.unit ?? 'solidBrick', mortar: choice?.mortar ?? 'I', fm: choice?.fm ? String(choice.fm) : '', fv: choice?.fv ? String(choice.fv) : '',
    zone: String(choice?.zone ?? 3), storiesAbove: String(choice?.storiesAbove ?? 0), edges: choice?.edges ?? 'threeOrMore', Lo: choice?.Lo ? String(choice.Lo) : '', Ho: choice?.Ho ? String(choice.Ho) : '', muOut: choice?.muOut !== undefined ? String(choice.muOut) : '',
    jBars: String(choice?.joint?.bars ?? 2), jDia: String(choice?.joint?.barDia ?? 6), jS: choice?.joint ? String(choice.joint.spacing * 100) : '40' });
  // svelte-ignore state_referenced_locally
  let col = $state<Record<string, string>>(el(choice?.column));
  // svelte-ignore state_referenced_locally
  let beam = $state<Record<string, string>>(el(choice?.beam));
  const toEl = (c: Record<string, string>): ConfiningElement => ({ b: num(c.b)! / 100, h: num(c.h)! / 100, bars: Math.round(num(c.bars)!), barDia: num(c.barDia)!, fy: num(c.fy)!, tieDia: num(c.tieDia)!, sNormal: num(c.sNormal)! / 100, sCritical: num(c.sCritical)! / 100 });
  function save() {
    const kind = f.kind as MasonryKind;
    const c: MasonryChoice = {
      kind, unit: f.unit as MasonryUnit, zone: Number(f.zone) as SeismicZone, storiesAbove: Math.round(num(f.storiesAbove) ?? 0), edges: f.edges === 'twoHorizontal' ? 'twoHorizontal' : 'threeOrMore',
      ...(num(f.fm) && num(f.fv) ? { fm: num(f.fm)!, fv: num(f.fv)! } : { mortar: f.mortar as MortarType }),
      ...(num(f.Lo) ? { Lo: num(f.Lo)! } : {}), ...(num(f.Ho) ? { Ho: num(f.Ho)! } : {}), ...(num(f.muOut) !== undefined ? { muOut: num(f.muOut)! } : {}),
      ...(kind !== 'reforzada' ? { column: toEl(col), beam: toEl(beam) } : {}),
      ...(kind === 'armada' ? { joint: { bars: Math.round(num(f.jBars) ?? 2), barDia: num(f.jDia) ?? 6, spacing: (num(f.jS) ?? 40) / 100 } } : {}),
    };
    setMasonryChoice(wallKey, c);
  }
  const ELS = [['b', 'sel.mas.b'], ['h', 'sel.mas.h'], ['bars', 'sel.mas.bars'], ['barDia', 'sel.mas.barDia'], ['fy', 'sel.mas.fy'], ['tieDia', 'sel.mas.tieDia'], ['sNormal', 'sel.mas.sNormal'], ['sCritical', 'sel.mas.sCritical']];
</script>

<div class="sf-form" data-testid="masonry-form">
  <label>{t('sel.mas.kind')} <select bind:value={f.kind} data-testid="masonry-kind">{#each ['simple', 'armada', 'reforzada'] as k (k)}<option value={k}>{t(`sel.mas.kind.${k}`)}</option>{/each}</select></label>
  <label>{t('sel.mas.unit')} <select bind:value={f.unit}>{#each ['solidBrick', 'hollowCeramic', 'hollowConcrete'] as k (k)}<option value={k}>{t(`sel.mas.unit.${k}`)}</option>{/each}</select></label>
  <label>{t('sel.mas.mortar')} <select bind:value={f.mortar}>{#each ['E', 'I', 'N', 'NA'] as k (k)}<option value={k}>{k}</option>{/each}</select></label>
  <label>f'm (MPa) <input inputmode="decimal" bind:value={f.fm} /></label>
  <label>f'v (MPa) <input inputmode="decimal" bind:value={f.fv} /></label>
  <label>{t('sel.mas.zone')} <select bind:value={f.zone}>{#each ['1', '2', '3', '4'] as z (z)}<option value={z}>{z}</option>{/each}</select></label>
  <label>{t('sel.mas.storiesAbove')} <input inputmode="numeric" bind:value={f.storiesAbove} /></label>
  <label>{t('sel.mas.edges')} <select bind:value={f.edges}><option value="threeOrMore">{t('sel.mas.edges.three')}</option><option value="twoHorizontal">{t('sel.mas.edges.two')}</option></select></label>
  <label>Lo (m) <input inputmode="decimal" bind:value={f.Lo} /></label>
  <label>Ho (m) <input inputmode="decimal" bind:value={f.Ho} /></label>
  <label>{t('sel.mas.muOut')} <input inputmode="decimal" bind:value={f.muOut} /></label>
</div>
{#if f.kind !== 'reforzada'}
  {#each [['column', col], ['beam', beam]] as [which, rec] (which)}
    <div class="sf-form">
      <strong class="tag">{t(`sel.mas.${which}`)}</strong>
      {#each ELS as [k, label] (k)}<label>{t(label)} <input inputmode="decimal" bind:value={(rec as Record<string, string>)[k]} /></label>{/each}
    </div>
  {/each}
{/if}
{#if f.kind === 'armada'}
  <div class="sf-form">
    <strong class="tag">{t('sel.mas.joint')}</strong>
    <label>{t('sel.mas.bars')} <input inputmode="numeric" bind:value={f.jBars} /></label>
    <label>{t('sel.mas.barDia')} <input inputmode="decimal" bind:value={f.jDia} /></label>
    <label>{t('sel.mas.jointSpacing')} <input inputmode="decimal" bind:value={f.jS} /></label>
  </div>
{/if}
<button onclick={save} data-testid="masonry-save">{t('mat.save')}</button>
