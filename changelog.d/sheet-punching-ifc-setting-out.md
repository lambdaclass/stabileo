### Fixed
#### Automatic punching reinforcement and sheet setting-out in IFC exports

The automatic punching reinforcement check uses its calculated spacing. The footing reinforcement sheet sizes each trial cage at its proposed spacing. With reinforcement sheets disabled, IFC exports omit sheet column fixed points and the setting-out grid.

The published Eurocode column member check uses its two reinforcement layers at their specified face distances. Checking individual placed bars is available in the reinforcement sheet. The published EC2 parameters can be used without loading the draft code-profile catalogue.

The published application includes the translated saved-reinforcement disclosure, wall refusals, cutoff warning and schedule splice note with the design results that emit them.

The published report and IFC exporter load their member-detailing sources without initializing sheet designers, schedules or three-dimensional sheet-bar layouts. The sheet build still includes its adopted bars and setting-out geometry.
