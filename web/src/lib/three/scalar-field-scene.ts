import type { Scene } from 'three';
import { createScalarFieldMesh, type ScalarFieldMesh } from './scalar-field-mesh';

/** Owns the mesh geometry as the viewer switches between live, replay and cached meshes. */
export class ScalarFieldScene {
  private field: ScalarFieldMesh | null = null;
  constructor(private scene: Scene) {}

  rebuild(xy: ArrayLike<number>, cells: ArrayLike<number>, cellSize: 2 | 3 | 4, lineWidth: number) {
    this.dispose();
    this.field = createScalarFieldMesh(xy, cells, cellSize, lineWidth);
    this.scene.add(this.field.group);
    return this.field;
  }

  dispose() {
    if (!this.field) return;
    this.scene.remove(this.field.group);
    this.field.dispose();
    this.field = null;
  }
}
