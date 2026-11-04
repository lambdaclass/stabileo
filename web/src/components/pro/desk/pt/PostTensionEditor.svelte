<!--
  Post-tensioned slabs: the project's tendon system (strand, jacking, friction and wedge set from
  the maker's tests, the long-term loss, f'ci), and for each slab panel declared post-tensioned
  its tendons in x and in y, the bonded steel placed, the load each direction balances, its checks
  and the order to stress it.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import { ptData, ptPanels, setPtPanel, setTendonSystem, stressingPlan } from '../../../../lib/store/stairs-pt';
  import type { TendonLayout, TendonSystem } from '../../../../lib/engine/design/slabs/post-tensioned';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';

  const panels = $derived(ptPanels());
  const pd = $derived(ptData());
  const plan = $derived(stressingPlan());
  let selected = $state<string | null>(null);
  const panel = $derived(panels.find((p) => p.key === selected) ?? null);
  let note = $state('');

  const num = (s: string | undefined) => { const v = Number(String(s ?? '').replace(',', '.')); return String(s ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');

  // ── The system: every value stated by the person, nothing assumed.
  const SYS = ['fpu', 'fpy', 'eps', 'aps', 'jackRatio', 'mu', 'k', 'seating', 'longTermLoss', 'fci'] as const;
  const fromSystem = (s: TendonSystem | undefined): Record<string, string> => ({ ...Object.fromEntries(SYS.map((k) => [k, s ? String(s[k]) : ''])), liveEnds: s?.liveEnds ?? 'one' });
  let sys = $state<Record<string, string>>(fromSystem(ptData().system));
  const sysMissing = $derived(SYS.filter((k) => num(sys[k]) === undefined));
  function saveSystem() {
    if (sysMissing.length) { note = t('pt.ui.missing'); return; }
    const v = Object.fromEntries(SYS.map((k) => [k, num(sys[k])!])) as Record<(typeof SYS)[number], number>;
    setTendonSystem({ ...v, liveEnds: sys.liveEnds === 'both' ? 'both' : 'one' });
    note = '';
  }

  // ── A panel's tendons (heights in mm in the form, m stored)
  type Dir = 'x' | 'y';
  const blankDir = () => ({ count: '', yLeft: '', yLow: '', yRight: '', banded: false });
  let lay = $state<Record<Dir, { count: string; yLeft: string; yLow: string; yRight: string; banded: boolean }>>({ x: blankDir(), y: blankDir() });
  let bonded = $state({ pos: '', neg: '' });
  function pick(key: string) {
    selected = key;
    const c = panels.find((p) => p.key === key)?.choice;
    const of = (l: TendonLayout | undefined) => (l ? { count: String(l.count), yLeft: String(l.yLeft * 1000), yLow: String(l.yLow * 1000), yRight: String(l.yRight * 1000), banded: !!l.banded } : blankDir());
    lay = { x: of(c?.x), y: of(c?.y) };
    bonded = { pos: c?.bonded?.pos !== undefined ? String(c.bonded.pos * 1e4) : '', neg: c?.bonded?.neg !== undefined ? String(c.bonded.neg * 1e4) : '' };
  }
  function savePanel() {
    if (!panel) return;
    const of = (d: Dir): TendonLayout | undefined => {
      const l = lay[d], n = num(l.count), a = num(l.yLeft), m = num(l.yLow), b = num(l.yRight);
      if (!n || a === undefined || m === undefined || b === undefined) return undefined;
      return { count: Math.round(n), yLeft: a / 1000, yLow: m / 1000, yRight: b / 1000, ...(l.banded ? { banded: true } : {}) };
    };
    const x = of('x'), y = of('y'), pos = num(bonded.pos), neg = num(bonded.neg);
    setPtPanel(panel.key, { ...(x ? { x } : {}), ...(y ? { y } : {}), ...(pos !== undefined || neg !== undefined ? { bonded: { ...(pos !== undefined ? { pos: pos / 1e4 } : {}), ...(neg !== undefined ? { neg: neg / 1e4 } : {}) } } : {}) });
  }
</script>

<div class="sf" data-testid="pt-editor">
  <p class="muted">{t('pt.ui.lead')}</p>

  <details class="sf-sec" open={!pd.system} data-testid="pt-system">
    <summary>{t('pt.ui.system')} <span class="muted">· {pd.system ? tp('pt.ui.systemSummary', { fpu: pd.system.fpu, aps: pd.system.aps, j: pd.system.jackRatio }) : t('pt.ui.systemNone')}</span></summary>
    <div class="sf-form">
      {#each SYS as k (k)}<label>{t(`pt.sys.${k}`)} <input inputmode="decimal" bind:value={sys[k]} data-testid="pt-sys-{k}" /></label>{/each}
      <label>{t('pt.sys.liveEnds')} <select bind:value={sys.liveEnds} data-testid="pt-sys-liveEnds"><option value="one">{t('pt.sys.one')}</option><option value="both">{t('pt.sys.both')}</option></select></label>
      <button onclick={saveSystem} data-testid="pt-sys-save">{t('mat.save')}</button>
    </div>
    <p class="muted">{t('pt.ui.systemNote')}</p>
  </details>

  <details class="sf-sec" open data-testid="pt-panels">
    <summary>{t('pt.ui.panels')} <span class="muted">· {tp('sfl.count', { n: panels.length })}</span></summary>
    {#if panels.length === 0}<p class="muted">{t('pt.ui.noPanels')}</p>{/if}
    <table class="sf-t">
      <tbody>
        {#each panels as p (p.key)}
          <tr class:on={selected === p.key} onclick={() => pick(p.key)} data-testid="pt-panel-{p.key}">
            <td>{p.name}</td><td>{p.readings.x?.span.toFixed(2)} × {p.readings.y?.span.toFixed(2)} m</td><td>h = {(p.h * 100).toFixed(0)} cm</td><td>{t(stateKey(p.status))}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if panel}
      {#each ['x', 'y'] as const as d (d)}
        <div class="sf-form" data-testid="pt-layout-{d}">
          <strong class="dir">{d}</strong>
          <label>{t('pt.lay.count')} <input inputmode="numeric" bind:value={lay[d].count} data-testid="pt-{d}-count" /></label>
          <label>{t('pt.lay.yLeft')} <input inputmode="decimal" bind:value={lay[d].yLeft} data-testid="pt-{d}-yLeft" /></label>
          <label>{t('pt.lay.yLow')} <input inputmode="decimal" bind:value={lay[d].yLow} data-testid="pt-{d}-yLow" /></label>
          <label>{t('pt.lay.yRight')} <input inputmode="decimal" bind:value={lay[d].yRight} data-testid="pt-{d}-yRight" /></label>
          <label class="chk"><input type="checkbox" bind:checked={lay[d].banded} /> {t('pt.lay.banded')}</label>
          {#if panel.balance[d]}{@const b = panel.balance[d]!}<span class="muted" data-testid="pt-balance-{d}">{tp('pt.ui.balance', { wb: b.wb.toFixed(2), wd: b.wDead.toFixed(2), pct: Math.round((100 * b.wb) / b.wDead), pe: b.pe.toFixed(0) })}</span>{/if}
        </div>
      {/each}
      <div class="sf-form">
        <label>{t('pt.lay.bondedPos')} <input inputmode="decimal" bind:value={bonded.pos} data-testid="pt-bonded-pos" /></label>
        <label>{t('pt.lay.bondedNeg')} <input inputmode="decimal" bind:value={bonded.neg} data-testid="pt-bonded-neg" /></label>
        <button onclick={savePanel} data-testid="pt-panel-save">{t('mat.save')}</button>
      </div>
      <SteelMemberSheet rows={panel.rows} note={t('pt.note')} />
    {/if}
    {#if note}<p class="muted" data-testid="pt-note">{note}</p>{/if}
  </details>

  <details class="sf-sec" data-testid="pt-order">
    <summary>{t('pt.ui.order')} <span class="muted">· {tp('sfl.count', { n: plan.length })}</span></summary>
    {#each plan as s (s.key + s.dir)}<p class="muted">{s.name} · {s.dir}: {s.order.join(' → ')}</p>{/each}
    <p class="muted">{t('pt.ui.orderNote')}</p>
  </details>
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td { padding: 2px 4px; border-top: 1px solid var(--st-hair); cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sf-form label.chk { flex-direction: row; align-items: center; gap: 0.25rem; }
  .dir { width: 1rem; align-self: center; }
  input, select { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  input[type='checkbox'] { width: auto; }
  select { width: auto; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
</style>
