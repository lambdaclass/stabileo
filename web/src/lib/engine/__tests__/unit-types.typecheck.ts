import { input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import type { SolverInput } from '../types';
import type { SolverInput3D } from '../types-3d';
import { areaM2, inertiaM4, mpa, ratio, modulusInternal, elasticFromDisplay, elasticToDisplay, type ElasticMaterialWire, type ElasticSectionWire, type Force, type Length, materialToWire, sectionToWire, section3DToWire, warpingM6, lengthM } from '../unit-types';
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
