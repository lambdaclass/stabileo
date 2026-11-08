import { input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { areaM2, inertiaM4, mpa, ratio, modulusInternal, elasticFromDisplay, elasticToDisplay, type ElasticMaterialWire, type ElasticSectionWire, type Force, type Length, type Moment, materialToWire, sectionToWire, section3DToWire, warpingM6, lengthM, forceKn, momentKnM, bimomentKnM2, nodeToWire, node3DToWire, loadToWire, load3DToWire } from '../unit-types';
const material: ElasticMaterialWire = { id: 1, e: mpa(200000), nu: ratio(0.3) };
const section: ElasticSectionWire = { id: 1, a: areaM2(0.01), iz: inertiaM4(0.0001) };
material.e = elasticFromDisplay(29000, 'stress', 'Imperial');
section.a = elasticFromDisplay(100, 'sectionArea', 'SI');
elasticToDisplay(section.iz, 'sectionInertia', 'SImm');
// @ts-expect-error MPa and internal kN/m² are different units
material.e = modulusInternal(material.e);
// @ts-expect-error raw numbers require an explicit boundary constructor
material.e = 200000;
// @ts-expect-error area is not second moment
section.iz = section.a;
// @ts-expect-error Poisson's ratio is not a modulus
material.nu = material.e;
// @ts-expect-error cannot feed area to the stress display conversion
elasticToDisplay(section.a, 'stress', 'SI');
// @ts-expect-error canonical area cannot be assigned a display stress
section.a = elasticFromDisplay(1, 'stress', 'SI');
declare const force: Force;
// @ts-expect-error force is not length
const length: Length = force;
void length;

const wireMaterial = materialToWire({ id: 1, e: 200000, nu: 0.3 });
const wireSection = sectionToWire({ id: 1, a: 0.01, iz: 0.0001 });
// @ts-expect-error the production material adapter retains the MPa brand
wireMaterial.e = modulusInternal(material.e);
// @ts-expect-error the production section adapter retains the inertia brand
wireSection.iz = wireSection.a;

// Exercise the public boundary as well as its individual adapters.
declare const input: SolverInput;
const wire = input2DToWireObject(input);
wire.materials['1'].e = mpa(200000);
wire.sections['1'].iz = inertiaM4(0.0001);
// @ts-expect-error the public wire boundary retains the MPa brand
wire.materials['1'].e = modulusInternal(material.e);
// @ts-expect-error raw numbers require an explicit boundary constructor
wire.materials['1'].e = 200000;
// @ts-expect-error the public wire boundary retains the inertia brand
wire.sections['1'].iz = wire.sections['1'].a;
// @ts-expect-error the public wire boundary retains the area brand
wire.sections['1'].a = force;

declare const input3D: SolverInput3D;
const wire3D = input3DToWireObject(input3D);
wire3D.sections['1'].iy = inertiaM4(0.0001);
wire3D.sections['1'].cw = warpingM6(1e-9);
wire3D.sections['1'].shearCenterY = lengthM(-0.02);
wire3D.materials['1'].e = mpa(200000);
// @ts-expect-error the 3D wire boundary retains the inertia brand
wire3D.sections['1'].iy = wire3D.sections['1'].a;
// @ts-expect-error the torsion constant is m⁴, not m⁶
wire3D.sections['1'].j = warpingM6(1e-9);
// @ts-expect-error the warping constant is m⁶, not m⁴
wire3D.sections['1'].cw = inertiaM4(1e-9);
// @ts-expect-error a shear-centre offset is a length, not an area
wire3D.sections['1'].shearCenterZ = areaM2(0.01);
// @ts-expect-error a shear area is an area, not a length
wire3D.sections['1'].asY = lengthM(0.01);
// @ts-expect-error raw numbers require an explicit boundary constructor
wire3D.sections['1'].iz = 0.0001;
// @ts-expect-error the 3D wire boundary retains the MPa brand
wire3D.materials['1'].e = modulusInternal(material.e);
const adapted3D = section3DToWire({ id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-5 });
// @ts-expect-error the 3D section adapter retains the area brand
adapted3D.a = adapted3D.iy;

wire.nodes['1'].x = lengthM(3);
wire.nodes['1'].z = lengthM(-1);
// @ts-expect-error a node coordinate is a length, not a force
wire.nodes['1'].x = forceKn(1);
// @ts-expect-error raw numbers require an explicit boundary constructor
wire.nodes['1'].z = 3;
for (const load of wire.loads) {
  if (load.type === 'nodal') {
    load.data.fx = forceKn(1);
    load.data.my = momentKnM(1);
    // @ts-expect-error the 2D nodal fx is a force, not a moment
    load.data.fx = momentKnM(1);
    // @ts-expect-error the 2D nodal moment is kN·m, not kN
    load.data.my = forceKn(1);
  } else if (load.type === 'pointOnElement') {
    load.data.a = lengthM(1.5);
    load.data.p = forceKn(-4);
    load.data.px = forceKn(1);
    load.data.my = momentKnM(0.5);
    // @ts-expect-error a point load position is a length, not a force
    load.data.a = forceKn(1);
    // @ts-expect-error a point load is a force, not a length
    load.data.p = lengthM(1);
  }
}
wire3D.nodes['1'].y = lengthM(2);
// @ts-expect-error a 3D node coordinate is a length, not an area
wire3D.nodes['1'].y = areaM2(0.01);
for (const load of wire3D.loads) {
  if (load.type === 'nodal') {
    load.data.fy = forceKn(1);
    load.data.mz = momentKnM(1);
    load.data.bw = bimomentKnM2(0.1);
    // @ts-expect-error a bimoment is kN·m², not kN·m
    load.data.bw = momentKnM(1);
    // @ts-expect-error kN·m is not kN
    load.data.fy = momentKnM(1);
    // @ts-expect-error a 3D nodal moment is kN·m, not kN
    load.data.mx = forceKn(1);
    // @ts-expect-error raw numbers require an explicit boundary constructor
    load.data.fz = 2.5;
  } else if (load.type === 'pointOnElement') {
    load.data.pz = forceKn(2);
    // @ts-expect-error a 3D point load is a force, not a length
    load.data.pz = lengthM(2);
  }
}
declare const moment: Moment;
// @ts-expect-error force is not moment
const notMoment: Moment = force;
void notMoment;
// @ts-expect-error moment is not force
const notForce: Force = moment;
void notForce;
const adaptedNode = nodeToWire({ id: 1, x: 0, z: 0 });
// @ts-expect-error the node adapter retains the length brand
adaptedNode.x = moment;
const adaptedNode3D = node3DToWire({ id: 1, x: 0, y: 0, z: 0 });
// @ts-expect-error the 3D node adapter retains the length brand
adaptedNode3D.z = force;
const adaptedLoad = loadToWire({ type: 'nodal', data: { nodeId: 1, fx: 0, fz: 0, my: 0 } });
// @ts-expect-error the load adapter retains the force brand on every variant it brands
if (adaptedLoad.type === 'nodal') adaptedLoad.data.fz = moment;
const adaptedLoad3D = load3DToWire({ type: 'pointOnElement', data: { elementId: 1, a: 0, py: 0, pz: 0 } });
// @ts-expect-error the 3D load adapter retains the length brand
if (adaptedLoad3D.type === 'pointOnElement') adaptedLoad3D.data.a = force;
