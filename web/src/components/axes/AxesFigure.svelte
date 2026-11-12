<script lang="ts">
  import { t } from '../../lib/i18n';
  import { AXIS_NAMES, gravityLabel, plane2D, type AxesFrame, type Vec3 } from '../../lib/axes/frame';

  let { frame, kind, leftLocal = false }: { frame: AxesFrame; kind: 'space' | 'plane' | 'local'; leftLocal?: boolean } = $props();

  const COLORS = ['#ff4444', '#44cc44', '#4488ff'] as const;
  const O = { x: 70, y: 150 };
  const project = (v: Vec3, len: number) => ({ x: O.x + len * (v[0] + 0.5 * v[1]), y: O.y - len * (v[2] + 0.38 * v[1]) });
  const line = (a: Vec3, b: Vec3) => {
    const p = project(a, 1);
    const q = project(b, 1);
    return `M${p.x},${p.y} L${q.x},${q.y}`;
  };

  const spaceAxes = $derived(frame.rows.map((row, i) => {
    const tip = project(row, row[1] !== 0 ? 70 : 62);
    return { name: AXIS_NAMES[i], color: COLORS[i], tip, label: project(row, row[1] !== 0 ? 84 : 76) };
  }));

  // The drawing's box grows to take an axis pointing down, back or left, its head and its letter.
  const spaceBox = $derived.by(() => {
    const xs = [0, 240, ...spaceAxes.flatMap((a) => [a.tip.x - 8, a.label.x - 8, a.label.x + 12])];
    const ys = [0, 168, ...spaceAxes.flatMap((a) => [a.tip.y + 8, a.label.y + 6, a.label.y - 12])];
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return `${x0} ${y0} ${Math.max(...xs) - x0} ${Math.max(...ys) - y0}`;
  });

  const plane = $derived(plane2D(frame));
  const planeBox = $derived(`0 0 200 ${plane.vertical.sign < 0 ? 186 : 150}`);
  const towardViewer = $derived(plane.normal.sign < 0);
  const ccw = $derived(towardViewer === (frame.det === 1));

  const localY = $derived(leftLocal ? -1 : 1);
</script>

