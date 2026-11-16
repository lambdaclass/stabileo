### Fixed
#### Preserve load and result directions when changing global axes

- Clear frame-dependent shell-load drafts when axes change, so retained values cannot submit a pressure in a new physical direction.
- Import explicit case self-weight rules in the declared axes, preserving direction, signed factor and member scope; report unsupported standalone or group rules.
- Keep SRSS and ABS components nonnegative when permuting axes in result tables, reports and downloads. Reverse influence-envelope bounds together with their response.
- Keep varying-load sketch endpoints, Explore roller labels, automatic modal notes and explicit load-case or combination renames consistent with the current axes.
- Translate section annotations, Hungarian modal figure text and result-change notices. Limit the axes notice to marked axis-named cases without explaining unrelated solver differences.
- Exercise stored load placement, delayed figure rendering and committed pre-axes saved files in regressions.
