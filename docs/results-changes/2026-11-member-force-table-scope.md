# Member force tables with a cleared or incomplete combination list

## Maximum member forces and their exported sources

A PRO project can define factored combinations while its active list is empty or selects only an unsigned SRSS or ABS magnitude. The maximum-by-type table previously treated an empty filtered list as permission to read the displayed result. CSV and Excel used those same rows. This could report a member force from the unfactored solve under a table heading for governing station demands.

On main revision 4ec9619b4, the regression cantilever with an empty active selection displayed axial force 10.00 and bending moment −40.00 under “Result on screen”. Selecting its defined combination gave 20.00 and −80.00 respectively. Both the linear and P-Delta fixtures use the project’s actual solver output.

The maximum-by-type, structural steel and tension rupture tables now consult the same combination inventory. A missing or unsigned active design basis produces a translated refusal. The maximum table and its exports are unavailable until a complete source is present. A model with no design combinations can still use its signed single solve. No equilibrium, station recovery or resistance equation changed.

Review previously exported maximum-by-type tables for models with combination scopes, then choose and solve the intended combinations before exporting again. The regression in the PRO component tests covers the table, export controls and steel readers for both analysis methods.

The saved-project notice uses PRO models with a restricted active combination selection or only magnitude combinations. An incomplete set of solved combinations is transient and still triggers the table refusal at runtime. With the same analytical input this reporting change does not alter solver results.
