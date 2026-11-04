/**
 * The 3D scene, for layers drawn by parts of the app the viewport does not import (PRO's linked
 * models): they add their objects to it, name the view category that tones them, and ask for a
 * frame.
 */
import type * as THREE from 'three';
import type { ViewCategory } from '../store/view-categories.svelte';

interface Host { scene: THREE.Scene; redraw: () => void }

let host = $state<Host | null>(null);
const toned = new Map<THREE.Object3D, ViewCategory>();

export const sceneHost = {
  get current() { return host; },
  attach(h: Host | null) { host = h; },
  /** An object drawn in the state of `category`, from now until it is released. */
  tone(obj: THREE.Object3D, category: ViewCategory) { toned.set(obj, category); host?.redraw(); },
  release(obj: THREE.Object3D) { toned.delete(obj); },
  get toned(): ReadonlyMap<THREE.Object3D, ViewCategory> { return toned; },
};
