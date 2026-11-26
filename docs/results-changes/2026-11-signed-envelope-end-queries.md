# Signed bounds in spatial envelope end queries

The Pro query table and its CSV export now include both signed envelope
bounds at the inward side of each member end. If two load cases give
+100 kN and −60 kN at the same inward end, both values are available
to the query and to its absolute threshold. Previously the branch kept
only +100 kN in this example. The absolute governing value is +100 kN.

Open the envelope and export the query again to recover the additional
rows. Existing solved cases and combinations supply the bounds.
