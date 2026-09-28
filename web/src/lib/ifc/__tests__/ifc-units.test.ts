/**
 * IFC length units — a file authored in millimetres imports in metres.
 *
 * These run the real parser (`ifc-parser.ts`, web-ifc WASM in Node) against a minimal
 * IFC4 file: one beam at (1000, 2000, 3000) extruded 4000 along Z, inside a
 * site/building/storey placement chain at the origin. Only the IfcUnitAssignment
 * changes between fixtures. The parser used to never read it, so the millimetre
 * fixture — the default export of several BIM tools — came in 1000x too large.
 */
import { describe, it, expect } from 'vitest';
import { parseIfc } from '../ifc-parser';

// The node build of web-ifc resolves the WASM relative to its own directory plus this
// path; './' lands on node_modules/web-ifc/web-ifc-node.wasm.
const WASM_PATH = './';

/** The fixture with a placeholder for the length-unit lines of the assignment. */
function fixture(lengthUnit: string): string {
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('units.ifc','2026-09-28T00:00:00',(''),(''),'fixture','fixture','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPERSON($,$,'fixture',$,$,$,$,$);
#2=IFCORGANIZATION($,'fixture',$,$,$);
#3=IFCPERSONANDORGANIZATION(#1,#2,$);
#4=IFCAPPLICATION(#2,'1.0','fixture','fixture');
#5=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,#3,#4,0);
#6=IFCDIRECTION((1.,0.,0.));
#7=IFCDIRECTION((0.,0.,1.));
#8=IFCCARTESIANPOINT((0.,0.,0.));
#9=IFCAXIS2PLACEMENT3D(#8,#7,#6);
#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#9,$);
${lengthUnit}
#12=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#13=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#14=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#15=IFCUNITASSIGNMENT((#11,#12,#13,#14));
#16=IFCPROJECT('0$proj',$,'proj',$,$,$,$,(#10),#15);
#18=IFCLOCALPLACEMENT($,#19);
#19=IFCAXIS2PLACEMENT3D(#8,#7,#6);
#17=IFCSITE('1$site',$,'site',$,$,#18,$,$,.ELEMENT.,$,$,$,$,$);
#21=IFCLOCALPLACEMENT(#18,#22);
#22=IFCAXIS2PLACEMENT3D(#8,#7,#6);
#20=IFCBUILDING('2$bldg',$,'bldg',$,$,#21,$,$,.ELEMENT.,$,$,$);
#24=IFCLOCALPLACEMENT(#21,#25);
#25=IFCAXIS2PLACEMENT3D(#8,#7,#6);
#23=IFCBUILDINGSTOREY('3$storey',$,'storey',$,$,#24,$,$,.ELEMENT.,0.);
#26=IFCCARTESIANPOINT((1000.,2000.,3000.));
#27=IFCAXIS2PLACEMENT3D(#26,#7,#6);
#28=IFCLOCALPLACEMENT(#24,#27);
#29=IFCRECTANGLEPROFILEDEF(.AREA.,'RECT 200x100',$,100.,200.);
#30=IFCCARTESIANPOINT((0.,0.,0.));
#31=IFCAXIS2PLACEMENT3D(#30,#7,#6);
#32=IFCDIRECTION((0.,0.,1.));
#33=IFCEXTRUDEDAREASOLID(#29,#31,#32,4000.);
#34=IFCSHAPEREPRESENTATION(#10,'Body','SweptSolid',(#33));
#35=IFCPRODUCTDEFINITIONSHAPE($,$,(#34));
#36=IFCBEAM('4$beam',#5,'B1',$,$,#28,#35,$,$);
ENDSEC;
END-ISO-10303-21;`;
}

const MILLIMETRES = `#11=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);`;
const METRES = `#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`;
const INCHES = `#11=IFCCONVERSIONBASEDUNIT(#40,.LENGTHUNIT.,'INCH',#41);
#40=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#41=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.0254),#40);`;

async function parseOne(lengthUnit: string) {
  const data = new TextEncoder().encode(fixture(lengthUnit));
  const result = await parseIfc(data.buffer as ArrayBuffer, { wasmPath: WASM_PATH });
  expect(result.warnings.filter((w) => !w.includes('material'))).toEqual([]);
  expect(result.members).toHaveLength(1);
  return result.members[0]!;
}

describe('IFC length units', () => {
  it('a millimetre file lands 1000x smaller: positions and extrusion depth in metres', async () => {
    const beam = await parseOne(MILLIMETRES);
    expect(beam.start.x).toBeCloseTo(1, 9);
    expect(beam.start.y).toBeCloseTo(2, 9);
    expect(beam.start.z).toBeCloseTo(3, 9);
    expect(beam.end.x).toBeCloseTo(1, 9);
    expect(beam.end.y).toBeCloseTo(2, 9);
    expect(beam.end.z).toBeCloseTo(7, 9); // 3000 + 4000 mm
  });

  it('a metre file (the IFC default) imports unchanged', async () => {
    const beam = await parseOne(METRES);
    expect(beam.start.x).toBeCloseTo(1000, 9);
    expect(beam.start.z).toBeCloseTo(3000, 9);
    expect(beam.end.z).toBeCloseTo(7000, 9);
  });

  it('a conversion-based unit (inches) applies its own factor', async () => {
    const beam = await parseOne(INCHES);
    expect(beam.start.x).toBeCloseTo(1000 * 0.0254, 6);
    expect(beam.start.y).toBeCloseTo(2000 * 0.0254, 6);
    expect(beam.end.z).toBeCloseTo(7000 * 0.0254, 6);
  });
});
