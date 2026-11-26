import type { Block } from './types';

const nextReleaseAdvisories = [
  'SA-2026-108-planar-projection-nodal-forces.md',
  'SA-2026-109-dxf-support-labels.md',
  'SA-2026-110-solver-json-boundary.md',
  'SA-2026-111-gravity-shared-deck-coverage.md',
  'SA-2026-112-basic-3d-shell-omission.md',
  'SA-2026-113-native-supplied-linear-certificates.md',
  'SA-2026-114-saved-combination-load-groups.md',
  'SA-2026-115-gravity-floor-region-ownership.md',
  'SA-2026-116-nonlinear-continuation-and-inclined-loads.md',
  'SA-2026-117-static-shell-self-weight-density.md',
  'SA-2026-118-self-weight-group-targets.md',
  'SA-2026-119-modal-mass-missing-density.md',
  'SA-2026-120-gravity-deck-load-placement.md',
  'SA-2026-121-planar-nonlinear-member-loads.md',
  'SA-2026-122-generated-load-combinations.md',
  'SA-2026-123-gravity-headroom-and-cover.md',
  'SA-2026-124-scoped-self-weight.md',
  'SA-2026-125-shared-rigid-support-degree.md',
  'SA-2026-126-repeated-load-combination-terms.md',
  'SA-2026-127-unmeshed-wall-slab-junctions.md',
  'SA-2026-128-sign-reversing-member-loads.md',
  'SA-2026-129-moving-load-force-jumps.md',
  'SA-2026-130-planar-elastic-mechanisms.md',
];

export function nextReleaseAdvisoryBlocks(status: string, linkText: string): Block[] {
  return nextReleaseAdvisories.flatMap<Block>((filename) => {
    const id = filename.split('-', 3).join('-');
    return [
      { k: 'note', t: `${id} — ${status}` },
      {
        k: 'ext',
        href: `https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/${filename}`,
        label: id,
        t: linkText,
      },
    ];
  });
}
