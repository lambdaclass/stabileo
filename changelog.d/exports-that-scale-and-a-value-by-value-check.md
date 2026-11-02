### Fixed
#### Excel, the report and drawings no longer stall on a real building, and "Check an exported report" compares the printed numbers (2026-11-02)

Exporting a six-storey building's results to Excel built every sheet of every case and
combination in memory before it measured them, and the tab ran out of memory. The large sheets
(stations, stresses, shell centres, nodes and corners) are now written row by row straight into
the zip of CSV files, the size is counted beforehand without producing a row, and the dialog says
how many cells the file will have and whether it comes as .xlsx or as a zip.

The report, PNG and SVG froze the browser for minutes (19 on an industrial shed) placing load
labels: every label tried each spot against every label and member placed before it. Labels now
look only at their neighbours, large obstacles in a coarser grid, and a spot that cannot beat the
best one found is not measured, with the same placement as before. On the audited six-storey
building the report went from about four minutes to ten seconds, and the PNG drawing from two
minutes to about fifteen seconds. The report draws the loads one
figure per load case (twelve at most; the table lists them all) instead of every case on one
unreadable figure, and a drawing of the model takes the cases shown on screen or one chosen case.

"Check an exported report" compared fingerprints only: a number edited in the HTML still read as
reproduced. A report now embeds its own choices and marks the tables it printed from the results;
the check prints them again from the fresh solve and compares every value, naming each one that
differs by table, row and column. It also stopped failing for every project with a seismic code
bound (an empty settings block and a pending binding read back differently after saving) and when
the load generator had run again at another time.
