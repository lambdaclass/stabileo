# Tables unsupported by staged construction

A native staged 3D model could decode directly with solid or curved shells and calculate the frame with those elements missing. The native staged JSON parser and the WASM export already refused those populated shell tables by name, but could still calculate with an unrecognized table missing. Direct staged 2D decoding could also omit a supplied connector table.

All staged inputs now validate the fields left over after reading the staged model. An unrecognized field or a populated unsupported table blocks analysis. Known unsupported table placeholders can be omitted, null, or empty. The 3D staged wire still accepts the plate and quadrilateral tables used by construction stages. A beam-only input gives the same staged results with or without empty shell placeholders.
