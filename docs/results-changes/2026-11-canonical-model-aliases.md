# Conflicting model aliases

Older project data can spell a planar moment as either `my` or `mz`. With both fields present, opening a project could keep zero for a nodal moment and use the nonzero value for a member point moment. If both values were nonzero and different, analysis already refused the load. A project could also contain competing transverse forces, support settlements, member releases or uniform load intensities. Which value reached analysis depended on how the model entered the application.

The model intake now refuses a record when two spellings of the same field disagree. The message identifies the record and both fields. Verify the intended value against the original model, correct the source, and rerun analyses that used it. A single legacy spelling or agreeing spellings produce the same canonical model. In spatial records, independent axes retain their own values. Direct native and WASM solver inputs accept agreeing load, support and result aliases. A planar solver node requires exactly one transverse coordinate, either `z` or the legacy `y`. It refuses both keys even when their values agree, since a spatial node can have equal coordinates on independent axes.

This change applies before assembly. The analysis equations are unchanged.

The results registry uses the same conflict check as model intake. The entry covers whether a model is accepted or refused. Numerical differences between successful analyses require their own evidence.
