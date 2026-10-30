/**
 * Draws the build timelapse on the 3D scene.
 *
 * Works on the meshes the viewport already keeps (one group per member, per shell, per
 * support): each frame it gives every piece the transform for how far it has come in and hides
 * what is not standing yet. While it runs it also sets the stage: background, lights, fog and
 * the members' finish for the chosen style, the glow on the pieces going in, and the camera's
 * turn. Everything else in the scene (nodes, loads, labels, results) is hidden, and all of it is
 * given back as it was on `restore`.
 *
 * With the envelope on, the façades are then clad and glazed floor by floor: meshes of its own,
 * made here and taken away on `restore` (the model has no such pieces).
 */
import * as THREE from 'three';
import { modelStore } from '../store';
import { buildTimelapse, HOLD_S, LEAD_S, type TimelapseStyle } from '../store/build-timelapse.svelte';
import { projectNodeToScene } from '../geometry/coordinate-system';
import {
  buildFront, buildSchedule, dropMatrix, growMatrix, growthAt, landAt, landedBetween, phaseAt, piecesStarted,
  type BuildPiece, type BuildSchedule, type BuildStep, type P3,
} from './build-timelapse';
import { envelopeSchedule, facadeBays, type EnvelopeStep } from './build-envelope';
import { timelapseSound } from './timelapse-sound';

export interface TimelapseRefs {
  scene: THREE.Scene;
  elementGroups: Map<number, THREE.Group>;
  shellGroups: Map<string, THREE.Group>;
  supportGizmos: Map<number, THREE.Group>;
  /** Scene children the timelapse keeps drawn (members, shells, supports). */
  keep: Set<THREE.Object3D>;
  /** Scene children kept unless the background is clean (the grids). */
  background: Set<THREE.Object3D>;
  /** Whether a planar model is drawn in the XZ plane. */
  project2D: boolean;
}

/** What the picture's texts need from the frame just drawn. */
export interface TimelapseFrameInfo {
  started: number;
  pieces: number;
  progress: number;
  /** 0 to 1 during the hold at the end, for the closing card. */
  closing: number;
  /** The stage or group going up, in a phased order. */
  phase: string | null;
}

/** Radians per second while the camera turns: a full turn in a minute. */
const ORBIT_RAD_S = (2 * Math.PI) / 60;
/** Seconds a piece keeps glowing after it is in place. */
const AFTERGLOW_S = 0.7;
const ACCENT = new THREE.Color('#e5482a');
const Z = new THREE.Vector3(0, 0, 1);

interface Look {
  top: string; bottom: string; fog: string;
  steel: number; metalness: number; roughness: number;
  sky: number; ground: number; hemi: number; key: number;
}
const LOOKS: Record<Exclude<TimelapseStyle, 'model'>, Look> = {
  night: {
    top: '#1b2838', bottom: '#05080d', fog: '#0b121b',
    steel: 0xc6cfd9, metalness: 0.55, roughness: 0.32,
    sky: 0xdfe8f5, ground: 0x1a2230, hemi: 0.75, key: 0.95,
  },
  studio: {
    top: '#f7f9fb', bottom: '#d3dae3', fog: '#e4e9ef',
    steel: 0x5f6f80, metalness: 0.35, roughness: 0.45,
    sky: 0xffffff, ground: 0xaab4bf, hemi: 0.85, key: 0.75,
  },
};

