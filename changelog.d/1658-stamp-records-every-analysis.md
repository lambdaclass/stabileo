### Fixed
#### A harmonic advisory stays up until harmonic analysis is run again, and projects record every analysis they ran (2026-11-07)

The results stamp now records the time history, nonlinear, harmonic, SSI and spectral runs of the
PRO advanced panel, not only the analyses of the main solve. An advisory about one analysis, such
as SA-2026-046 (harmonic), is no longer cleared by a static solve: it stays on screen until that
analysis is run again. For a project solved after this change, an advisory says its results are
affected when the stamp shows the analysis ran, and does not apply when it shows it did not;
older projects keep saying they may be affected if the analysis was used (#1658).
