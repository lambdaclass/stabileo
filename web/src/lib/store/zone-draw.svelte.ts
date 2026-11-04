/**
 * Drawing a use zone in the model: clicks on the working plane at a level, captured like a new
 * node (on a node, on a member, on the grid or a template's point), make its outline; a click on
 * the first point, or Enter, closes it (`store/use-zones.ts createUseZone`). Not model data.
 */
import { uiStore } from './ui.svelte';
import { createUseZone } from './use-zones';
import { t, tp } from '../i18n';

let active = $state(false);
let points = $state<Array<{ x: number; y: number }>>([]);
let z = $state(0);
let name = $state('');

export const zoneDraw = {
  get active() { return active; },
  get points() { return points; },
  get z() { return z; },
  /** Start drawing at the level the working plane is on. */
  start(zoneName = '') {
    active = true; points = []; z = uiStore.nodeCreateZ; name = zoneName;
    uiStore.currentTool = 'select';
    uiStore.workingPlane = 'XY';
  },
  stop() { active = false; points = []; },
  /** A point clicked; the first one again closes the zone. */
  add(p: { x: number; y: number }) {
    if (!active) return;
    const first = points[0];
    if (first && points.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) < 1e-6) { this.close(); return; }
    if (points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)) return;
    points = [...points, p];
  },
  undo() { points = points.slice(0, -1); },
  close(): number {
    if (points.length < 3) return -1;
    const id = createUseZone(points, z, name.trim() || tp('loadZone.defaultName', { n: Date.now() % 1000 }));
    if (id < 0) uiStore.toast(t('loadZone.selfIntersecting'), 'error');
    else uiStore.toast(tp('useZones.drawn', { n: points.length }), 'success');
    points = [];
    return id;
  },
};
