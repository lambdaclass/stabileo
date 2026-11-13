import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const SEAM = [
  'components/pro/loads/ProWriteLoadCard.svelte', 'components/pro/loads/ProShellLoadForm.svelte', 'components/pro/loads/LoadSketch.svelte',
  'components/pro/loads/ProLoadTables.svelte', 'components/pro/loads/LoadTargetPicker.svelte', 'components/pro/loads/ProCaseDetails.svelte',
  'components/pro/ProLoadCases.svelte', 'components/pro/StaticsCheckPanel.svelte', 'components/pro/ProTransformPanel.svelte',
  'components/pro/ProConstraintsTab.svelte', 'components/pro/ProGridPanel.svelte', 'components/pro/ProDrawBar.svelte',
  'components/pro/ProAdvancedTab.svelte', 'components/pro/ProSpecialLoadsSection.svelte', 'components/pro/ProStoryDriftTable.svelte',
  'components/pro/SupportDofFields.svelte', 'components/pro/ProSupportsTab.svelte', 'components/pro/ProFloorLoadSection.svelte',
  'components/pro/ProAutoLoadsApplying.svelte', 'components/pro/ProAutoLoadsDialog.svelte', 'components/pro/ProWindCasesPanel.svelte',
  'components/pro/ProWindStructure.svelte', 'components/pro/ProDirectAnalysis.svelte', 'components/pro/ProMesher.svelte',
  'components/pro/ProEditPanel.svelte', 'components/pro/ProMovingLoadsPanel.svelte', 'components/pro/ProSeismicMethod.svelte',
  'components/pro/building/UnderlayRow.svelte', 'components/pro/building/UnderlayConvertDialog.svelte', 'components/pro/building/BuildingTools.svelte',
  'components/pro/building/BuildingRange.svelte', 'components/pro/building/BuildingBeams.svelte', 'components/pro/generators/GeneratorOutput.svelte',
  'components/pro/dynamics/TimeHistoryPanel.svelte', 'components/pro/dynamics/GroundMotionRow.svelte', 'components/pro/nonlinear/PushoverView.svelte',
  'components/pro/spec/SpecSurfaces.svelte', 'components/pro/plates/PlateMeshDialog.svelte', 'components/pro/design/FootingMatPanel.svelte',
  'components/pro/design/FootingMatPhysicalPanel.svelte', 'components/pro/design/DesignFilterBar.svelte', 'components/property/MemberOffsetEditor.svelte',
  'components/WhatIfPanel.svelte', 'lib/model/constraint-labels.ts', 'lib/store/statics-rows.ts', 'lib/pro/support-types.ts',
];

describe('PRO screens that name global axes go through the display layer', () => {
  for (const f of SEAM) {
    it(`${f} reads the user frame`, () => {
      expect(read(f)).toMatch(/axes\/(display|axes\.svelte|typed-frame)'/);
    });
  }

  it('none of them prints a fixed global axis or a raw global component', () => {
    const forbidden = [
      /<option value="[xy]">[XY]<\/option>/,
      /<span class="al-label">[XYZ]<\/span>/,
      /ΣF[xyz] \{F\(r\.applied/,
      /\{AXIS\[k\]\}/,
      /fmtQ\(r\.f[xyz], 'force'\)/,
      /'Fx', 'Fy', 'Fz'|tx: 'Fx'/,
      /label: t\('pro\.roller(XZ|XY|YZ)'\)/,
      /dir\.toUpperCase\(\)\}/,
    ];
    for (const f of SEAM) for (const re of forbidden) expect(read(f), `${f} ${re}`).not.toMatch(re);
  });

  it('the Add load card and the shell form hand the user frame to the builders', () => {
    expect(read('components/pro/loads/ProWriteLoadCard.svelte')).toMatch(/toModel: typedFrame/);
    expect(read('components/pro/loads/ProShellLoadForm.svelte')).toMatch(/typedFrame\.vec\)/);
  });
});
