<script lang="ts">
  import { PRESETS, PRESET_IDS, type PresetId, type Tensor3 } from '../../lib/mohr/space';
  import { tm } from './i18n';

  let { value, onpick }: { value: Tensor3; onpick: (id: PresetId) => void } = $props();

  const KEYS = ['xx', 'yy', 'zz', 'xy', 'xz', 'yz'] as const;
  const same = (a: Tensor3, b: Tensor3) => {
    const scale = Math.max(...KEYS.map((k) => Math.abs(b[k])), 1);
    return KEYS.every((k) => Math.abs(a[k] - b[k]) <= 1e-9 * scale);
  };
  const current = $derived(PRESET_IDS.find((id) => same(value, PRESETS[id])) ?? null);
  const focusIndex = $derived(Math.max(0, current ? PRESET_IDS.indexOf(current) : 0));

  type P = [number, number];
  const S = 5.8, CX = 22, CY = 20.6;
  const proj = (x: number, y: number, z: number): P => [CX + (y - x) * 0.866 * S, CY + (x + y) * 0.5 * S - z * S];
  const pts = (list: P[]) => list.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const faces = [
    pts([proj(1, -1, 1), proj(1, 1, 1), proj(1, 1, -1), proj(1, -1, -1)]),
    pts([proj(-1, 1, 1), proj(1, 1, 1), proj(1, 1, -1), proj(-1, 1, -1)]),
    pts([proj(-1, -1, 1), proj(1, -1, 1), proj(1, 1, 1), proj(-1, 1, 1)]),
  ];

  type Arrow = { d: string; head: string; kind: 'ten' | 'comp' | 'shear' };
  function arrow(from: P, to: P, kind: Arrow['kind']): Arrow {
    const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, h = 2.6;
    return {
      d: `M${from[0].toFixed(1)} ${from[1].toFixed(1)}L${(to[0] - ux * h * 0.6).toFixed(1)} ${(to[1] - uy * h * 0.6).toFixed(1)}`,
      head: pts([to, [to[0] - ux * h * 1.6 - uy * h, to[1] - uy * h * 1.6 + ux * h], [to[0] - ux * h * 1.6 + uy * h, to[1] - uy * h * 1.6 - ux * h]]),
      kind,
    };
  }
  const axis = (i: number, t: number): [number, number, number] => [i === 0 ? t : 0, i === 1 ? t : 0, i === 2 ? t : 0];
  function figure(s: Tensor3): Arrow[] {
    const big = Math.max(...KEYS.map((k) => Math.abs(s[k])), 1e-12);
    const out: Arrow[] = [];
    (['xx', 'yy', 'zz'] as const).forEach((k, i) => {
      const v = s[k];
      if (Math.abs(v) < 1e-9 * big) return;
      const len = 0.75 + 1.05 * Math.abs(v) / big;
      const near = proj(...axis(i, 1.1)), far = proj(...axis(i, 1.1 + len));
      out.push(v > 0 ? arrow(near, far, 'ten') : arrow(far, near, 'comp'));
    });
    const shear = (v: number, face: number, along: number) => {
      if (Math.abs(v) < 1e-9 * big) return;
      const half = 0.75 * Math.sign(v);
      const base = (t: number): P => { const p: [number, number, number] = [0, 0, 0]; p[face] = 1.12; p[along] = t; return proj(...p); };
      out.push(arrow(base(-half), base(half), 'shear'));
    };
    shear(s.xy, 0, 1);
    shear(s.xy, 1, 0);
    shear(s.yz, 1, 2);
    shear(s.xz, 2, 0);
    return out;
  }
  const figures = PRESET_IDS.map((id) => ({ id, arrows: figure(PRESETS[id]) }));

  let buttons: HTMLButtonElement[] = $state([]);
  function key(e: KeyboardEvent, i: number) {
    const n = PRESET_IDS.length;
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onpick(PRESET_IDS[next]);
    buttons[next]?.focus();
  }
</script>

<div class="mh-presets" role="radiogroup" aria-label={tm('mohr.preset')} data-testid="mohr3d-preset">
  {#each figures as f, i (f.id)}
    <button type="button" class="mh-preset" role="radio" aria-checked={current === f.id} tabindex={i === focusIndex ? 0 : -1} title={tm(`mohr.preset.${f.id}`)} aria-label={tm(`mohr.preset.${f.id}`)}
      bind:this={buttons[i]} onclick={() => onpick(f.id)} onkeydown={(e) => key(e, i)} data-testid={`mohr3d-preset-${f.id}`}>
      <svg class="mh-preset-cube" viewBox="3 0.5 38 34" width="38" height="34" aria-hidden="true" focusable="false">
        {#each faces as face, j (j)}<polygon class="mh-preset-face" points={face} />{/each}
        {#each f.arrows as a, j (j)}
          <path class="mh-preset-arrow mh-preset-{a.kind}" d={a.d} /><polygon class="mh-preset-head mh-preset-{a.kind}" points={a.head} />
        {/each}
      </svg>
      <span class="mh-preset-name">{tm(`mohr.presetShort.${f.id}`)}</span>
    </button>
  {/each}
</div>
