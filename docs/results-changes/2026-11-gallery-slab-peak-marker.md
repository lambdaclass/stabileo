# The public slab gallery marks its peak deflection

Integration PR #2081 includes the shared tools viewer change from commit
`a260c831e`. The generated public slab gallery now returns
`views.deflection.peak.value` and `views.deflection.peak.at`, locating the
maximum already present in its deflection values. Both column and wall
support selections supply this marker.

The exact frozen corpus previously recorded no marker. Results Snapshot
therefore reported four new leaves for each selection: the peak value, the
coordinate array length and its two coordinates. The refreshed captures add
only those leaves. Every previously frozen value remains exactly equal;
model inputs, analytical references, certificates and engine results are
unchanged. The equality comparison and its exclusions are unchanged.

The new `gallery-slab-peak-marker` registry entry applies only to the two
explicit public gallery contexts with linear analysis. Saved projects never
infer these context features and receive no recheck notice from this entry.
The existing slab test checks that the marker equals the array maximum and
uses that node’s coordinates for columns, walls and a larger gallery model.
The exact frozen replay continues to cover both default support selections.

This registers a display-output addition. No engine correction or safety
advisory is involved.
