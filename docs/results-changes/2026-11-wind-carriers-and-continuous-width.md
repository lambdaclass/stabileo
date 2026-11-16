# Wind carriers and continuous tapered widths

PR: #2220. Date: 2026-11-16. This corrects defects on the unmerged wind branch.
No aerodynamic coefficient, engineering threshold or numerical accuracy changed.

A height-changing member was automatically included in the pressure partition.
A diagonal between two corner columns added a fifth moving section point to
a rectangular four-column layout, making its otherwise supported partition
unresolved. Carrier selection now first joins contiguous collinear member
intervals into physical trajectories. An interconnect joining two less inclined
trajectories that both span its full height is excluded from the default
pressure carriers. The test uses four square corner columns and a face diagonal;
each column retains one quarter of the total field. Rotation, reflection,
subdivision of a column or brace, crossed braces and partial height bands retain
that allocation. Isolated sloping carriers remain eligible. All width and field
consumers use this selection. This does not declare a brace as a loaded face
member or infer a separate aerodynamic load on it.

The field previously switched between declared and measured width at each
integration station. A two-carrier test tapering from 0.03 m to 0.09 m over
6 m crosses the existing 0.05 m stick threshold at 2 m. The unsplit model
refused; splitting there could finish with a different, incorrect member load.
The maximum carrier width over the whole requested height now determines the
width interpretation. Above the threshold, physical width varies continuously
throughout the field; at or below it, the declared width applies throughout.
The pressure callback receives this field-wide interpretation, including the
square-diagonal chimney projection. Width preflight uses the same carrier
geometry. Changing the subdivision cannot change the interpretation.

For constant unit pressure on that taper, each carrier takes the height density
w(z) = (0.03 + 0.01z)/2, integrating to 0.18 per carrier. On a sloping member,
its line density is w(z) dz/ds. The independent beam checks integrate that
linear density: V(s) is its remaining force, M(s) its remaining first moment
about the station, and tip displacement is
[3L integral(q(s)s² ds) - integral(q(s)s³ ds)]/(6EI).
The column/brace checks isolate the pressure transfer on each carrier as a
cantilever; they do not claim the assembled braced tower has cantilever stiffness.
Both checks cover signed member loads, internal shear and moment at stations,
torsion and displacement through 2D/3D linear and P-delta WASM/native paths.
The shared generator exports 184 native inputs with exact wire parity checks.

The seven-storey wind preview additionally exceeded Chromium's function-argument
limit when the transactional planner called push with the whole generated array.
The commit loop now appends individual entries after successful generation.
Pressure refusals still discard the entire wind transaction. The stack trace
contains no recursive call cycle. Both affected E2E specs pass on main; the
branch's openings test now supplies the complete wall/roof envelope required
by its enclosure editor before using the classification.

Stored generated loads must be regenerated, followed by analyses, combinations
and design checks. Solving the existing stored loads again does not change them.
No new advisory is assigned by this record.
