<script lang="ts">
  /**
   * Draw a section from parts: plates, tubes, circles, polygons, bent plates and catalogue
   * profiles, each with its material, and read its properties as it is drawn.
   *
   * What reaches the model is the parts themselves (`Section.drawn`), so reopening the section
   * reopens this drawing, and the properties are recomputed from them wherever they are read.
   */
  import { untrack } from 'svelte';
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { ALL_PROFILES } from '../../../lib/data/steel-profiles';
  import { catalogueOutline } from '../../../lib/section/canonical';
  import {
    attachOffset, nextPartId, type DrawnSection, type DrawnPart, type DrawnShape, type DrawnIssue, type Pt,
  } from '../../../lib/section/drawn';
  import { analyzeDrawn, materialAreas, type DrawnAnalysis } from '../../../lib/section/drawn-properties';
  import { dxfSectionParts } from '../../../lib/section/drawn-dxf';
  import { STARTERS, starterParts, type StarterId } from '../../../lib/section/drawn-starters';
  import type { SectionChoice } from '../../../lib/section/section-choice';
  import type { DxfUnit } from '../../../lib/dxf/types';
  import DrawnSectionCanvas from './DrawnSectionCanvas.svelte';
  import DrawnPartEditor from './DrawnPartEditor.svelte';
  import DrawnSectionProps from './DrawnSectionProps.svelte';

  interface Props {
    onDraft: (choice: SectionChoice | null) => void;
    initial?: { name: string; drawn: DrawnSection } | null;
  }
  const args: Props = $props();

  const materials = $derived([...modelStore.materials.values()].map((m) => ({ id: m.id, name: m.name, e: m.e, nu: m.nu, rho: m.rho })));
  let drawn = $state<DrawnSection>(untrack(() => structuredClone(args.initial?.drawn ?? { version: 1, parts: starterParts('weldedI', catalogueOutline) })));
  let name = $state(untrack(() => args.initial?.name ?? t('drawn.defaultName')));
  let selected = $state<number | null>(null);
  let dragging = $state(false);

  const refId = $derived(drawn.refMaterialId ?? materials[0]?.id ?? null);
  const refMat = $derived(materials.find((m) => m.id === refId));
  const shearModulus = (m: { e: number; nu: number }) => m.e / (2 * (1 + m.nu));

  /*
   * The ratios are refreshed from the materials as they are now, every time the drawing changes
   * hands, so a material edited since the section was drawn is read at its current modulus.
   */
  const withRatios = (d: DrawnSection): DrawnSection => {
    if (!refMat) return d;
    return {
      ...d,
      parts: d.parts.map((p) => {
        if (p.materialId == null || p.materialId === refId) {
          const { materialId: _m, ratio: _r, ...rest } = p;
          return rest;
        }
        const m = materials.find((x) => x.id === p.materialId);
        return m ? { ...p, ratio: { e: m.e / refMat.e, g: shearModulus(m) / shearModulus(refMat) } } : p;
      }),
    };
  };
  const effective = $derived(withRatios(drawn));

  /** kg/m³ from the material's unit weight, kN/m³. */
  const density = (id: number | null) => {
    const m = materials.find((x) => x.id === (id ?? refId));
    return m ? (m.rho * 1000) / 9.80665 : undefined;
  };
  const analysis = $derived.by((): DrawnAnalysis | null => {
    try {
      return analyzeDrawn(effective, catalogueOutline, { density, torsion: !dragging });
    } catch {
      return null;
    }
  });
  const sp = $derived(analysis?.properties ?? null);
  const issues = $derived(analysis?.assembled.issues ?? []);
  const materialOrder = $derived<Array<number | null>>([null, ...materials.filter((m) => m.id !== refId).map((m) => m.id)]);

  $effect(() => {
    const p = sp;
    const nm = name.trim();
    // Mid-drag the torsion is not solved, so the last complete draft stands until the drop.
    if (dragging) return;
    if (!p || !nm) { args.onDraft(null); return; }
    const bb = p.bbox;
    const d = $state.snapshot(effective) as DrawnSection;
    // More than one material: each one's real area, for weight and quantities (`drawn.ts`).
    const regions = analysis?.assembled.regions ?? [];
    const areas = regions.length > 1 ? materialAreas(analysis!.assembled) : undefined;
    const { areas: _stale, ...rest } = d;
    const withAreas: DrawnSection = areas ? { ...rest, areas } : rest;
    args.onDraft({
      kind: 'drawn', name: nm,
      drawn: refId != null ? { ...withAreas, refMaterialId: refId } : withAreas,
      props: { a: p.a, iy: p.iy, iz: p.iz, j: p.j, b: bb[2] - bb[0], h: bb[3] - bb[1] },
    });
  });

  // ── Editing ──
  const replace = (part: DrawnPart) => { drawn = { ...drawn, parts: drawn.parts.map((p) => (p.id === part.id ? part : p)) }; };
  function add(shape: DrawnShape, extra: Partial<DrawnPart> = {}) {
    const id = nextPartId(drawn);
    // A new part goes above everything, so it never lands overlapping what is there.
    const top = sp ? sp.bbox[3] : 0;
    const part: DrawnPart = { id, shape, at: [0, 0], rotationDeg: 0, ...extra };
    const probe = { ...part };
    const outline = catalogueOutline;
    const others = drawn.parts.filter((p) => !p.void);
    const at = others.length > 0 && !extra.void ? attachOffset(probe, others[others.length - 1]!, 'top', 'centre', outline) : null;
    drawn = { ...drawn, parts: [...drawn.parts, { ...part, at: at ?? [0, extra.void ? 0 : top] }] };
    selected = id;
  }
  const NEW: Record<string, () => void> = {
    rect: () => add({ kind: 'rect', b: 0.2, h: 0.012 }),
    hollowRect: () => add({ kind: 'hollowRect', b: 0.1, h: 0.1, t: 0.005 }),
    circle: () => add({ kind: 'circle', d: 0.05 }),
    tube: () => add({ kind: 'tube', d: 0.1143, t: 0.006 }),
    polygon: () => add({ kind: 'polygon', points: [[-0.05, 0], [0.05, 0], [0, 0.08]] }),
    polyline: () => add({ kind: 'polyline', points: [[0, 0.1], [0, 0], [0.08, 0]], t: 0.004 }),
    profile: () => add({ kind: 'profile', name: 'IPE 200' }),
    hole: () => add({ kind: 'circle', d: 0.02 }, { void: true, at: [0, 0] }),
  };
  function attach(target: number, side: 'top' | 'bottom' | 'left' | 'right', align: 'start' | 'centre' | 'end') {
    const part = drawn.parts.find((p) => p.id === selected);
    const tgt = drawn.parts.find((p) => p.id === target);
    if (!part || !tgt) return;
    const at = attachOffset(part, tgt, side, align, catalogueOutline);
    if (at) replace({ ...part, at });
  }
  function duplicate() {
    const part = drawn.parts.find((p) => p.id === selected);
    if (!part) return;
    const id = nextPartId(drawn);
    drawn = { ...drawn, parts: [...drawn.parts, { ...structuredClone($state.snapshot(part)) as DrawnPart, id, mirror: !part.mirror || undefined }] };
    selected = id;
  }
  function remove() {
    drawn = { ...drawn, parts: drawn.parts.filter((p) => p.id !== selected) };
    selected = null;
  }
  function start(id: StarterId) {
    drawn = { ...drawn, parts: starterParts(id, catalogueOutline) };
    selected = null;
    name = t(`drawn.starter.${id}`);
  }

  // ── Import ──
  let dxfUnit = $state<DxfUnit>('mm');
  let importNote = $state<string | null>(null);
  async function importDxf(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    const r = dxfSectionParts(await file.text(), dxfUnit, 1);
    if (r.parts.length === 0) { importNote = t('drawn.dxfNothing').replace('{open}', String(r.open)); return; }
    drawn = { ...drawn, parts: r.parts };
    selected = null;
    importNote = t('drawn.dxfRead').replace('{loops}', String(r.loops)).replace('{circles}', String(r.circles)).replace('{open}', String(r.open));
  }
  /** Sections of this project that can become parts: drawn ones by their parts, catalogue ones as a profile. */
  const projectSections = $derived([...modelStore.sections.values()].filter((s) => s.drawn || catalogueOutline(s.name)));
  function fromProject(id: number) {
    const s = modelStore.sections.get(id);
    if (!s) return;
    if (s.drawn) {
      let next = nextPartId(drawn);
      const parts = s.drawn.parts.map((p) => ({ ...structuredClone($state.snapshot(p)) as DrawnPart, id: next++ }));
      drawn = { ...drawn, parts: [...drawn.parts, ...parts] };
    } else {
      add({ kind: 'profile', name: s.name });
    }
  }

  const profileNames = ALL_PROFILES.map((p) => p.name);
  const selectedPart = $derived(drawn.parts.find((p) => p.id === selected) ?? null);

  function issueText(i: DrawnIssue): string {
    switch (i.kind) {
      case 'overlap': return t(i.sameMaterial ? 'drawn.issue.overlapSame' : 'drawn.issue.overlapMixed')
        .replace('{a}', String(i.partIds[0])).replace('{b}', String(i.partIds[1])).replace('{area}', (i.area * 1e6).toFixed(0));
      case 'loose': return t('drawn.issue.loose').replace('{n}', String(i.pieces));
      case 'holeOutside': return t(i.fully ? 'drawn.issue.holeOutside' : 'drawn.issue.holeEdge').replace('{id}', String(i.partId));
      case 'degenerate': return t('drawn.issue.degenerate').replace('{id}', String(i.partId));
      case 'unknownProfile': return t('drawn.issue.unknownProfile').replace('{id}', String(i.partId)).replace('{name}', i.name);
      case 'empty': return t('drawn.issue.empty');
    }
  }
