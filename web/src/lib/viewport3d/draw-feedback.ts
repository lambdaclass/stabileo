/**
 * What the model shows while a member or a plate is being drawn.
 *
 * The first node of a member and the corners of a plate were marked only by recolouring the node,
 * a sphere a few pixels across, so after the first click nothing on screen said a node had been
 * taken. These are rings of a constant size on screen around each picked node, drawn over
 * everything, and a dashed line from the picked nodes to the pointer: what the next click will
 * close.
 */
import * as THREE from 'three';
import { COLORS } from '../three/selection-helpers';

const RING_PX = 24;

let ringTexture: THREE.Texture | null = null;
function ring(): THREE.Texture {
  if (ringTexture) return ringTexture;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  g.stroke();
  ringTexture = new THREE.CanvasTexture(c);
  return ringTexture;
}

export interface DrawFeedback {
  group: THREE.Group;
  /** Rings around these points, in scene coordinates. */
  setPicked(points: THREE.Vector3[]): void;
  /** The dashed preview: through `points`, then to `cursor` when there is one. */
  setPreview(points: THREE.Vector3[], cursor: THREE.Vector3 | null): void;
  clear(): void;
}

export function createDrawFeedback(): DrawFeedback {
  const group = new THREE.Group();
  group.name = 'drawFeedback';
  group.renderOrder = 1000;

  const rings = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      size: RING_PX, sizeAttenuation: false, map: ring(), transparent: true,
      color: COLORS.nodeSelected, depthTest: false, depthWrite: false,
    }),
  );
  rings.renderOrder = 1000;
  rings.frustumCulled = false;

  const preview = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: COLORS.nodeSelected, dashSize: 0.15, gapSize: 0.1, depthTest: false }),
  );
  preview.renderOrder = 999;
  preview.frustumCulled = false;
  group.add(rings, preview);

  return {
    group,
    setPicked(points) {
      rings.geometry.dispose();
      rings.geometry = new THREE.BufferGeometry().setFromPoints(points);
      rings.visible = points.length > 0;
    },
    setPreview(points, cursor) {
      const all = cursor ? [...points, cursor] : points;
      preview.geometry.dispose();
      preview.geometry = new THREE.BufferGeometry().setFromPoints(all);
      preview.computeLineDistances();
      preview.visible = all.length >= 2;
    },
    clear() {
      this.setPicked([]);
      this.setPreview([], null);
    },
  };
}
