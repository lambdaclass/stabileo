export class HeroLoop {
  u = $state(0);
  hovered = $state(false);
  paused = $state(false);
  laps = $state(0);
  readonly #period: number;
  readonly #reduced: boolean;

  constructor(period: number, reduced: boolean, still: number) {
    this.#period = period;
    this.#reduced = reduced;
    this.u = reduced ? still : 0;
  }

  get seconds(): number {
    return this.u * this.#period;
  }

  start(): () => void {
    if (this.#reduced) return () => {};
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!this.hovered && !this.paused) {
        const next = this.u + dt / this.#period;
        if (next >= 1) this.laps += 1;
        this.u = next % 1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
