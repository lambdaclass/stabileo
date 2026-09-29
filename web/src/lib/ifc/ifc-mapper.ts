// Map parsed IFC structural members to Dedaliano model structures
// This mapper is independent of web-ifc and operates on pre-parsed data.

import { profileByName, profileToSectionFull } from '../data/steel-profiles';
import { t, tp } from '../i18n';

// ─── Types ────────────────────────────────────────────────────

export interface IfcMember {
  id: number;
  type: 'beam' | 'column' | 'brace';
  name: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  profileName?: string;
  materialName?: string;
}

export interface IfcMappingResult {
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  /** Each element with the index of its material and section in the lists below. */
  elements: Array<{ nodeI: number; nodeJ: number; type: 'frame' | 'truss'; material: number; section: number }>;
  materials: Array<{ name: string; e: number; nu: number; rho: number }>;
  sections: Array<{
    name: string; a: number; iz: number;
    iy?: number; j?: number;
    h?: number; b?: number;
    tw?: number; tf?: number; t?: number;
    shape?: string;
    profileFamily?: string;
  }>;
  warnings: string[];
}

export interface IfcMapperOptions {
  snapTolerance?: number; // meters, default 0.01
  /** IfcMember (braces, purlins, struts) as truss members. Default true. */
  membersAsTruss?: boolean;
}

// ─── Known material defaults ──────────────────────────────────

/*
 * Matched as substrings of the name with case, spacing and accents removed, in this order:
 * a grade first, then the family word. The words are the ones a model is written with in
 * Spanish and Portuguese too: "Hormigón H-30" or "Concreto C25" came in as steel with a warning,
 * and every concrete member was fifteen times too stiff.
 */
const STEEL = { e: 200000, nu: 0.3, rho: 78.5 };
const TIMBER = { e: 12000, nu: 0.3, rho: 5.0 };
const ALUMINIUM = { e: 70000, nu: 0.33, rho: 27.0 };
const CONCRETE = { e: 30000, nu: 0.2, rho: 25.0 };
/** An Argentine grade (H-30) names f'c, and E = 4700·√f'c as in CIRSOC 201. */
function concreteOfFc(fc: number) { return { e: Math.round(4700 * Math.sqrt(fc)), nu: 0.2, rho: 25.0 }; }

const MATERIAL_WORDS: Array<[string, { e: number; nu: number; rho: number }]> = [
  ['hormigon', CONCRETE], ['concreto', CONCRETE], ['betao', CONCRETE], ['beton', CONCRETE],
  ['acero', STEEL], ['aco', STEEL],
  ['madera', TIMBER], ['madeira', TIMBER],
  ['aluminio', ALUMINIUM], ['aluminium', ALUMINIUM],
];

const MATERIAL_DEFAULTS: Record<string, { e: number; nu: number; rho: number }> = {
  steel:    { e: 200000, nu: 0.3,  rho: 78.5 },
  s235:     { e: 200000, nu: 0.3,  rho: 78.5 },
  s275:     { e: 200000, nu: 0.3,  rho: 78.5 },
  s355:     { e: 200000, nu: 0.3,  rho: 78.5 },
  s420:     { e: 200000, nu: 0.3,  rho: 78.5 },
  s450:     { e: 200000, nu: 0.3,  rho: 78.5 },
  concrete: { e: 30000,  nu: 0.2,  rho: 25.0 },
  c25:      { e: 30000,  nu: 0.2,  rho: 25.0 },
  c30:      { e: 33000,  nu: 0.2,  rho: 25.0 },
  c35:      { e: 35000,  nu: 0.2,  rho: 25.0 },
  c40:      { e: 35000,  nu: 0.2,  rho: 25.0 },
  timber:   { e: 12000,  nu: 0.3,  rho: 5.0  },
  wood:     { e: 12000,  nu: 0.3,  rho: 5.0  },
  aluminum: { e: 70000,  nu: 0.33, rho: 27.0 },
};

function materialFor(name: string): { e: number; nu: number; rho: number } | null {
  const plain = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const key = plain.replace(/[\s_-]/g, '');
  // An H-grade names f'c, which is the better answer than a family default.
  const h = key.match(/h(\d{2})(?!\d)/);
  if (h && /hormigon|concreto|^h\d/.test(key)) return concreteOfFc(Number(h[1]));
  const known = Object.entries(MATERIAL_DEFAULTS).find(([k]) => key.includes(k));
  if (known) return known[1];
  // Whole words, so that "aco" (aço) does not match inside another word.
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  return MATERIAL_WORDS.find(([w]) => words.some((x) => x === w || (w.length >= 6 && x.startsWith(w))))?.[1] ?? null;
}

// ─── Main mapping function ────────────────────────────────────

