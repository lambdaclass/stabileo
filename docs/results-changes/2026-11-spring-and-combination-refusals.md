# Refuse non-finite springs and fully cancelled combinations (2026-11-19)

The synchronous cable and soil–structure interaction wrappers encoded NaN and infinite support stiffness as JSON null. The engine treated null as an omitted optional spring and could return the response of the structure with that spring missing. The synchronous wrappers and nonlinear worker now use the same checked encoder. A non-finite value is refused before encoding, with the field path and the existing `non_finite_result` code at the synchronous boundary. The native solvers already checked these spring inputs.

The shared combination resolver now refuses a load combination when it starts with a nonzero factor and every case has a net factor of exactly zero. The refusal happens before a zero displacement, reaction or force result can be published. Deliberately zero factors are still accepted. A combination where one case cancels and another contributes still uses the existing calculation. The web also refuses combinations on routes that retain unmerged factors if ordinary summation loses every nonzero net factor to roundoff. The routes that already use the compensated net factors still recover those nonzero responses.

Review the indicated stiffness for a refused spring and resolve repeated factors in a refused combination. Re-run the analysis after correcting the input.
