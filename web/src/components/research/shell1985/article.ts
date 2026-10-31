// Route-local article text. Untranslated locales use the English reference article.
const en = {
  "shellObstacleCourseBelytschkoEtAl": "Shell obstacle course — Belytschko et al. (1985)",
  "threeCurvedShellBenchmarksSolvedWithThe": "Three curved-shell benchmarks, solved with the production MITC4 engine. Refine each mesh and inspect its measured response; every failure stays visible.",
  "theObstacleCourse": "The obstacle course",
  "thisPageRunsExistingStabileoShellTests": "This page runs existing Stabileo shell tests in the browser. It is a benchmark companion to Belytschko, Stolarski, Liu, Carpenter and Ong (CMAME 51, 1985), not an implementation of their stress-projection element. The production element here is MITC4 with its existing membrane and shear treatment. No solver equations or tolerances were changed for this page.",
  "modelsAndMeasurements": "Models and measurements",
  "scordelisLoRoof": "Scordelis–Lo roof:",
  "rLThicknessHalfAngleEVertical": " R = 25, L = 50, thickness 0.25, 40° half-angle, E = 4.32 × 10⁸, ν = 0, vertical gravity load 90 per area. The quarter model measures signed u_z at the midspan free edge against −0.3024. The #810 test-model correction removes the artificial crown pin, unions symmetry constraints at corners, and retains all tributary gravity loads.",
  "pinchedCylinderWithRigidDiaphragms": "Pinched cylinder with rigid diaphragms:",
  "rLThicknessETheOneEighth": " R = 300, L = 600, thickness 3, E = 3 × 10⁶, ν = 0.3. The one-eighth model carries a 0.25 inward load at midspan. Complete symmetry constraints are unioned at intersections. Signed u_y at the loaded node is compared with −1.8248 × 10⁻⁵.",
  "hemisphereWithAnHole": "Hemisphere with an 18° hole:",
  "theNafemsLeLabelledVariantIn": " the NAFEMS LE3-labelled variant in ",
  "shellBenchmarkBenchmarkHemisphereHoleConvergence": "shell_benchmark::benchmark_hemisphere_hole_convergence",
  "rThicknessELatitudeRunsFromThe": ". R = 10, thickness 0.04, E = 6.825 × 10⁷, ν = 0.3; latitude runs from the equator to 72°. The quarter model applies +2 in x and −2 in y and measures signed u_x at the equator against ",
  "theNativeSolidShellTestInsteadApplies": ". The native solid-shell test instead applies ±1 after symmetry reduction and compares with ",
  "alsoCitingThoseConventionsAreNotInterchangeable": " (also citing 0.0924). Those conventions are not interchangeable. The unperforated hemisphere is not this case.",
  "allInputsUseTheTestsConsistentBenchmark": "All inputs use the tests' consistent benchmark units. The engine input modulus is E/1000. Viewer numbers use those same length units; magnification is visual only. The editor handoff preserves geometry, nodal loads and each constrained degree of freedom.",
  "refinementAndVerdicts": "Refinement and verdicts",
  "the": "The ",
  "sharedEngineOwnedCaseFile": "shared engine-owned case file",
  "isReadByTheNativeTestsAnd": " is read by the native tests and this page, with a regression test enforcing agreement with the corrected roof and cylinder builders. Curves show signed computed/reference versus mesh divisions; the dashed line is 1. Missing results are never interpolated.",
  "theHeadlineCountsTheFinestSelectedBrowser": "The headline counts the finest selected browser meshes only: roof 16×16, cylinder 16×16, hemisphere 16×16 (289 nodes each). The corrected roof passes at all four meshes; the cylinder converges but still exceeds 2% at 6–16, so those failures remain visible. Its native-only 32×32 check passes with 1.006% error. The three hemisphere meshes are withheld by the engine (#798) and count as not passing, so the headline shows 1/3 passing. The browser cap bounds workload, not measured capacity. Every row retains relative error strictly below 2%, including response direction; this is the existing benchmark-page policy, not a tolerance attributed to the paper.",
  "findingsAndProvenance": "Findings and provenance",
  "findingsLedger": "findings ledger",
  "recordsAccuracyAndModelLimitationsThe": " records accuracy and model limitations. The ",
  "productionRegistry": "production registry",
  "containsShellContainment": " withholds the distorted hemisphere meshes for known issue #798 (SH-MITC4-DISTORTION) and warns about MITC4 shell convergence for #810. Withheld rows stay in the denominator and show no numerical result. Audit #810 identified test-model errors in the roof and cylinder, not an engine regression: the corrected roof reaches −0.302426 at 16×16 (0.0084% error); cylinder error decreases from 37.878% at 6×6 to 6.775% at 16×16 and 1.006% at 32×32. No engine equations, references or tolerances were changed.",
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
