/**
 * The project's axes as an IfcGrid, added to a written IFC: each axis a line in plan across what
 * the building covers, U the axes at a constant X and V those at a constant Y, placed with the
 * building and held by its lowest storey, with a FootPrint so viewers draw it. A setting out reads
 * its columns' fixed points against them. Without axes both ways the file is left as it was.
 */
import { guid, real, str } from './ifc-writer';

export interface GridAxisLine { name: string; axis: 'x' | 'y'; at: number }

export function withIfcGrid(step: string, axes: readonly GridAxisLine[], extent: { x0: number; x1: number; y0: number; y1: number }): string {
  const u = axes.filter((a) => a.axis === 'x'), v = axes.filter((a) => a.axis === 'y');
  if (!u.length || !v.length) return step;
  const ids = [...step.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]));
  const building = /^#\d+=IFCBUILDING\('[^']*',\$,'(?:[^']|'')*',\$,\$,(#\d+),/m.exec(step)?.[1];
  const context = /^#(\d+)=IFCGEOMETRICREPRESENTATIONCONTEXT\(\$,'Model'/m.exec(step)?.[1];
  const storey = /^#(\d+)=IFCBUILDINGSTOREY\(/m.exec(step)?.[1];
  if (!ids.length || !building || !context || !storey) return step;
  let next = Math.max(...ids);
  const lines: string[] = [];
  const add = (e: string) => { lines.push(`#${++next}=${e};`); return `#${next}`; };
  const pt2 = (x: number, y: number) => add(`IFCCARTESIANPOINT((${real(x)},${real(y)}))`);
  const sub = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('FootPrint','Model',*,*,*,*,#${context},$,.PLAN_VIEW.,$)`);
  const curves: string[] = [];
  const axis = (a: GridAxisLine) => {
    const c = a.axis === 'x' ? add(`IFCPOLYLINE((${pt2(a.at, extent.y0)},${pt2(a.at, extent.y1)}))`) : add(`IFCPOLYLINE((${pt2(extent.x0, a.at)},${pt2(extent.x1, a.at)}))`);
    curves.push(c);
    return add(`IFCGRIDAXIS(${str(a.name)},${c},.T.)`);
  };
  const U = u.map(axis), V = v.map(axis);
  const set = add(`IFCGEOMETRICCURVESET((${curves.join(',')}))`);
  const rep = add(`IFCSHAPEREPRESENTATION(${sub},'FootPrint','GeometricCurveSet',(${set}))`);
  const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const placement = add(`IFCLOCALPLACEMENT(${building},${add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)})`);
  const grid = add(`IFCGRID(${str(guid('grid'))},$,'Grid',$,$,${placement},${shape},(${U.join(',')}),(${V.join(',')}),$,$)`);
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${str(guid('c:grid'))},$,$,$,(${grid}),#${storey})`);
  const end = step.lastIndexOf('ENDSEC;');
  return `${step.slice(0, end)}${lines.join('\n')}\n${step.slice(end)}`;
}
