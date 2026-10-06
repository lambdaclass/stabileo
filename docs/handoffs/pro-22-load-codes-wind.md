# PRO — 22: load codes by family, the wind's dynamics, and the generator's memory

Branch `feat/pro-22-load-codes-wind`, on `feat/pro-21-member-loads`. Everything is in the
application layer; the engine is untouched.

## The wind's gust effect factor (CIRSOC 102-2025 §1.9)

- `codes/cirsoc102/gust.ts`: Eqs. (1.9-6) to (1.9-16), the approximate frequencies (1.9-2..4) within
  §1.9.2.1, `L_ef` (1.9-1), the flexible eccentricity (2.4-5) and the commentary's sensitivity
  triggers (C 1.1.2). Table 1.9-1 is complete in `wind.ts` (`EXPOSURE_CONSTANTS`).
- `engine/loads/wind-dynamics.ts`: where each direction's n₁ comes from (`modal`, `typed`,
  `approximate`, `declaredRigid`), the damping, the rigid G (0.85 or Eq. 1.9-6) and `e_R`. A
  low-rise building (art. 1.2) is rigid without a frequency. `fundamentalFrequencies` picks, per
  direction, the mode with the most mass along it, and names a torsional first mode under 1 Hz.
- `store/seismic-modes.ts`, `windFrequenciesForPlan`: the modal frequencies under the plan's own
  masses, the same path the modal seismic method uses.
- The plan carries `factors.windGust` per axis; level forces scale with it, torsional cases of a
  flexible axis use Eq. (2.4-5), and other structures declared flexible without a frequency are
  refused. The old `rigid` checkbox reads back as `declaredRigid`.
- `ProWindDynamics.svelte`: the inputs and the per-direction reading with its steps. The reading is
  kept apart from the plan, so it stays after "Back" and drops when an input it depends on changes.

## Load codes behind family interfaces

- `codes/families/load-codes.ts`: one interface per load role (`CombinationCode`,
  `ImposedLoadCode`, `WindCode`, `SnowCode`, `SeismicCode`, `ThermalCode`).
- `codes/families/origin.ts`: the code-neutral words the model stores (`ActionCategory`,
  `CombinationOrigin`), types only, so the model does not import the generator.
- `codes/families/cirsoc.ts`: the CIRSOC family wrapping what the generator already ran; the
  seismic block of the plan moved verbatim to `engine/loads/load-plan-seismic.ts`.
- `codes/families/index.ts`: the registry (`registerLoadCodes` returns a remover that puts back what
  it replaced), `resolveLoadCodes`, `hasLoadModule`, `loadFamilyOf`, `withOrigin`.
- `load-plan.ts` resolves the modules of the bound roles; a bound role with no module blocks with
  `loadPlan.blocked.noCodeModule`. Every case gets `category`, every combination `origin` (the
  project's own rules say `code: 'project'`). The PRO examples' generated combinations carry it too.
- `roles.ts`: a `thermal` role (seeded with CIRSOC 101-2025), `withAllRoles` for projects saved
  before it, `regulations.problem.loadFamilyMismatch` when an action code is of another family than
  the basis, `settingsByCode` to keep each code's settings when the binding changes.
- The role selector offers, for load roles, only adapters with a module.
- `result-scopes.ts`, `activeComboIds`: "all" leaves out the combinations a code wrote for service.

## The generator's memory and "replace"

- Every load the generator writes is marked `generatedBy`. "Replace generated loads" removes the
  marked loads in the case types the plan regenerates, and the combinations with an origin
  (`store/apply-load-plan.ts`, `replacedByPlan`); the preview counts the same
  (`load-plan-delta.ts`, `generated`). Without that information the delta keeps the previous
  behaviour.
- The dialog saves a snapshot of its own state per role on preview and reads it back when it opens
  (`restoreFromRoles`); with nothing saved it starts from the bound module's `defaults`. Section
  headings come from the module (`title`, `sections`).

## Units

- `utils/units.ts`: `areaLoad` (kN/m², kgf/m², psf) and `speed` (m/s, mph).
- `components/pro/loads/QuantityInput.svelte`: a field typed in display units and kept in SI. Used for
  the wind speed, the service speed, typed dead rows, p_g, the soil surcharge; the roof dead load
  converts inline because it can be empty.

## Tests

- `codes/cirsoc102/__tests__/gust.test.ts`: the commentary's worked example (G 0.818, G_f 1.162), a
  60 m frame (0.978 / 0.999), a chimney.
- `engine/loads/__tests__/wind-gust-plan.test.ts`: forces scale with G_f, Eq. (2.4-5), service wind,
  refusals.
- `codes/families/__tests__/load-families.test.ts`: a family registered only in the test drives the
  plan; origin and category; blocked by name; registry restore; `withAllRoles`; family mismatch;
  per-action replace and its preview; `activeComboIds`.
- `e2e/pro-wind-dynamics.spec.ts` (`@smoke`): typed frequencies read G_f with its steps, and the
  dialog reopens on the saved parameters.

## Not done here

- Across-wind and torsional dynamic response (outside §1.9's G_f); the dialog says so.
- Loads and combinations written by an older version carry no marker. "Replace" keeps them unless
  the user ticks "also remove unmarked" (`replaceScope`, `alsoUnmarked`), which the preview offers
  when there are some in the cases the plan writes into; a hand edit or a copy makes an item the
  user's (`generatedBy` dropped, combination `origin.edited`).
- No second family is implemented; the interfaces and the test family are the contract.
