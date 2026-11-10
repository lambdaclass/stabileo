### BREAKING (results)
#### Modal bases use the rounding scale of each mass Gram entry (2026-11-10)

The modal-basis guard now evaluates absolute mass products per Gram entry instead of a global mass norm. Valid orthogonal bases with strongly contrasting masses are no longer refused solely by that norm; unresolved cancellation and inaccurate bases still refuse at the existing limits. This also restores the full-spectrum conditioning solve used by the #1267 metamorphic regression without changing test tolerances. The #759 containment row is marked CORRECTED. Registry: `modal-basis-entrywise-rounding`; details in `docs/results-changes/2026-11-modal-basis-rounding.md`.
