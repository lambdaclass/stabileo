import './course-dictionaries';
import { methodById } from '../engine/steps/methods';
import { planeModel } from '../engine/steps/plane-model';
import { solveReference } from '../engine/steps/reference';
import { installCourse } from '../store/explained-steps.svelte';

export { default as StepWizard } from '../../components/dsm/StepWizard.svelte';
export { default as FmWizard } from '../../components/fm/FmWizard.svelte';
export { default as StepsCatalog } from '../../components/steps/StepsCatalog.svelte';
export { default as StepDocView } from '../../components/steps/StepDocView.svelte';
export { solveDetailed } from '../engine/solver-detailed';
export { solveDetailed3D } from '../engine/solver-detailed-3d';
export { solveForceMethod, ForceMethodError, FM_MAX_GH } from '../engine/force-method/solve';
export { solveForceMethod3D } from '../engine/force-method/solve-3d';

installCourse({ methodById, planeModel, solveReference });
