# Independent pressure accounting in Explore

When an Explore slider changes generated shell pressure, analysis checks the original pressure field and the requested slider factor. It compares each corner pressure or both endpoints of a varying field after applying the declared case factors. It also derives the expected nodal forces from the request and checks the assembled solver rows by shell and node. Explicitly factored combinations check their nodal forces again after scaling, and notional cases check the pressure source before using it to generate lateral loads.

Alternating pressure errors on a rectangular shell can change equivalent nodal forces while leaving the total force and moment equal to the request. A mismatch beyond the existing roundoff allowance stops analysis and identifies the load case or combination, shell, and pressure value or nodal force. Correctly assembled and factored loads retain their results.
