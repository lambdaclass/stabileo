# Independent pressure accounting in Explore

When an Explore slider changes a pressure generated from a physical plate definition, analysis checks the requested change using the baseline pressure field and the slider factor. It integrates the baseline field on its original shell independently of the load scaler, then applies the slider's change to the integrated force and moment. Declared case and combination factors apply to the checked totals.

A mismatch beyond the affected component's roundoff allowance stops analysis and identifies the load case, plate and component. The pressure sent to the solver and the solver equations are unchanged. Correctly scaled cases retain their results.
