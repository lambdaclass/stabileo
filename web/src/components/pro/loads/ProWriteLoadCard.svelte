<script lang="ts">
  /**
   * Write a load: its kind, its values, and what it goes on (`LoadTargetPicker`), added in one undo
   * step to the active case. What the form describes is `model/loads/write-load.ts`'s: the numbers
   * read by the app's one rule (a field empty is the default it names, a J value empty is the I
   * value, a field that does not read refuses the add), and a stretch or a point that does not fit
   * its member refused, the members named.
   *
   * Values are in SI, as the rest of the model is typed: kN, kN/m, kN·m, m, °C; the displacements and
   * eccentricities in mm, as they are measured, kept in m.
   */
  import { untrack } from 'svelte';
  import { modelStore, uiStore } from '../../../lib/store';
  import { drawState } from '../../../lib/store/draw-state.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import type { Load } from '../../../lib/store/model.svelte';
  import { addLoads } from '../../../lib/store/load-ops';
  import { resolveTargets, type TargetEntity } from '../../../lib/model/loads/load-targets';
  import { inclinedForce, type GlobalAxis } from '../../../lib/model/loads/member-load-tools';
  import { buildWrittenLoads, type WriteKind, type WriteOutcome, type WriteRefusal } from '../../../lib/model/loads/write-load';
  import { loadedLength } from '../../../lib/model/loads/load-stretch';
  import { memberRef3D } from '../../../lib/engine/solver-service';
  import type { GlobalAxis as SwAxis, SelfWeightLoad } from '../../../lib/engine/analysis-settings';
  import type { MemberFrame } from '../../../lib/engine/member-loads';
  import LoadTargetPicker, { type PickedSpec } from './LoadTargetPicker.svelte';
  import QuantityInput from './QuantityInput.svelte';
  import LoadSketch, { type SketchInput } from './LoadSketch.svelte';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import ProShellLoadForm from './ProShellLoadForm.svelte';
  import type { ShellRef } from '../../../lib/model/loads/shell-load-tools';

  type Kind = 'nodal' | 'displacement' | 'distributed' | 'point' | 'thermal' | 'strain' | 'prestress' | 'surface' | 'hydro' | 'shellPoint' | 'thermalQuad' | 'selfWeight';
  type Group = 'node' | 'member' | 'slab' | 'general';
  const KINDS: Array<{ id: Kind; group: Group }> = [
    { id: 'nodal', group: 'node' }, { id: 'displacement', group: 'node' },
    { id: 'distributed', group: 'member' }, { id: 'point', group: 'member' }, { id: 'thermal', group: 'member' },
    { id: 'strain', group: 'member' }, { id: 'prestress', group: 'member' },
    { id: 'surface', group: 'slab' }, { id: 'hydro', group: 'slab' }, { id: 'shellPoint', group: 'slab' }, { id: 'thermalQuad', group: 'slab' },
    // The self-weight is a rule of the case, kept on the model (`analysis.selfWeight`), not loads.
    { id: 'selfWeight', group: 'general' },
  ];
  let kind = $state<Kind>('nodal');
  const group = $derived(KINDS.find((k) => k.id === kind)!.group);
  // The self-weight goes on members (and, on the whole model or a group, on their shells too).
  const entity = $derived<TargetEntity>(group === 'node' ? 'nodes' : group === 'member' || group === 'general' ? 'members' : 'quads');
  let target = $state<PickedSpec>({ by: 'selection' });
  let summary = $state<{ text: string; warn: boolean }>({ text: '', warn: false });
  /** Another kind: the self-weight starts on the whole model, the rest on the selection. */
  function pick(k: Kind) {
    const was = group;
    kind = k; error = null; done = null;
    if (group !== was && (group === 'general' || target.by === 'all')) target = { by: group === 'general' ? 'all' : 'selection' };
  }
  // Opened on a node from the model's context menu: a node's load, on the selection.
  $effect.pre(() => {
    if (drawState.writeSeq > 0) untrack(() => {
      target = { by: 'selection' };
      if (entity !== 'nodes') kind = 'nodal';
    });
  });

  /*
   * Every field with a magnitude is a `QuantityInput`: typed in the display units, kept here in SI,
   * `null` while empty (the default its placeholder names).
   */
  type N = number | null;
  /** A field's value; empty is `fallback`. */
  const num = (v: N, fallback = 0): number => v ?? fallback;
  /** A field's value, or null when it is empty. */
  const opt = (v: N): N => v;

  // ── Nodal ──
  let f = $state<Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', N>>({ fx: null, fy: null, fz: null, mx: null, my: null, mz: null });
  let inclined = $state(false);
  let incF = $state<N>(null);
  /*
   * An inclined force's direction: from an origin (a node or a point) toward the node it acts at,
   * each node Apply to names. Only the origin is typed; where it goes is where it is applied.
   */
  let incFromKind = $state<'node' | 'point'>('node');
  let incFromNode = $state('');
  let incFrom = $state<Record<'x' | 'y' | 'z', N>>({ x: null, y: null, z: null });
  /** The origin, or null while it names none. */
  function incOrigin(): { x: number; y: number; z?: number } | null {
    if (incFromKind === 'node') return modelStore.nodes.get(Number(incFromNode)) ?? null;
    const p = incFrom;
    return p.x === null && p.y === null && p.z === null ? null : { x: num(p.x), y: num(p.y), z: num(p.z) };
  }
  /** The force at the loaded node `at`, from the origin toward it; null when they make no direction. */
  function inclinedAt(at: { x: number; y: number; z?: number }, F: number) {
    const from = incOrigin();
    return from ? inclinedForce(from, at, F) : null;
  }
  // ── Displacement ──
  let u = $state<Record<'dx' | 'dy' | 'dz' | 'drx' | 'dry' | 'drz', N>>({ dx: null, dy: null, dz: null, drx: null, dry: null, drz: null });
  // ── Distributed ──
  let frame = $state<MemberFrame>('local');
  let shape = $state<'trapezoid' | 'triangle' | 'hydrostatic'>('trapezoid');
  let q = $state<Record<'xI' | 'xJ' | 'yI' | 'yJ' | 'zI' | 'zJ', N>>({ xI: null, xJ: null, yI: null, yJ: null, zI: null, zJ: null });
  let qa = $state<N>(null), qb = $state<N>(null);
  let peak = $state<N>(null), peakAt = $state<N>(null), peakComp = $state<'x' | 'y' | 'z'>('z');
  let w1 = $state<N>(null), w2 = $state<N>(null), hydroAxis = $state<GlobalAxis>('Z'), hydroComp = $state<'x' | 'y' | 'z'>('x');
  // ── Point ──
  let pFrame = $state<'local' | 'global'>('local');
  let p = $state<Record<'px' | 'py' | 'pz' | 'mx' | 'my' | 'mz', N>>({ px: null, py: null, pz: null, mx: null, my: null, mz: null });
  let pa = $state<N>(null);
  // ── Thermal, strain, tendon ──
  let th = $state<Record<'dt' | 'gz' | 'gy', N>>({ dt: null, gz: null, gy: null });
  let strainBy = $state<'unit' | 'length'>('unit');
  /** ε₀ in ‰: a ratio, typed as it is. */
  let strainPerMil = $state('');
  /** ΔL, a length. */
  let strainDL = $state<N>(null);
  let ps = $state<Record<'force' | 'eI' | 'eM' | 'eJ', N>>({ force: null, eI: null, eM: null, eJ: null });
  // ── Slabs ──
  let tq = $state<Record<'dt' | 'g', N>>({ dt: null, g: null });
  // ── Self-weight ──
  let swDir = $state<SwAxis>('Z');
  let swFactor = $state('-1');

  let error = $state<string | null>(null);
  let done = $state<string | null>(null);

  const caseId = $derived(uiStore.activeLoadCaseId);
  const quadSelection = $derived([...uiStore.selectedShells].filter((k) => k[0] === 'q').map((k) => Number(k.slice(1))));
  const plateSelection = $derived([...uiStore.selectedShells].filter((k) => k[0] === 'p').map((k) => Number(k.slice(1))));
  const sel = () => ({ nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, quads: quadSelection, plates: plateSelection });
  const targets = (): number[] => (target.by === 'chain' ? [...uiStore.selectedElements]
    : resolveTargets(entity, target, modelStore.model as never, sel()));
  /** The shells picked, quads and triangles; typed ids name quads. */
  function shellTargets(): ShellRef[] {
    const of = (kind: 'quads' | 'plates') => (kind === 'plates' && target.by === 'ids' ? [] : resolveTargets(kind, target as never, modelStore.model as never, sel()));
    const ref = (id: number, on?: 'plate'): ShellRef | null => {
      const sh = on ? modelStore.plates.get(id) : modelStore.quads.get(id);
      const pts = sh?.nodes.map((n) => modelStore.nodes.get(n));
      return sh && pts && pts.every(Boolean) ? { id, ...(on ? { on } : {}), nodes: [...sh.nodes], pts: pts as ShellRef['pts'] } : null;
    };
    return [...of('quads').map((id) => ref(id)), ...of('plates').map((id) => ref(id, 'plate'))].filter((r): r is ShellRef => !!r);
  }
  let shellForm = $state<ProShellLoadForm | null>(null);
  let shellSketch = $state<SketchInput['shell']>(undefined);
  /** What the fields say, drawn beside them (`LoadSketch`). */
  const sketch = $derived<SketchInput>({
    kind, frame, shape, f, inclined, incF, incFromKind, incFromNode, incFrom, u, q, qa, qb, peak, peakAt, peakComp, w1, w2, hydroAxis, hydroComp,
    pFrame, p, pa, th, strainBy, strain: strainBy === 'unit' ? (strainPerMil.trim() === '' ? null : parseDecimal(strainPerMil)) : strainDL,
    ps, tq, swDir, swFactor: swFactor.trim() === '' ? null : parseDecimal(swFactor), shell: shellSketch,
  });

  /** The loads the form describes, on its targets; a reason when it describes none. */
  function build(): WriteOutcome | WriteRefusal {
    // Slab loads act on quads and triangles through one integral (`shell-load-integration.ts`).
    if (kind === 'surface' || kind === 'hydro' || kind === 'shellPoint') {
      return shellForm ? shellForm.build(shellTargets(), caseId) : { error: 'writeLoad.noTarget' };
    }
    if (kind === 'thermalQuad') {
      const shells = shellTargets();
      if (!shells.length) return { error: 'writeLoad.noTarget' };
      const dt = num(tq.dt), g = num(tq.g);
      if (dt === 0 && g === 0) return { error: 'writeLoad.zero' };
      return { loads: shells.map((sh) => ({ type: 'thermalQuad3d', data: { id: 0, quadId: sh.id, ...(sh.on ? { on: sh.on } : {}), dtUniform: dt, dtGradient: g, caseId } }) as Load) };
    }
    // A strain by unit is typed in ‰, as text: one that does not read refuses the add.
    const perMil = strainPerMil.trim() === '' ? null : parseDecimal(strainPerMil);
    if (kind === 'strain' && strainBy === 'unit' && strainPerMil.trim() !== '' && perMil === null) return { error: 'pro.loadUnreadable' };
    return buildWrittenLoads({
      kind: kind as WriteKind, f, inclined, incF, incFromKind, incFromNode, incFrom, u, frame, shape, q, qa, qb, peak, peakAt, peakComp,
      w1, w2, hydroAxis, hydroComp, pFrame, p, pa, th, strainBy, strainVal: strainBy === 'unit' ? perMil : strainDL, ps, sq: null, tq,
    }, {
      caseId, ids: targets(), chain: target.by === 'chain',
      node: (id) => modelStore.nodes.get(id),
      element: (id) => modelStore.elements.get(id),
      axes: (id) => memberRef3D(modelStore.model as never, id)?.axes ?? null,
      length: (id) => loadedLength(modelStore.model as never, id),
    });
  }

  /** The self-weight on what Apply to names, in the active case; one with the same case, axis and reach takes the new factor. */
  function addSelfWeight() {
    const f = swFactor.trim() === '' ? null : parseDecimal(swFactor);
    if (f === null || f === 0) { error = t('writeLoad.zero'); done = null; return; }
    const reach: Pick<SelfWeightLoad, 'elements' | 'groupId'> = target.by === 'all' ? {}
      : target.by === 'group' ? { groupId: target.groupId }
      : { elements: resolveTargets('members', target as never, modelStore.model as never, sel()) };
    if (reach.elements?.length === 0 || (reach.groupId !== undefined && !modelStore.model.groups.has(reach.groupId))) { error = t('writeLoad.noTarget'); done = null; return; }
    const rule: SelfWeightLoad = { caseId: caseId ?? modelStore.model.loadCases[0]?.id ?? 1, direction: swDir, factor: f, ...reach };
    const key = (r: SelfWeightLoad) => JSON.stringify([r.caseId, r.direction, r.groupId ?? null, r.elements ? [...r.elements].sort((a, b) => a - b) : null]);
    const now = modelStore.analysis?.selfWeight ?? [];
    const same = now.findIndex((r) => key(r) === key(rule));
    modelStore.setAnalysis({ selfWeight: same >= 0 ? now.map((r, i) => (i === same ? rule : r)) : [...now, rule] });
    error = null;
    const c = modelStore.model.loadCases.find((lc) => lc.id === rule.caseId)?.name ?? '';
    done = tp(same >= 0 ? 'writeLoad.swReplaced' : 'writeLoad.swAdded', { case: c, f: String(f).replace('-', '−'), dir: swDir });
  }

  function add() {
    if (kind === 'selfWeight') { addSelfWeight(); return; }
    const res = build();
    if ('error' in res) { error = tp(res.error, res.params); done = null; return; }
    addLoads(res.loads);
    error = null;
    done = tp('writeLoad.added', { n: res.loads.length, case: modelStore.model.loadCases.find((lc) => lc.id === caseId)?.name ?? '' })
      + (res.skipped ? ` ${tp(res.skipped.key, { list: res.skipped.ids.join(', ') })}` : '');
  }

  const incPreview = $derived.by(() => {
    if (!inclined || kind !== 'nodal') return null;
    const first = [...uiStore.selectedNodes][0];
    const at = first !== undefined ? modelStore.nodes.get(first) : undefined;
    const F = opt(incF);
    return F && at ? inclinedAt(at, F) : null;
  });
