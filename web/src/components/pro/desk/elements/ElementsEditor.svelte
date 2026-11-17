<!--
  Particular elements: corbels, coupling beams (found where a beam joins two walls), openings
  through beams, masonry walls, masonry infills (with their struts put in the model), tubular
  truss joints and timber dowel connections. Each family lists its elements with their state;
  picking one opens its rows.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { corbelChecks, couplingChecks, openingChecks, removeEntry, setCouplingChoice } from '../../../../lib/store/special-elements';
  import { infillChecks, masonryWallChecks, placeInfillStruts, removeInfillStruts } from '../../../../lib/store/masonry-infill';
  import { dowelChecks, hssJointChecks } from '../../../../lib/store/special-connections';
  import type { CheckRow } from '../../../../lib/design-contract';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';
  import CorbelForm from './CorbelForm.svelte';
  import OpeningForm from './OpeningForm.svelte';
  import MasonryForm from './MasonryForm.svelte';
  import InfillForm from './InfillForm.svelte';
  import ConnectionForms from './ConnectionForms.svelte';

  const corbels = $derived(corbelChecks());
  const coupling = $derived(couplingChecks());
  const openings = $derived(openingChecks());
  const masonry = $derived(masonryWallChecks());
  const infills = $derived(infillChecks());
  const hss = $derived(hssJointChecks());
  const dowels = $derived(dowelChecks());
  let selected = $state<string | null>(null);
  let note = $state('');
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');
  const pick = (k: string) => { selected = selected === k ? null : k; note = ''; };
  const rowsOf = (k: string): CheckRow[] | null => {
    const [fam, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    const f = fam === 'corbel' ? corbels.find((c) => c.entry.id === id) : fam === 'coupling' ? coupling.find((c) => String(c.elementId) === id)
      : fam === 'opening' ? openings.find((c) => c.entry.id === id) : fam === 'masonry' ? masonry.find((c) => c.key === id)
      : fam === 'infill' ? infills.find((c) => c.entry.id === id) : fam === 'hss' ? hss.find((c) => c.entry.id === id) : dowels.find((c) => c.entry.id === id);
    return f?.rows ?? null;
  };
  const current = $derived(selected ? rowsOf(selected) : null);
  const family = $derived(selected ? selected.slice(0, selected.indexOf(':')) : '');
  const masonryOn = $derived(family === 'masonry' ? masonry.find((m) => `masonry:${m.key}` === selected) ?? null : null);
  const couplingOn = $derived(family === 'coupling' ? coupling.find((c) => `coupling:${c.elementId}` === selected) ?? null : null);
  const infillOn = $derived(family === 'infill' ? infills.find((c) => `infill:${c.entry.id}` === selected) ?? null : null);
</script>

<div class="sf sel" data-testid="elements-editor">
  <p class="muted">{t('sel.ui.lead')}</p>

  {#snippet sheet(fam: string)}
    {#if current && family === fam}<SteelMemberSheet rows={current} note={t(`sel.note.${fam}`)} />{/if}
  {/snippet}

  <details class="sf-sec" data-testid="sel-corbels">
    <summary>{t('sel.corbels')} <span class="muted">· {tp('sfl.count', { n: corbels.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each corbels as c (c.entry.id)}
        <tr class:on={selected === `corbel:${c.entry.id}`} onclick={() => pick(`corbel:${c.entry.id}`)} data-testid="corbel-row-{c.entry.id}">
          <td>{c.entry.name}</td><td>{c.vu !== null ? `Vu ${c.vu.toFixed(1)} kN` : '—'}</td><td>{c.design ? `As ${(c.design.asPrimary * 1e4).toFixed(2)} cm²` : ''}</td><td>{t(stateKey(c.status))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeEntry('corbels', c.entry.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    <CorbelForm onsaved={(id) => (selected = `corbel:${id}`)} />
    {@render sheet('corbel')}
  </details>

  <details class="sf-sec" data-testid="sel-coupling">
    <summary>{t('sel.coupling')} <span class="muted">· {tp('sfl.count', { n: coupling.length })}</span></summary>
    {#if coupling.length === 0}<p class="muted">{t('sel.coupling.none')}</p>{/if}
    <table class="sf-t"><tbody>
      {#each coupling as c (c.elementId)}
        <tr class:on={selected === `coupling:${c.elementId}`} onclick={() => pick(`coupling:${c.elementId}`)} data-testid="coupling-row-{c.elementId}">
          <td>{t('sel.beam')} {c.elementId}</td><td>ln/h {(c.h ? c.ln / c.h : 0).toFixed(2)}</td><td>{c.vu !== null ? `Vu ${c.vu.toFixed(1)} kN` : '—'}</td><td>{t(stateKey(c.status))}</td>
        </tr>
      {/each}
    </tbody></table>
    {#if couplingOn}
      <div class="sf-form">
        <label>α (°) <input inputmode="decimal" value={couplingOn.choice?.alphaDeg ?? ''} onchange={(e) => { const v = Number(e.currentTarget.value.replace(',', '.')); setCouplingChoice(couplingOn.elementId, { ...(couplingOn.choice ?? {}), ...(v > 0 ? { alphaDeg: v } : {}) }); }} /></label>
        <button class="link" onclick={() => { setCouplingChoice(couplingOn.elementId, { ...(couplingOn.choice ?? {}), excluded: true }); selected = null; }}>{t('sel.coupling.exclude')}</button>
      </div>
    {/if}
    {@render sheet('coupling')}
  </details>

  <details class="sf-sec" data-testid="sel-openings">
    <summary>{t('sel.openings')} <span class="muted">· {tp('sfl.count', { n: openings.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each openings as c (c.entry.id)}
        <tr class:on={selected === `opening:${c.entry.id}`} onclick={() => pick(`opening:${c.entry.id}`)} data-testid="opening-row-{c.entry.id}">
          <td>{t('sel.beam')} {c.entry.elementId} · x = {c.entry.x.toFixed(2)} m</td><td>{Math.round(c.entry.lo * 100)} × {Math.round(c.entry.ho * 100)} cm</td><td>{c.mu !== null ? `Mu ${c.mu.toFixed(1)} · Vu ${c.vu!.toFixed(1)}` : '—'}</td><td>{t(stateKey(c.status))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeEntry('openings', c.entry.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    <OpeningForm onsaved={(id) => (selected = `opening:${id}`)} />
    {@render sheet('opening')}
  </details>

  <details class="sf-sec" data-testid="sel-masonry">
    <summary>{t('sel.masonry')} <span class="muted">· {tp('sfl.count', { n: masonry.length })}</span></summary>
    {#if masonry.length === 0}<p class="muted">{t('sel.masonry.none')}</p>{/if}
    <table class="sf-t"><tbody>
      {#each masonry as c (c.key)}
        <tr class:on={selected === `masonry:${c.key}`} onclick={() => pick(`masonry:${c.key}`)} data-testid="masonry-row-{c.key}">
          <td>{c.name}</td><td>{c.L.toFixed(2)} × {c.H.toFixed(2)} m · t {Math.round(c.t * 100)} cm</td><td>{c.forces ? `Vu ${c.forces.vu.toFixed(1)} kN` : '—'}</td><td>{t(stateKey(c.status))}</td>
        </tr>
      {/each}
    </tbody></table>
    {#if masonryOn}{#key masonryOn.key}<MasonryForm wallKey={masonryOn.key} choice={masonryOn.choice} />{/key}{/if}
    {@render sheet('masonry')}
  </details>

  <details class="sf-sec" data-testid="sel-infills">
    <summary>{t('sel.infills')} <span class="muted">· {tp('sfl.count', { n: infills.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each infills as c (c.entry.id)}
        <tr class:on={selected === `infill:${c.entry.id}`} onclick={() => pick(`infill:${c.entry.id}`)} data-testid="infill-row-{c.entry.id}">
          <td>{c.entry.name}</td><td>{c.strut ? tp('sel.infill.width', { w: (c.strut.width * 100).toFixed(0) }) : '—'}</td><td>{c.entry.strutIds?.length ? t('sel.infill.placed') : t('sel.infill.notPlaced')}</td><td>{t(stateKey(c.status))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeInfillStruts(c.entry.id); removeEntry('infills', c.entry.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    {#if infillOn}
      <div class="sf-form">
        <button onclick={() => { const n = placeInfillStruts(infillOn.entry.id).length; note = tp('sel.infill.made', { n }); }} data-testid="infill-place">{t('sel.infill.place')}</button>
        {#if infillOn.entry.strutIds?.length}<button class="link" onclick={() => removeInfillStruts(infillOn.entry.id)}>{t('sel.infill.remove')}</button>{/if}
      </div>
    {/if}
    <InfillForm onsaved={(id) => (selected = `infill:${id}`)} />
    {@render sheet('infill')}
  </details>

  <details class="sf-sec" data-testid="sel-hss">
    <summary>{t('sel.hss')} <span class="muted">· {tp('sfl.count', { n: hss.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each hss as c (c.entry.id)}
        <tr class:on={selected === `hss:${c.entry.id}`} onclick={() => pick(`hss:${c.entry.id}`)} data-testid="hss-row-{c.entry.id}">
          <td>{t('memo.el.node')} {c.entry.nodeId}</td><td>{c.joint ?? '—'}</td><td>{t(stateKey(c.status))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeEntry('hss', c.entry.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    <ConnectionForms kind="hss" onsaved={(id) => (selected = `hss:${id}`)} />
    {@render sheet('hss')}
  </details>

  <details class="sf-sec" data-testid="sel-dowels">
    <summary>{t('sel.dowels')} <span class="muted">· {tp('sfl.count', { n: dowels.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each dowels as c (c.entry.id)}
        <tr class:on={selected === `dowel:${c.entry.id}`} onclick={() => pick(`dowel:${c.entry.id}`)} data-testid="dowel-row-{c.entry.id}">
          <td>{c.entry.name}</td><td>{c.entry.n} × Ø{c.entry.D} mm</td><td>{c.demand !== null ? `${c.demand.toFixed(1)} kN` : '—'}</td><td>{t(stateKey(c.status))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeEntry('dowels', c.entry.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    <ConnectionForms kind="dowel" onsaved={(id) => (selected = `dowel:${id}`)} />
    {@render sheet('dowel')}
  </details>
  {#if note}<p class="muted" data-testid="sel-note">{note}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .sel :global(.muted) { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td { padding: 2px 4px; border-top: 1px solid var(--st-hair); cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sel :global(.sf-form) { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sel :global(.sf-form label) { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sel :global(.sf-form .tag) { align-self: center; font-size: 0.68rem; min-width: 5rem; }
  .sel :global(input), .sel :global(select) { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  .sel :global(select) { width: auto; max-width: 14rem; }
  .sel :global(button) { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  .sel :global(button.link) { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
