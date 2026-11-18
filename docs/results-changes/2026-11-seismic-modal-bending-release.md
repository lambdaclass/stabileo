# Modal seismic generation requires continuous bending rotations at mass carriers

PR #2316. 2026-11-18.

The seismic load planner uses joint rotations to interpolate the mode shape
along each member. A bending release lets the member rotate independently of
the joint at the released end. The modal result supplies joint rotations, so
using them at a released end can change the calculated carrier inertia and
story shear.

Modal seismic generation now stops before that interpolation and lists the
affected member IDs and any assigned names. This also applies when modes are
supplied directly to the load planner. Static seismic generation can still
distribute load to members with bending releases.

Review modal E cases if they came from a planner build that interpolated
released ends. Once a supported modal load calculation is available for the
model, regenerate those cases and repeat the analyses, combinations and design
checks that depend on them.
