<!--
  Special slabs and foundations: the ribbed, hollow-core and composite-deck panels (their system,
  their checks), the drop panels and capitals at the flat slab's columns, the mat on springs and
  the piles of the pile caps. Plank types and deck profiles are the project's, from their makers'
  tables.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { detailingStore } from '../../../../lib/store/detailing.svelte';
  import {
    headChecks, matChecks, patchSpecial, pileChecks, saveDeckProfile, savePlankType, setHead, setSlabSystem, specialData, specialPanels,
  } from '../../../../lib/store/special-floors';
  import type { RibbedGeometry } from '../../../../lib/engine/design/slabs/ribbed';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';

  const panels = $derived(specialPanels());
  const heads = $derived(headChecks());
  const mat = $derived(matChecks());
  const piles = $derived(pileChecks());
  const sd = $derived(specialData());
  let selected = $state<string | null>(null);
  const panel = $derived(panels.find((p) => p.key === selected) ?? null);
  let note = $state('');

  const num = (s: string | number | undefined) => { const v = Number(String(s ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');

  // ── Ribbed geometry (cm in the form, m stored)
  let rib = $state<Record<string, string>>({ h: '35', c: '5', sx: '70', sy: '', bb: '12', bt: '', filler: 'removable' });
  function pick(key: string) {
    selected = key;
    const g = panels.find((p) => p.key === key)?.choice?.ribbed;
    if (g) rib = { h: String(g.h * 100), c: String(g.c * 100), sx: String(g.spacingX * 100), sy: g.spacingY ? String(g.spacingY * 100) : '', bb: String(g.ribBottom * 100), bt: g.ribTop ? String(g.ribTop * 100) : '', filler: g.filler };
  }
  function saveRib() {
    if (!panel) return;
    const m = (k: string) => (num(rib[k]) ?? 0) / 100;
    const g: RibbedGeometry = { h: m('h'), c: m('c'), spacingX: m('sx'), ribBottom: m('bb'), filler: rib.filler === 'permanent' ? 'permanent' : 'removable', ...(num(rib.sy) ? { spacingY: m('sy') } : {}), ...(num(rib.bt) ? { ribTop: m('bt') } : {}) };
    setSlabSystem(panel.key, { ...(panel.choice ?? {}), ribbed: g });
  }
  /** The panel's shells take the solid thickness of equal stiffness (their weight stays on the safe side). */
  function applyEquivalent() {
    if (!panel?.props) return;
    const h = Math.round(panel.props.hEq * 1000) / 1000;
    modelStore.batch(() => { for (const q of panel.reading.quads) modelStore.updateQuad(q.id, { thickness: h }); });
    note = tp('sfl.applied', { h: (h * 100).toFixed(1) });
  }

  // ── Plank types and deck profiles
  let plank = $state<Record<string, string>>({ name: '', depth: '20', width: '1.2', selfWeight: '', phiMn: '', phiVn: '', ei: '' });
  function addPlank() {
    const id = `pk-${Date.now().toString(36)}`;
    if (!plank.name || !num(plank.phiMn) || !num(plank.phiVn) || !num(plank.selfWeight)) return;
    savePlankType({ id, name: plank.name, depth: (num(plank.depth) ?? 20) / 100, width: num(plank.width) ?? 1.2, selfWeight: num(plank.selfWeight)!, phiMn: num(plank.phiMn)!, phiVn: num(plank.phiVn)!, ...(num(plank.ei) ? { ei: num(plank.ei)! } : {}) });
    if (panel) setSlabSystem(panel.key, { ...(panel.choice ?? {}), plankId: id });
  }
  let deck = $state<Record<string, string>>({ name: '', hr: '7.5', t: '0.9', as: '', ycg: '3.75', fy: '280', ribWidth: '15', ribSpacing: '30', weight: '0.12', phiMnDeck: '' });
  function addDeck() {
    const id = `dk-${Date.now().toString(36)}`;
    if (!deck.name || !num(deck.as) || !num(deck.phiMnDeck)) return;
    saveDeckProfile({ id, name: deck.name, hr: (num(deck.hr) ?? 7.5) / 100, t: (num(deck.t) ?? 0.9) / 1000, as: num(deck.as)! / 1e4, ycg: (num(deck.ycg) ?? 3.75) / 100, fy: num(deck.fy) ?? 280,
      ribWidth: (num(deck.ribWidth) ?? 15) / 100, ribSpacing: (num(deck.ribSpacing) ?? 30) / 100, weight: num(deck.weight) ?? 0.12, phiMnDeck: num(deck.phiMnDeck)! });
    if (panel) setSlabSystem(panel.key, { ...(panel.choice ?? {}), deckId: id });
  }

  // ── Heads
  const joints = $derived([...new Set(detailingStore.assemblies.flatMap((a) => (a.families ?? []).flatMap((r) => (r.family === 'slab' ? r.punching.map((p) => p.nodeId) : []))))].sort((a, b) => a - b));
  let head = $state<Record<string, string>>({ node: '', bx: '', by: '', depth: '', capital: '' });
  function saveHead() {
    const n = Number(head.node);
    if (!Number.isFinite(n)) return;
    const drop = num(head.bx) && num(head.by) && num(head.depth) ? { bx: num(head.bx)!, by: num(head.by)!, depth: num(head.depth)! / 100 } : undefined;
    setHead(n, { ...(drop ? { drop } : {}), ...(num(head.capital) ? { capital: num(head.capital)! } : {}) });
  }
</script>

<div class="sf" data-testid="special-floors">
  <p class="muted">{t('sfl.lead')}</p>

  <details class="sf-sec" open data-testid="spec-panels">
    <summary>{t('sfl.panels')} <span class="muted">· {tp('sfl.count', { n: panels.length })}</span></summary>
    {#if panels.length === 0}<p class="muted">{t('sfl.noPanels')}</p>{/if}
    <table class="sf-t">
      <tbody>
        {#each panels as p (p.key)}
          <tr class:on={selected === p.key} onclick={() => pick(p.key)} data-testid="spec-panel-{p.key}">
            <td>{p.name}</td><td>{t(`physical.typ.${p.typology}`)}</td><td>{p.reading.span.toFixed(2)} m · {p.reading.dir}</td><td>{t(stateKey(p.status))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if panel}
      {#if panel.typology === 'waffle'}
        <div class="sf-form" data-testid="spec-ribbed">
          {#each [['h', 'sfl.rib.h'], ['c', 'sfl.rib.c'], ['sx', 'sfl.rib.sx'], ['sy', 'sfl.rib.sy'], ['bb', 'sfl.rib.bb'], ['bt', 'sfl.rib.bt']] as [k, label] (k)}
            <label>{t(label)} <input inputmode="decimal" bind:value={rib[k]} data-testid="spec-rib-{k}" /></label>
          {/each}
          <label>{t('sfl.rib.filler')} <select bind:value={rib.filler}><option value="removable">{t('sfl.rib.removable')}</option><option value="permanent">{t('sfl.rib.permanent')}</option></select></label>
          <button onclick={saveRib} data-testid="spec-rib-save">{t('mat.save')}</button>
        </div>
        {#if panel.props}
          <p class="muted" data-testid="spec-rib-props">{tp('sfl.rib.props', { v: panel.props.volume.toFixed(3), w: panel.props.selfWeight.toFixed(2), h: (panel.props.hEq * 100).toFixed(1) })}</p>
          <button onclick={applyEquivalent} data-testid="spec-rib-apply">{t('sfl.rib.apply')}</button>
        {/if}
      {:else if panel.typology === 'hollowCore'}
        <label class="sf-row">{t('sfl.plank.type')}
          <select value={panel.choice?.plankId ?? ''} onchange={(e) => setSlabSystem(panel.key, { ...(panel.choice ?? {}), plankId: e.currentTarget.value })} data-testid="spec-plank-select">
            <option value="">—</option>{#each sd.plankTypes ?? [] as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
        <div class="sf-form">
          {#each [['name', 'sfl.plank.name'], ['depth', 'sfl.plank.depth'], ['width', 'sfl.plank.width'], ['selfWeight', 'sfl.plank.weight'], ['phiMn', 'sfl.plank.phiMn'], ['phiVn', 'sfl.plank.phiVn'], ['ei', 'sfl.plank.ei']] as [k, label] (k)}
            <label>{t(label)} <input bind:value={plank[k]} data-testid="spec-plank-{k}" /></label>
          {/each}
          <button onclick={addPlank} data-testid="spec-plank-add">{t('sfl.add')}</button>
        </div>
      {:else}
        <label class="sf-row">{t('sfl.deck.profile')}
          <select value={panel.choice?.deckId ?? ''} onchange={(e) => setSlabSystem(panel.key, { ...(panel.choice ?? {}), deckId: e.currentTarget.value })} data-testid="spec-deck-select">
            <option value="">—</option>{#each sd.deckProfiles ?? [] as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
          </select>
        </label>
        <div class="sf-form">
          {#each [['name', 'sfl.plank.name'], ['hr', 'sfl.deck.hr'], ['t', 'sfl.deck.t'], ['as', 'sfl.deck.as'], ['ycg', 'sfl.deck.ycg'], ['fy', 'sfl.deck.fy'], ['ribWidth', 'sfl.deck.ribWidth'], ['ribSpacing', 'sfl.deck.ribSpacing'], ['weight', 'sfl.deck.weight'], ['phiMnDeck', 'sfl.deck.phiMn']] as [k, label] (k)}
            <label>{t(label)} <input bind:value={deck[k]} data-testid="spec-deck-{k}" /></label>
          {/each}
          <button onclick={addDeck} data-testid="spec-deck-add">{t('sfl.add')}</button>
        </div>
      {/if}
      <SteelMemberSheet rows={panel.rows} note={t(`sfl.note.${panel.typology}`)} />
    {/if}
    {#if note}<p class="muted" data-testid="spec-note">{note}</p>{/if}
  </details>

  <details class="sf-sec" data-testid="spec-heads">
    <summary>{t('sfl.heads')} <span class="muted">· {tp('sfl.count', { n: heads.length })}</span></summary>
    <div class="sf-form">
      <label>{t('sfl.head.node')} <select bind:value={head.node} data-testid="spec-head-node"><option value="">—</option>{#each joints as n (n)}<option value={String(n)}>{n}</option>{/each}</select></label>
      <label>{t('sfl.head.bx')} <input bind:value={head.bx} data-testid="spec-head-bx" /></label>
      <label>{t('sfl.head.by')} <input bind:value={head.by} data-testid="spec-head-by" /></label>
      <label>{t('sfl.head.depth')} <input bind:value={head.depth} data-testid="spec-head-depth" /></label>
      <label>{t('sfl.head.capital')} <input bind:value={head.capital} data-testid="spec-head-capital" /></label>
      <button onclick={saveHead} data-testid="spec-head-save">{t('mat.save')}</button>
    </div>
    {#each heads as h (h.nodeId)}
      <h6>{tp('sfl.head.title', { n: h.nodeId })} · {t(stateKey(h.status))} <button class="link" onclick={() => setHead(h.nodeId, null)}>{t('mat.timber.drop')}</button></h6>
      <SteelMemberSheet rows={h.rows} note={t('sfl.note.heads')} />
    {/each}
  </details>

  <details class="sf-sec" data-testid="spec-mat">
    <summary>{t('sfl.mat')} <span class="muted">· {mat ? tp('sfl.mat.nodes', { n: mat.nodes }) : t('sfl.mat.none')}</span></summary>
    {#if mat}<SteelMemberSheet rows={mat.rows} note={t('sfl.note.mat')} />{:else}<p class="muted">{t('sfl.mat.hint')}</p>{/if}
  </details>

  <details class="sf-sec" data-testid="spec-piles">
    <summary>{t('sfl.piles')} <span class="muted">· {tp('sfl.count', { n: piles.length })}</span></summary>
    <label class="sf-row">{t('sfl.piles.steel')} <input inputmode="decimal" value={((sd.pileSteelRatio ?? 0.01) * 100).toString()} onchange={(e) => patchSpecial({ pileSteelRatio: (num(e.currentTarget.value) ?? 1) / 100 })} /></label>
    {#each piles as p (p.footingId)}
      <h6>{tp('sfl.piles.cap', { n: p.footingId })} · {t(stateKey(p.status))}</h6>
      <SteelMemberSheet rows={p.rows} note={t('sfl.note.piles')} />
    {/each}
  </details>
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; display: inline; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td { padding: 2px 4px; border-top: 1px solid var(--st-hair); cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label, .sf-row { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sf-row { flex-direction: row; align-items: center; gap: 0.4rem; }
  input, select { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  select { width: auto; }
  h6 { margin: 0.3rem 0 0; font-size: 0.7rem; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
