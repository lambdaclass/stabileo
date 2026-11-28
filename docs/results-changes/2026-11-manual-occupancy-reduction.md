# Review the occupancy used for manual live-load reduction

In the integration build, opening a live-load case with an occupancy missing from the offered table selected the first row. Applying the preview saved that replacement and its reduction ratio. The case pane now preserves the stated use, displays an unavailable key and requires selection of an offered occupancy before applying a new ratio.

For TS 498, the manual case preview also lost the occupancy key before calling the reduction adapter. The automatic generator supplied it. In the checked-in office-column regression for four supported floors, omitting the key produced a ratio of 0.98 and the adapter with the office key returned 0.95. The case editor now passes the row used for its pressure and restrictions to the same adapter. See the checked-in TS 498 adapter and the browser calculation in web/scripts/result-checks-disclosure.test.mjs.

Review the occupancy in Case details against the intended use. Apply the reviewed reduction and solve the model again. Older files can identify that the first row was used but cannot show whether the operator chose it. The notice also covers older reduced TS 498 residential and office column cases above the unreduced floor-count range. Applying a reviewed row records that decision. No regulator table or solver equation changed.
