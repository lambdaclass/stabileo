# Signed envelope queries and Excel force magnitudes

Spatial end queries and signed force tables read each selected member from
the constituent cases of a bound envelope. A cantilever with axial end
forces of −80 kN and +30 kN reports −80 kN as the minimum and +30 kN as the
maximum. A single max-absolute end force previously yielded −80 kN for both.
Incomplete constituent coverage produces an unavailable-extrema diagnostic.

The Excel Summary for an active spatial SRSS or ABS combination shows the
exact peak magnitude of each force and moment component, using the same
calculation as the printable report. A component with only a conservative
bound is marked unavailable. For two identical triangular loads rising from
zero to 10 kN/m over a simply supported 6 m span, the peak My is 32.66 kN·m
under SRSS and 46.19 kN·m under ABS at workbook precision.

Regenerate affected force tables, force-query CSVs, and Excel workbooks to
retrieve the corrected values.
