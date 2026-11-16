import type * as THREE from 'three';
import { Vector3 } from 'three';
import { axesStore } from '../axes/axes.svelte';
import { AXIS_NAMES } from '../axes/frame';

/** The X/Y/Z triad in the viewport's corner, drawn from the camera's current orientation. */
export function drawAxisGizmoOn(canvas: HTMLCanvasElement, camera: THREE.Camera): void {
  const gc = canvas.getContext('2d');
  if (!gc) return;
  const s = canvas.width;
  gc.clearRect(0, 0, s, s);
  camera.updateMatrixWorld();
  const viewMat = camera.matrixWorldInverse;
  const colors = ['#ff4444', '#44ff44', '#4488ff'];
  const axes = axesStore.frame.rows.map((r, i) => ({ label: AXIS_NAMES[i], color: colors[i], dir: new Vector3(r[0], r[1], r[2]) }));
  const cx = s / 2, cy = s / 2, len = s * 0.35;
  const projected = axes
    .map((a) => {
      const d = a.dir.clone().transformDirection(viewMat);
      return { ...a, sx: d.x * len, sy: -d.y * len, depth: d.z };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const ax of projected) {
    gc.strokeStyle = ax.color;
    gc.lineWidth = 2;
    gc.globalAlpha = ax.depth > 0 ? 1 : 0.3;
    gc.beginPath();
    gc.moveTo(cx, cy);
    gc.lineTo(cx + ax.sx, cy + ax.sy);
    gc.stroke();
    gc.globalAlpha = 1;
    gc.fillStyle = ax.color;
    gc.font = 'bold 12px sans-serif';
    gc.fillText(ax.label, cx + ax.sx * 1.2 - 4, cy + ax.sy * 1.2 + 4);
  }
}
