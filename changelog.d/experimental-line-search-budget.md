### BREAKING (results)
#### Honor the line-search iteration budget on every load increment (2026-11-22)

Experimental 2D and 3D line searches can now reach full load when a large
per-increment budget previously wrapped and ended the solve early. The driver
returns an error if the actual total iteration count exceeds the supported range.
