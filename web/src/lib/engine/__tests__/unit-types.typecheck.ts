import { areaM2, inertiaM4, mpa, ratio, modulusInternal, elasticFromDisplay, elasticToDisplay, type ElasticMaterialWire, type ElasticSectionWire, type Force, type Length, materialToWire, sectionToWire } from '../unit-types';
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