export function mapIfcToModel(
  members: IfcMember[],
  options?: IfcMapperOptions,
): IfcMappingResult {
  const tol = options?.snapTolerance ?? 0.01;
  const warnings: string[] = [];

  // ── Node pool with snap merging ──
  const nodes: Array<{ id: number; x: number; y: number; z: number }> = [];

  function findOrAddNode(x: number, y: number, z: number): number {
    for (const n of nodes) {
      const dx = n.x - x;
      const dy = n.y - y;
      const dz = n.z - z;
      if (dx * dx + dy * dy + dz * dz < tol * tol) return n.id;
    }
    const id = nodes.length;
    nodes.push({ id, x, y, z });
    return id;
  }

  // ── Elements ── (material and section indices filled in once the lists exist)
  const placed: Array<{ member: IfcMember; nodeI: number; nodeJ: number; type: 'frame' | 'truss' }> = [];
  const asTruss = options?.membersAsTruss ?? true;

  for (const member of members) {
    const ni = findOrAddNode(member.start.x, member.start.y, member.start.z);
    const nj = findOrAddNode(member.end.x, member.end.y, member.end.z);
    if (ni === nj) {
      warnings.push(tp('ifc.memberZeroLength', { n: member.name }));
      continue;
    }
    const type = member.type === 'brace' && asTruss ? 'truss' as const : 'frame' as const;
    placed.push({ member, nodeI: ni, nodeJ: nj, type });
  }

  // ── Materials ──
  // Collect unique material names
  const materialNames = new Set<string>();
  for (const m of members) {
    if (m.materialName) materialNames.add(m.materialName);
  }

  const materials: IfcMappingResult['materials'] = [];
  const materialIndex = new Map<string, number>();
  for (const name of materialNames) {
    materialIndex.set(name, materials.length);
    const known = materialFor(name);
    if (known) {
      materials.push({ name, ...known });
    } else {
      // Default to steel
      warnings.push(tp('ifc.materialUnknown', { n: name }));
      materials.push({ name, ...STEEL });
    }
  }

  // If no materials found, add default steel
  if (materials.length === 0) {
    materials.push({ name: t('ifc.defaultSteel'), ...STEEL });
  }

  // ── Sections ──
  const profileNames = new Set<string>();
  for (const m of members) {
    if (m.profileName) profileNames.add(m.profileName);
  }

  const sections: IfcMappingResult['sections'] = [];
  const sectionIndex = new Map<string, number>();
  for (const name of profileNames) {
    sectionIndex.set(name, sections.length);
    /*
     * The catalogue by exact name, and only a name that starts with letters. The substring
     * search this used took the first profile whose name CONTAINED the text: "IPE 30" became
     * the IPE 300, a solid "300x300" became a hollow SHS 300x300, and "HEB200", which contains
     * no "HEB 200", fell through to a 200 mm square.
     */
    const p = /^\s*[A-Za-z]/.test(name) ? profileByName(name) : null;
    if (p) {
      const sec = profileToSectionFull(p);
      sections.push({
        name: p.name,
        a: sec.a,
        iz: sec.iz,
        // Both were dropped: an IPE 300 came in with no strong-axis inertia and no J.
        iy: sec.iy,
        j: sec.j,
        profileFamily: p.family,
        h: sec.h,
        b: sec.b,
        tw: sec.tw,
        tf: sec.tf,
        t: sec.t,
        shape: sec.shape,
      });
    } else {
      // Try to extract dimensions from name (e.g., "200x100x5")
      const dims = name.match(/(\d+)[xX×](\d+)(?:[xX×](\d+))?/);
      if (dims) {
        const h = parseFloat(dims[1]) * 1e-3; // mm → m
        const b = parseFloat(dims[2]) * 1e-3;
        const tw = dims[3] ? parseFloat(dims[3]) * 1e-3 : undefined;
        // Estimate properties
        const a = tw ? 2 * (h + b) * tw : h * b; // hollow vs solid
        const iz = tw ? (h ** 3 * b / 12 - (h - 2 * tw) ** 3 * (b - 2 * tw) / 12) : h ** 3 * b / 12;
        const iy = tw ? (b ** 3 * h / 12 - (b - 2 * tw) ** 3 * (h - 2 * tw) / 12) : b ** 3 * h / 12;
        sections.push({
          name, a, iz, iy, h, b, t: tw,
          shape: tw ? 'RHS' : 'rect',
        });
        warnings.push(t('ifc.profileEstimated').replace('{n}', name));
      } else {
        // Fallback: generic rectangular 200x200
        warnings.push(t('ifc.profileUnknown').replace('{n}', name));
        sections.push({
          name,
          a: 0.04,     // 200mm x 200mm
          iz: 1.33e-4, // bh³/12
          iy: 1.33e-4,
          h: 0.2,
          b: 0.2,
          shape: 'rect',
        });
      }
    }
  }

  // If no sections found, add default
  if (sections.length === 0) {
    sections.push({
      name: 'Default',
      a: 0.00285,
      iz: 1.943e-5,
      h: 0.2,
      b: 0.1,
      shape: 'I',
    });
  }

  // Each member keeps its own material and section; one without either takes the first.
  const elements = placed.map((p) => ({
    nodeI: p.nodeI, nodeJ: p.nodeJ, type: p.type,
    material: p.member.materialName !== undefined ? materialIndex.get(p.member.materialName) ?? 0 : 0,
    section: p.member.profileName !== undefined ? sectionIndex.get(p.member.profileName) ?? 0 : 0,
  }));

  return { nodes, elements, materials, sections, warnings };
}
