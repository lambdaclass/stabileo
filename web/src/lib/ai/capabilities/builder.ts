import { isSpaceProtocol } from './registry';
import { defaultMaterial, defaultSection, lookupSection, type SectionProps } from './sections';

export type Snapshot = Record<string, unknown>;

export function sectionToJson(id: number, s: SectionProps): [number, Record<string, unknown>] {
  return [id, { id, name: s.name, a: s.a, iz: s.iz, iy: s.iy, j: s.j, h: s.h, b: s.b, tw: s.tw, tf: s.tf, shape: s.shape }];
}

export function resolveSection(name: string | undefined, fallback: () => SectionProps = defaultSection): SectionProps {
  return (name !== undefined ? lookupSection(name) : undefined) ?? fallback();
}

export function resolveSupport(name: string | undefined, fallback: string): string {
  return name ?? fallback;
}

export class Builder {
  nodeId = 1;
  elemId = 1;
  supportId = 1;
  loadId = 1;
  nodes: unknown[] = [];
  elements: unknown[] = [];
  supports: unknown[] = [];
  loads: unknown[] = [];
  materials: Record<string, unknown>[] = [defaultMaterial()];
  sections: unknown[];
  readonly analysisMode: '2d' | '3d';

  private constructor(mode: '2d' | '3d', sections: unknown[]) {
    this.analysisMode = mode;
    this.sections = sections;
  }

  static new2d(beamSection: SectionProps): Builder {
    return new Builder('2d', [sectionToJson(1, beamSection)]);
  }

  static new3d(beamSection: SectionProps, colSection: SectionProps): Builder {
    return new Builder('3d', [sectionToJson(1, colSection), sectionToJson(2, beamSection)]);
  }

  addNode2d(x: number, y: number): number {
    const id = this.nodeId++;
    this.nodes.push([id, { id, x, y }]);
    return id;
  }

  addNode3d(x: number, y: number, z: number): number {
    const id = this.nodeId++;
    this.nodes.push([id, { id, x, y, z }]);
    return id;
  }

  addElement(nodeI: number, nodeJ: number, type: string, sectionId: number): number {
    const id = this.elemId++;
    this.elements.push([id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId, hingeStart: false, hingeEnd: false,
    }]);
    return id;
  }

  addFrame(nodeI: number, nodeJ: number, sectionId = 1): number {
    return this.addElement(nodeI, nodeJ, 'frame', sectionId);
  }

  addTruss(nodeI: number, nodeJ: number, sectionId: number): number {
    return this.addElement(nodeI, nodeJ, 'truss', sectionId);
  }

  addSupport(nodeId: number, type: string): void {
    const id = this.supportId++;
    this.supports.push([id, { id, nodeId, type }]);
  }

  addDistributedLoad(elementId: number, q: number): void {
    const id = this.loadId++;
    this.loads.push(isSpaceProtocol(this.analysisMode)
      ? { type: 'distributed3d', data: { id, elementId, qYI: 0, qYJ: 0, qZI: q, qZJ: q, frame: 'global' } }
      : { type: 'distributed', data: { id, elementId, qI: q, qJ: q } });
  }

  addNodalLoad2d(nodeId: number, fx: number, fz: number): void {
    const id = this.loadId++;
    this.loads.push({ type: 'nodal', data: { id, nodeId, fx, fz, my: 0 } });
  }

  addNodalLoad3d(nodeId: number, fx: number, fy: number, fz: number): void {
    const id = this.loadId++;
    this.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx: 0, my: 0, mz: 0 } });
  }

  toSnapshot(): Snapshot {
    return {
      analysisMode: this.analysisMode,
      nodes: this.nodes,
      materials: [[1, this.materials[0]]],
      sections: this.sections,
      elements: this.elements,
      supports: this.supports,
      loads: this.loads,
      nextId: {
        node: this.nodeId,
        material: 2,
        section: this.sections.length + 1,
        element: this.elemId,
        support: this.supportId,
        load: this.loadId,
      },
    };
  }
}