function gradient(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface MatSaved { color: number; emissive: number; emissiveIntensity: number; metalness: number; roughness: number }

/** How far out of the column and beam axes the envelope hangs, and its parts' sizes (m). */
const ENV_OUT = 0.28;
const ENV_PANEL = 0.12;
const ENV_GLASS = 0.03;
const ENV_MULLION = { along: 0.06, deep: 0.1 };
/** How far in from a balcony's edge its railing stands (m). */
const ENV_RAIL_IN = 0.08;
/** Seconds between the structure finishing and the envelope starting. */
const ENV_PAUSE = 0.4;

interface EnvPart { step: EnvelopeStep; cladding: THREE.Group; glass: THREE.Group }

/**
 * The envelope's meshes, one cladding group and one glass group per bay, standing where they go.
 * A glazed bay: a spandrel at the foot and a band at the floor's edge, the glass between them
 * divided by mullions about every 1.6 m. A solid one (a wall behind): cladding floor to floor. A
 * balcony's railing: glass with posts and a handrail.
 */
function buildEnvelopeMeshes(steps: readonly EnvelopeStep[]): { group: THREE.Group; parts: EnvPart[]; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'timelapseEnvelope';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cladMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.85, metalness: 0.02 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fa8cc, roughness: 0.08, metalness: 0.75, transparent: true, opacity: 0.5, depthWrite: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c333b, roughness: 0.5, metalness: 0.6 });
  const parts: EnvPart[] = [];
  const piece = (parent: THREE.Group, mat: THREE.Material, cx: number, cy: number, cz: number, yaw: number, along: number, deep: number, high: number) => {
    const m = new THREE.Mesh(box, mat);
    m.position.set(cx, cy, cz);
    m.rotation.set(0, 0, yaw);
    m.scale.set(Math.max(0.01, along), Math.max(0.005, deep), Math.max(0.01, high));
    parent.add(m);
  };
  for (const step of steps) {
    const { a, b, z0, z1, out, kind } = step.bay;
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    const H = z1 - z0;
    if (w < 0.2 || H < 0.5) continue;
    const yaw = Math.atan2(b.y - a.y, b.x - a.x);
    const ux = (b.x - a.x) / w, uy = (b.y - a.y) / w;
    const at = (s: number, off: number) => ({ x: a.x + ux * s + out.x * off, y: a.y + uy * s + out.y * off });
    const cladding = new THREE.Group(), glass = new THREE.Group();
    if (kind === 'rail') {
      // A balcony's railing: glass on the slab's edge, a little in, posts at its ends and a handrail.
      const m = at(w / 2, -ENV_RAIL_IN);
      piece(glass, glassMat, m.x, m.y, z0 + H / 2, yaw, w - 0.04, ENV_GLASS, H - 0.05);
      piece(glass, frameMat, m.x, m.y, z1 - 0.025, yaw, w, 0.06, 0.05);
      for (const s of [0.03, w - 0.03]) { const p = at(s, -ENV_RAIL_IN); piece(glass, frameMat, p.x, p.y, z0 + H / 2, yaw, 0.05, 0.05, H); }
    } else if (kind === 'solid') {
      // Where a wall stands: cladding from floor to floor.
      const mid = at(w / 2, ENV_OUT);
      piece(cladding, cladMat, mid.x, mid.y, z0 + H / 2, yaw, w - 0.04, ENV_PANEL, H - 0.02);
    } else {
      const mid = at(w / 2, ENV_OUT);
      const spandrel = Math.min(0.9, H * 0.3), band = Math.min(0.35, H * 0.12);
      piece(cladding, cladMat, mid.x, mid.y, z0 + spandrel / 2, yaw, w - 0.04, ENV_PANEL, spandrel);
      piece(cladding, cladMat, mid.x, mid.y, z1 - band / 2, yaw, w - 0.04, ENV_PANEL, band);
      const g0 = z0 + spandrel, g1 = z1 - band, gh = g1 - g0;
      const gm = at(w / 2, ENV_OUT - ENV_PANEL / 4);
      piece(glass, glassMat, gm.x, gm.y, (g0 + g1) / 2, yaw, w - 0.04, ENV_GLASS, gh);
      const panes = Math.max(1, Math.round(w / 1.6));
      for (let i = 0; i <= panes; i++) {
        const p = at(Math.min(w - 0.03, Math.max(0.03, (i * w) / panes)), ENV_OUT);
        piece(glass, frameMat, p.x, p.y, (g0 + g1) / 2, yaw, ENV_MULLION.along, ENV_MULLION.deep, gh);
      }
    }
    for (const g of [cladding, glass]) { g.matrixAutoUpdate = false; g.visible = false; group.add(g); }
    parts.push({ step, cladding, glass });
  }
  return { group, parts, dispose: () => { box.dispose(); cladMat.dispose(); glassMat.dispose(); frameMat.dispose(); } };
}

