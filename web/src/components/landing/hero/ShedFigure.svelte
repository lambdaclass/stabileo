<script module lang="ts">
  import { NODES, MEMBERS, FY } from './shed-data';

  const segments = new Map<string, { start: number; end: number; levels: Set<number> }>();
  for (const [start, end, level] of MEMBERS) {
    const key = [NODES[start].join(','), NODES[end].join(',')].sort().join('|');
    const segment = segments.get(key);
    if (segment) {
      segment.levels.add(level);
    } else {
      segments.set(key, { start, end, levels: new Set([level]) });
    }
  }

  const strokes = [...segments.values()].flatMap(({ start, end, levels }) =>
    [...levels].sort((a, b) => a - b).map((level, index) => ({
      start,
      end,
      level,
      lane: index - (levels.size - 1) / 2,
    })),
  ).sort((a, b) => a.level - b.level);

  type Point = { x: number; y: number };
  const LANE_SPACING = 4;

  function placeStroke(a: Point, b: Point, lane: number) {
    if (lane === 0) return { a, b };

    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const distance = lane * LANE_SPACING;
    const dx = -Math.sin(angle) * distance;
    const dy = Math.cos(angle) * distance;
    return {
      a: { x: a.x + dx, y: a.y + dy },
      b: { x: b.x + dx, y: b.y + dy },
    };
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t } from '../../../lib/i18n/store.svelte';
  import { HeroLoop, smooth } from './loop.svelte';

  type Props = { prefersReducedMotion?: boolean };
  let { prefersReducedMotion = false }: Props = $props();

  const PERIOD = 18, SCAN = 5, FADE_AT = 17;
  const loop = new HeroLoop(PERIOD, () => prefersReducedMotion, 0.5);
  onMount(() => loop.start());

  const RAMP = ['#3b5368', '#3f6f8f', '#3f8fa6', '#52a99b', '#8cbf6f', '#d2c84f', '#eda23a', '#e9692e', '#e5482a'];
  function colour(level: number): string {
    const x = (level / 20) * (RAMP.length - 1);
    return RAMP[Math.min(RAMP.length - 1, Math.round(x))];
  }

  const CENTER = [12, 10, 5];
  const SCALE = 13.8;
  const ORIGIN = { x: 280, y: 136 };
  const EL = (22 * Math.PI) / 180;
  const LENGTH = 24;

  const time = $derived(loop.seconds);
  const az = $derived(((-62 + 34 * Math.sin((2 * Math.PI * time) / PERIOD)) * Math.PI) / 180);
  const pts = $derived.by(() => {
    const r = [-Math.sin(az), Math.cos(az), 0];
    const u = [-Math.sin(EL) * Math.cos(az), -Math.sin(EL) * Math.sin(az), Math.cos(EL)];
    return NODES.map((p) => {
      const d = [p[0] - CENTER[0], p[1] - CENTER[1], p[2] - CENTER[2]];
      return {
        x: ORIGIN.x + SCALE * (d[0] * r[0] + d[1] * r[1]),
        y: ORIGIN.y - SCALE * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]),
      };
    });
  });
  const front = $derived(smooth(time / SCAN) * (LENGTH + 4) - 2);
  const lit = (start: number, end: number) => smooth(front - Math.min(NODES[start][0], NODES[end][0]));
  const fade = $derived(Math.min(loop.laps > 0 ? smooth(time / 0.5) : 1, 1 - smooth((time - FADE_AT) / (PERIOD - FADE_AT))));
  const GRADIENT = `linear-gradient(90deg, ${RAMP.join(', ')})`;
</script>

<figure class="shed-fig">
  <svg
    viewBox="0 0 560 270"
    role="img"
    aria-labelledby="shed-title shed-desc"
  >
    <title id="shed-title">{t('landing.shedTitle')}</title>
    <desc id="shed-desc">{t('landing.shedDesc')}</desc>
    <g aria-hidden="true" style="opacity: {fade}">
      {#each strokes as { start, end, level, lane }, k (k)}
        {@const { a, b } = placeStroke(pts[start], pts[end], lane)}
        {@const on = lit(start, end)}
        <line
          x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={b.x.toFixed(1)} y2={b.y.toFixed(1)}
          stroke={on > 0.02 ? colour(level) : '#55626e'}
          stroke-width={0.7 + 1.1 * (level / 20) * on}
          stroke-opacity={0.35 + 0.65 * on}
        />
      {/each}
    </g>
  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.shedTag')}</span>
    <span class="hf-item shed-caption">
      <span>{t('landing.shedHeading')}</span>
      <span class="shed-scale"><b>0</b><i class="shed-ramp" style="background: {GRADIENT}"></i><b>fy = {FY} MPa</b></span>
    </span>
  </figcaption>
</figure>

<style>
  .shed-caption {
    flex-wrap: wrap;
    white-space: normal;
  }
  .shed-scale {
    display: inline-flex;
    gap: inherit;
    white-space: nowrap;
  }
  .shed-ramp {
    display: inline-block;
    width: 7rem;
    height: 7px;
    border-radius: 1px;
    align-self: center;
  }
  .shed-fig {
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  line {
    stroke-linecap: round;
  }
</style>