{#if kind === 'space'}
  <svg class="axes-fig" viewBox={spaceBox} role="img" aria-label={t('axes.figSpaceAria')}>
    <defs>
      {#each COLORS as c, i}
        <marker id="ax-head-{i}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>
      {/each}
      <marker id="ax-head-g" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
    </defs>
    <path class="ground" d="{line([-14, -12, 0], [124, -12, 0])} L{project([124, 70, 0], 1).x},{project([124, 70, 0], 1).y} L{project([-14, 70, 0], 1).x},{project([-14, 70, 0], 1).y} z" />
    <path class="frame" d="{line([20, 50, 0], [20, 50, 80])} {line([110, 50, 0], [110, 50, 80])} {line([20, 50, 80], [110, 50, 80])}" />
    <path class="gravity" d={line([65, 50, 118], [65, 50, 90])} marker-end="url(#ax-head-g)" />
    <text class="gravity-label" x={project([70, 50, 112], 1).x} y={project([70, 50, 112], 1).y}>g · {gravityLabel(frame)}</text>
    {#each spaceAxes as a, i}
      <line x1={O.x} y1={O.y} x2={a.tip.x} y2={a.tip.y} stroke={a.color} stroke-width="2.4" marker-end="url(#ax-head-{i})" />
      <text class="axis-label" x={a.label.x} y={a.label.y} fill={a.color}>{a.name}</text>
    {/each}
    <circle cx={O.x} cy={O.y} r="2.6" class="origin" />
  </svg>
{:else if kind === 'plane'}
  <svg class="axes-fig" viewBox={planeBox} role="img" aria-label={t('axes.figPlaneAria')}>
    <defs>
      <marker id="pl-head-h" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS[AXIS_NAMES.indexOf(plane.horizontal.name)]} /></marker>
      <marker id="pl-head-v" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS[AXIS_NAMES.indexOf(plane.vertical.name)]} /></marker>
      <marker id="pl-head-m" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
    </defs>
    <line x1="100" y1="95" x2={100 + 62 * plane.horizontal.sign} y2="95" stroke={COLORS[AXIS_NAMES.indexOf(plane.horizontal.name)]} stroke-width="2.4" marker-end="url(#pl-head-h)" />
    <text class="axis-label" x={100 + 74 * plane.horizontal.sign} y="99" text-anchor="middle" fill={COLORS[AXIS_NAMES.indexOf(plane.horizontal.name)]}>{plane.horizontal.name}</text>
    <line x1="100" y1="95" x2="100" y2={95 - 62 * plane.vertical.sign} stroke={COLORS[AXIS_NAMES.indexOf(plane.vertical.name)]} stroke-width="2.4" marker-end="url(#pl-head-v)" />
    <text class="axis-label" x="100" y={95 - 72 * plane.vertical.sign + (plane.vertical.sign > 0 ? 0 : 10)} text-anchor="middle" fill={COLORS[AXIS_NAMES.indexOf(plane.vertical.name)]}>{plane.vertical.name}</text>
    <circle cx="100" cy="95" r="7" class="normal" stroke={COLORS[AXIS_NAMES.indexOf(plane.normal.name)]} />
    {#if towardViewer}
      <circle cx="100" cy="95" r="2.2" fill={COLORS[AXIS_NAMES.indexOf(plane.normal.name)]} />
    {:else}
      <path d="M95,90 L105,100 M105,90 L95,100" stroke={COLORS[AXIS_NAMES.indexOf(plane.normal.name)]} stroke-width="1.6" />
    {/if}
    <text class="axis-label small" x="88" y="113" text-anchor="end" fill={COLORS[AXIS_NAMES.indexOf(plane.normal.name)]}>{plane.normal.name}</text>
    <path class="moment" d={ccw ? 'M126.3,104.6 A28,28 0 1,0 73.7,104.6' : 'M73.7,104.6 A28,28 0 1,1 126.3,104.6'} marker-end="url(#pl-head-m)" />
    <text class="moment-label" x="130" y="58">M{plane.normal.name.toLowerCase()} +</text>
  </svg>
{:else}
  <svg class="axes-fig" viewBox="0 0 220 150" role="img" aria-label={t('axes.figLocalAria')}>
    <defs>
      {#each COLORS as c, i}
        <marker id="lc-head-{i}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>
      {/each}
    </defs>
    <rect class="beam" x="40" y="96" width="150" height="16" />
    <circle cx="40" cy="104" r="3" class="origin" />
    <text class="end-label" x="30" y="128">i</text>
    <text class="end-label" x="190" y="128">j</text>
    <line x1="40" y1="104" x2="110" y2="104" stroke={COLORS[0]} stroke-width="2.4" marker-end="url(#lc-head-0)" />
    <text class="axis-label" x="116" y="94" fill={COLORS[0]}>x</text>
    <line x1="40" y1="104" x2={40 + 30 * localY} y2={104 - 24 * localY} stroke={COLORS[1]} stroke-width="2.4" marker-end="url(#lc-head-1)" />
    <text class="axis-label" x={40 + 40 * localY} y={104 - 30 * localY + (localY < 0 ? 12 : 0)} fill={COLORS[1]}>y</text>
    <line x1="40" y1="104" x2="40" y2="44" stroke={COLORS[2]} stroke-width="2.4" marker-end="url(#lc-head-2)" />
    <text class="axis-label" x="46" y="44" fill={COLORS[2]}>z</text>
  </svg>
{/if}

<style>
  .axes-fig { width: 100%; height: auto; color: var(--st-text-2); display: block; }
  .ground { fill: var(--st-surface-3); stroke: var(--st-border); stroke-width: 1; opacity: 0.9; }
  .frame { fill: none; stroke: var(--st-text-3); stroke-width: 3; stroke-linecap: round; }
  .beam { fill: var(--st-surface-3); stroke: var(--st-text-3); stroke-width: 1.2; }
  .gravity { stroke: currentColor; stroke-width: 1.6; stroke-dasharray: 4 3; }
  .gravity-label, .moment-label, .end-label { font-size: 11px; fill: var(--st-text-2); }
  .axis-label { font-size: 13px; font-weight: 700; }
  .axis-label.small { font-size: 11px; }
  .origin { fill: var(--st-text); }
  .normal { fill: none; stroke-width: 1.6; }
  .moment { fill: none; stroke: currentColor; stroke-width: 1.4; }
</style>