</script>

<div class="drawn-editor" data-testid="drawn-editor">
  <div class="bar">
    <label class="name">{t('drawn.name')}<input type="text" bind:value={name} data-testid="drawn-name" /></label>
    <select
      data-testid="drawn-starter"
      value=""
      onchange={(e) => { const v = e.currentTarget.value as StarterId | ''; if (v) start(v); e.currentTarget.value = ''; }}
    >
      <option value="">{t('drawn.startFrom')}</option>
      {#each STARTERS as s (s)}<option value={s}>{t(`drawn.starter.${s}`)}</option>{/each}
    </select>
  </div>

  <div class="bar add" role="toolbar" aria-label={t('drawn.add')}>
    <span>{t('drawn.add')}</span>
    {#each Object.keys(NEW) as k (k)}
      <button type="button" data-testid="drawn-add-{k}" onclick={NEW[k]}>{t(k === 'hole' ? 'drawn.hole' : `drawn.shape.${k}`)}</button>
    {/each}
  </div>

  <div class="bar">
    <label class="file">
      {t('drawn.importDxf')}
      <input type="file" accept=".dxf" data-testid="drawn-dxf" onchange={importDxf} />
    </label>
    <select bind:value={dxfUnit} aria-label={t('drawn.dxfUnit')}>
      <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
    </select>
    {#if projectSections.length > 0}
      <select
        data-testid="drawn-from-project" value=""
        onchange={(e) => { const v = e.currentTarget.value; if (v) fromProject(Number(v)); e.currentTarget.value = ''; }}
      >
        <option value="">{t('drawn.fromProject')}</option>
        {#each projectSections as s (s.id)}<option value={String(s.id)}>{s.name}</option>{/each}
      </select>
    {/if}
    {#if materials.length > 1}
      <label>{t('drawn.reference')}
        <select value={String(refId)} data-testid="drawn-ref-material" onchange={(e) => (drawn = { ...drawn, refMaterialId: Number(e.currentTarget.value) })}>
          {#each materials as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
  {#if importNote}<p class="note" data-testid="drawn-import-note">{importNote}</p>{/if}

  <div class="main">
    <div class="left">
      <DrawnSectionCanvas
        drawn={effective} {sp} {selected} profile={catalogueOutline} {materialOrder}
        materialNames={new Map([[null, refMat?.name ?? ''], ...materials.map((m) => [m.id, m.name] as [number, string])])}
        onSelect={(id) => (selected = id)}
        onMove={(id, at: Pt) => { const p = drawn.parts.find((x) => x.id === id); if (p) replace({ ...p, at }); }}
        onDrag={(d) => (dragging = d)}
      />
      <div class="chips" role="listbox" aria-label={t('drawn.parts')}>
        {#each drawn.parts as p (p.id)}
          <button
            type="button" role="option" aria-selected={p.id === selected} class:on={p.id === selected}
            data-testid="drawn-part-chip" onclick={() => (selected = p.id)}
          >#{p.id} {p.void ? t('drawn.hole') : t(`drawn.shape.${p.shape.kind}`)}</button>
        {/each}
      </div>
      {#if selectedPart}
        <DrawnPartEditor
          part={selectedPart}
          others={drawn.parts.filter((p) => p.id !== selectedPart.id)}
          {materials} refMaterialId={refId} {profileNames}
          onChange={replace} onAttach={attach} onDuplicate={duplicate} onDelete={remove}
        />
      {/if}
      {#if issues.length > 0}
        <ul class="issues" data-testid="drawn-issues">
          {#each issues as i, k (k)}
            <li class={i.severity}>{issueText(i.issue)}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="right">
      {#if sp}
        <DrawnSectionProps values={sp} />
      {:else}
        <p class="note">{t(analysis ? 'drawn.fixErrors' : 'drawn.engineNotReady')}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .drawn-editor { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.7rem; color: var(--st-text-2); }
  .bar.add span { color: var(--st-text-3); }
  label { display: flex; align-items: center; gap: 4px; }
  .name input { width: 12rem; }
  input, select { background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 2px 4px; font-size: 0.7rem; }
  .file input { width: 11rem; }
  button { padding: 2px 8px; font-size: 0.68rem; background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); border-radius: 3px; cursor: pointer; }
  button:hover { color: var(--st-text); border-color: var(--st-interactive); }
  .main { display: flex; gap: 10px; min-height: 0; }
  .left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .right { width: 210px; flex-shrink: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button.on { border-color: var(--st-selected); color: var(--st-text); }
  .issues { margin: 0; padding-left: 1rem; font-size: 0.68rem; line-height: 1.4; }
  .issues .error { color: var(--st-danger); }
  .issues .warning { color: var(--st-text-3); }
  .note { margin: 0; font-size: 0.68rem; color: var(--st-text-3); line-height: 1.35; }
</style>
