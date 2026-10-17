<script lang="ts">
  /**
   * End connection (tension) of the selected steel members — what CIRSOC 301 D.3 needs for
   * rupture on Ae = An·U, and nothing it does not.
   *
   * Edits `Element.tensionConnection` for every selected steel member at once, at both ends or one
   * of them; one Apply is one undo step. The preview runs the same computation the checker runs
   * (`engine/steel/tension-connection.ts`) against each member's own section, BEFORE anything is
   * written, so An, U and Ae — or the named reason they cannot be had — are on screen while the
   * fields are being filled.
   *
   * Presets fill the layout only. A bolt count, a pitch or a weld length is never put in a field
   * the user did not type into: a pitch guessed as 3 d is a dimension nobody chose.
   *
   * A bolt layout already designed at the member's end node (connections panel) can be copied in
   * — the joint design stays the one place that bolt pattern is chosen.
   */
  import { untrack } from 'svelte';
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { jointDesignStore } from '../../../lib/store/joint-design.svelte';
  import {
    endNetArea, tensionGeometry, connectedOptions, presetConnection, TENSION_PRESETS,
    type EndConnection, type ConnectedElements, type WeldLayout, type TensionPreset, type MemberTensionConnection,
  } from '../../../lib/engine/steel/tension-connection';
  import type { HoleKind } from '../../../lib/connection/bolt-geometry';
  import { HOLE_TABLE_DIAMETERS_MM } from '../../../lib/connection/bolt-geometry';

  let { ids, bare = false }: { ids: readonly number[]; bare?: boolean } = $props();

  type EndSel = 'both' | 'i' | 'j';

  /** Steel members only: the material reads as metal (fy > 80 MPa), as the checker decides. */
  const steelIds = $derived(ids.filter((id) => {
    const e = modelStore.elements.get(id);
    const m = e && modelStore.materials.get(e.materialId);
    return !!m && (m.fy ?? 0) > 80;
  }));

  let endSel = $state<EndSel>('both');

  // ── The draft, as plain fields (number inputs give number | null) ──
  let kind = $state<'bolted' | 'welded'>('bolted');
  let connected = $state<ConnectedElements>('all');
  let diameterMm = $state<number | null>(null);
  let holeKind = $state<HoleKind>('standard');
  let boltsPerLine = $state<number | null>(null);
  let lines = $state<number | null>(null);
  let webLines = $state<number | null>(null);
  let pitchMm = $state<number | null>(null);
  let staggered = $state(false);
  let sMm = $state<number | null>(null);
  let gMm = $state<number | null>(null);
  let weld = $state<WeldLayout>('longitudinal');
  let lengthMm = $state<number | null>(null);

  const num = (v: number | null): number | undefined => (v === null || !Number.isFinite(v) ? undefined : v);
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  function draft(): EndConnection {
    if (kind === 'welded') {
      return { kind, connected, weld, ...(num(lengthMm) !== undefined ? { lengthMm: num(lengthMm) } : {}) };
    }
    return {
      kind, connected, holeKind,
      ...(num(diameterMm) !== undefined ? { diameterMm: num(diameterMm) } : {}),
      ...(num(boltsPerLine) !== undefined ? { boltsPerLine: num(boltsPerLine) } : {}),
      ...(num(lines) !== undefined ? { lines: num(lines) } : {}),
      ...(connected === 'all' && num(webLines) !== undefined ? { webLines: num(webLines) } : {}),
      ...(num(pitchMm) !== undefined ? { pitchMm: num(pitchMm) } : {}),
      ...(staggered ? { stagger: { ...(num(sMm) !== undefined ? { sMm: num(sMm) } : {}), ...(num(gMm) !== undefined ? { gMm: num(gMm) } : {}) } } : {}),
    };
  }

  function load(c: EndConnection | undefined) {
    const firstShape = shapeOfFirst();
    if (!c) {
      kind = 'bolted'; connected = firstShape ? connectedOptionsFor(firstShape)[0]! : 'all';
      diameterMm = null; holeKind = 'standard'; boltsPerLine = null; lines = null; webLines = null;
      pitchMm = null; staggered = false; sMm = null; gMm = null; weld = 'longitudinal'; lengthMm = null;
      return;
    }
    kind = c.kind; connected = c.connected;
    if (c.kind === 'welded') { weld = c.weld; lengthMm = c.lengthMm ?? null; return; }
    diameterMm = c.diameterMm ?? null; holeKind = c.holeKind; boltsPerLine = c.boltsPerLine ?? null;
    lines = c.lines ?? null; webLines = c.webLines ?? null; pitchMm = c.pitchMm ?? null;
    staggered = !!c.stagger; sMm = c.stagger?.sMm ?? null; gMm = c.stagger?.gMm ?? null;
  }

  const sectionOf = (id: number) => modelStore.sections.get(modelStore.elements.get(id)?.sectionId ?? -1);
  function shapeOfFirst(): string | undefined {
    const s = steelIds[0] !== undefined ? sectionOf(steelIds[0]) : undefined;
    if (!s) return undefined;
    const g = tensionGeometry(s);
    return 'refused' in g ? undefined : g.kind;
  }
  function connectedOptionsFor(kindOfGeometry: string): ConnectedElements[] {
    return connectedOptions(kindOfGeometry as never);
  }

  /** The stored connection at the chosen end(s), one value or "mixed" across the selection. */
  const storedAt = (id: number, end: 'i' | 'j') => modelStore.elements.get(id)?.tensionConnection?.[end];
  const endsDiffer = $derived(endSel === 'both' && steelIds.some((id) => !same(storedAt(id, 'i'), storedAt(id, 'j'))));

  // Reload the draft when the selection or the end changes — not on every model edit.
  let loadedKey = '';
  $effect(() => {
    const key = `${steelIds.join(',')}|${endSel}`;
    if (key === loadedKey) return;
    loadedKey = key;
    untrack(() => {
      const first = steelIds[0];
      load(first === undefined ? undefined : endSel === 'j' ? storedAt(first, 'j') : storedAt(first, 'i') ?? storedAt(first, 'j'));
    });
  });

  const geometryOfFirst = $derived.by(() => {
    const s = steelIds[0] !== undefined ? sectionOf(steelIds[0]) : undefined;
    return s ? tensionGeometry(s) : null;
  });
  const options = $derived<ConnectedElements[]>(
    geometryOfFirst && !('refused' in geometryOfFirst)
      ? connectedOptions(geometryOfFirst.kind)
      : ['all', 'flanges', 'web', 'flange', 'legH', 'legB'],
  );
  const isPlate = $derived(!!geometryOfFirst && !('refused' in geometryOfFirst) && geometryOfFirst.kind === 'plate');

  function applyPreset(p: TensionPreset) {
    load(presetConnection(p, sectionOf(steelIds[0] ?? -1)?.shape));
  }

  /** Per selected member: what the draft gives on its own section. */
  const preview = $derived.by(() => {
    const d = draft();
    return steelIds.slice(0, 12).map((id) => {
      const sec = sectionOf(id);
      return { id, name: sec?.name ?? '—', r: sec ? endNetArea(sec, d) : null };
    });
  });

  function write(next: (cur: MemberTensionConnection) => MemberTensionConnection) {
    modelStore.batch(() => {
      for (const id of steelIds) {
        const cur = modelStore.elements.get(id)?.tensionConnection ?? {};
        const n = next(cur);
        modelStore.updateElement(id, { tensionConnection: n.i || n.j ? n : undefined });
      }
    });
  }
  function apply() {
    const d = draft();
    const copy = () => JSON.parse(JSON.stringify(d)) as EndConnection;
    write((cur) => ({
      ...cur,
      ...(endSel !== 'j' ? { i: copy() } : {}),
      ...(endSel !== 'i' ? { j: copy() } : {}),
    }));
  }
  function clear() {
    write((cur) => {
      const n: MemberTensionConnection = { ...cur };
      if (endSel !== 'j') delete n.i;
      if (endSel !== 'i') delete n.j;
      return n;
    });
  }
  const anyStored = $derived(steelIds.some((id) => (endSel !== 'j' && storedAt(id, 'i')) || (endSel !== 'i' && storedAt(id, 'j'))));

  /** Stored state summary: described / not described / mixed, per end. */
  function storedSummary(end: 'i' | 'j'): string {
    const v = [...new Set(steelIds.map((id) => (storedAt(id, end) ? 'd' : 'n')))];
    if (v.length !== 1) return t('steel.tc.mixed');
    return v[0] === 'd' ? t('steel.tc.described') : t('steel.tc.notDescribed');
  }

  /**
   * A bolt layout designed at the first member's end node, if any. The joint stores `rows`
   * across the force and `count / rows` bolts in each; its one spacing is the pitch.
   */
  const jointBolts = $derived.by(() => {
    const first = steelIds[0];
    const e = first !== undefined ? modelStore.elements.get(first) : undefined;
    if (!e) return null;
    const nodes = endSel === 'i' ? [e.nodeI] : endSel === 'j' ? [e.nodeJ] : [e.nodeI, e.nodeJ];
    for (const node of nodes) {
      const b = jointDesignStore.choicesFor(node).bolts;
      if (b && b.count > 0 && b.rows > 0 && Number.isInteger(b.count / b.rows)) return { node, b };
    }
    return null;
  });
  function useJoint() {
    if (!jointBolts) return;
    const { b } = jointBolts;
    kind = 'bolted'; diameterMm = b.diameterMm; holeKind = 'standard';
    lines = b.rows; boltsPerLine = b.count / b.rows; pitchMm = b.spacingMm;
  }

  const mm2 = (v: number) => (v * 1e6).toFixed(0);
