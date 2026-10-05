<script lang="ts">
  /**
   * Write a load: its kind, its values, and what it goes on (`LoadTargetPicker`), added in one undo
   * step to the active case.
   *
   * Every number is read by the app's one reader (a comma or a point; `parseDecimal`): "1,5" is one
   * and a half, and a field left empty is the default it names (a J value empty is the I value; a
   * zero typed in J is a zero, so a triangle that ends in nothing is a triangle).
   *
   * Values are in SI, as the rest of the model is typed: kN, kN/m, kN·m, m, °C; the displacements and
   * eccentricities in mm, as they are measured, kept in m.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import { addLoads } from '../../../lib/store/load-ops';
  import { resolveTargets, type TargetEntity } from '../../../lib/model/loads/load-targets';
  import { orderedChain, loadsOnChain, triangularPeak, hydrostaticLoads, inclinedForce, type GlobalAxis } from '../../../lib/model/loads/member-load-tools';
  import { memberRef3D } from '../../../lib/engine/solver-service';
  import type { Load } from '../../../lib/store/model.svelte';
  import type { MemberFrame, Vec3 } from '../../../lib/engine/member-loads';
  import LoadTargetPicker, { type PickedSpec } from './LoadTargetPicker.svelte';

  type Kind = 'nodal' | 'displacement' | 'distributed' | 'point' | 'thermal' | 'strain' | 'prestress' | 'surface' | 'thermalQuad';
  const KINDS: Array<{ id: Kind; group: 'node' | 'member' | 'slab' }> = [
    { id: 'nodal', group: 'node' }, { id: 'displacement', group: 'node' },
    { id: 'distributed', group: 'member' }, { id: 'point', group: 'member' }, { id: 'thermal', group: 'member' },
    { id: 'strain', group: 'member' }, { id: 'prestress', group: 'member' },
    { id: 'surface', group: 'slab' }, { id: 'thermalQuad', group: 'slab' },
  ];
  let kind = $state<Kind>('nodal');
  const entity = $derived<TargetEntity>(KINDS.find((k) => k.id === kind)!.group === 'node' ? 'nodes' : KINDS.find((k) => k.id === kind)!.group === 'member' ? 'members' : 'quads');
  let target = $state<PickedSpec>({ by: 'selection' });

  /** A field's number; empty or unreadable is `fallback`. */
  const num = (s: string, fallback = 0): number => parseDecimal(s) ?? fallback;
  /** A field's number, or null when it is empty or unreadable. */
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
  let sq = $state('');
  let tq = $state({ dt: '', g: '' });

  let error = $state<string | null>(null);
  let done = $state<string | null>(null);

  const caseId = $derived(uiStore.activeLoadCaseId);
  const quadSelection = $derived([...uiStore.selectedShells].filter((k) => k[0] === 'q').map((k) => Number(k.slice(1))));
  const targets = (): number[] => (target.by === 'chain' ? [...uiStore.selectedElements]
    : resolveTargets(entity, target, modelStore.model as never, { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, quads: quadSelection }));
  const lengthOf = (id: number) => memberRef3D(modelStore.model as never, id)?.axes.L ?? modelStore.getElementLength(id);
  const bends = (id: number) => modelStore.elements.get(id)?.type !== 'truss';

  /** The loads the form describes, on its targets; a reason when it describes none. */
  function build(): Load[] | string {
    const ids = targets();
    if (ids.length === 0) return t('writeLoad.noTarget');
    const c = { caseId };
    const nodeLoads = (data: (id: number) => Load | null) => ids.map(data).filter((l): l is Load => !!l);
    switch (kind) {
      case 'nodal': {
        if (inclined) {
          const F = opt(incF);
          if (F === null || F === 0) return t('writeLoad.zero');
          return nodeLoads((id) => {
            const at = modelStore.nodes.get(id)!;
            const to = incByNode ? modelStore.nodes.get(Number(incToNode)) : { x: num(incTo.x), y: num(incTo.y), z: num(incTo.z) };
            const v = to ? inclinedForce(at, to, F) : null;
            return v ? { type: 'nodal3d', data: { id: 0, nodeId: id, fx: v[0], fy: v[1], fz: v[2], mx: 0, my: 0, mz: 0, ...c } } : null;
          });
        }
        const v = { fx: num(f.fx), fy: num(f.fy), fz: num(f.fz), mx: num(f.mx), my: num(f.my), mz: num(f.mz) };
        if (Object.values(v).every((x) => x === 0)) return t('writeLoad.zero');
        return nodeLoads((id) => ({ type: 'nodal3d', data: { id: 0, nodeId: id, ...v, ...c } }));
      }
      case 'displacement': {
        const mm = (s: string) => { const x = opt(s); return x === null || x === 0 ? undefined : x / 1000; };
        const r = (s: string) => { const x = opt(s); return x === null || x === 0 ? undefined : x; };
        const d = { dx: mm(u.dx), dy: mm(u.dy), dz: mm(u.dz), drx: r(u.drx), dry: r(u.dry), drz: r(u.drz) };
        if (Object.values(d).every((x) => x === undefined)) return t('writeLoad.zero');
        const clean = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
        return nodeLoads((id) => ({ type: 'displacement3d', data: { id: 0, nodeId: id, ...clean, ...c } }));
      }
      case 'distributed': {
        if (shape === 'hydrostatic') {
          const members = ids.map((id) => {
            const e = modelStore.elements.get(id)!;
            return { id, i: modelStore.nodes.get(e.nodeI)!, j: modelStore.nodes.get(e.nodeJ)! };
          });
          const out = hydrostaticLoads(members, hydroAxis, num(w1), num(w2), hydroComp, frame);
          return out.length ? out.map((d) => ({ type: 'distributed3d', data: { ...d, id: 0, ...c } }) as Load) : t('writeLoad.zero');
        }
        if (shape === 'triangle') {
          const pk = opt(peak);
          if (pk === null || pk === 0) return t('writeLoad.zero');
          return ids.flatMap((id) => {
            const L = lengthOf(id);
            const at = opt(peakAt);
            return triangularPeak(id, L, pk, peakComp, frame, at ?? L / 2).map((d) => ({ type: 'distributed3d', data: { ...d, id: 0, ...c } }) as Load);
          });
        }
        const xI = num(q.xI), yI = num(q.yI), zI = num(q.zI);
        // An empty J is the I value: a uniform load needs one row. A zero typed is a zero.
        const xJ = opt(q.xJ) ?? xI, yJ = opt(q.yJ) ?? yI, zJ = opt(q.zJ) ?? zI;
        if ([xI, xJ, yI, yJ, zI, zJ].every((x) => x === 0)) return t('writeLoad.zero');
        const a = opt(qa), b = opt(qb);
        if (target.by === 'chain') {
          const chain = orderedChain(ids, (id) => modelStore.elements.get(id), (id) => modelStore.nodes.get(id));
          if (!chain) return t('loadTarget.chainBad');
          const ax = (id: number) => memberRef3D(modelStore.model as never, id)?.axes ?? null;
          const first = ax(chain.links[0]!.id);
          if (!first) return t('writeLoad.noTarget');
          const chainAxes = chain.links[0]!.reversed ? { ...first, ex: first.ex.map((v) => -v) as Vec3, ez: first.ez.map((v) => -v) as Vec3 } : first;
          return loadsOnChain(chain, { kind: 'distributed', a: a ?? 0, b: b ?? chain.total, frame, qI: [xI, yI, zI], qJ: [xJ, yJ, zJ] }, ax, chainAxes)
            .map((l) => ({ type: l.type, data: { ...l.data, id: 0, ...c } }) as Load);
        }
        return ids.map((id) => {
          const L = lengthOf(id);
          const data: Record<string, unknown> = { id: 0, elementId: id, qYI: yI, qYJ: yJ, qZI: zI, qZJ: zJ, ...c };
          if (xI || xJ) { data.qXI = xI; data.qXJ = xJ; }
          if (frame !== 'local') data.frame = frame;
          if (a !== null && a > 0) data.a = Math.min(a, L);
          if (b !== null && b < L) data.b = Math.max(b, a ?? 0);
          return { type: 'distributed3d', data } as unknown as Load;
        });
      }
      case 'point': {
        const v = { px: num(p.px), py: num(p.py), pz: num(p.pz), mx: num(p.mx), my: num(p.my), mz: num(p.mz) };
        if (Object.values(v).every((x) => x === 0)) return t('writeLoad.zero');
        const moment = v.mx !== 0 || v.my !== 0 || v.mz !== 0;
        if (moment && ids.some((id) => !bends(id))) return t('writeLoad.momentOnTruss');
        const a = opt(pa);
        if (target.by === 'chain') {
          const chain = orderedChain(ids, (id) => modelStore.elements.get(id), (id) => modelStore.nodes.get(id));
          if (!chain) return t('loadTarget.chainBad');
          const ax = (id: number) => memberRef3D(modelStore.model as never, id)?.axes ?? null;
          const first = ax(chain.links[0]!.id);
          if (!first) return t('writeLoad.noTarget');
          const chainAxes = chain.links[0]!.reversed ? { ...first, ex: first.ex.map((x) => -x) as Vec3, ez: first.ez.map((x) => -x) as Vec3 } : first;
          return loadsOnChain(chain, { kind: 'point', a: a ?? chain.total / 2, frame: pFrame, F: [v.px, v.py, v.pz], M: [v.mx, v.my, v.mz] }, ax, chainAxes)
            .map((l) => ({ type: l.type, data: { ...l.data, id: 0, ...c } }) as Load);
        }
        return ids.map((id) => {
          const L = lengthOf(id);
          const data: Record<string, unknown> = { id: 0, elementId: id, a: Math.min(L, Math.max(0, a ?? L / 2)), py: v.py, pz: v.pz, ...c };
          for (const k of ['px', 'mx', 'my', 'mz'] as const) if (v[k]) data[k] = v[k];
          if (pFrame === 'global') data.frame = 'global';
          return { type: 'pointOnElement3d', data } as unknown as Load;
        });
      }
      case 'thermal': {
        const dt = num(th.dt), gz = num(th.gz), gy = num(th.gy);
        if (dt === 0 && gz === 0 && gy === 0) return t('writeLoad.zero');
        return ids.map((id) => ({ type: 'thermal', data: { id: 0, elementId: id, dtUniform: dt, dtGradient: gz, ...(gy ? { dtGradientY: gy } : {}), ...c } }) as Load);
      }
      case 'strain': {
        const v = opt(strainVal);
        if (v === null || v === 0) return t('writeLoad.zero');
        // ‰ of the member's length, or mm of it.
        return ids.map((id) => ({ type: 'thermal', data: { id: 0, elementId: id, dtUniform: 0, dtGradient: 0, strain: strainBy === 'unit' ? v / 1000 : v / 1000 / lengthOf(id), ...c } }) as Load);
      }
      case 'prestress': {
        const P = opt(ps.force);
        if (P === null || P === 0) return t('writeLoad.zero');
        if (ids.some((id) => !bends(id))) return t('writeLoad.prestressOnTruss');
        const mm = (s: string) => num(s) / 1000;
        return ids.map((id) => ({ type: 'prestress3d', data: { id: 0, elementId: id, force: P, eI: mm(ps.eI), eM: opt(ps.eM) === null ? (mm(ps.eI) + mm(ps.eJ)) / 2 : mm(ps.eM), eJ: mm(ps.eJ), ...c } }) as Load);
      }
      case 'surface': {
        const v = opt(sq);
        if (v === null || v === 0) return t('writeLoad.zero');
        return ids.map((id) => ({ type: 'surface3d', data: { id: 0, quadId: id, q: v, ...c } }) as Load);
      }
      case 'thermalQuad': {
        const dt = num(tq.dt), g = num(tq.g);
        if (dt === 0 && g === 0) return t('writeLoad.zero');
        return ids.map((id) => ({ type: 'thermalQuad3d', data: { id: 0, quadId: id, dtUniform: dt, dtGradient: g, ...c } }) as Load);
      }
    }
  }

  function add() {
    const out = build();
    if (typeof out === 'string') { error = out; done = null; return; }
    addLoads(out);
    error = null;
    done = tp('writeLoad.added', { n: out.length, case: modelStore.model.loadCases.find((lc) => lc.id === caseId)?.name ?? '' });
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
  {:else if kind === 'surface'}
    <div class="wl-row"><label>q <input type="text" bind:value={sq} class="wl-num" placeholder="kN/m²" data-testid="wl-sq" /></label></div>
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
