### Changed
#### Engine tests that time themselves no longer run on a shared CI machine (2026-11-03)

The solid-shell centroid-stress performance check failed on a busy CI runner although nothing was
wrong: it compared two wall-clock timings measured back to back. It now counts how often the
expensive enhanced-strain blocks are built (never for the centroid stress, once per stiffness);
its timing budget runs single-threaded in the Engine Gates job.
Four other engine checks of how cost grows with model size (Poisson section solve, constraint
validation, area-mass validation, RC member check) keep their timings and now run single-threaded
in the Engine Gates job only. No check of a computed result changed.
