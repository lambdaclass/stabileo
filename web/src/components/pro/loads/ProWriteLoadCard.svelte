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
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import type { Load } from '../../../lib/store/model.svelte';
  import { addLoads } from '../../../lib/store/load-ops';
  import { resolveTargets, type TargetEntity } from '../../../lib/model/loads/load-targets';
  import { inclinedForce, type GlobalAxis } from '../../../lib/model/loads/member-load-tools';
  import { buildWrittenLoads, type WriteOutcome, type WriteRefusal } from '../../../lib/model/loads/write-load';
  import { loadedLength } from '../../../lib/model/loads/load-stretch';
  import { memberRef3D } from '../../../lib/engine/solver-service';
  import type { MemberFrame } from '../../../lib/engine/member-loads';
  import LoadTargetPicker, { type PickedSpec } from './LoadTargetPicker.svelte';
  import ProShellLoadForm from './ProShellLoadForm.svelte';
  import type { ShellRef } from '../../../lib/model/loads/shell-load-tools';

  type Kind = 'nodal' | 'displacement' | 'distributed' | 'point' | 'thermal' | 'strain' | 'prestress' | 'surface' | 'hydro' | 'shellPoint' | 'thermalQuad';
  const KINDS: Array<{ id: Kind; group: 'node' | 'member' | 'slab' }> = [
    { id: 'nodal', group: 'node' }, { id: 'displacement', group: 'node' },
    { id: 'distributed', group: 'member' }, { id: 'point', group: 'member' }, { id: 'thermal', group: 'member' },
    { id: 'strain', group: 'member' }, { id: 'prestress', group: 'member' },
    { id: 'surface', group: 'slab' }, { id: 'hydro', group: 'slab' }, { id: 'shellPoint', group: 'slab' }, { id: 'thermalQuad', group: 'slab' },
  ];
  let kind = $state<Kind>('nodal');
  const entity = $derived<TargetEntity>(KINDS.find((k) => k.id === kind)!.group === 'node' ? 'nodes' : KINDS.find((k) => k.id === kind)!.group === 'member' ? 'members' : 'quads');
  let target = $state<PickedSpec>({ by: 'selection' });

  /** The preview's reading of a field: empty or unreadable is `fallback` (the add refuses unreadable text). */
  const num = (s: string, fallback = 0): number => parseDecimal(s) ?? fallback;
  /** The preview's reading of a field, or null when it is empty or unreadable. */
  const opt = (s: string): number | null => (s.trim() === '' ? null : parseDecimal(s));

  // ── Nodal ──
  let f = $state({ fx: '', fy: '', fz: '', mx: '', my: '', mz: '' });
  let inclined = $state(false);
  let incF = $state('');
  let incToNode = $state('');
  let incTo = $state({ x: '', y: '', z: '' });
  let incByNode = $state(true);
  // ── Displacement ──
  let u = $state({ dx: '', dy: '', dz: '', drx: '', dry: '', drz: '' });
  // ── Distributed ──
  let frame = $state<MemberFrame>('local');
  let shape = $state<'trapezoid' | 'triangle' | 'hydrostatic'>('trapezoid');
  let q = $state({ xI: '', xJ: '', yI: '', yJ: '', zI: '', zJ: '' });
  let qa = $state(''), qb = $state('');
  let peak = $state(''), peakAt = $state(''), peakComp = $state<'x' | 'y' | 'z'>('z');
  let w1 = $state(''), w2 = $state(''), hydroAxis = $state<GlobalAxis>('Z'), hydroComp = $state<'x' | 'y' | 'z'>('x');
  // ── Point ──
  let pFrame = $state<'local' | 'global'>('local');
  let p = $state({ px: '', py: '', pz: '', mx: '', my: '', mz: '' });
  let pa = $state('');
  // ── Thermal, strain, tendon ──
  let th = $state({ dt: '', gz: '', gy: '' });
  let strainBy = $state<'unit' | 'length'>('unit');
  let strainVal = $state('');
  let ps = $state({ force: '', eI: '', eM: '', eJ: '' });
  // ── Slabs ──
  let tq = $state({ dt: '', g: '' });

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

  /** The loads the form describes, on its targets; a reason when it describes none. */
  function build(): WriteOutcome | WriteRefusal {
    // Slab loads act on quads and triangles through one integral (`shell-load-integration.ts`).
    if (kind === 'surface' || kind === 'hydro' || kind === 'shellPoint') {
      const r = shellForm ? shellForm.build(shellTargets(), caseId) : 'writeLoad.noTarget';
      return typeof r === 'string' ? { error: r } : { loads: r };
    }
    if (kind === 'thermalQuad') {
      const shells = shellTargets();
      if (!shells.length) return { error: 'writeLoad.noTarget' };
      // Blank is 0; text that does not read refuses the add instead of becoming a zero.
      const read = (v: string) => (v.trim() === '' ? 0 : parseDecimal(v));
      const dt = read(tq.dt), g = read(tq.g);
      if (dt === null || g === null) return { error: 'pro.loadUnreadable' };
      if (dt === 0 && g === 0) return { error: 'writeLoad.zero' };
      return { loads: shells.map((sh) => ({ type: 'thermalQuad3d', data: { id: 0, quadId: sh.id, ...(sh.on ? { on: sh.on } : {}), dtUniform: dt, dtGradient: g, caseId } }) as Load) };
    }
    return buildWrittenLoads({
      kind, f, inclined, incF, incToNode, incTo, incByNode, u, frame, shape, q, qa, qb, peak, peakAt, peakComp,
      w1, w2, hydroAxis, hydroComp, pFrame, p, pa, th, strainBy, strainVal, ps, sq: '', tq,
    }, {
      caseId, ids: targets(), chain: target.by === 'chain',
      node: (id) => modelStore.nodes.get(id),
      element: (id) => modelStore.elements.get(id),
      axes: (id) => memberRef3D(modelStore.model as never, id)?.axes ?? null,
      length: (id) => loadedLength(modelStore.model as never, id),
    });
  }

  function add() {
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
    const to = incByNode ? modelStore.nodes.get(Number(incToNode)) : { x: num(incTo.x), y: num(incTo.y), z: num(incTo.z) };
    const F = opt(incF);
    return at && to && F ? inclinedForce(at, to, F) : null;
  });
