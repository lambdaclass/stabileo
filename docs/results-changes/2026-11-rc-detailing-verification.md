# RC beam and column detailing verification

CIRSOC 201 beam and wall station checks now select transverse spacing limits using the concrete shear contribution evaluated at each concurrent load tuple. The governing tuple can come from a combination with less shear and more axial tension. Fixed beam verification also checks along-member spacing using the evaluated cage.

A saved beam-line drawing can block regional flexure or primary shear verification when the regional calculation credits bars beyond their drawn ends. The verifier checks the intervals on both sides of drawn changes. The stirrup evidence retains every positive-length interval at a member boundary. The original weak-zone example was already checked using its local cage on the parent build.

Inflection anchorage now includes sign changes through exact zero-moment stations. For a zero plateau between opposite signs, the governing shear among the zero stations controls. The seismic frame check resolves the start, end and bottom bar layers or groups before finding the smallest diameter for the hoop spacing limit.

A column lift schedule now reports each specified bar diameter and computes its lap separately. Physical detailing withholds column and adjoining beam-joint geometry when the column generator cannot reproduce the specified cage. Uniform cages that fit the existing generator continue through that path.

Combined torsion capacity and utilization now reflect the lower evaluated concrete shear limit, including when the section still passes. Drawn perimeter steel must have development evidence at interior cuts. Touching bar ends cannot provide that evidence. The 2025 check can establish straight development from the actual distance to a cutoff. The 2005 drawn-perimeter check withholds credit at interior terminations. Interpolated cutoff sections and drawn hoop transitions remain in the governing torsion sweep.

The flagship gravity example keeps its automatic-design fingerprint. When its reinforcement is verified as drawn, eight previously passing members with changing top-bar layouts now refuse the regional flexural check. Ten members that already failed their drawn stirrup minimum also withhold secondary shear approval because the drawing cannot substantiate the corner bars required for the concrete-only check.

See issues #2214, #2271, #2241, #2245, #2249, #2217, #2239 and #2349.
