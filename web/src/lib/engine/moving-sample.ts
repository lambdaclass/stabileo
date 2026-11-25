type LocalForce = [axial: number, shearY: number, shearZ: number];

export interface AxleFace {
  elementId: number;
  nodeId: number;
  atEnd: boolean;
  force: LocalForce;
}

export function axleFaceForce(force: LocalForce, axialOnly: boolean): LocalForce {
    return axialOnly ? [force[0], 0, 0] : force;
}

export type FaceLoads = Map<number, [LocalForce, LocalForce]>;

class SampleLimit<L> {
  readonly changes = new Map<number, L | undefined>();
  readonly faces: FaceLoads = new Map();

  add(face: AxleFace): void {
    let forces = this.faces.get(face.elementId);
    if (!forces) {
      forces = [[0, 0, 0], [0, 0, 0]];
      this.faces.set(face.elementId, forces);
    }
    const at = forces[Number(face.atEnd)];
    for (const axis of [0, 1, 2] as const) at[axis] += face.force[axis];
  }

  solve<R>(loads: L[], solve: (loads: L[]) => R): R {
    const changed: L[] = [];
    for (const [index, load] of loads.entries()) {
      const value = this.changes.has(index) ? this.changes.get(index) : load;
      if (value !== undefined) changed.push(value);
    }
    return solve(changed);
  }
}

export class MovingSample<L> {
  readonly loads: L[] = [];
  private readonly limits = [new SampleLimit<L>(), new SampleLimit<L>()] as const;

  get hasJoints(): boolean { return this.limits.some((limit) => limit.faces.size > 0); }

  addJoint(faces: [AxleFace | undefined, AxleFace | undefined], loadAt: (nodeId: number) => L): void {
    const node = (faces[0] ?? faces[1])!.nodeId;
    const index = this.loads.length;
    this.loads.push(loadAt(node));
    for (const side of [0, 1] as const) {
      const limit = this.limits[side], face = faces[side];
      if (face) limit.add(face);
      if (face?.nodeId !== node) limit.changes.set(index, face && loadAt(face.nodeId));
    }
  }

  fold<R>(solve: (loads: L[]) => R, fold: (result: R, faces?: FaceLoads, reuse?: boolean) => void): R {
    const exact = solve(this.loads);
    fold(exact);
    for (const limit of this.limits) {
      if (limit.changes.size) {
        fold(limit.solve(this.loads, solve), limit.faces);
      } else if (limit.faces.size) {
        fold(exact, limit.faces, true);
      }
    }
    return exact;
  }
}
