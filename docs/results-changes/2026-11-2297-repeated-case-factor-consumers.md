# Use exact repeated case factors throughout combinations (2026-11-23)

The main combination solver already resolves repeated factors exactly for each load case. Shell stress recombination still applied the factors individually. The free-body and statics views also reconstructed the applied loads from the individual terms. Rounding could erase whole case contributions. Adding [2¹¹⁰, 2⁵⁴, 1, −2⁵⁴, −1, −2¹¹⁰, 1] on the case with a stress of 2, after including a second case with a stress of 4, gave 2 instead of 6 in the packed shell kernel. Removing the last unit factor gave 0 instead of 4.

The shared resolver adds a case's factors exactly and rounds its total once before the case is applied. Shell recovery, magnitude combinations, free-body loads, the statics check, and generated case factors now use that resolution. Generated notional variants use their source's net factor, and composite cases use each included case's net factor. Exact cancellation still gives zero contribution. The combination solver continues to refuse a combination whose nonzero factors all cancel.

Re-run affected combinations and review the shell stresses and applied loads. Regenerate any notional variants previously created from rules that repeated a source case. Previously stored composite entries with repeated factors are resolved when the model is solved.
