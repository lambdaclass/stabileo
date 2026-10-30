// Route-local article text. Untranslated locales use the English reference article.
const en = {
  "shellObstacleCourseBelytschkoEtAl": "Shell obstacle course — Belytschko et al. (1985)",
  "threeCurvedShellBenchmarksSolvedWithThe": "Three curved-shell benchmarks, solved with the production MITC4 engine. Refine each mesh and inspect its measured response; every failure stays visible.",
  "theObstacleCourse": "The obstacle course",
  "thisPageRunsExistingStabileoShellTests": "This page runs existing Stabileo shell tests in the browser. It is a benchmark companion to Belytschko, Stolarski, Liu, Carpenter and Ong (CMAME 51, 1985), not an implementation of their stress-projection element. The production element here is MITC4 with its existing membrane and shear treatment. No solver equations or tolerances were changed for this page.",
  "modelsAndMeasurements": "Models and measurements",
  "scordelisLoRoof": "Scordelis–Lo roof:",
  "rLThicknessHalfAngleEVertical": " R = 25, L = 50, thickness 0.25, 40° half-angle, E = 4.32 × 10⁸, ν = 0, vertical gravity load 90 per area. A quarter model measures |u_z| at the midspan free edge against 0.3024. The existing test's crown pin and corner restraint precedence are retained, including omission of loads at vertically restrained nodes.",
  "pinchedCylinderWithRigidDiaphragms": "Pinched cylinder with rigid diaphragms:",
  "rLThicknessETheOneEighth": " R = 300, L = 600, thickness 3, E = 3 × 10⁶, ν = 0.3. The one-eighth geometry carries a 0.25 inward load at midspan. The test calls this a quarter model in its comments. We retain its exact restraints, including corner precedence, and measure |u_y| at the loaded node against 1.8248 × 10⁻⁵.",
  "hemisphereWithAnHole": "Hemisphere with an 18° hole:",
  "theNafemsLeLabelledVariantIn": " the NAFEMS LE3-labelled variant in ",
  "shellBenchmarkBenchmarkHemisphereHoleConvergence": "shell_benchmark::benchmark_hemisphere_hole_convergence",
  "rThicknessELatitudeRunsFromThe": ". R = 10, thickness 0.04, E = 6.825 × 10⁷, ν = 0.3; latitude runs from the equator to 72°. The quarter model applies +2 in x and −2 in y and measures |u_x| at the equator against ",
  "theNativeSolidShellTestInsteadApplies": ". The native solid-shell test instead applies ±1 after symmetry reduction and compares with ",
  "alsoCitingThoseConventionsAreNotInterchangeable": " (also citing 0.0924). Those conventions are not interchangeable. The unperforated hemisphere is not this case.",
  "allInputsUseTheTestsConsistentBenchmark": "All inputs use the tests' consistent benchmark units. The engine input modulus is E/1000. Viewer numbers use those same length units; magnification is visual only. The editor handoff preserves geometry, nodal loads and each constrained degree of freedom.",
  "refinementAndVerdicts": "Refinement and verdicts",
  "the": "The ",
  "sharedEngineOwnedCaseFile": "shared engine-owned case file",
  "isReadByTheNativeTestsAnd": " is read by the native tests and this page. Curves show computed/reference versus mesh divisions; the dashed line is 1. Failures or missing results are never interpolated. Refinement need not be monotone and is not a promise of convergence.",
  "theHeadlineCountsTheFinestSelectedBrowser": "The headline counts the finest selected browser meshes only: roof 16×16, cylinder 16×16, hemisphere 16×16. The 16×16 cap bounds each model to 289 nodes. Cylinder 12×12 and 16×16 extend the existing test geometry and restraints; they have no historical regression assertion. This is a conservative workload cap, not a measured browser capacity limit. Every row uses the existing benchmark-page accuracy policy of relative error strictly below 2%; this is not a tolerance attributed to the paper. Native tests retain all their original assertions and much broader regression bounds. Passing those bounds does not mean passing this accuracy target.",
  "findingsAndProvenance": "Findings and provenance",
  "findingsLedger": "findings ledger",
  "recordsAccuracyAndModelLimitationsThe": " records accuracy and model limitations. The ",
  "productionRegistry": "production registry",
  "hasNoOpenShellEntrySolverOwner": " has no open shell entry; solver-owner triage is still needed. The page cannot establish that a mismatch is solely locking rather than a boundary-condition or reference convention issue.",
  "referencesAreInheritedFrom": "References are inherited from ",
  "shellBenchmarkRs": "shell_benchmark.rs",
  "and": " and ",
  "solidShellLockingRs": "solid_shell_locking.rs",
  "theRoofAndCylinderValuesAlsoAppear": "; the roof and cylinder values also appear in the shared MacNeal–Harder data. ",
  "scordelisLoRs": "scordelis_lo.rs",
  "containsFlatPlateChecksDespiteItsFilename": " contains flat plate checks, despite its filename. Crossref verifies the Belytschko citation, not these numerical transcriptions. Published table/page provenance is unresolved, so catalogue status remains proposed. Research, not a design tool.",
  "stabileo": " · Stabileo: ",
  "stabileo2": "Stabileo"
};

const translations: Record<string, Partial<typeof en>> = { en };
export function articleStrings(locale: string) {
  return { ...en, ...translations[locale] };
}
