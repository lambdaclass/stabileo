/**
 * Tools that write shell loads as the model keeps them:
 *
 *   hydrostatic   a fluid to a level, on the shells chosen: γ·(level − z) normal to each, pushing
 *                 away from a point in the fluid (by default the middle of the shells), nothing
 *                 above the level. A wall and a bottom alike;
 *   point         a force at a point of a shell, as the nodal forces of its shape functions.
 *
 * Pure: the caller adds what comes back in one undo step.
 */
import { shellFrame, shellPointForces, type ShellPoint, type Vec3 } from '../../engine/shell-load-integration';
import type { NodalLoad3D, SurfaceLoad3D } from '../../store/model.svelte';

export interface ShellRef { id: number; on?: 'plate'; pts: ShellPoint[]; nodes: number[] }

/** Each shell's surface load of a fluid of unit weight γ to `levelZ`; shells above it take none. */
export function hydrostaticSurfaceLoads(
  shells: readonly ShellRef[], gamma: number, levelZ: number, inside?: Vec3,
): Array<Omit<SurfaceLoad3D, 'id' | 'caseId'>> {
  const frames = shells.map((s) => ({ s, f: shellFrame(s.on ?? 'quad', s.pts) })).filter((x) => !!x.f);
  if (!frames.length) return [];
  const mid: Vec3 = inside ?? frames.reduce<Vec3>((c, x) => [c[0] + x.f!.centroid[0] / frames.length, c[1] + x.f!.centroid[1] / frames.length, c[2] + x.f!.centroid[2] / frames.length], [0, 0, 0]);
  const zMin = Math.min(...shells.flatMap((s) => s.pts.map((p) => p.z ?? 0)));
  const out: Array<Omit<SurfaceLoad3D, 'id' | 'caseId'>> = [];
  for (const { s, f } of frames) {
    if (!(zMin < levelZ)) break;
    if (Math.min(...s.pts.map((p) => p.z ?? 0)) >= levelZ) continue;
    // Away from the fluid: along the normal when the shell's middle is on its +z side.
    const away = f!.ez[0] * (f!.centroid[0] - mid[0]) + f!.ez[1] * (f!.centroid[1] - mid[1]) + f!.ez[2] * (f!.centroid[2] - mid[2]);
    // A shell through the point (a bottom seen from its own level) pushes down and out: −Z side.
    const sign = Math.abs(away) > 1e-9 ? Math.sign(away) : (f!.ez[2] <= 0 ? 1 : -1);
    out.push({
      quadId: s.id, ...(s.on ? { on: s.on } : {}),
      q: 0, frame: 'local',
      vary: { dir: [0, 0, 1], c1: levelZ, q1: 0, c2: zMin, q2: sign * gamma * (levelZ - zMin) },
    });
  }
  return out;
}

/** The nodal forces of a force at a point, on the first shell it falls on (projected along Z, then X, then Y). */
export function shellPointNodalLoads(shells: readonly ShellRef[], at: Vec3, force: Vec3): Array<Omit<NodalLoad3D, 'id' | 'caseId'>> | null {
  for (const normal of [[0, 0, 1], [1, 0, 0], [0, 1, 0]] as Vec3[]) {
    for (const s of shells) {
      // Only a shell the point lies on: its plane within 1 mm along the projection.
      const fr = shellFrame(s.on ?? 'quad', s.pts);
      if (!fr) continue;
      const den = fr.ez[0] * normal[0] + fr.ez[1] * normal[1] + fr.ez[2] * normal[2];
      if (Math.abs(den) < 1e-9) continue;
      const gap = (fr.ez[0] * (at[0] - fr.centroid[0]) + fr.ez[1] * (at[1] - fr.centroid[1]) + fr.ez[2] * (at[2] - fr.centroid[2])) / den;
      if (Math.abs(gap) > 1e-3) continue;
      const f = shellPointForces(s.on ?? 'quad', s.pts, at, force, normal);
      if (!f) continue;
      return s.nodes.map((nodeId, i) => ({ nodeId, fx: f[i]![0], fy: f[i]![1], fz: f[i]![2], mx: 0, my: 0, mz: 0 }));
    }
  }
  return null;
}
