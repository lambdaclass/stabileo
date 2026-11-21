# Wind plan levels are independent of seismic generation

PR #2316. 2026-11-19.

Load plans expose the wind and gravity levels in `levels`, with the same
endpoint assignment of member self-weight as main. Static seismic generation
uses its own `seismicLevels`, which include the column weight carried by each
seismic story. The seismic preview and its saved calculation basis use that
story distribution.

In the two-story regression model, the wind and gravity self-weights at
elevations 0, 12 and 24 m are 187.5, 850 and 812.5 kN. Enabling seismic in
the earlier branch returned the seismic weights of 150, 925 and 775 kN
through the same field. The planner now exposes both distributions and
keeps the wind level weights fixed. The model's approximate and WASM modal
wind cases, member loads and gust factors are identical with seismic enabled
and disabled. Previously generated loads do not need regeneration for this
level-data correction.
