# Conflicting model aliases

Older project data can spell a planar moment as either `my` or `mz`. With both fields present, opening a project could keep zero for a nodal moment and use the nonzero value for a member point moment. If both values were nonzero and different, analysis already refused the load. A project could also contain competing transverse forces, support settlements, member releases or uniform load intensities. Which value reached analysis depended on how the model entered the application.

The model intake now refuses a record when two spellings of the same field disagree. The message identifies the record and both fields. Verify the intended value against the original model, correct the source, and rerun analyses that used it. A single legacy spelling or agreeing spellings produce the same canonical model. In spatial records, independent axes retain their own values. Direct native and WASM solver inputs also accept agreeing aliases and refuse conflicting ones.

This change applies before assembly. The analysis equations are unchanged.
