# Flat-roof snow in companion combinations

Issue #2211 exposed a mismatch between the CIRSOC 101-2025 exception 2
note and the applied member loads. Strength combinations 2, 4 and 5
selected the ordinary roof snow patterns, including slope reduction,
instead of the flat-roof pressure pf required by that exception.

For the issue witness, the projected member length is 10 m, slope 20°,
tributary width 1 m, pg=1 and Ce=Ct=I=1, with a slippery roof. CIRSOC
104-2005 chapter 3 equation (1) gives pf=0.7. Chapter 4 Figure 2 gives
Cs=(70-20)/(70-5)=10/13. The physical balanced pressure is therefore
ps=7/13. The companion contribution in combination 2 changes from
0.5*(7/13)*10=2.692307692307692 kN to 0.5*0.7*10=3.5 kN.
The minimum in section 3.4 is evaluated for the actual roof geometry;
this does not pretend that the physical roof has zero slope.

A typed snowBasis term now survives native generation and WASM
transport. The planner materializes pf through the same projected
member-load path used by physical snow. The separate case contains
neither slope reduction, shaped patterns, drift nor sliding surcharge.
The applicable chapter 10 rain-on-snow supplement remains in this case.
Its interpretation survives apply, case matching and model persistence.
The companion-only case is not requested as a standalone solve; combinations
that reference it still obtain its member loading.
Every combination expansion selects the required interpretation and
refuses if it is unavailable. The exception note on legacy specifications
also requests the flat-roof interpretation, rather than silently retaining
the earlier mapping.

INPRES-CIRSOC 103 [3.16] still applies to physical roof snow. A distinct
seismic specification preserves f2*S alongside CIRSOC 101's 0.2*pf;
taking the larger scalar factor cannot replace these two different fields.
Automatic mass presets exclude the companion-only case. The load-plan
seismic weight continues to read the physical balanced case once.

The independent carrier oracle uses EA=EI=1, projected length 10 m and
rise 10*tan(slope). For a uniform projected pressure p and member length
L, the local axial intensity is -p*cos(slope)*sin(slope), and the transverse
intensity is -p*cos(slope)^2. At station s the axial force and shear are
the respective intensities times (L-s), and bending is transverse
intensity times (L-s)^2/2. Tip axial displacement is axial intensity
times L^2/2; tip deflection is transverse intensity times L^4/8.
Tests compare those values per carrier, through projected and width
inlets, rotations, mirroring, member reversal and subdivision. They check
both sides of the slope-factor and low-slope-minimum boundaries, and
retain the physical-pressure control. These are analytical member-load
checks upstream of the 2D/3D and linear/nonlinear solver selections;
they are not separate nonlinear solver validations.

A low-slope correct-input control uses pg=0.5 and Ce=1.1, with Ct=I=1.
Equation (1) gives 0.385, the minimum is 0.5, and chapter 10 gives
0.25-(0.5-0.385)=0.135 rain supplement below 2.4 degrees. Both physical
and companion fields therefore remain 0.635 below that boundary and 0.5
at or above it. This supplement must not be lost by separating the cases.

The existing snow snapshot corpus captures the physical cases, which
this change preserves. No historical snapshot baseline is changed.
Regenerate snow loads and combinations, then rerun analyses and checks.
Issue #2218 remains open: preserving its physical eccentric loading
requires distributed torque support and a geometric tributary partition;
this change does not claim that its transfer is corrected.
