### Fixed
#### Default browser locale initialization (2026-11-15)

- Initialize the offered locales without accessing Node globals in browsers when the research switch is unset. The RC-NM-PAIRING and containment responsive checks keep their original viewport, readability and overflow assertions at CI defaults (#2099).
- Share the responsive fixture renderer and wait for its completed browser probe within the existing timeout, reporting browser script errors instead of returning an empty measurement.
