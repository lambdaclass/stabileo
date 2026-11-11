import { DEFAULT_2D, DEFAULT_3D, type Mohr2DState, type Mohr3DState, type MohrKind } from './state';

class MohrPanel {
  open = $state(false);
  kind = $state<MohrKind>('plane');
  plane = $state<Mohr2DState>({ ...DEFAULT_2D });
  space = $state<Mohr3DState>({ ...DEFAULT_3D, s: { ...DEFAULT_3D.s } });
  fromModel = $state(false);
}

export const mohrPanel = new MohrPanel();

export function openMohr(options: { kind?: MohrKind; plane?: Mohr2DState; space?: Mohr3DState; fromModel?: boolean } = {}): void {
  if (options.plane) mohrPanel.plane = { ...options.plane };
  if (options.space) mohrPanel.space = { ...options.space, s: { ...options.space.s } };
  mohrPanel.kind = options.kind ?? mohrPanel.kind;
  mohrPanel.fromModel = options.fromModel ?? false;
  mohrPanel.open = true;
}

export function closeMohr(): void {
  mohrPanel.open = false;
}

/** A beam fibre in MPa: σ along the bar and the τ its Mohr circle uses; σy = σz = 0. `components` are τxy, τxz when known. */
export function openMohrFromFibre(sigma: number, tau: number, components?: [number, number], kind: MohrKind = 'plane'): void {
  const [xy, xz] = components ?? [tau, 0];
  openMohr({
    kind,
    plane: { sx: sigma, sy: 0, txy: tau, theta: 0, unit: 'MPa', tauDown: mohrPanel.plane.tauDown },
    space: { s: { xx: sigma, yy: 0, zz: 0, xy, xz, yz: 0 }, phi: mohrPanel.space.phi, theta: mohrPanel.space.theta, unit: 'MPa' },
    fromModel: true,
  });
}