</script>

<div class="wl" data-testid="write-load-form">
  <!-- What the load is: its case and its kind, a list grouped by what it goes on. -->
  <div class="wl-head">
    <div class="fg-r"><span class="fg-l">{t('pro.writeLoadCase')}</span>
      <select class="fg-wide" bind:value={uiStore.activeLoadCaseId} data-testid="write-load-case">
        {#each modelStore.model.loadCases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.kindShort')}</span>
      <select class="fg-wide" value={kind} onchange={(e) => pick(e.currentTarget.value as Kind)} aria-label={t('writeLoad.kind')} data-testid="wl-kind">
        {#each ['node', 'member', 'slab', 'general'] as g (g)}
          <optgroup label={t(`writeLoad.group.${g}`)}>
            {#each KINDS.filter((k) => k.group === g) as k (k.id)}<option value={k.id}>{t(`writeLoad.kind.${k.id}`)}</option>{/each}
          </optgroup>
        {/each}
      </select></div>
  </div>

  <!-- The fields, and beside them a sketch of what they stand for, drawn from what is typed. -->
  <div class="wl-body" class:wl-body-mobile={uiStore.isMobile}>
  <div class="wl-fields">
  {#if kind === 'nodal'}
    <label class="wl-check fg-full"><input type="checkbox" bind:checked={inclined} data-testid="wl-inclined" /> {t('writeLoad.inclined')}</label>
    {#if inclined}
      <div class="fg-r"><span class="fg-l">F</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={incF} quantity="force" testid="wl-inc-f" /><span class="fg-u">{unitQ('force')}</span></div>
      <div class="fg-r"><span class="fg-l">{t('writeLoad.from')}</span>
        <select class="fg-wide" bind:value={incFromKind} data-testid="wl-inc-from-kind">
          <option value="node">{t('writeLoad.inc.node')}</option>
          <option value="point">{t('writeLoad.inc.point')}</option>
        </select></div>
      {#if incFromKind === 'node'}
        <div class="fg-r"><span class="fg-l">{t('writeLoad.node')}</span><input type="text" inputmode="numeric" bind:value={incFromNode} class="fg-in" placeholder="ID" data-testid="wl-inc-from-node" /></div>
      {:else}
        <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
        <div class="fg-r"><span class="fg-l">{t('writeLoad.point')}</span>
          {#each ['x', 'y', 'z'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={incFrom[k]} quantity="length" testid="wl-inc-from-{k}" />{/each}<span class="fg-u">{unitQ('length')}</span></div>
      {/if}
      <div class="fg-r"><span class="fg-l">{t('writeLoad.toward')}</span><span class="fg-wide wl-toward" data-testid="wl-inc-toward">{t('writeLoad.towardLoaded')}</span></div>
      {#if incPreview}<p class="wl-hint fg-full" data-testid="wl-inc-preview">{tp('writeLoad.inclinedPreview', { fx: fmtQ(incPreview[0], 'force'), fy: fmtQ(incPreview[1], 'force'), fz: fmtQ(incPreview[2], 'force'), u: unitQ('force') })}</p>{/if}
    {:else}
      <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
      <div class="fg-r"><span class="fg-l">F</span>
        {#each ['fx', 'fy', 'fz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={f[k]} quantity="force" testid="wl-{k}" ariaLabel={k.toUpperCase()} />{/each}<span class="fg-u">{unitQ('force')}</span></div>
      <div class="fg-r"><span class="fg-l">M</span>
        {#each ['mx', 'my', 'mz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={f[k]} quantity="moment" testid="wl-{k}" ariaLabel={k.toUpperCase()} />{/each}<span class="fg-u">{unitQ('moment')}</span></div>
    {/if}
  {:else if kind === 'displacement'}
    <p class="wl-hint fg-full">{t('writeLoad.displacementHint')}</p>
    <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
    <div class="fg-r"><span class="fg-l">d</span>
      {#each ['dx', 'dy', 'dz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={u[k]} quantity="displacement" testid="wl-{k}" ariaLabel={k} />{/each}<span class="fg-u">{unitQ('displacement')}</span></div>
    <div class="fg-r"><span class="fg-l">θ</span>
      {#each ['drx', 'dry', 'drz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={u[k]} quantity="rotation" testid="wl-{k}" ariaLabel={k} />{/each}<span class="fg-u">rad</span></div>
  {:else if kind === 'distributed'}
    <div class="fg-r"><span class="fg-l">{t('loads.frame')}</span>
      <select class="fg-wide" bind:value={frame} data-testid="wl-frame" title={t('loads.frameHelp')}>
        <option value="local">{t('loads.frame.local')}</option>
        <option value="global">{t('loads.frame.global')}</option>
        <option value="projected">{t('loads.frame.projected')}</option>
      </select></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shape')}</span>
      <select class="fg-wide" bind:value={shape} data-testid="wl-shape">
        <option value="trapezoid">{t('writeLoad.shape.trapezoid')}</option>
        <option value="triangle">{t('writeLoad.shape.triangle')}</option>
        <option value="hydrostatic">{t('writeLoad.shape.hydrostatic')}</option>
      </select></div>
    {#if shape === 'trapezoid'}
      <div class="fg-r fg-head"><span></span><span>I</span><span>J</span></div>
      {#each [['x', 'xI', 'xJ'], ['y', 'yI', 'yJ'], ['z', 'zI', 'zJ']] as const as [c, i, j] (c)}
        <div class="fg-r"><span class="fg-l">{frame === 'local' ? `q${c}` : `q${c.toUpperCase()}`}</span>
          <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={q[i]} quantity="distributedLoad" testid="wl-q{c}i" />
          <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={q[j]} quantity="distributedLoad" placeholder={t('writeLoad.sameAsI')} testid="wl-q{c}j" />
          <span class="fg-u fg-u2">{unitQ('distributedLoad')}</span></div>
      {/each}
      <div class="fg-r"><span class="fg-l">a</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={qa} quantity="length" placeholder="0" testid="wl-a" /><span class="fg-u">{unitQ('length')}</span></div>
      <div class="fg-r"><span class="fg-l">b</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={qb} quantity="length" placeholder="L" testid="wl-b" /><span class="fg-u">{unitQ('length')}</span></div>
      <p class="wl-hint fg-full">{t('writeLoad.abHint')}</p>
    {:else if shape === 'triangle'}
      <div class="fg-r"><span class="fg-l">{t('writeLoad.peak')}</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={peak} quantity="distributedLoad" testid="wl-peak" /><span class="fg-u">{unitQ('distributedLoad')}</span></div>
      <div class="fg-r"><span class="fg-l">{t('writeLoad.along')}</span><select class="fg-in" bind:value={peakComp} data-testid="wl-peak-comp">{#each ['x', 'y', 'z'] as c (c)}<option value={c}>{frame === 'local' ? c : c.toUpperCase()}</option>{/each}</select></div>
      <div class="fg-r"><span class="fg-l">{t('writeLoad.peakAt')}</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={peakAt} quantity="length" placeholder="L/2" testid="wl-peak-at" /><span class="fg-u">{unitQ('length')}</span></div>
    {:else}
      <div class="fg-r"><span class="fg-l">w₁</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={w1} quantity="distributedLoad" testid="wl-w1" /><span class="fg-u">{unitQ('distributedLoad')}</span></div>
      <div class="fg-r"><span class="fg-l">w₂</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={w2} quantity="distributedLoad" testid="wl-w2" /><span class="fg-u">{unitQ('distributedLoad')}</span></div>
      <div class="fg-r"><span class="fg-l">{t('writeLoad.alongAxis')}</span><select class="fg-in" bind:value={hydroAxis} data-testid="wl-hydro-axis"><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></div>
      <div class="fg-r"><span class="fg-l">{t('writeLoad.acting')}</span><select class="fg-in" bind:value={hydroComp} data-testid="wl-hydro-comp">{#each ['x', 'y', 'z'] as c (c)}<option value={c}>{frame === 'local' ? c : c.toUpperCase()}</option>{/each}</select></div>
      <p class="wl-hint fg-full">{t('writeLoad.hydrostaticHint')}</p>
    {/if}
  {:else if kind === 'point'}
    <div class="fg-r"><span class="fg-l">{t('loads.frame')}</span>
      <select class="fg-wide" bind:value={pFrame} data-testid="wl-pframe">
        <option value="local">{t('loads.frame.local')}</option>
        <option value="global">{t('loads.frame.global')}</option>
      </select></div>
    <div class="fg-r"><span class="fg-l">a</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pa} quantity="length" placeholder="L/2" testid="wl-pa" /><span class="fg-u">{unitQ('length')}</span></div>
    <div class="fg-r fg-head"><span></span>{#each ['x', 'y', 'z'] as c (c)}<span>{pFrame === 'local' ? c : c.toUpperCase()}</span>{/each}</div>
    <div class="fg-r"><span class="fg-l">P</span>
      {#each ['px', 'py', 'pz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={p[k]} quantity="force" testid="wl-{k}" ariaLabel={k} />{/each}<span class="fg-u">{unitQ('force')}</span></div>
    <div class="fg-r"><span class="fg-l">M</span>
      {#each ['mx', 'my', 'mz'] as const as k (k)}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={p[k]} quantity="moment" testid="wl-p{k}" ariaLabel={k} />{/each}<span class="fg-u">{unitQ('moment')}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.pointHint')}</p>
  {:else if kind === 'thermal'}
    <div class="fg-r"><span class="fg-l">ΔT</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={th.dt} quantity="temperatureDiff" testid="wl-dt" /><span class="fg-u">{unitQ('temperatureDiff')}</span></div>
    <div class="fg-r"><span class="fg-l">ΔTgz</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={th.gz} quantity="temperatureDiff" testid="wl-gz" /><span class="fg-u">{unitQ('temperatureDiff')}</span></div>
    <div class="fg-r"><span class="fg-l">ΔTgy</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={th.gy} quantity="temperatureDiff" testid="wl-gy" /><span class="fg-u">{unitQ('temperatureDiff')}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.thermalHint')}</p>
  {:else if kind === 'strain'}
    <div class="fg-r"><span class="fg-l">{t('writeLoad.as')}</span>
      <span class="fg-wide">
        <label class="wl-check"><input type="radio" bind:group={strainBy} value="unit" /> ε₀</label>
        <label class="wl-check"><input type="radio" bind:group={strainBy} value="length" /> ΔL</label>
      </span></div>
    <div class="fg-r"><span class="fg-l">{strainBy === 'unit' ? 'ε₀' : 'ΔL'}</span>
      {#if strainBy === 'unit'}<input type="text" inputmode="decimal" bind:value={strainPerMil} class="fg-in" data-testid="wl-strain" /><span class="fg-u">‰</span>
      {:else}<QuantityInput nullable showUnit={false} cls="fg-in" bind:value={strainDL} quantity="displacement" testid="wl-strain-dl" /><span class="fg-u">{unitQ('displacement')}</span>{/if}</div>
    <p class="wl-hint fg-full">{t('writeLoad.strainHint')}</p>
  {:else if kind === 'prestress'}
    <div class="fg-r"><span class="fg-l">P</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={ps.force} quantity="force" testid="wl-ps-force" /><span class="fg-u">{unitQ('force')}</span></div>
    <div class="fg-r fg-head"><span></span><span>I</span><span>{t('writeLoad.middle')}</span><span>J</span></div>
    <div class="fg-r"><span class="fg-l">e</span>
      <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={ps.eI} quantity="length" placeholder="0" testid="wl-ps-ei" ariaLabel="e I" />
      <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={ps.eM} quantity="length" placeholder={t('writeLoad.eMidDefault')} testid="wl-ps-em" ariaLabel={`e ${t('writeLoad.middle')}`} />
      <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={ps.eJ} quantity="length" placeholder="0" testid="wl-ps-ej" ariaLabel="e J" />
      <span class="fg-u">{unitQ('length')}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.prestressHint')}</p>
  {:else if kind === 'selfWeight'}
    <div class="fg-r"><span class="fg-l">{t('selfWeight.direction')}</span><select class="fg-in" bind:value={swDir} data-testid="wl-sw-dir"><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></div>
    <div class="fg-r"><span class="fg-l">{t('selfWeight.factor')}</span><input type="text" inputmode="decimal" bind:value={swFactor} class="fg-in" data-testid="wl-sw-factor" /></div>
    <p class="wl-hint fg-full">{t('writeLoad.swHint')}</p>
  {:else if kind === 'surface' || kind === 'hydro' || kind === 'shellPoint'}
    {#key kind}<ProShellLoadForm {kind} bind:this={shellForm} bind:sketch={shellSketch} />{/key}
  {:else}
    <div class="fg-r"><span class="fg-l">ΔT</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={tq.dt} quantity="temperatureDiff" testid="wl-tq-dt" /><span class="fg-u">{unitQ('temperatureDiff')}</span></div>
    <div class="fg-r"><span class="fg-l">ΔTg</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={tq.g} quantity="temperatureDiff" testid="wl-tq-g" /><span class="fg-u">{unitQ('temperatureDiff')}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.thermalQuadHint')}</p>
  {/if}
  </div>
  <LoadSketch v={sketch} />
  </div>

  <!-- A new picker for another family of targets: node numbers are not member numbers. -->
  {#key `${drawState.writeSeq}:${group}`}<LoadTargetPicker {entity} allowAll={kind === 'selfWeight'} allowChain={kind === 'distributed' && shape === 'trapezoid' || kind === 'point'} bind:spec={target} bind:summary />{/key}

  {#if error}<p class="wl-error" role="alert" data-testid="wl-error">{error}</p>{/if}
  {#if done}<p class="wl-done" role="status" data-testid="wl-done">{done}</p>{/if}
  <div class="wl-actions">
    <button type="button" class="wl-add" onclick={add} data-testid="wl-add">{t('pro.add')} {t('pro.oneLoad')}</button>
    <span class="wl-count" class:warn={summary.warn} data-testid="load-target-count">{summary.text}</span>
  </div>
</div>

<style>
  .wl { display: flex; flex-direction: column; gap: 6px; }
  .wl :global(.wl-check) { font-size: 0.72rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .wl :global(.wl-hint) { margin: 0; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
  .wl-error { margin: 0; font-size: 0.66rem; color: var(--st-danger); }
  .wl-done { margin: 0; font-size: 0.66rem; color: var(--st-ok); }
  /* The same button and count as the Add support card. */
  .wl-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .wl-add { flex: none; padding: 0.3rem 0.8rem; border: 1px solid var(--st-accent); border-radius: var(--st-radius); background: var(--st-accent); color: #fff; font: inherit; font-size: 0.72rem; cursor: pointer; }
  .wl-count { font-size: 0.66rem; color: var(--st-text-2); }
  .wl-count.warn { color: var(--st-warn); }
  /* The sketch stays beside the fields and gives way first (down to 150 px) when the panel is narrow. */
  /*
   * The fields under the case and the kind, set in from them; the sketch always to their right,
   * giving way first as the panel narrows. On a phone the sketch goes under the fields.
   */
  .wl-head { display: flex; flex-direction: column; gap: 5px; }
  .wl-body { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
  .wl-body-mobile { flex-direction: column; align-items: stretch; }
  .wl-body-mobile > :global(.lsw) { width: 100%; max-width: 420px; }
  .wl-fields { flex: 1 1 0; min-width: 236px; display: flex; flex-direction: column; gap: 5px;
    margin-left: 6px; padding-left: 10px; border-left: 2px solid var(--st-hair); }
  /*
   * One grid for every kind's fields, the slab form's too: a column of names, cells of one width,
   * the unit after the row. A vector is a row with X, Y, Z (or I, J) headed above it, so a value
   * always sits beside its own name and under its own component.
   */
  .wl { --fg-l: 4.3rem; --fg-c: 50px; }
  .wl :global(.fg-r) { display: grid; grid-template-columns: var(--fg-l) repeat(3, minmax(38px, var(--fg-c))) auto; gap: 6px; align-items: center; }
  /* In the fields, each name sits against its own cell. */
  .wl-fields :global(.fg-l) { text-align: right; padding-right: 2px; }
  .wl :global(.fg-head) { font-size: 0.62rem; color: var(--st-text-3); text-align: center; margin-bottom: -3px; }
  .wl :global(.fg-l) { font-size: 0.7rem; color: var(--st-text-3); line-height: 1.15; overflow-wrap: break-word; hyphens: auto; }
  .wl :global(.fg-u) { font-size: 0.64rem; color: var(--st-text-3); white-space: nowrap; }
  .wl :global(.fg-wide) { grid-column: 2 / -1; justify-self: start; display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .wl :global(.fg-full) { grid-column: 1 / -1; }
  .wl :global(.qi) { width: 100%; min-width: 0; }
  .wl :global(input.fg-in), .wl :global(select.fg-in), .wl :global(select.fg-wide) {
    width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 5px;
    background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px;
    color: var(--st-text); font-size: 0.72rem; font-family: var(--st-mono);
  }
  .wl :global(select.fg-in), .wl :global(select.fg-wide) { font-family: var(--st-sans); }
  .wl :global(select.fg-wide) { width: auto; max-width: 100%; min-width: 0; }
  .wl :global(input.fg-in:focus), .wl :global(select:focus) { outline: none; border-color: var(--st-accent); }
  .wl-toward { font-size: 0.7rem; color: var(--st-text-2); }
</style>
