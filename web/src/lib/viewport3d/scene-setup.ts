/**
 * The 3D viewport's scene, camera, renderer, orbit controls and lights, shared by the app's
 * Viewport3D and by any other view that must look and behave the same (the research viewer).
 * Store-free: callers own what goes in the scene and when it renders.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS } from '../three/selection-helpers';
import { setCameraUp } from '../geometry/coordinate-system';

export function createViewerScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  return scene;
}

export function createViewerPerspectiveCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  setCameraUp(camera);
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function createViewerOrthographicCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  setCameraUp(camera);
  camera.position.set(12, 8, 12);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function createViewerRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);
  return renderer;
}

/** Damped orbit controls that zoom toward the pointer, as in the app. */
export function createViewerControls(camera: THREE.Camera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.target.set(0, 0, 0);
  controls.zoomToCursor = true;
  return controls;
}

/** The default mouse and touch mapping: left drag orbits, right drag pans, wheel zooms. */
export function applyDefaultNavigation(controls: OrbitControls, opts: { leftSlides?: boolean; plan?: boolean } = {}): void {
  const { leftSlides = false, plan = false } = opts;
  controls.enableRotate = !plan;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: leftSlides ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: leftSlides && !plan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: leftSlides ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
}

export function addViewerLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dir1.position.set(10, 20, 10);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-10, 10, -10);
  scene.add(dir2);
}