</script>

<div class={bare ? 'tc-bare' : 'pk-card tc'} data-testid="tc-editor">
  {#if !bare}<h4 class="pk-heading">{t('steel.tc.title')}</h4>{/if}
  <p class="pk-hint">{t('steel.tc.hint')}</p>
  {#if steelIds.length === 0}
    <p class="pk-hint" data-testid="tc-none">{t('steel.tc.none')}</p>
  {:else}
    <p class="tc-now" data-testid="tc-stored">
      {tp('steel.tc.selected', { n: steelIds.length })} · {tp('steel.tc.stored', { i: storedSummary('i'), j: storedSummary('j') })}
    </p>

    <div class="tc-seg" role="radiogroup" aria-label={t('steel.tc.title')}>
      {#each ['both', 'i', 'j'] as const as e (e)}
        <button class="pk-btn" class:pk-btn-primary={endSel === e} role="radio" aria-checked={endSel === e}
          onclick={() => { endSel = e; }} data-testid="tc-end-{e}">{t(`steel.tc.end.${e}`)}</button>
      {/each}
    </div>
    {#if endsDiffer}<p class="pk-hint tc-warn" data-testid="tc-ends-differ">{t('steel.tc.endsDiffer')}</p>{/if}

    <div class="pk-row">
      <select class="pk-grow" value="" onchange={(e) => { const v = e.currentTarget.value; if (v) applyPreset(v as TensionPreset); e.currentTarget.value = ''; }} data-testid="tc-preset">
        <option value="">{t('steel.tc.preset')}</option>
        {#each TENSION_PRESETS as p (p)}<option value={p}>{t(`steel.tc.preset.${p}`)}</option>{/each}
      </select>
    </div>
    <p class="pk-hint">{t('steel.tc.presetHint')}</p>

    <div class="tc-seg">
      <button class="pk-btn" class:pk-btn-primary={kind === 'bolted'} onclick={() => { kind = 'bolted'; }} data-testid="tc-kind-bolted">{t('steel.tc.kind.bolted')}</button>
      <button class="pk-btn" class:pk-btn-primary={kind === 'welded'} onclick={() => { kind = 'welded'; }} data-testid="tc-kind-welded">{t('steel.tc.kind.welded')}</button>
    </div>

    <label class="tc-field">{t('steel.tc.connected')}
      <select bind:value={connected} data-testid="tc-connected">
        {#each options as o (o)}<option value={o}>{t(`steel.tc.connected.${o}`)}</option>{/each}
        {#if !options.includes(connected)}<option value={connected}>{t(`steel.tc.connected.${connected}`)}</option>{/if}
      </select>
    </label>

    {#if kind === 'bolted'}
      <div class="tc-grid">
        <label class="tc-field">{t('steel.tc.diameter')}
          <input type="number" min="6" step="1" list="tc-diameters" bind:value={diameterMm} data-testid="tc-diameter" />
        </label>
        <datalist id="tc-diameters">{#each HOLE_TABLE_DIAMETERS_MM as d (d)}<option value={d}></option>{/each}</datalist>
        <label class="tc-field">{t('steel.tc.holeKind')}
          <select bind:value={holeKind} data-testid="tc-hole">
            <option value="standard">{t('steel.tc.hole.standard')}</option>
            <option value="oversize">{t('steel.tc.hole.oversize')}</option>
          </select>
        </label>
        <label class="tc-field">{t('steel.tc.boltsPerLine')}
          <input type="number" min="1" step="1" bind:value={boltsPerLine} data-testid="tc-bolts" />
        </label>
        <label class="tc-field">{t('steel.tc.lines')}
          <input type="number" min="1" step="1" bind:value={lines} data-testid="tc-lines" />
        </label>
        {#if connected === 'all' && !isPlate}
          <label class="tc-field">{t('steel.tc.webLines')}
            <input type="number" min="0" step="1" bind:value={webLines} data-testid="tc-web-lines" />
          </label>
        {/if}
        <label class="tc-field">{t('steel.tc.pitch')}
          <input type="number" min="0" step="5" bind:value={pitchMm} data-testid="tc-pitch" />
        </label>
      </div>
      <label class="tc-check"><input type="checkbox" bind:checked={staggered} data-testid="tc-stagger" /> {t('steel.tc.stagger')}</label>
      {#if staggered}
        <div class="tc-grid">
          <label class="tc-field">{t('steel.tc.staggerS')}<input type="number" min="0" step="5" bind:value={sMm} data-testid="tc-stagger-s" /></label>
          <label class="tc-field">{t('steel.tc.staggerG')}<input type="number" min="0" step="5" bind:value={gMm} data-testid="tc-stagger-g" /></label>
        </div>
      {/if}
      {#if jointBolts}
        <button class="pk-btn tc-joint" onclick={useJoint} data-testid="tc-from-joint">{tp('steel.tc.fromJoint', {
          node: jointBolts.node, count: jointBolts.b.count, d: jointBolts.b.diameterMm, rows: jointBolts.b.rows, s: jointBolts.b.spacingMm,
        })}</button>
      {/if}
    {:else}
      <div class="tc-grid">
        <label class="tc-field">{t('steel.tc.weld')}
          <select bind:value={weld} data-testid="tc-weld">
            <option value="longitudinal">{t('steel.tc.weld.longitudinal')}</option>
            <option value="transverse">{t('steel.tc.weld.transverse')}</option>
            <option value="longitudinalAndTransverse">{t('steel.tc.weld.longitudinalAndTransverse')}</option>
          </select>
        </label>
        {#if weld !== 'transverse'}
          <label class="tc-field">{t('steel.tc.weldLength')}
            <input type="number" min="0" step="10" bind:value={lengthMm} data-testid="tc-weld-length" />
          </label>
        {/if}
      </div>
      <p class="pk-hint">{t('steel.tc.weldNoHoles')}</p>
    {/if}

    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={apply} data-testid="tc-apply">{tp('steel.tc.apply', { n: steelIds.length })}</button>
      <button class="pk-btn" onclick={clear} disabled={!anyStored} data-testid="tc-clear">{t('steel.tc.clear')}</button>
    </div>

    <p class="tc-sub">{t('steel.tc.preview')}</p>
    <table class="tc-table" data-testid="tc-preview">
      <thead><tr><th>{t('steel.tc.col.member')}</th><th>{t('steel.tc.col.section')}</th><th>An</th><th>U</th><th>Ae</th></tr></thead>
      <tbody>
        {#each preview as row (row.id)}
          <tr data-testid="tc-preview-{row.id}">
            <td>#{row.id}</td>
            <td>{row.name}</td>
            {#if row.r && !('refused' in row.r)}
              <td class="num">{mm2(row.r.An)} mm²</td>
              <td class="num">{row.r.U.toFixed(3)}</td>
              <td class="num" title={row.r.clause}>{mm2(row.r.Ae)} mm² <span class="tc-clause">{row.r.clause}</span></td>
            {:else}
              <td colspan="3" class="tc-refused" data-testid="tc-preview-refused-{row.id}">
                {row.r ? t(`steel.tc.refuse.${row.r.refused.code}`) : '—'}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="pk-hint">{t('steel.tc.chainNote')}</p>
  {/if}
</div>

<style>
  .tc { margin-top: 6px; }
  .tc-bare { display: flex; flex-direction: column; gap: 0.45rem; }
  .tc-now { margin: 0 0 4px; font-size: 0.64rem; color: var(--st-text-2); }
  .tc-seg { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }
  .tc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 4px 8px; }
  .tc-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.64rem; color: var(--st-text-2); }
  .tc-field input, .tc-field select { width: 100%; min-width: 0; }
  .tc-check { font-size: 0.66rem; display: flex; gap: 4px; align-items: center; margin: 4px 0; }
  .tc-sub { margin: 6px 0 2px; font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .tc-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; }
  .tc-table th, .tc-table td { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  .tc-table .num { font-family: var(--st-mono); text-align: right; white-space: nowrap; }
  .tc-clause { color: var(--st-text-3); font-size: 0.58rem; }
  .tc-refused { color: var(--st-warn); }
  .tc-warn { color: var(--st-warn); }
  .tc-joint { margin: 4px 0; text-align: left; white-space: normal; }
</style>
