/**
 * Basic Structural Calc-Book Report Generator
 *
 * Generates a printable HTML report covering model data, loads, and analysis results.
 * Works for both 2D and 3D Basic mode analysis.
 * Uses Blob URL + browser print for PDF output (same pattern as pro-report.ts).
 */

import { provenanceBlockHtml, type ResultProvenance as ProvenanceRecord, type ProvenanceLabels } from '../provenance/result-provenance';
import type { Node, Material, Section, Element, Support } from '../store/model.svelte';
import type { AnalysisResults, FullEnvelope } from './types';
import type { AnalysisResults3D, FullEnvelope3D } from './types-3d';
import { releaseLabel } from '../export/excel';
import { t, tp, i18n } from '../i18n';
import { coordLabels, shownCoords, twoD, userRot, userVec } from '../axes/display';
import { nodeShown3D, standingPlane } from '../axes/node-coords';
import { TWO_D_DISPLACEMENT_LABELS, TWO_D_REACTION_LABELS } from '../geometry/coordinate-system';
import { modelFigureSvg } from './report/model-figure';
import { formatValue, toDisplay, unitLabel, type Quantity, type UnitSystem } from '../utils/units';
import { extraDecimals, smallDisplacement } from '../utils/unit-format';
import type { KinematicReport } from './kinematic-report';
import { saveFile } from '../export/save-file';