export function createTimelapseView() {
  let schedule: BuildSchedule | null = null;
  let scheduleSig = '';
  const stepOf = new Map<string, BuildStep>();
  const shown = new Map<THREE.Object3D, boolean>();
  const touched = new Set<THREE.Object3D>();
  const mats = new Map<THREE.MeshStandardMaterial, MatSaved>();
  const m16: number[] = new Array(16);
  const grow = new THREE.Matrix4();
  const base = new THREE.Matrix4();
  const scaleM = new THREE.Matrix4();
  const back = new THREE.Matrix4();
  const offset = new THREE.Vector3();
  let lastNow = -1;
  /** The build time of the frame before, to hear what landed in between; NaN after a jump. */
  let lastT = NaN;
  // The envelope: its turns, and its meshes once made for them.
  let envSteps: EnvelopeStep[] = [];
  let envMeshes: ReturnType<typeof buildEnvelopeMeshes> | null = null;
  let envMeshesFor: EnvelopeStep[] | null = null;

  // The stage: saved on the first frame, given back on restore.
  let stageStyle: TimelapseStyle | null = null;
  let savedBackground: THREE.Scene['background'] = null;
  let savedFog: THREE.Scene['fog'] = null;
  let bgTexture: THREE.CanvasTexture | null = null;
  let lights: THREE.Group | null = null;
  let keyLight: THREE.DirectionalLight | null = null;
  let staged = false;

  function pieces(project2D: boolean): BuildPiece[] {
    const at = (id: number) => {
      const n = modelStore.nodes.get(id);
      return n ? projectNodeToScene(n, project2D) : null;
    };
    const out: BuildPiece[] = [];
    for (const [id, e] of modelStore.elements) {
      const a = at(e.nodeI), b = at(e.nodeJ);
      if (a && b) out.push({ key: `e${id}`, kind: 'member', a, b, nodes: [e.nodeI, e.nodeJ] });
    }
    for (const [prefix, shells] of [['p', modelStore.plates], ['q', modelStore.quads]] as const) {
      for (const [id, s] of shells as Map<number, { nodes: number[] }>) {
        const pts = s.nodes.map(at);
        if (pts.every(Boolean)) out.push({ key: `${prefix}${id}`, kind: 'shell', pts: pts as P3[], nodes: [...s.nodes] });
      }
    }
    return out;
  }

  /** (Re)builds the schedule when the model or the options changed. */
  function prepare(project2D: boolean): void {
    // The phased orders need phases (construction stages, groups) this view is not given: they
    // build as they would go up.
    const order = buildTimelapse.order === 'stages' || buildTimelapse.order === 'groups' ? 'construction' : buildTimelapse.order;
    // Stages are edited in place, so their content is part of what the schedule depends on.
    const sig = `${modelStore.loadEpoch}|${modelStore.modelVersion}|${modelStore.elements.size}|${modelStore.plates.size}|${modelStore.quads.size}|${order}|${buildTimelapse.duration}|${project2D}|${buildTimelapse.envelope}`;
    if (sig === scheduleSig && schedule) return;
    scheduleSig = sig;
    const supported = new Set<number>();
    for (const s of modelStore.supports.values()) supported.add(s.nodeId);
    const all = pieces(project2D);
    schedule = buildSchedule(all, order, { duration: buildTimelapse.duration, supportedNodes: supported });
    stepOf.clear();
    for (const s of schedule.steps) stepOf.set(s.key, s);
    // The envelope after the structure: a little under half its time, at least a few seconds.
    const bays = buildTimelapse.envelope && !project2D ? facadeBays(all) : [];
    const envDuration = bays.length ? Math.max(3, buildTimelapse.duration * 0.45) : 0;
    envSteps = envelopeSchedule(bays, schedule.total + ENV_PAUSE, envDuration);
    buildTimelapse.total = LEAD_S + schedule.total + (envSteps.length ? ENV_PAUSE + envDuration : 0);
  }

  /** The envelope's meshes for the current turns, in the scene; none without the envelope. */
  function syncEnvelope(scene: THREE.Scene): void {
    if (envMeshesFor === envSteps && (envMeshes !== null) === envSteps.length > 0) return;
    dropEnvelope(scene);
    envMeshesFor = envSteps;
    if (envSteps.length === 0) return;
    envMeshes = buildEnvelopeMeshes(envSteps);
    scene.add(envMeshes.group);
  }

  function dropEnvelope(scene: THREE.Scene): void {
    if (envMeshes) { scene.remove(envMeshes.group); envMeshes.dispose(); }
    envMeshes = null;
    envMeshesFor = null;
  }

  /** A bay part risen to its turn's growth at `tp`. */
  function placeEnvelope(obj: THREE.Group, step: BuildStep, tp: number): void {
    const s = growthAt(step, tp);
    obj.visible = s > 0.002;
    if (!obj.visible) return;
    obj.matrix.fromArray(s >= 1 ? growMatrix(step, 1, m16) : growMatrix(step, s, m16));
    obj.matrixWorldNeedsUpdate = true;
  }

  function setStage(scene: THREE.Scene): void {
    const style = buildTimelapse.style;
    if (!staged) {
      savedBackground = scene.background;
      savedFog = scene.fog;
      staged = true;
    }
    if (style === stageStyle) return;
    stageStyle = style;
    bgTexture?.dispose(); bgTexture = null;
    if (lights) { scene.remove(lights); lights = null; keyLight = null; }
    if (style === 'model') {
      scene.background = savedBackground;
      scene.fog = savedFog;
      return;
    }
    const look = LOOKS[style];
    bgTexture = gradient(look.top, look.bottom);
    scene.background = bgTexture;
    scene.fog = new THREE.Fog(look.fog, 1, 1000);
    lights = new THREE.Group();
    lights.name = 'timelapseLights';
    lights.add(new THREE.HemisphereLight(look.sky, look.ground, look.hemi));
    keyLight = new THREE.DirectionalLight(0xffffff, look.key);
    lights.add(keyLight, keyLight.target);
    scene.add(lights);
  }

  /** The member's finish for the style, and its glow while it goes in. */
  function finish(group: THREE.Object3D, glow: number): void {
    const style = buildTimelapse.style;
    const look = style === 'model' ? null : LOOKS[style];
    group.traverse((o) => {
      if (o.userData?.pickingHelper) return;
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!mat || !mat.isMeshStandardMaterial) return;
      let saved = mats.get(mat);
      if (!saved) {
        saved = { color: mat.color.getHex(), emissive: mat.emissive.getHex(), emissiveIntensity: mat.emissiveIntensity, metalness: mat.metalness, roughness: mat.roughness };
        mats.set(mat, saved);
      }
      if (look) { mat.color.setHex(look.steel); mat.metalness = look.metalness; mat.roughness = look.roughness; }
      else { mat.color.setHex(saved.color); mat.metalness = saved.metalness; mat.roughness = saved.roughness; }
      // The brand's vermilion: the colour itself turns, and a little light of its own keeps it
      // from going pink under the white lights.
      if (glow > 0.001) {
        mat.color.lerp(ACCENT, glow * 0.9);
        mat.emissive.copy(ACCENT);
        mat.emissiveIntensity = glow * 0.45;
      } else { mat.emissive.setHex(saved.emissive); mat.emissiveIntensity = saved.emissiveIntensity; }
    });
  }

  function place(obj: THREE.Object3D, step: BuildStep | null, tp: number, drop: number): void {
    touched.add(obj);
    // A piece with no turn is one no stage puts up: it is not part of what gets built.
    const s = step ? growthAt(step, tp) : schedule?.partial ? 0 : 1;
    if (s <= 0.002) { obj.visible = false; return; }
    obj.visible = true;
    obj.matrixAutoUpdate = false;
    base.compose(obj.position, obj.quaternion, obj.scale);
    if (s >= 1 || !step) obj.matrix.copy(base);
    else if (buildTimelapse.entry === 'drop') obj.matrix.fromArray(dropMatrix(drop, s, m16)).multiply(base);
    else obj.matrix.fromArray(growMatrix(step, s, m16)).multiply(base);
    obj.matrixWorldNeedsUpdate = true;
    let glow = 0;
    if (step && buildTimelapse.highlight) {
      glow = s < 1 ? 1 : step.outStart !== undefined && tp > step.end ? 0 : Math.max(0, 1 - (tp - step.end) / AFTERGLOW_S);
    }
    finish(obj, glow);
  }

  /** A support pops up at its node during the lead, a little after the one before it. */
  function placeSupport(obj: THREE.Object3D, k: number, n: number, t: number): void {
    touched.add(obj);
    const start = n > 1 ? (k / (n - 1)) * LEAD_S * 0.5 : 0;
    const u = Math.max(0, Math.min(1, (t - start) / (LEAD_S * 0.5)));
    const s = 1 - Math.pow(1 - u, 3);
    if (s <= 0.002) { obj.visible = false; return; }
    obj.visible = true;
    obj.matrixAutoUpdate = false;
    base.compose(obj.position, obj.quaternion, obj.scale);
    // About its own origin, which is the node.
    const p = obj.position;
    grow.makeTranslation(p.x, p.y, p.z).multiply(scaleM.makeScale(s, s, s)).multiply(back.makeTranslation(-p.x, -p.y, -p.z));
    obj.matrix.copy(grow).multiply(base);
    obj.matrixWorldNeedsUpdate = true;
  }

  /**
   * Draw the frame for the timelapse's current time. Returns null when it is off.
   */
  function frame(refs: TimelapseRefs, camera: THREE.Camera, target: THREE.Vector3, now: number): TimelapseFrameInfo | null {
    if (!buildTimelapse.active) { lastNow = -1; return null; }
    prepare(refs.project2D);
    setStage(refs.scene);
    syncEnvelope(refs.scene);
    const wasPlaying = buildTimelapse.playing;
    buildTimelapse.tick(now);
    const t = buildTimelapse.time;
    const sch = schedule!;

    const grid = !buildTimelapse.cleanBackground && buildTimelapse.style !== 'studio';
    for (const child of refs.scene.children) {
      if (child === lights || child === envMeshes?.group) continue;
      if (!shown.has(child)) shown.set(child, child.visible);
      const keep = refs.keep.has(child) || (refs.background.has(child) && grid) || (child as THREE.Light).isLight === true;
      child.visible = keep;
    }

    const tp = t - LEAD_S;
    const drop = Math.max(2, (sch.zMax - sch.zMin) * 0.4 + 1);
    for (const [id, g] of refs.elementGroups) place(g, stepOf.get(`e${id}`) ?? null, tp, drop);
    for (const [key, g] of refs.shellGroups) place(g, stepOf.get(key) ?? null, tp, drop);
    const sup = [...refs.supportGizmos.values()];
    sup.forEach((g, k) => placeSupport(g, k, sup.length, t));
    for (const part of envMeshes?.parts ?? []) {
      placeEnvelope(part.cladding, part.step.cladding, tp);
      placeEnvelope(part.glass, part.step.glass, tp);
    }

    // The camera: a slow turn, and on `rise` the view climbs with the build.
    const dt = wasPlaying && lastNow >= 0 ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    if (dt > 0 && buildTimelapse.camera !== 'fixed') {
      offset.copy(camera.position).sub(target).applyAxisAngle(Z, ORBIT_RAD_S * dt);
      camera.position.copy(target).add(offset);
    }
    if (buildTimelapse.camera === 'rise') {
      const want = sch.zMin + (buildFront(sch, tp) - sch.zMin) * 0.6;
      const dz = (want - target.z) * Math.min(1, 3 * Math.max(dt, 1 / 60));
      target.z += dz;
      camera.position.z += dz;
    }
    if (buildTimelapse.camera !== 'fixed') camera.lookAt(target);
    lastNow = now;

    // The key light comes from over the viewer's shoulder; the fog thickens past the model.
    if (keyLight) {
      keyLight.position.copy(camera.position).add(offset.set(0, 0, camera.position.distanceTo(target) * 0.5));
      keyLight.target.position.copy(target);
    }
    if (refs.scene.fog instanceof THREE.Fog && stageStyle !== 'model') {
      const d = camera.position.distanceTo(target);
      refs.scene.fog.near = d * 1.1;
      refs.scene.fog.far = d * 3.2;
    }

    const total = buildTimelapse.total;
    // The sound: a knock for what landed since the last frame, and the chime as the build ends.
    // Only while it plays forward at its own pace; a seek or a loop back is silent.
    if (wasPlaying && Number.isFinite(lastT) && t > lastT && t - lastT < 0.25) {
      let landed = landedBetween(sch, lastT - LEAD_S, tp);
      for (const e of envSteps) { const l = landAt(e.cladding); if (l > lastT - LEAD_S && l <= tp) landed++; }
      timelapseSound.hits(buildTimelapse.sound, landed);
      if (lastT < total + 0.3 && t >= total + 0.3) timelapseSound.done(buildTimelapse.sound);
    } else timelapseSound.reset();
    lastT = t;
    return {
      started: piecesStarted(sch, tp),
      pieces: sch.steps.length,
      progress: total > LEAD_S ? Math.max(0, Math.min(1, tp / (total - LEAD_S))) : 1,
      closing: Math.max(0, Math.min(1, (t - total - 0.3) / Math.min(0.9, HOLD_S * 0.4))),
      phase: phaseAt(sch, tp) || null,
    };
  }

  /** Everything back as it was before the timelapse. */
  function restore(scene: THREE.Scene): void {
    for (const obj of touched) {
      obj.matrixAutoUpdate = true;
      obj.updateMatrix();
      obj.visible = true;
    }
    touched.clear();
    for (const [mat, s] of mats) {
      mat.color.setHex(s.color); mat.emissive.setHex(s.emissive); mat.emissiveIntensity = s.emissiveIntensity;
      mat.metalness = s.metalness; mat.roughness = s.roughness;
    }
    mats.clear();
    for (const [obj, v] of shown) obj.visible = v;
    shown.clear();
    if (staged) { scene.background = savedBackground; scene.fog = savedFog; }
    if (lights) scene.remove(lights);
    dropEnvelope(scene);
    envSteps = [];
    bgTexture?.dispose();
    lights = null; keyLight = null; bgTexture = null; stageStyle = null; staged = false;
    schedule = null;
    scheduleSig = '';
    lastNow = -1;
    lastT = NaN;
  }

  return { frame, restore };
}