</script>

<div class="wl" data-testid="write-load-form">
  <div class="wl-kinds" role="radiogroup" aria-label={t('writeLoad.kind')}>
    {#each ['node', 'member', 'slab'] as g (g)}
      <div class="wl-kgroup">
        <span class="wl-kgroup-name">{t(`writeLoad.group.${g}`)}</span>
        {#each KINDS.filter((k) => k.group === g) as k (k.id)}
          <button type="button" role="radio" aria-checked={kind === k.id} class="wl-kind" class:active={kind === k.id}
            onclick={() => { kind = k.id; error = null; done = null; }} data-testid="wl-kind-{k.id}">{t(`writeLoad.kind.${k.id}`)}</button>
        {/each}
      </div>
    {/each}
  </div>

  {#if kind === 'nodal'}
    <label class="wl-check"><input type="checkbox" bind:checked={inclined} data-testid="wl-inclined" /> {t('writeLoad.inclined')}</label>
    {#if inclined}
      <div class="wl-row">
        <label>F <input type="text" bind:value={incF} class="wl-num" placeholder="kN" data-testid="wl-inc-f" /></label>
        <label class="wl-check"><input type="radio" bind:group={incByNode} value={true} /> {t('writeLoad.towardNode')}</label>
        <label class="wl-check"><input type="radio" bind:group={incByNode} value={false} /> {t('writeLoad.towardPoint')}</label>
      </div>
      <div class="wl-row">
        {#if incByNode}<label>{t('writeLoad.node')} <input type="text" bind:value={incToNode} class="wl-num" placeholder="ID" data-testid="wl-inc-node" /></label>
        {:else}
          <label>X <input type="text" bind:value={incTo.x} class="wl-num" placeholder="m" /></label>
          <label>Y <input type="text" bind:value={incTo.y} class="wl-num" placeholder="m" /></label>
          <label>Z <input type="text" bind:value={incTo.z} class="wl-num" placeholder="m" /></label>
        {/if}
      </div>
      {#if incPreview}<p class="wl-hint" data-testid="wl-inc-preview">{tp('writeLoad.inclinedPreview', { fx: incPreview[0].toFixed(3), fy: incPreview[1].toFixed(3), fz: incPreview[2].toFixed(3) })}</p>{/if}
    {:else}
      <div class="wl-row">
        {#each ['fx', 'fy', 'fz'] as k (k)}<label>{k.toUpperCase()} <input type="text" bind:value={f[k as keyof typeof f]} class="wl-num" placeholder="kN" data-testid="wl-{k}" /></label>{/each}
      </div>
      <div class="wl-row">
        {#each ['mx', 'my', 'mz'] as k (k)}<label>{k.toUpperCase()} <input type="text" bind:value={f[k as keyof typeof f]} class="wl-num" placeholder="kN·m" data-testid="wl-{k}" /></label>{/each}
      </div>
    {/if}
  {:else if kind === 'displacement'}
    <p class="wl-hint">{t('writeLoad.displacementHint')}</p>
    <div class="wl-row">
      {#each ['dx', 'dy', 'dz'] as k (k)}<label>{k} <input type="text" bind:value={u[k as keyof typeof u]} class="wl-num" placeholder="mm" data-testid="wl-{k}" /></label>{/each}
    </div>
    <div class="wl-row">
      {#each ['drx', 'dry', 'drz'] as k (k)}<label>{k} <input type="text" bind:value={u[k as keyof typeof u]} class="wl-num" placeholder="rad" data-testid="wl-{k}" /></label>{/each}
    </div>
  {:else if kind === 'distributed'}
    <div class="wl-row">
      <label>{t('loads.frame')}
        <select bind:value={frame} data-testid="wl-frame" title={t('loads.frameHelp')}>
          <option value="local">{t('loads.frame.local')}</option>
          <option value="global">{t('loads.frame.global')}</option>
          <option value="projected">{t('loads.frame.projected')}</option>
        </select></label>
      <label>{t('writeLoad.shape')}
        <select bind:value={shape} data-testid="wl-shape">
          <option value="trapezoid">{t('writeLoad.shape.trapezoid')}</option>
          <option value="triangle">{t('writeLoad.shape.triangle')}</option>
          <option value="hydrostatic">{t('writeLoad.shape.hydrostatic')}</option>
        </select></label>
    </div>
    {#if shape === 'trapezoid'}
      {#each [['x', 'xI', 'xJ'], ['y', 'yI', 'yJ'], ['z', 'zI', 'zJ']] as [c, i, j] (c)}
        <div class="wl-row">
          <label>{frame === 'local' ? `q${c}` : `q${c.toUpperCase()}`} I <input type="text" bind:value={q[i as keyof typeof q]} class="wl-num" placeholder="kN/m" data-testid="wl-q{c}i" /></label>
          <label>J <input type="text" bind:value={q[j as keyof typeof q]} class="wl-num" placeholder={t('writeLoad.sameAsI')} data-testid="wl-q{c}j" /></label>
        </div>
      {/each}
      <div class="wl-row">
        <label>a <input type="text" bind:value={qa} class="wl-num" placeholder="0" data-testid="wl-a" /></label>
        <label>b <input type="text" bind:value={qb} class="wl-num" placeholder="L" data-testid="wl-b" /></label>
        <span class="wl-hint">{t('writeLoad.abHint')}</span>
      </div>
    {:else if shape === 'triangle'}
      <div class="wl-row">
        <label>{t('writeLoad.peak')} <input type="text" bind:value={peak} class="wl-num" placeholder="kN/m" data-testid="wl-peak" /></label>
        <label>{t('writeLoad.along')} <select bind:value={peakComp} data-testid="wl-peak-comp">{#each ['x', 'y', 'z'] as c (c)}<option value={c}>{frame === 'local' ? c : c.toUpperCase()}</option>{/each}</select></label>
        <label>{t('writeLoad.peakAt')} <input type="text" bind:value={peakAt} class="wl-num" placeholder="L/2" data-testid="wl-peak-at" /></label>
      </div>
    {:else}
      <p class="wl-hint">{t('writeLoad.hydrostaticHint')}</p>
      <div class="wl-row">
        <label>w₁ <input type="text" bind:value={w1} class="wl-num" placeholder="kN/m" data-testid="wl-w1" /></label>
        <label>w₂ <input type="text" bind:value={w2} class="wl-num" placeholder="kN/m" data-testid="wl-w2" /></label>
        <label>{t('writeLoad.alongAxis')} <select bind:value={hydroAxis} data-testid="wl-hydro-axis"><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
        <label>{t('writeLoad.acting')} <select bind:value={hydroComp} data-testid="wl-hydro-comp">{#each ['x', 'y', 'z'] as c (c)}<option value={c}>{frame === 'local' ? c : c.toUpperCase()}</option>{/each}</select></label>
      </div>
    {/if}
  {:else if kind === 'point'}
    <div class="wl-row">
      <label>{t('loads.frame')}
        <select bind:value={pFrame} data-testid="wl-pframe">
          <option value="local">{t('loads.frame.local')}</option>
          <option value="global">{t('loads.frame.global')}</option>
        </select></label>
      <label>a <input type="text" bind:value={pa} class="wl-num" placeholder="L/2" data-testid="wl-pa" /></label>
    </div>
    <div class="wl-row">
      {#each ['px', 'py', 'pz'] as k (k)}<label>{pFrame === 'local' ? `P${k[1]}` : `P${k[1]!.toUpperCase()}`} <input type="text" bind:value={p[k as keyof typeof p]} class="wl-num" placeholder="kN" data-testid="wl-{k}" /></label>{/each}
    </div>
    <div class="wl-row">
      {#each ['mx', 'my', 'mz'] as k (k)}<label>{pFrame === 'local' ? `M${k[1]}` : `M${k[1]!.toUpperCase()}`} <input type="text" bind:value={p[k as keyof typeof p]} class="wl-num" placeholder="kN·m" data-testid="wl-p{k}" /></label>{/each}
    </div>
    <p class="wl-hint">{t('writeLoad.pointHint')}</p>
  {:else if kind === 'thermal'}
    <div class="wl-row">
      <label>ΔT <input type="text" bind:value={th.dt} class="wl-num" placeholder="°C" data-testid="wl-dt" /></label>
      <label>ΔTgz <input type="text" bind:value={th.gz} class="wl-num" placeholder="°C" data-testid="wl-gz" /></label>
      <label>ΔTgy <input type="text" bind:value={th.gy} class="wl-num" placeholder="°C" data-testid="wl-gy" /></label>
    </div>
    <p class="wl-hint">{t('writeLoad.thermalHint')}</p>
  {:else if kind === 'strain'}
    <div class="wl-row">
      <label class="wl-check"><input type="radio" bind:group={strainBy} value="unit" /> ε₀ (‰)</label>
      <label class="wl-check"><input type="radio" bind:group={strainBy} value="length" /> ΔL (mm)</label>
      <input type="text" bind:value={strainVal} class="wl-num" placeholder={strainBy === 'unit' ? '‰' : 'mm'} data-testid="wl-strain" />
    </div>
    <p class="wl-hint">{t('writeLoad.strainHint')}</p>
  {:else if kind === 'prestress'}
    <div class="wl-row">
      <label>P <input type="text" bind:value={ps.force} class="wl-num" placeholder="kN" data-testid="wl-ps-force" /></label>
    </div>
    <div class="wl-row">
      <label>e I <input type="text" bind:value={ps.eI} class="wl-num" placeholder="mm" data-testid="wl-ps-ei" /></label>
      <label>e {t('writeLoad.middle')} <input type="text" bind:value={ps.eM} class="wl-num" placeholder="mm" data-testid="wl-ps-em" /></label>
      <label>e J <input type="text" bind:value={ps.eJ} class="wl-num" placeholder="mm" data-testid="wl-ps-ej" /></label>
    </div>
    <p class="wl-hint">{t('writeLoad.prestressHint')}</p>
  {:else if kind === 'surface' || kind === 'hydro' || kind === 'shellPoint'}
    {#key kind}<ProShellLoadForm {kind} bind:this={shellForm} />{/key}
  {:else}
    <div class="wl-row">
      <label>ΔT <input type="text" bind:value={tq.dt} class="wl-num" placeholder="°C" data-testid="wl-tq-dt" /></label>
      <label>ΔTg <input type="text" bind:value={tq.g} class="wl-num" placeholder="°C" data-testid="wl-tq-g" /></label>
    </div>
  {/if}

  <LoadTargetPicker {entity} allowChain={kind === 'distributed' && shape === 'trapezoid' || kind === 'point'} bind:spec={target} />

  {#if error}<p class="wl-error" role="alert" data-testid="wl-error">{error}</p>{/if}
  {#if done}<p class="wl-done" role="status" data-testid="wl-done">{done}</p>{/if}
  <button type="button" class="wl-add" onclick={add} data-testid="wl-add">{t('writeLoad.add')}</button>
</div>

<style>
  .wl { display: flex; flex-direction: column; gap: 6px; }
  .wl-kinds { display: flex; flex-direction: column; gap: 3px; }
  .wl-kgroup { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
  .wl-kgroup-name { min-width: 3.6rem; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--st-text-3); }
  .wl-kind { padding: 2px 7px; font-size: 0.68rem; color: var(--st-text-3); background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 4px; cursor: pointer; }
  .wl-kind:hover { color: var(--st-text-2); }
  .wl-kind.active { color: var(--st-text); border-color: var(--st-text-2); }
  .wl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .wl-row label, .wl-check { font-size: 0.72rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .wl-num, .wl-row select { width: 64px; padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.74rem; font-family: var(--st-mono); }
  .wl-row select { width: auto; font-family: var(--st-sans); }
  .wl-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
  .wl-error { margin: 0; font-size: 0.66rem; color: var(--st-danger); }
  .wl-done { margin: 0; font-size: 0.66rem; color: var(--st-ok); }
  .wl-add { align-self: flex-start; padding: 5px 14px; font-size: 0.74rem; color: var(--st-text); background: var(--st-surface-3); border: 1px solid var(--st-interactive); border-radius: 4px; cursor: pointer; }
  .wl-add:hover { background: var(--st-hair-strong); }
</style>
