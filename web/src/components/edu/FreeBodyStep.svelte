<script lang="ts">
  import { t, tp } from '../../lib/i18n';
  import type { ModelSpec } from './exercise-spec';
  import { withinTolerance } from './exercise-marking';
  import {
    BAR_ENDS, END_DOFS, barName, endElement, freeBodyKey, freeBodyUnit, studentBalanced,
    type BarEnd, type BarTruth, type EndAction, type EndDof, type FreeBodyBar,
  } from './free-body-step';

  type VerifState = 'pending' | 'correct' | 'incorrect';

  interface Props {
    model: ModelSpec;
    bars: FreeBodyBar[];
    truth: BarTruth[] | null;
    answers: Record<string, string>;
    verif: Record<string, VerifState>;
    revealed: Record<string, boolean>;
    exam: boolean;
    canReveal: boolean;
    complete: boolean;
  }

  let { model, bars, truth, answers = $bindable(), verif = $bindable(), revealed = $bindable(), exam, canReveal, complete }: Props = $props();

  let active = $state(0);
  let hints = $state<string[]>([]);
  const bar = $derived(bars[active] ?? bars[0]!);

  const num = (s: string | undefined) => {
    const v = parseFloat((s ?? '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2).replace(/\.?0+$/, ''));

  function barDone(b: number): boolean {
    return BAR_ENDS.every((end) => END_DOFS.every((dof) => verif[freeBodyKey(b, end, dof)] === 'correct'));
  }

  function verify() {
    if (!truth) return;
    const next = { ...verif };
    const notes: string[] = [];
    bars.forEach((barN, b) => {
      const student = {} as Record<BarEnd, EndAction>;
      let entered = true, wrong = false;
      for (const end of BAR_ENDS) {
        student[end] = { Fx: 0, Fy: 0, M: 0 };
        for (const dof of END_DOFS) {
          const key = freeBodyKey(b, end, dof);
          if (revealed[key]) { next[key] = 'correct'; student[end][dof] = truth[b]![end][dof]; continue; }
          const v = num(answers[key]);
          if (v === null) { next[key] = 'pending'; entered = false; continue; }
          student[end][dof] = v;
          next[key] = withinTolerance(v, truth[b]![end][dof]) ? 'correct' : 'incorrect';
          if (next[key] === 'incorrect') wrong = true;
        }
      }
      if (!wrong) return;
      const name = barName(barN, b);
      notes.push(entered && studentBalanced(model, barN, student, truth[b]!)
        ? tp('edu.fb.hintBalanced', { bar: name })
        : entered ? tp('edu.fb.hintUnbalanced', { bar: name }) : tp('edu.fb.hintSome', { bar: name }));
    });
    verif = next;
    hints = notes;
  }

  function reveal(key: string, value: number) {
    answers = { ...answers, [key]: fmt(value) };
    revealed = { ...revealed, [key]: true };
    verif = { ...verif, [key]: 'correct' };
  }

  const W = 360, H = 210, PAD = 62, ARROW = 34, MAP_W = 120, MAP_H = 84;

  function fitter(points: Array<[number, number]>, w: number, h: number, pad: number) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = x1 - x0 > 1e-9 ? (w - 2 * pad) / (x1 - x0) : Infinity;
    const sy = y1 - y0 > 1e-9 ? (h - 2 * pad) / (y1 - y0) : Infinity;
    const s = Math.min(sx, sy, 1e6);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return (p: [number, number]) => ({ x: w / 2 + (p[0] - cx) * s, y: h / 2 - (p[1] - cy) * s });
  }

  const at = $derived(fitter(bar.nodes.map((n) => model.nodes[n]!), W, H, PAD));
  const mapAt = $derived(fitter(model.nodes, MAP_W, MAP_H, 14));

  type Pt = { x: number; y: number };
  const arrowHead = (tip: Pt, dx: number, dy: number, size = 6) => {
    const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    return `M${tip.x},${tip.y} L${tip.x - ux * size - uy * size * 0.55},${tip.y - uy * size + ux * size * 0.55} L${tip.x - ux * size + uy * size * 0.55},${tip.y - uy * size - ux * size * 0.55} Z`;
  };

  interface Glyph { d: string; head: string; tag: string; tx: number; ty: number; anchor: 'start' | 'middle' | 'end'; state: VerifState | 'empty' }
  interface Block { x: number; y: number; anchor: 'start' | 'end'; lines: Array<{ text: string; state: VerifState | 'empty' }> }

  function endGlyphs(b: number, end: BarEnd): { glyphs: Glyph[]; block: Block } {
    const { node } = endElement(bar, end);
    const other = end === 'i' ? bar.nodes[1]! : bar.nodes[bar.nodes.length - 2]!;
    const p = at(model.nodes[node]!), q = at(model.nodes[other]!);
    const ol = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    const out = { x: (p.x - q.x) / ol, y: (p.y - q.y) / ol };
    const stateOf = (key: string, v: number | null): VerifState | 'empty' => (v === null ? 'empty' : exam ? 'pending' : verif[key] ?? 'pending');
    const perp = Math.abs(out.x) > 1e-6 ? { x: 0, y: -1 } : { x: 1, y: 0 };
    const blockRight = out.x + perp.x >= 0, blockUp = out.y + perp.y < 0;
    const glyphs: Glyph[] = [];
    const lines: Block['lines'] = [];
    for (const dof of ['Fx', 'Fy'] as const) {
      const key = freeBodyKey(b, end, dof);
      const v = num(answers[key]);
      const unit = dof === 'Fx' ? { x: 1, y: 0 } : { x: 0, y: -1 };
      const sign = v === null || v >= 0 ? 1 : -1;
      const d = { x: unit.x * sign, y: unit.y * sign };
      const outward = d.x * out.x + d.y * out.y >= -0.01;
      const tail = outward ? p : { x: p.x - d.x * ARROW, y: p.y - d.y * ARROW };
      const tip = outward ? { x: p.x + d.x * ARROW, y: p.y + d.y * ARROW } : p;
      const far = outward ? tip : tail;
      const state = stateOf(key, v);
      glyphs.push({
        d: `M${tail.x},${tail.y} L${tip.x},${tip.y}`, head: arrowHead(tip, d.x, d.y), state, tag: dof,
        tx: dof === 'Fx' ? far.x : far.x + (blockRight ? -5 : 5), ty: dof === 'Fx' ? far.y - 5 : far.y + (d.y > 0 === outward ? 10 : -2),
        anchor: dof === 'Fx' ? 'middle' : blockRight ? 'end' : 'start',
      });
      lines.push({ text: v === null ? `${dof} ?` : `${dof} = ${fmt(v)}`, state });
    }
    const key = freeBodyKey(b, end, 'M');
    const v = num(answers[key]);
    const r = 15, cw = v === null || v >= 0;
    const base = Math.atan2(out.y, out.x);
    const a0 = base - (cw ? 0.75 : -0.75) * Math.PI, a1 = base + (cw ? 0.75 : -0.75) * Math.PI;
    const s0 = { x: p.x + r * Math.cos(a0), y: p.y + r * Math.sin(a0) }, e = { x: p.x + r * Math.cos(a1), y: p.y + r * Math.sin(a1) };
    const tangent = cw ? { x: -Math.sin(a1), y: Math.cos(a1) } : { x: Math.sin(a1), y: -Math.cos(a1) };
    const mState = stateOf(key, v);
    glyphs.push({ d: `M${s0.x},${s0.y} A${r},${r} 0 1 ${cw ? 1 : 0} ${e.x},${e.y}`, head: arrowHead(e, tangent.x, tangent.y, 5), state: mState, tag: '', tx: 0, ty: 0, anchor: 'start' });
    lines.push({ text: v === null ? 'M ?' : `M = ${fmt(v)}`, state: mState });
    const block: Block = { x: p.x + (blockRight ? 20 : -20), y: blockUp ? p.y - 52 : p.y + 30, anchor: blockRight ? 'start' : 'end', lines };
    return { glyphs, block };
  }

  const drawn = $derived(BAR_ENDS.map((end) => endGlyphs(active, end)));

  const elementLoads = $derived.by(() => {
    const out: Array<{ arrows: Array<{ d: string; head: string }>; line: string; label: string; lx: number; ly: number; span: number }> = [];
    for (const l of model.distributedLoads ?? []) {
      if (!bar.elements.some((e) => e.index === l.element)) continue;
      const [ni, nj] = model.elements[l.element]!;
      const a = model.nodes[ni]!, b = model.nodes[nj]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const perp = { x: -(b[1] - a[1]) / len, y: (b[0] - a[0]) / len };
      const qI = l.qI, qJ = l.qJ ?? l.qI, top = Math.max(Math.abs(qI), Math.abs(qJ)) || 1;
      const away = { x: -perp.x * Math.sign(qI || qJ || 1), y: perp.y * Math.sign(qI || qJ || 1) };
      const arrows: Array<{ d: string; head: string }> = [];
      const tails: Pt[] = [];
      const pa = at(a), pb = at(b);
      const n = Math.max(2, Math.round(Math.hypot(pb.x - pa.x, pb.y - pa.y) / 26));
      for (let k = 0; k <= n; k++) {
        const f = k / n, q = qI + (qJ - qI) * f;
        const onBar = at([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        const lenPx = 6 + 18 * (Math.abs(q) / top);
        const tail = { x: onBar.x + away.x * lenPx, y: onBar.y + away.y * lenPx };
        tails.push(tail);
        if (Math.abs(q) > 1e-9) arrows.push({ d: `M${tail.x},${tail.y} L${onBar.x},${onBar.y}`, head: arrowHead(onBar, -away.x, -away.y, 5) });
      }
      const mid = { x: (tails[0]!.x + tails[n]!.x) / 2, y: (tails[0]!.y + tails[n]!.y) / 2 };
      out.push({
        arrows, line: tails.map((p, k) => `${k ? 'L' : 'M'}${p.x},${p.y}`).join(' '),
        label: qI === qJ ? `q = ${fmt(Math.abs(qI))} kN/m` : `q = ${fmt(Math.abs(qI))}–${fmt(Math.abs(qJ))} kN/m`,
        lx: mid.x + away.x * 8, ly: mid.y + away.y * 8 + (away.y > 0 ? 9 : 0), span: Math.hypot(pb.x - pa.x, pb.y - pa.y),
      });
    }
    const widest = new Map<string, number>();
    for (const l of out) widest.set(l.label, Math.max(widest.get(l.label) ?? 0, l.span));
    const labelled = new Set<string>();
    return out.map((l) => {
      const show = l.span === widest.get(l.label) && !labelled.has(l.label);
      if (show) labelled.add(l.label);
      return { ...l, label: show ? l.label : '' };
    });
  });

  const interior = $derived.by(() => {
    const inside = bar.nodes.slice(1, -1);
    const loads: Array<{ d: string; head: string; label: string; lx: number; ly: number }> = [];
    const supports: Pt[] = [];
    for (const node of inside) {
      const p = at(model.nodes[node]!);
      for (const l of model.nodalLoads ?? []) {
        if (l.node !== node) continue;
        const fx = l.fx ?? 0, fy = l.fy ?? 0, mag = Math.hypot(fx, fy);
        if (mag < 1e-9) continue;
        const d = { x: fx / mag, y: -fy / mag };
        const tail = { x: p.x - d.x * ARROW, y: p.y - d.y * ARROW };
        loads.push({ d: `M${tail.x},${tail.y} L${p.x},${p.y}`, head: arrowHead(p, d.x, d.y), label: `${fmt(mag)} kN`, lx: tail.x, ly: tail.y - 4 });
      }
      if (model.supports.some((s) => s.node === node)) supports.push(p);
    }
    return { loads, supports };
  });

  const ends = $derived(BAR_ENDS.map((end) => {
    const { node } = endElement(bar, end);
    return { end, node, p: at(model.nodes[node]!) };
  }));
</script>

<div class="fb" data-testid="edu-fb">
  <p class="fb-info">{t('edu.fb.intro')}</p>

  <div class="fb-pick">
    <svg class="fb-map" viewBox="0 0 {MAP_W} {MAP_H}" role="img" aria-label={t('edu.fb.map')}>
      {#each bars as b, k}
        {@const pts = b.nodes.map((n) => mapAt(model.nodes[n]!))}
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} class="map-bar" class:on={k === active} class:done={!exam && barDone(k)} />
      {/each}
      {#each model.nodes as n, k}
        {@const p = mapAt(n)}
        <circle cx={p.x} cy={p.y} r="2" class="map-node" />
        <text x={p.x + 4} y={p.y - 4} class="map-label">{k + 1}</text>
      {/each}
    </svg>
    <div class="fb-tabs" role="tablist">
      {#each bars as b, k}
        <button
          type="button" role="tab" class="fb-tab" class:on={k === active} class:done={!exam && barDone(k)}
          aria-selected={k === active} onclick={() => (active = k)} data-testid="edu-fb-bar-{k}"
        >
          {#if !exam && barDone(k)}✓ {/if}{barName(b, k)}
        </button>
      {/each}
    </div>
  </div>

  <svg class="fb-draw" viewBox="0 0 {W} {H}" role="img" aria-label={barName(bar, active)} data-testid="edu-fb-drawing">
    {#each elementLoads as l}
      <path d={l.line} class="load-line" />
      {#each l.arrows as a}<path d={a.d} class="load" /><path d={a.head} class="load-head" />{/each}
      {#if l.label}<text x={l.lx} y={l.ly} class="load-label" text-anchor="middle">{l.label}</text>{/if}
    {/each}
    <polyline points={bar.nodes.map((n) => { const p = at(model.nodes[n]!); return `${p.x},${p.y}`; }).join(' ')} class="member" />
    {#each interior.supports as p}
      <path d="M{p.x},{p.y} l-7,11 h14 Z" class="support" />
      <text x={p.x} y={p.y + 22} class="support-label" text-anchor="middle">{t('edu.fb.reactionKnown')}</text>
    {/each}
    {#each interior.loads as l}
      <path d={l.d} class="load" /><path d={l.head} class="load-head" />
      <text x={l.lx} y={l.ly} class="load-label" text-anchor="middle">{l.label}</text>
    {/each}
    {#each drawn as end}
      {#each end.glyphs as g}
        <path d={g.d} class="action {g.state}" />
        <path d={g.head} class="action-head {g.state}" />
        {#if g.tag}<text x={g.tx} y={g.ty} class="action-tag {g.state}" text-anchor={g.anchor}>{g.tag}</text>{/if}
      {/each}
      <text x={end.block.x} y={end.block.y} class="action-block" text-anchor={end.block.anchor}>
        {#each end.block.lines as line, k}
          <tspan x={end.block.x} dy={k ? 12 : 0} class="action-label {line.state}">{line.text}</tspan>
        {/each}
      </text>
    {/each}
    {#each ends as e}
      <circle cx={e.p.x} cy={e.p.y} r="3.5" class="cut" />
    {/each}
  </svg>

  <p class="fb-sign">{t('edu.fb.signs')}</p>

  {#each ends as e}
    <div class="fb-end">
      <span class="fb-end-label">{tp('edu.fb.node', { n: e.node + 1 })}</span>
      <div class="fb-inputs">
        {#each END_DOFS as dof}
          {@const key = freeBodyKey(active, e.end, dof)}
          {@const state = exam ? 'pending' : verif[key] ?? 'pending'}
          <div class="fb-input-group">
            <label class="fb-input" class:verif-correct={state === 'correct'} class:verif-incorrect={state === 'incorrect'}>
              <span class="fb-name">{dof}</span>
              <input
                type="text" inputmode="decimal" placeholder="0.00"
                value={answers[key] ?? ''}
                oninput={(ev) => { answers = { ...answers, [key]: (ev.target as HTMLInputElement).value }; }}
                class:revealed={revealed[key]}
                readonly={revealed[key]}
                data-testid="edu-fb-{active}-{e.end}-{dof}"
              />
              <span class="fb-unit">{freeBodyUnit(dof as EndDof)}</span>
            </label>
            {#if canReveal && state === 'incorrect' && !revealed[key] && truth}
              <button type="button" class="reveal-btn" onclick={() => reveal(key, truth![active]![e.end][dof])}>{t('edu.reveal')}</button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}

  {#if !exam}
    <button type="button" class="verify-btn" onclick={verify} disabled={complete || !truth} data-testid="edu-fb-verify">
      {complete ? '✓ ' + t('edu.verified') : t('edu.fb.verify')}
    </button>
  {/if}

  {#if hints.length > 0}
    <div class="hints">
      {#each hints as hint}<p class="hint">{hint}</p>{/each}
    </div>
  {/if}
</div>

<style>
  .fb { display: grid; gap: 8px; }
  .fb-info, .fb-sign { font-size: 0.72rem; color: var(--st-text-3); margin: 0; line-height: 1.4; }
  .fb-sign { font-family: var(--st-mono); font-size: 0.66rem; }
  .fb-pick { display: flex; gap: 10px; align-items: center; }
  .fb-map { width: 120px; height: 84px; flex: none; background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .map-bar { fill: none; stroke: var(--st-text-3); stroke-width: 3; stroke-linecap: round; }
  .map-bar.done { stroke: var(--st-ok); }
  .map-bar.on { stroke: var(--st-accent); stroke-width: 4.5; }
  .map-node { fill: var(--st-text-2); }
  .map-label { font: 9px var(--st-mono); fill: var(--st-text-2); }
  .fb-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
  .fb-tab {
    padding: 4px 8px; font: 0.68rem var(--st-sans); color: var(--st-text-2); cursor: pointer;
    background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius);
  }
  .fb-tab.on { border-color: var(--st-accent); color: var(--st-text); font-weight: 600; }
  .fb-tab.done { color: var(--st-ok); }
  .fb-draw { width: 100%; height: auto; max-height: 240px; background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .member { fill: none; stroke: var(--st-model-member); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .cut { fill: var(--st-surface); stroke: var(--st-text-2); stroke-width: 1.5; }
  .support { fill: none; stroke: var(--st-model-support); stroke-width: 1.5; }
  .support-label { font: 9px var(--st-sans); fill: var(--st-text-3); }
  .load, .load-line { fill: none; stroke: var(--st-warn); stroke-width: 1.3; }
  .load-head { fill: var(--st-warn); }
  .load-label { font: 10px var(--st-mono); fill: var(--st-warn); }
  .action { fill: none; stroke: var(--st-accent); stroke-width: 2; }
  .action-head { fill: var(--st-accent); }
  .action-label { font: 600 10px var(--st-mono); fill: var(--st-accent); }
  .action-tag { font: 9px var(--st-mono); fill: var(--st-accent); }
  .action-tag.empty { fill: var(--st-text-3); }
  .action-tag.correct { fill: var(--st-ok); }
  .action-tag.incorrect { fill: var(--st-danger); }
  .action.empty { stroke: var(--st-text-3); stroke-dasharray: 3 3; stroke-width: 1.3; }
  .action-head.empty { fill: var(--st-text-3); }
  .action-label.empty { fill: var(--st-text-3); font-weight: 400; }
  .action.correct { stroke: var(--st-ok); }
  .action-head.correct, .action-label.correct { fill: var(--st-ok); }
  .action.incorrect { stroke: var(--st-danger); }
  .action-head.incorrect, .action-label.incorrect { fill: var(--st-danger); }
  .fb-end { display: grid; gap: 4px; }
  .fb-end-label { font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .fb-inputs { display: flex; flex-wrap: wrap; gap: 6px; }
  .fb-input-group { display: flex; align-items: center; gap: 4px; }
  .fb-input { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; }
  .fb-name { color: var(--st-text-2); font-weight: 500; min-width: 18px; }
  .fb-input input {
    width: 64px; padding: 4px 6px; background: var(--st-surface-3); border: 1px solid var(--st-hair);
    border-radius: var(--st-radius); color: var(--st-text); font: 0.75rem var(--st-mono); text-align: right;
  }
  .fb-input input:focus { outline: none; border-color: var(--st-focus); }
  .fb-unit { color: var(--st-text-3); font-size: 0.65rem; }
  .verif-correct input { border-color: var(--st-ok); background: color-mix(in srgb, var(--st-ok) 10%, transparent); }
  .verif-incorrect input { border-color: var(--st-danger); background: color-mix(in srgb, var(--st-danger) 10%, transparent); }
  input.revealed { color: var(--st-warn); font-style: italic; border-color: var(--st-warn); background: color-mix(in srgb, var(--st-warn) 10%, transparent); }
  .verify-btn {
    justify-self: start; padding: 6px 16px; background: var(--st-accent); border: 1px solid var(--st-accent);
    border-radius: var(--st-radius); color: var(--st-text-on-accent); font: 600 0.72rem var(--st-sans); cursor: pointer;
  }
  .verify-btn:hover:not(:disabled) { background: var(--st-accent-hover); border-color: var(--st-accent-hover); }
  .verify-btn:disabled { background: none; color: var(--st-ok); border-color: var(--st-ok); cursor: default; }
  .reveal-btn {
    padding: 2px 8px; background: none; border: 1px solid var(--st-hair); border-radius: var(--st-radius);
    color: var(--st-text-3); font: 0.6rem var(--st-sans); cursor: pointer; white-space: nowrap;
  }
  .reveal-btn:hover { color: var(--st-warn); border-color: var(--st-warn); }
  .hints { margin: 0; }
  .hint { font-size: 0.7rem; color: var(--st-warn); margin: 2px 0; line-height: 1.4; }
</style>
